import type { CandidateScores, RenderSettings } from '@shared/types'
import { PERSON_ANALYSIS_POLICY } from '@shared/constants/person-analysis'

export const SMART_ANALYSIS_VERSION = 'phase5-mediapipe-pose-v1'

export { PERSON_ANALYSIS_POLICY } from '@shared/constants/person-analysis'

const BASE_WEIGHTS = {
  sharpness: 0.22,
  exposure: 0.18,
  motion: 0.15,
  stability: 0.15,
  audioActivity: 0.1,
  personPresence: PERSON_ANALYSIS_POLICY.baseWeight,
  sceneQuality: 0.15,
  blackFramePenalty: 0.35,
  duplicatePenalty: 0.12
} as const

export interface RawCandidateMetrics {
  sharpness: number
  exposure: number
  motion: number
  stability: number
  audioActivity: number
  personPresence: number
  sceneQuality: number
  blackFramePenalty: number
  duplicatePenalty: number
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export function scoreCandidate(
  metrics: RawCandidateMetrics,
  preferences: RenderSettings['smartPreferences']
): CandidateScores {
  const weights = {
    ...BASE_WEIGHTS,
    sharpness: BASE_WEIGHTS.sharpness * (preferences.preferClearFootage ? 1.45 : 1),
    motion: BASE_WEIGHTS.motion * (preferences.preferMotion ? 1.35 : 0.75),
    audioActivity: BASE_WEIGHTS.audioActivity * (preferences.preferAudibleMoments ? 1.5 : 0.6),
    personPresence: preferences.preferPeople
      ? PERSON_ANALYSIS_POLICY.preferredWeight
      : PERSON_ANALYSIS_POLICY.baseWeight
  }
  const positive =
    metrics.sharpness * weights.sharpness +
    metrics.exposure * weights.exposure +
    metrics.motion * weights.motion +
    metrics.stability * weights.stability +
    metrics.audioActivity * weights.audioActivity +
    metrics.personPresence * weights.personPresence +
    metrics.sceneQuality * weights.sceneQuality
  const weightTotal =
    weights.sharpness + weights.exposure + weights.motion + weights.stability +
    weights.audioActivity + weights.personPresence + weights.sceneQuality
  const total = clamp(
    positive / weightTotal -
      metrics.blackFramePenalty * weights.blackFramePenalty -
      metrics.duplicatePenalty * weights.duplicatePenalty
  )
  return { ...metrics, total }
}

export function analysisReasons(scores: CandidateScores, personDetected = false): string[] {
  const reasons: string[] = []
  if (scores.blackFramePenalty > 0.3) reasons.push('Dark frames reduced score')
  if (scores.duplicatePenalty > 0.1) reasons.push('Similar footage reduced score')
  if (scores.sharpness >= 0.68) reasons.push('Clear, sharp footage')
  if (scores.exposure >= 0.7) reasons.push('Good exposure')
  if (scores.motion >= 0.6) reasons.push('Useful motion')
  if (scores.stability >= 0.72) reasons.push('Stable camera movement')
  if (scores.audioActivity >= 0.55) reasons.push('Audible activity')
  if (personDetected && scores.personPresence >= 0.72) reasons.push('Person consistently visible')
  else if (personDetected && scores.personPresence >= 0.4) reasons.push('Person detected')
  if (scores.sceneQuality >= 0.6) reasons.push('Natural scene timing')
  return reasons.length > 0 ? reasons.slice(0, 4) : ['Best balanced candidate']
}
