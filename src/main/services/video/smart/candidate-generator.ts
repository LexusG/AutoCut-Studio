import type { AnalysisQuality } from '@shared/types'

export interface CandidateWindow {
  id: string
  start: number
  end: number
  duration: number
}

const candidateCounts: Record<AnalysisQuality, number> = { fast: 3, balanced: 5, detailed: 8 }

export function generateCandidateWindows(
  sourceDuration: number,
  segmentDuration: number,
  quality: AnalysisQuality
): CandidateWindow[] {
  const margin = sourceDuration <= 2 ? 0 : Math.min(2, sourceDuration * 0.08)
  const usableStart = margin
  const usableEnd = Math.max(usableStart + 0.05, sourceDuration - margin)
  const duration = Math.min(segmentDuration, usableEnd - usableStart)
  const available = Math.max(0, usableEnd - usableStart - duration)
  const count = available < 0.25 ? 1 : candidateCounts[quality]
  return Array.from({ length: count }, (_unused, index) => {
    const ratio = count === 1 ? 0.5 : index / (count - 1)
    const start = Math.min(sourceDuration - duration, usableStart + available * ratio)
    return {
      id: `candidate-${index + 1}`,
      start: Math.round(start * 1000) / 1000,
      end: Math.round((start + duration) * 1000) / 1000,
      duration: Math.round(duration * 1000) / 1000
    }
  })
}
