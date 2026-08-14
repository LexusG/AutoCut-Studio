import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpeechAnalysisResult, TimeRegion } from '@shared/types'
import { runProcess } from '../../ffmpeg/process'
import { applicationStoragePaths } from '../../filesystem/application-storage'

export const SPEECH_ANALYZER_VERSION = 'phase6-silencedetect-v1'
export const SPEECH_ANALYSIS_CONFIG = { thresholdDb: -35, minimumSilence: 0.25 } as const

const round = (value: number): number => Math.round(value * 1000) / 1000

function region(startTime: number, endTime: number): TimeRegion {
  return { startTime: round(startTime), endTime: round(endTime), duration: round(endTime - startTime) }
}

export function parseSilenceDetection(output: string, duration: number): SpeechAnalysisResult {
  const events = [...output.matchAll(/silence_(start|end):\s*([0-9.]+)/g)]
    .map((match) => ({ kind: match[1], time: Math.max(0, Math.min(duration, Number(match[2]))) }))
    .filter((event) => Number.isFinite(event.time))
    .sort((left, right) => left.time - right.time)
  const silenceRegions: TimeRegion[] = []
  let open: number | null = null
  for (const event of events) {
    if (event.kind === 'start') open = event.time
    else if (open != null && event.time > open) {
      silenceRegions.push(region(open, event.time))
      open = null
    }
  }
  if (open != null && duration > open) silenceRegions.push(region(open, duration))

  const speechRegions: TimeRegion[] = []
  let cursor = 0
  for (const silence of silenceRegions) {
    if (silence.startTime > cursor + 0.02) speechRegions.push(region(cursor, silence.startTime))
    cursor = Math.max(cursor, silence.endTime)
  }
  if (duration > cursor + 0.02) speechRegions.push(region(cursor, duration))
  const speechDuration = speechRegions.reduce((sum, item) => sum + item.duration, 0)
  return {
    speechRegions,
    silenceRegions,
    speechRatio: duration > 0 ? Math.max(0, Math.min(1, speechDuration / duration)) : 0,
    confidence: events.length > 0 ? 0.78 : 0.58,
    analyzerVersion: SPEECH_ANALYZER_VERSION,
    warnings: [],
    noAudioStream: false
  }
}

function noAudioResult(): SpeechAnalysisResult {
  return {
    speechRegions: [], silenceRegions: [], speechRatio: 0, confidence: null,
    analyzerVersion: SPEECH_ANALYZER_VERSION,
    warnings: ['No speech stream: the source clip has no audio.'], noAudioStream: true
  }
}

async function cachePath(path: string): Promise<string> {
  const file = await stat(path)
  const key = createHash('sha256').update(JSON.stringify({
    path, size: file.size, mtimeMs: file.mtimeMs,
    version: SPEECH_ANALYZER_VERSION, config: SPEECH_ANALYSIS_CONFIG
  })).digest('hex')
  return join(applicationStoragePaths().analysisCache, 'speech', `${key}.json`)
}

export async function analyzeSpeechActivity(
  ffmpegPath: string,
  source: { path: string; duration: number; hasAudio: boolean },
  signal: AbortSignal
): Promise<{ result: SpeechAnalysisResult; cacheHit: boolean }> {
  if (!source.hasAudio) return { result: noAudioResult(), cacheHit: false }
  const target = await cachePath(source.path)
  try {
    return { result: JSON.parse(await readFile(target, 'utf8')) as SpeechAnalysisResult, cacheHit: true }
  } catch {
    // A cache miss is expected for new or modified media.
  }
  const { stderr, stdout } = await runProcess(ffmpegPath, [
    '-hide_banner', '-loglevel', 'info', '-i', source.path,
    '-vn', '-ac', '1', '-ar', '16000',
    '-af', `silencedetect=noise=${SPEECH_ANALYSIS_CONFIG.thresholdDb}dB:d=${SPEECH_ANALYSIS_CONFIG.minimumSilence}`,
    '-f', 'null', '-'
  ], { signal })
  const result = parseSilenceDetection(`${stdout}\n${stderr}`, source.duration)
  await mkdir(join(applicationStoragePaths().analysisCache, 'speech'), { recursive: true })
  await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  return { result, cacheHit: false }
}
