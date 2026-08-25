import type {
  TranscriptionQueueItem,
  TranscriptionQueueProgress,
  TranscriptionQueueRequest,
  TranscriptionResult
} from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { analyzeSpeechActivity } from '../video/content/speech-analysis'
import { cancelTranscription, transcribeProject } from './job-manager'
import { modelName } from './model-manager'

interface QueueControl {
  paused: boolean
  cancelAll: boolean
  currentJobId: string | null
  wake: (() => void) | null
  failedClipIds: Set<string>
  preparationController: AbortController | null
}

const queues = new Map<string, QueueControl>()

async function waitWhilePaused(control: QueueControl): Promise<void> {
  while (control.paused && !control.cancelAll) await new Promise<void>((resolve) => { control.wake = resolve })
}

export async function runTranscriptionQueue(
  request: TranscriptionQueueRequest,
  onProgress: (progress: TranscriptionQueueProgress) => void
): Promise<TranscriptionResult> {
  if (queues.has(request.queueId)) throw new Error('This transcription queue is already active.')
  const control: QueueControl = {
    paused: false,
    cancelAll: false,
    currentJobId: null,
    wake: null,
    failedClipIds: new Set(),
    preparationController: null
  }
  queues.set(request.queueId, control)
  const model = modelName(request.settings.quality, request.settings.language)
  const items: TranscriptionQueueItem[] = request.sources.map((source) => ({
    clipId: source.clipId, filename: source.filename, duration: source.duration, model,
    state: 'waiting', progress: 0, result: null
  }))
  const transcripts = []
  const references = []
  const warnings: string[] = []
  let cachedCount = 0
  const report = (): void => onProgress({
    queueId: request.queueId, items: structuredClone(items), paused: control.paused,
    completed: items.filter((item) => ['complete', 'cached', 'no-speech', 'failed', 'cancelled'].includes(item.state)).length,
    total: items.length
  })
  try {
    report()
    const ffmpeg = request.skipNoSpeech ? await detectFfmpeg() : null
    for (let index = 0; index < request.sources.length; index += 1) {
      const source = request.sources[index]
      const item = items[index]
      await waitWhilePaused(control)
      if (control.cancelAll) { item.state = 'cancelled'; item.result = 'Cancelled'; report(); continue }
      if (request.skipNoSpeech) {
        item.state = 'preparing'; item.progress = 4; report()
        if (!source.hasAudio) { item.state = 'no-speech'; item.progress = 100; item.result = 'Skipped - No Speech'; report(); continue }
        if (ffmpeg?.ffmpeg.path) {
          const preparationController = new AbortController()
          control.preparationController = preparationController
          let speech
          try { speech = await analyzeSpeechActivity(ffmpeg.ffmpeg.path, source, preparationController.signal) }
          catch (error) {
            control.preparationController = null
            if (control.cancelAll || preparationController.signal.aborted) {
              item.state = 'cancelled'; item.progress = 100; item.result = 'Cancelled'; report(); continue
            }
            warnings.push(`${source.filename}: speech screening was unavailable; transcription continued.`)
          }
          control.preparationController = null
          if (speech && speech.result.confidence != null && speech.result.confidence >= 0.7 && speech.result.speechRatio < 0.03) {
            item.state = 'no-speech'; item.progress = 100; item.result = 'Skipped - No Speech'; report(); continue
          }
        }
      }
      const childJobId = `${request.queueId}:${source.clipId}`
      control.currentJobId = childJobId
      item.state = 'transcribing'; item.progress = 5; report()
      try {
        const result = await transcribeProject({
          jobId: childJobId, projectId: request.projectId, sources: [source], settings: request.settings, vocabulary: request.vocabulary
        }, (progress) => { item.state = progress.stage === 'Preparing audio' ? 'preparing' : 'transcribing'; item.progress = progress.percent; report() })
        transcripts.push(...result.transcripts); references.push(...result.references); warnings.push(...result.warnings)
        cachedCount += result.cachedCount
        item.state = result.cachedCount ? 'cached' : result.transcripts.every((transcript) => transcript.noSpeech) ? 'no-speech' : 'complete'
        item.progress = 100; item.result = item.state === 'cached' ? 'Cached' : item.state === 'no-speech' ? 'No Speech' : 'Complete'
      } catch (error) {
        item.state = control.cancelAll ? 'cancelled' : 'failed'
        item.result = error instanceof Error ? error.message : 'Transcription failed.'
        if (item.state === 'failed') control.failedClipIds.add(source.clipId)
      } finally { control.currentJobId = null; report() }
    }
    return { transcripts, references, cachedCount, warnings }
  } finally { queues.delete(request.queueId) }
}

export function pauseTranscriptionQueue(queueId: string): boolean {
  const queue = queues.get(queueId); if (!queue) return false
  queue.paused = true; return true
}

export function resumeTranscriptionQueue(queueId: string): boolean {
  const queue = queues.get(queueId); if (!queue) return false
  queue.paused = false; queue.wake?.(); queue.wake = null; return true
}

export function cancelCurrentTranscriptionQueueItem(queueId: string): boolean {
  const queue = queues.get(queueId)
  if (!queue) return false
  if (queue.preparationController) {
    queue.preparationController.abort()
    return true
  }
  return Boolean(queue.currentJobId && cancelTranscription(queue.currentJobId))
}

export function cancelAllTranscriptionQueueItems(queueId: string): boolean {
  const queue = queues.get(queueId); if (!queue) return false
  queue.cancelAll = true; queue.paused = false; queue.wake?.(); queue.wake = null
  queue.preparationController?.abort()
  if (queue.currentJobId) cancelTranscription(queue.currentJobId)
  return true
}
