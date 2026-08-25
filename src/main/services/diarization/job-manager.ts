import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  DiarizationAnalysisResult,
  DiarizationProgress,
  DiarizationRequest,
  DiarizationSegment,
  SpeakerDiarizationResult,
  Transcript
} from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { analysisScheduler } from '../semantic/analysis-scheduler'
import { prepareTranscriptionAudio } from '../transcription/audio-preparation'
import { updateTranscript } from '../transcription/transcript-repository'
import { diarizationModelPaths, getDiarizationModelStatus, markDiarizationModelsActive } from './model-manager'
import { loadDiarizationResult, saveDiarizationResult } from './repository'
import { SherpaOnnxDiarizationProvider } from './sherpa-onnx-provider'
import { alignTranscriptSpeakers } from './transcript-aligner'

export const DIARIZATION_ANALYSIS_VERSION = 'phase9-diarization-v1'
const AUDIO_PREPARATION_VERSION = 'mono-16k-pcm-s16-v1'

async function cacheKey(source: DiarizationRequest['sources'][number], modelVersion: string, speakerCount: DiarizationRequest['speakerCount']): Promise<string> {
  const metadata = await stat(source.path)
  return createHash('sha256').update(JSON.stringify({
    source: source.path, size: metadata.size, modified: metadata.mtimeMs,
    modelVersion, speakerCount, audio: AUDIO_PREPARATION_VERSION, analysis: DIARIZATION_ANALYSIS_VERSION
  })).digest('hex')
}
function overlaps(segments: DiarizationSegment[]): DiarizationSegment[] {
  return segments.map((segment) => ({ ...segment, overlappingSpeakerIds: [...new Set(segments
    .filter((other) => other.speakerId !== segment.speakerId && Math.min(segment.end, other.end) - Math.max(segment.start, other.start) >= 0.1)
    .map((other) => other.speakerId))] }))
}

export function diarizeProject(
  request: DiarizationRequest,
  transcripts: Transcript[],
  onProgress: (progress: DiarizationProgress) => void
): Promise<DiarizationAnalysisResult> {
  return analysisScheduler.schedule(`diarization:${request.jobId}`, 'normal', async (signal) => {
    const status = await getDiarizationModelStatus()
    if (status.state !== 'ready') throw new Error('Speaker detection unavailable. Install the local diarization models first.')
    const ffmpeg = await detectFfmpeg()
    if (!ffmpeg.ffmpeg.path) throw new Error('FFmpeg runtime is unavailable for speaker audio preparation.')
    const provider = new SherpaOnnxDiarizationProvider()
    const modelPaths = diarizationModelPaths()
    const directory = join(applicationStoragePaths().processing, 'diarization', request.jobId)
    await mkdir(directory, { recursive: true })
    const results: SpeakerDiarizationResult[] = []
    const references = []
    const aligned = new Map(transcripts.map((transcript) => [transcript.sourceClipId, transcript]))
    const warnings: string[] = []
    let cachedCount = 0
    const report = (state: DiarizationProgress['state'], index: number, percent: number): void => onProgress({
      jobId: request.jobId, state, currentClip: request.sources[index]?.filename ?? null,
      currentClipIndex: Math.min(index + 1, request.sources.length), totalClips: request.sources.length, percent
    })
    markDiarizationModelsActive(true)
    try {
      report('queued', 0, 0)
      for (let index = 0; index < request.sources.length; index += 1) {
        if (signal.aborted) throw new Error('Speaker detection cancelled.')
        const source = request.sources[index]
        const key = await cacheKey(source, status.modelVersion, request.speakerCount)
        const cached = await loadDiarizationResult(request.projectId, source.clipId)
        let result: SpeakerDiarizationResult
        if (cached?.cacheKey === key) {
          result = cached
          cachedCount += 1
        } else if (!source.hasAudio) {
          result = {
            version: 1, sourceClipId: source.clipId, sourcePath: source.path, provider: 'sherpa-onnx',
            modelVersion: status.modelVersion, speakerCount: 0, requestedSpeakerCount: request.speakerCount,
            segments: [], analysisVersion: DIARIZATION_ANALYSIS_VERSION, cacheKey: key,
            warnings: ['Source has no audio stream.'], createdAt: new Date().toISOString()
          }
          warnings.push(`${source.filename}: no audio stream.`)
        } else {
          report('preparing', index, (index + 0.1) / request.sources.length * 100)
          const audioPath = await prepareTranscriptionAudio(ffmpeg.ffmpeg.path, source.path, join(directory, source.clipId), 0, signal)
          report('analyzing', index, (index + 0.25) / request.sources.length * 100)
          const segments = overlaps(await provider.diarize({
            audioPath, sourceClipId: source.clipId, speakerCount: request.speakerCount,
            segmentationModelPath: modelPaths.segmentation, embeddingModelPath: modelPaths.embedding, signal
          }))
          result = {
            version: 1, sourceClipId: source.clipId, sourcePath: source.path, provider: 'sherpa-onnx',
            modelVersion: status.modelVersion, speakerCount: new Set(segments.map((segment) => segment.speakerId)).size,
            requestedSpeakerCount: request.speakerCount, segments, analysisVersion: DIARIZATION_ANALYSIS_VERSION,
            cacheKey: key, warnings: [], createdAt: new Date().toISOString()
          }
        }
        report('aligning', index, (index + 0.82) / request.sources.length * 100)
        const transcript = aligned.get(source.clipId)
        if (transcript) {
          const updated = alignTranscriptSpeakers(transcript, result)
          aligned.set(source.clipId, updated)
          await updateTranscript(updated)
        }
        report('saving', index, (index + 0.92) / request.sources.length * 100)
        references.push(await saveDiarizationResult(request.projectId, result))
        results.push(result)
        report('analyzing', index, (index + 1) / request.sources.length * 100)
      }
      report('complete', request.sources.length - 1, 100)
      return { results, references, transcripts: [...aligned.values()], cachedCount, warnings }
    } finally {
      markDiarizationModelsActive(false)
      await provider.release()
      await rm(directory, { recursive: true, force: true })
    }
  })
}

export function cancelDiarization(jobId: string): boolean {
  return analysisScheduler.cancel(`diarization:${jobId}`)
}
