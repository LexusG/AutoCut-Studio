import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AnalysisQuality,
  PersonAnalysisSummary,
  RenderSettings,
  SelectedCandidateMetadata
} from '@shared/types'
import { runProcess } from '../../ffmpeg/process'
import { generateCandidateWindows } from './candidate-generator'
import { type PersonPresenceProvider, UnavailablePersonPresenceProvider } from './optional-ml'
import { analysisReasons, PERSON_ANALYSIS_POLICY, scoreCandidate, type RawCandidateMetrics } from './scoring'

export interface AnalyzedCandidate {
  start: number
  end: number
  metadata: SelectedCandidateMetadata
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

function valuesFor(text: string, key: string): number[] {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...text.matchAll(new RegExp(`${escaped}=(-?[0-9.]+)`, 'g'))]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite)
}

function average(values: number[], fallback: number): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

function lastNumber(text: string, expression: RegExp, fallback: number): number {
  const matches = [...text.matchAll(expression)]
  const value = Number(matches.at(-1)?.[1])
  return Number.isFinite(value) ? value : fallback
}

function metricsFromOutput(text: string, hasAudio: boolean, personPresence: number): RawCandidateMetrics {
  const luminance = average(valuesFor(text, 'lavfi.signalstats.YAVG'), 96)
  const frameDifference = average(valuesFor(text, 'lavfi.signalstats.YDIF'), 8)
  const sceneChange = Math.max(0, ...valuesFor(text, 'lavfi.scd.score'))
  const blur = lastNumber(text, /blur mean:\s*([0-9.]+)/g, 8)
  const meanVolume = lastNumber(text, /mean_volume:\s*(-?[0-9.]+) dB/g, -60)
  const maxVolume = lastNumber(text, /max_volume:\s*(-?[0-9.]+) dB/g, -20)
  const exposure = clamp(1 - Math.abs(luminance - 112) / 112)
  const blackFramePenalty = luminance < 8 ? 1 : luminance < 28 ? (28 - luminance) / 20 : 0
  const motion = clamp(1 - Math.abs(frameDifference - 12) / 18)
  const stability = clamp(1 - Math.max(0, frameDifference - 20) / 30)
  const audioActivity = hasAudio
    ? clamp((meanVolume + 55) / 35) * (maxVolume > -0.4 ? 0.75 : 1)
    : 0
  return {
    sharpness: clamp(1 - Math.max(0, blur - 3) / 25),
    exposure,
    motion,
    stability,
    audioActivity,
    personPresence,
    sceneQuality: clamp(0.45 + Math.min(sceneChange, 20) / 40),
    blackFramePenalty,
    duplicatePenalty: 0
  }
}

export async function analyzeClipCandidates(
  ffmpegPath: string,
  source: { path: string; duration: number; hasAudio: boolean },
  segmentDuration: number,
  quality: AnalysisQuality,
  settings: RenderSettings,
  signal: AbortSignal,
  personProvider: PersonPresenceProvider = new UnavailablePersonPresenceProvider()
): Promise<AnalyzedCandidate[]> {
  const windows = generateCandidateWindows(source.duration, segmentDuration, quality)
  const candidates: AnalyzedCandidate[] = []
  for (const window of windows) {
    if (signal.aborted) throw new Error('Render cancelled.')
    const args = [
      '-hide_banner', '-loglevel', 'info',
      '-ss', window.start.toFixed(3),
      '-t', window.duration.toFixed(3),
      '-i', source.path,
      '-vf', 'fps=1,scale=320:-2,signalstats,scdet=t=10,metadata=print:file=-,blurdetect=block_width=16:block_height=16:block_pct=80'
    ]
    if (source.hasAudio) args.push('-af', 'volumedetect')
    args.push('-f', 'null', '-')
    const process = await runProcess(ffmpegPath, args, { signal })
    let personAnalysis: PersonAnalysisSummary
    try {
      const sampleCount = PERSON_ANALYSIS_POLICY.sampling[quality]
      const directory = await mkdtemp(join(tmpdir(), 'autocut-person-'))
      try {
        const rate = sampleCount / Math.max(0.1, window.duration)
        await runProcess(ffmpegPath, [
          '-hide_banner', '-loglevel', 'error',
          '-ss', window.start.toFixed(3),
          '-t', window.duration.toFixed(3),
          '-i', source.path,
          '-vf', `fps=${rate.toFixed(6)}:round=up,scale=256:-2:flags=bilinear`,
          '-frames:v', String(sampleCount),
          '-q:v', '4',
          '-y', join(directory, 'frame-%03d.jpg')
        ], { signal })
        const names = (await readdir(directory)).filter((name) => name.endsWith('.jpg')).sort()
        const frames = await Promise.all(names.map(async (name, index) => ({
          timestamp: window.start + ((index + 0.5) / Math.max(1, names.length)) * window.duration,
          dataUrl: `data:image/jpeg;base64,${(await readFile(join(directory, name))).toString('base64')}`
        })))
        personAnalysis = await personProvider.analyzeFrames(frames, settings.personAnalysis, signal)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    } catch (error) {
      if (signal.aborted) throw error
      personAnalysis = {
        detected: false,
        confidence: 0,
        sampledFrames: 0,
        framesContainingPerson: 0,
        presenceRatio: 0,
        averageConfidence: 0,
        maximumConfidence: 0,
        landmarkQuality: null,
        provider: settings.personAnalysis.provider,
        modelVersion: settings.personAnalysis.modelVersion,
        analyzerVersion: settings.personAnalysis.analyzerVersion,
        warnings: [error instanceof Error ? error.message : String(error)]
      }
    }
    const metrics = metricsFromOutput(
      `${process.stdout}\n${process.stderr}`,
      source.hasAudio,
      personAnalysis.confidence
    )
    if (candidates.length > 0) {
      const prior = candidates[candidates.length - 1].metadata.scores
      const similarity = 1 - (
        Math.abs(prior.exposure - metrics.exposure) +
        Math.abs(prior.motion - metrics.motion) +
        Math.abs(prior.sharpness - metrics.sharpness)
      ) / 3
      metrics.duplicatePenalty = similarity > 0.95 ? 0.2 : 0
    }
    const scores = scoreCandidate(metrics, settings.smartPreferences)
    candidates.push({
      start: window.start,
      end: window.end,
      metadata: {
        candidateId: window.id,
        scores,
        reasons: analysisReasons(scores, personAnalysis.detected),
        analysisFallback: false,
        personAnalysis
      }
    })
  }
  return candidates
}
