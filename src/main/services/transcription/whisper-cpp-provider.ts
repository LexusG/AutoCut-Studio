import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Transcript, TranscriptSegment, TranscriptWord } from '@shared/types'
import { runProcess } from '../ffmpeg/process'
import { findWhisperExecutable, markModelActive, modelName, whisperModelPath } from './model-manager'
import type { ProviderInput, TranscriptionProvider } from './provider'

const ANALYZER_VERSION = 'phase7-whisper-cpp-v1'

function timestamp(value: unknown): number {
  if (typeof value === 'number') return value > 1000 ? value / 1000 : value
  if (typeof value !== 'string') return 0
  const parts = value.replace(',', '.').split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  return parts.reduce((sum, part) => sum * 60 + part, 0)
}

interface WhisperToken {
  text?: string
  word?: string
  p?: number
  probability?: number
  offsets?: { from?: number; to?: number }
  timestamps?: { from?: string; to?: string }
  t0?: number
  t1?: number
}

interface WhisperSegment {
  text?: string
  timestamps?: { from?: string; to?: string }
  offsets?: { from?: number; to?: number }
  tokens?: WhisperToken[]
}

function tokenRange(token: WhisperToken, offset: number): { start: number; end: number } {
  const start = token.offsets?.from != null ? token.offsets.from / 1000
    : token.timestamps?.from ? timestamp(token.timestamps.from) : (token.t0 ?? 0) / 100
  const end = token.offsets?.to != null ? token.offsets.to / 1000
    : token.timestamps?.to ? timestamp(token.timestamps.to) : (token.t1 ?? token.t0 ?? 0) / 100
  return { start: start + offset, end: Math.max(start, end) + offset }
}

export function parseWhisperJson(
  raw: unknown,
  context: Omit<ProviderInput, 'audioPath' | 'signal' | 'onProgress'>,
  model: string
): Transcript {
  const root = raw as { transcription?: WhisperSegment[]; result?: { language?: string } }
  const sourceSegments = Array.isArray(root.transcription) ? root.transcription : []
  const words: TranscriptWord[] = []
  const segments: TranscriptSegment[] = sourceSegments.map((segment, segmentIndex) => {
    const segmentStart = segment.offsets?.from != null ? segment.offsets.from / 1000 + context.timestampOffset
      : timestamp(segment.timestamps?.from) + context.timestampOffset
    const segmentEnd = segment.offsets?.to != null ? segment.offsets.to / 1000 + context.timestampOffset
      : timestamp(segment.timestamps?.to) + context.timestampOffset
    const segmentWords = (segment.tokens ?? []).flatMap((token, tokenIndex) => {
      const text = (token.word ?? token.text ?? '').trim()
      const speakable = /[\p{L}\p{N}]/u.test(text) || /^[,.!?;:]+$/.test(text)
      if (!text || !speakable || text.includes('�') || /^\[.*\]$/.test(text) || /^<\|.*\|>$/.test(text)) return []
      const range = tokenRange(token, context.timestampOffset)
      const word: TranscriptWord = {
        id: `word-${segmentIndex}-${tokenIndex}-${Math.round(range.start * 1000)}`,
        start: Math.max(0, range.start),
        end: Math.min(context.sourceDuration, Math.max(range.start, range.end)),
        text,
        originalText: text,
        confidence: token.p ?? token.probability ?? null,
        filler: false,
        excluded: false
      }
      words.push(word)
      return [word]
    })
    const text = segmentWords.map((word) => word.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
    return {
      id: `segment-${segmentIndex}-${Math.round(segmentStart * 1000)}`,
      start: Math.max(0, segmentStart),
      end: Math.min(context.sourceDuration, Math.max(segmentStart, segmentEnd)),
      text,
      originalText: text,
      words: segmentWords,
      confidence: segmentWords.length
        ? segmentWords.reduce((sum, word) => sum + (word.confidence ?? 0), 0) / segmentWords.length
        : null
    }
  }).filter((segment) => segment.words.length)
  const fullText = segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim()
  const confidences = words.flatMap((word) => word.confidence == null ? [] : [word.confidence])
  const now = new Date().toISOString()
  return {
    version: 1, id: randomUUID(), projectId: context.projectId,
    sourceClipId: context.sourceClipId, sourcePath: context.sourcePath,
    sourceDuration: context.sourceDuration, language: context.settings.language,
    detectedLanguage: root.result?.language ?? null, provider: 'whisper.cpp', model,
    analyzerVersion: ANALYZER_VERSION, fullText, originalText: fullText,
    segments, words, createdAt: now, updatedAt: now,
    averageConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    noSpeech: words.length === 0, revision: 1
  }
}

export class WhisperCppProvider implements TranscriptionProvider {
  readonly id = 'whisper.cpp' as const
  readonly version = ANALYZER_VERSION

  async transcribe(input: ProviderInput): Promise<Transcript> {
    const executable = await findWhisperExecutable()
    if (!executable) throw new Error('whisper.cpp is unavailable. Install whisper-cli or set AUTOCUT_WHISPER_CPP.')
    const model = modelName(input.settings.quality, input.settings.language)
    const modelPath = whisperModelPath(model)
    const outputBase = join(dirname(input.audioPath), 'transcript')
    const language = input.settings.language === 'english' ? 'en' : 'auto'
    markModelActive(model, true)
    try {
      let progress = 0
      const captureProgress = (text: string): void => {
        for (const match of text.matchAll(/progress\s*=\s*(\d+)%/gi)) progress = Math.max(progress, Number(match[1]))
        input.onProgress?.(progress)
      }
      await runProcess(executable, [
        '-m', modelPath, '-f', input.audioPath, '-l', language,
        '-t', String(Math.max(1, Math.min(8, input.settings.threads))),
        '-ojf', '-ml', '1', '-sow', '-of', outputBase, '-pp', '-sns'
      ], {
        signal: input.signal,
        onStdout: captureProgress,
        onStderr: captureProgress
      })
      const parsed = JSON.parse(await readFile(`${outputBase}.json`, 'utf8')) as unknown
      return parseWhisperJson(parsed, input, model)
    } finally {
      markModelActive(model, false)
      await rm(`${outputBase}.json`, { force: true })
    }
  }
}
