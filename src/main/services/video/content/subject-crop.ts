import type { RenderPlan, SubjectFocusPoint, SubjectTrack } from '@shared/types'

export const SUBJECT_TRACKING_CONFIG = {
  minimumConfidence: 0.42,
  deadZone: 0.025,
  smoothingFactor: 0.34,
  maximumPanPerSecond: 0.28
} as const

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export function smoothFocusPoints(points: SubjectFocusPoint[]): SubjectFocusPoint[] {
  const reliable = points.filter((point) => point.confidence >= SUBJECT_TRACKING_CONFIG.minimumConfidence)
    .sort((left, right) => left.timestamp - right.timestamp)
  if (reliable.length < 2) return reliable
  const output = [{ ...reliable[0] }]
  for (let index = 1; index < reliable.length; index += 1) {
    const previous = output[index - 1]
    const current = reliable[index]
    const elapsed = Math.max(0.05, current.timestamp - previous.timestamp)
    const maxMove = SUBJECT_TRACKING_CONFIG.maximumPanPerSecond * elapsed
    const smoothAxis = (prior: number, incoming: number): number => {
      const delta = incoming - prior
      if (Math.abs(delta) < SUBJECT_TRACKING_CONFIG.deadZone) return prior
      const smoothed = delta * SUBJECT_TRACKING_CONFIG.smoothingFactor
      return clamp(prior + Math.max(-maxMove, Math.min(maxMove, smoothed)))
    }
    output.push({
      ...current,
      x: smoothAxis(previous.x, current.x),
      y: smoothAxis(previous.y, current.y),
      subjectWidth: previous.subjectWidth * 0.5 + current.subjectWidth * 0.5,
      subjectHeight: previous.subjectHeight * 0.5 + current.subjectHeight * 0.5
    })
  }
  return output
}

export function createSubjectTrack(points: SubjectFocusPoint[] | undefined): SubjectTrack {
  const smoothed = smoothFocusPoints(points ?? [])
  if (smoothed.length === 0) {
    return { points: [], confidence: 0, fallback: true, reason: 'No reliable subject; Center Crop used.' }
  }
  const confidence = smoothed.reduce((sum, point) => sum + point.confidence, 0) / smoothed.length
  return {
    points: smoothed,
    confidence,
    fallback: false,
    reason: smoothed.some((point) => Math.abs(point.x - 0.5) > 0.08)
      ? 'Crop shifted to keep detected subjects visible.'
      : 'Detected subjects remain within the center crop.'
  }
}

export function applySubjectCropPlans(plan: RenderPlan): RenderPlan {
  if (plan.output.fitMode !== 'crop' || plan.cropFocus !== 'smart-subject') return plan
  return {
    ...plan,
    segments: plan.segments.map((segment) => {
      const track = createSubjectTrack(segment.selectedCandidate?.personAnalysis?.focusPoints)
      const selectedCandidate = segment.selectedCandidate && !track.fallback
        ? {
            ...segment.selectedCandidate,
            decisionNotes: [...(segment.selectedCandidate.decisionNotes ?? []), track.reason]
          }
        : segment.selectedCandidate
      return { ...segment, selectedCandidate, cropPlan: { focusMode: 'smart-subject', track } }
    })
  }
}

function expressionFor(points: SubjectFocusPoint[], key: 'x' | 'y', segmentStart: number): string {
  if (points.length === 0) return '0.5'
  if (points.length === 1) return points[0][key].toFixed(5)
  let expression = points.at(-1)![key].toFixed(5)
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index]
    const to = points[index + 1]
    const fromTime = Math.max(0, from.timestamp - segmentStart)
    const toTime = Math.max(fromTime + 0.001, to.timestamp - segmentStart)
    const interpolated = `${from[key].toFixed(5)}+(${(to[key] - from[key]).toFixed(5)})*(t-${fromTime.toFixed(3)})/${(toTime - fromTime).toFixed(3)}`
    expression = `if(lt(t\\,${toTime.toFixed(3)})\\,${interpolated}\\,${expression})`
  }
  return expression
}

export function smartCropFilter(
  track: SubjectTrack | null | undefined,
  segmentStart: number,
  width: number,
  height: number
): string {
  if (!track || track.fallback || track.points.length === 0) return `crop=${width}:${height}`
  const x = expressionFor(track.points, 'x', segmentStart)
  const y = expressionFor(track.points, 'y', segmentStart)
  return `crop=${width}:${height}:x='max(0,min(iw-ow,(${x})*iw-ow/2))':y='max(0,min(ih-oh,(${y})*ih-oh/2))'`
}
