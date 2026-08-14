import type { AnalysisQuality, RenderSettings, SelectedCandidateMetadata } from '@shared/types'
import { runProcess } from '../../ffmpeg/process'
import { generateCandidateWindows } from './candidate-generator'
import { UnavailableMLAnalyzer, type OptionalMLAnalyzer } from './optional-ml'
import { analysisReasons, scoreCandidate, type RawCandidateMetrics } from './scoring'

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
  mlAnalyzer: OptionalMLAnalyzer = new UnavailableMLAnalyzer()
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
    const [process, ml] = await Promise.all([
      runProcess(ffmpegPath, args, { signal }),
      mlAnalyzer.analyzeFrame(source.path, window.start + window.duration / 2, signal)
    ])
    const metrics = metricsFromOutput(`${process.stdout}\n${process.stderr}`, source.hasAudio, ml.personPresence)
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
        reasons: analysisReasons(scores),
        analysisFallback: false
      }
    })
  }
  return candidates
}
