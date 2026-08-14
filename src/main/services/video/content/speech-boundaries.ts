import type { RenderPlanSegment, SpeechAnalysisResult, SpeechCutProtection } from '@shared/types'

export interface SpeechAdjustedRange {
  start: number
  end: number
  speechActivity: number
  boundaryQuality: number
  completeness: number
  note: string | null
}

const windows: Record<SpeechCutProtection, number> = { off: 0, normal: 0.45, strong: 0.85 }
const round = (value: number): number => Math.round(value * 1000) / 1000

export function isActiveSpeech(result: SpeechAnalysisResult, time: number, margin = 0): boolean {
  return result.speechRegions.some((item) => time > item.startTime + margin && time < item.endTime - margin)
}

function speechOverlap(result: SpeechAnalysisResult, start: number, end: number): number {
  return result.speechRegions.reduce((sum, item) =>
    sum + Math.max(0, Math.min(end, item.endTime) - Math.max(start, item.startTime)), 0)
}

export function adjustRangeForSpeech(
  segment: RenderPlanSegment,
  analysis: SpeechAnalysisResult,
  protection: SpeechCutProtection
): SpeechAdjustedRange {
  const duration = segment.duration
  const activity = duration > 0 ? speechOverlap(analysis, segment.start, segment.end) / duration : 0
  const complete = analysis.speechRegions.filter((item) =>
    item.startTime >= segment.start && item.endTime <= segment.end
  ).reduce((sum, item) => sum + item.duration, 0)
  const completeness = activity > 0 ? Math.min(1, complete / Math.max(0.01, speechOverlap(analysis, segment.start, segment.end))) : 1
  if (protection === 'off' || analysis.noAudioStream || analysis.speechRegions.length === 0) {
    return { start: segment.start, end: segment.end, speechActivity: activity, boundaryQuality: 0.5, completeness, note: null }
  }

  const tolerance = windows[protection]
  const boundaries = analysis.silenceRegions.flatMap((item) => [item.startTime, item.endTime])
  const desiredEnd = segment.end
  const viable = boundaries
    .map((boundary) => ({ boundary, distance: Math.abs(boundary - desiredEnd) }))
    .filter(({ boundary, distance }) => distance <= tolerance && boundary - duration >= 0 && boundary <= segment.sourceDuration)
    .filter(({ boundary }) => !isActiveSpeech(analysis, boundary - duration) && !isActiveSpeech(analysis, boundary))
    .sort((left, right) => left.distance - right.distance)
  const chosen = viable[0]
  if (!chosen) {
    const safe = !isActiveSpeech(analysis, segment.start) && !isActiveSpeech(analysis, segment.end)
    return { start: segment.start, end: segment.end, speechActivity: activity, boundaryQuality: safe ? 0.8 : 0.2, completeness, note: null }
  }
  const start = round(chosen.boundary - duration)
  const end = round(chosen.boundary)
  const delta = round(end - desiredEnd)
  return {
    start, end, speechActivity: speechOverlap(analysis, start, end) / duration,
    boundaryQuality: Math.max(0.65, 1 - chosen.distance / Math.max(0.01, tolerance)),
    completeness,
    note: `Cut moved ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}s to a speech pause.`
  }
}
