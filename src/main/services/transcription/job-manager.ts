import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Transcript,
  TranscriptSegment,
  TranscriptWord,
  TranscriptionProgress,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionSource
} from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { prepareTranscriptionAudio } from './audio-preparation'
import { modelName } from './model-manager'
import type { TranscriptionProvider } from './provider'
import { readTranscriptCache, transcriptCacheKey, writeTranscriptCache } from './transcript-cache'
import { saveTranscript } from './transcript-repository'
import { WhisperCppProvider } from './whisper-cpp-provider'

const controllers = new Map<string, AbortController>()
let queue: Promise<void> = Promise.resolve()

function emptyTranscript(request: TranscriptionRequest, source: TranscriptionSource): Transcript {
  const now = new Date().toISOString()
  return {
    version: 1, id: randomUUID(), projectId: request.projectId, sourceClipId: source.clipId,
    sourcePath: source.path, sourceDuration: source.duration, language: request.settings.language,
    detectedLanguage: null, provider: 'whisper.cpp',
    model: modelName(request.settings.quality, request.settings.language),
    analyzerVersion: 'phase7-whisper-cpp-v1', fullText: '', originalText: '', segments: [], words: [],
    createdAt: now, updatedAt: now, averageConfidence: null, noSpeech: true, revision: 1
  }
}

function combineTranscripts(parts: Transcript[], request: TranscriptionRequest, source: TranscriptionSource): Transcript {
  if (parts.length === 0) return emptyTranscript(request, source)
  const segments: TranscriptSegment[] = parts.flatMap((part) => part.segments)
    .sort((left, right) => left.start - right.start)
  const words: TranscriptWord[] = segments.flatMap((segment) => segment.words)
  const fullText = segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim()
  const confidence = words.flatMap((word) => word.confidence == null ? [] : [word.confidence])
  return {
    ...parts[0], id: randomUUID(), sourceDuration: source.duration, segments, words,
    fullText, originalText: fullText, noSpeech: words.length === 0,
    averageConfidence: confidence.length ? confidence.reduce((sum, value) => sum + value, 0) / confidence.length : null
  }
}

async function runJob(
  request: TranscriptionRequest,
  onProgress: (progress: TranscriptionProgress) => void,
  provider: TranscriptionProvider
): Promise<TranscriptionResult> {
  const controller = new AbortController()
  controllers.set(request.jobId, controller)
  const startedAt = Date.now()
  const status = await detectFfmpeg()
  if (!status.ffmpeg.path) throw new Error('FFmpeg is required to prepare transcription audio.')
  const workDirectory = join(applicationStoragePaths().processing, 'transcription', request.jobId)
  await mkdir(workDirectory, { recursive: true })
  const transcripts: Transcript[] = []
  const references = []
  const warnings: string[] = []
  let cachedCount = 0
  const report = (stage: TranscriptionProgress['stage'], clip: number, percent: number): void => onProgress({
    jobId: request.jobId, stage, currentClip: request.sources[clip]?.filename ?? null,
    currentClipIndex: Math.min(request.sources.length, clip + 1), totalClips: request.sources.length,
    percent, elapsedSeconds: (Date.now() - startedAt) / 1000
  })
  try {
    report('Queued', 0, 0)
    for (let sourceIndex = 0; sourceIndex < request.sources.length; sourceIndex += 1) {
      if (controller.signal.aborted) throw new Error('Transcription cancelled.')
      const source = request.sources[sourceIndex]
      const base = sourceIndex / Math.max(1, request.sources.length) * 100
      const span = 100 / Math.max(1, request.sources.length)
      const key = await transcriptCacheKey(source, request.settings, provider.version)
      const cached = await readTranscriptCache(key)
      let transcript: Transcript
      if (cached) {
        transcript = { ...cached, projectId: request.projectId, sourceClipId: source.clipId, sourcePath: source.path }
        cachedCount += 1
      } else if (!source.hasAudio) {
        transcript = emptyTranscript(request, source)
        warnings.push(`${source.filename} has no audio stream.`)
      } else {
        const ranges = source.ranges?.length ? source.ranges : [{ start: 0, end: source.duration }]
        const parts: Transcript[] = []
        for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
          report('Preparing audio', sourceIndex, base + span * (0.05 + rangeIndex / ranges.length * 0.1))
          const audioPath = await prepareTranscriptionAudio(
            status.ffmpeg.path, source.path, join(workDirectory, source.clipId), rangeIndex,
            controller.signal, ranges[rangeIndex]
          )
          report('Loading transcription model', sourceIndex, base + span * 0.18)
          parts.push(await provider.transcribe({
            projectId: request.projectId, sourceClipId: source.clipId, sourcePath: source.path,
            sourceDuration: source.duration, audioPath, timestampOffset: ranges[rangeIndex].start,
            settings: request.settings, signal: controller.signal,
            onProgress: (progress) => report('Transcribing', sourceIndex, base + span * (0.2 + progress / 100 * 0.65))
          }))
        }
        report('Processing timestamps', sourceIndex, base + span * 0.9)
        transcript = combineTranscripts(parts, request, source)
        await writeTranscriptCache(key, transcript)
      }
      report('Saving transcript cache', sourceIndex, base + span * 0.96)
      references.push(await saveTranscript(transcript))
      transcripts.push(transcript)
    }
    report('Complete', Math.max(0, request.sources.length - 1), 100)
    return { transcripts, references, cachedCount, warnings }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Transcription cancelled.')
    throw error
  } finally {
    controllers.delete(request.jobId)
    await rm(workDirectory, { recursive: true, force: true })
  }
}

export function transcribeProject(
  request: TranscriptionRequest,
  onProgress: (progress: TranscriptionProgress) => void,
  provider: TranscriptionProvider = new WhisperCppProvider()
): Promise<TranscriptionResult> {
  if (!request.sources.length) return Promise.reject(new Error('Choose at least one clip to transcribe.'))
  if (controllers.has(request.jobId)) return Promise.reject(new Error('This transcription job already exists.'))
  let resolveResult!: (result: TranscriptionResult) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<TranscriptionResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
  queue = queue.catch(() => undefined).then(async () => {
    try { resolveResult(await runJob(request, onProgress, provider)) }
    catch (error) { rejectResult(error) }
  })
  return result
}

export function cancelTranscription(jobId: string): boolean {
  const controller = controllers.get(jobId)
  if (!controller) return false
  controller.abort()
  return true
}
