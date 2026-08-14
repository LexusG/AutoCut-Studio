export const PERSON_ANALYSIS_POLICY = {
  detectionThreshold: 0.45,
  sampling: { fast: 3, balanced: 6, detailed: 10 },
  presenceRatioInfluence: 0.65,
  confidenceInfluence: 0.35,
  baseWeight: 0.04,
  preferredWeight: 0.24
} as const

