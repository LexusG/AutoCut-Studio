import type { BeatAnalysisResult, CutSyncMode, RenderPlanSegment } from '@shared/types'
import { isActiveSpeech } from './speech-boundaries'

export const BEAT_SNAP_WINDOWS: Record<CutSyncMode, number> = {
  natural: 0, 'beat-assisted': 0.28, 'beat-strong': 0.48
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export function snapSegmentsToBeats(
  segments: RenderPlanSegment[],
  analysis: BeatAnalysisResult | null,
  mode: CutSyncMode
): RenderPlanSegment[] {
  const tolerance = BEAT_SNAP_WINDOWS[mode]
  if (!analysis || tolerance === 0 || segments.length < 2) return segments
  const updated = segments.map((segment) => ({ ...segment, selectedCandidate: segment.selectedCandidate ? { ...segment.selectedCandidate } : null }))
  let timeline = updated[0].duration - (updated[0].transitionToNext?.duration ?? 0)
  for (let index = 0; index < updated.length - 1; index += 1) {
    const current = updated[index]
    const next = updated[index + 1]
    if (current.locked || next.locked) {
      timeline += next.duration - (next.transitionToNext?.duration ?? 0)
      continue
    }
    const beat = analysis.beats
      .filter((item) => Math.abs(item.timestamp - timeline) <= tolerance)
      .filter((item) => mode === 'beat-strong' || item.strong || item.strength >= 0.55)
      .sort((left, right) => Math.abs(left.timestamp - timeline) - Math.abs(right.timestamp - timeline))[0]
    if (beat) {
      const delta = round(beat.timestamp - timeline)
      const newCurrentDuration = round(current.duration + delta)
      const newNextDuration = round(next.duration - delta)
      const currentEnd = round(current.start + newCurrentDuration)
      const nextEnd = round(next.start + newNextDuration)
      const speechUnsafe = (current.selectedCandidate?.speechAnalysis && isActiveSpeech(current.selectedCandidate.speechAnalysis, currentEnd)) ||
        (next.selectedCandidate?.speechAnalysis && isActiveSpeech(next.selectedCandidate.speechAnalysis, next.start))
      if (!speechUnsafe && newCurrentDuration >= 0.5 && newNextDuration >= 0.5 && currentEnd <= current.sourceDuration && nextEnd <= next.sourceDuration) {
        current.duration = newCurrentDuration
        current.end = currentEnd
        current.automaticEnd = currentEnd
        next.duration = newNextDuration
        next.end = nextEnd
        next.automaticEnd = nextEnd
        const note = `Cut moved ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}s to a nearby beat.`
        current.selectedCandidate = current.selectedCandidate
          ? { ...current.selectedCandidate, decisionNotes: [...(current.selectedCandidate.decisionNotes ?? []), note] }
          : null
        timeline = beat.timestamp
      }
    }
    timeline += next.duration - (next.transitionToNext?.duration ?? 0)
  }
  return updated
}
