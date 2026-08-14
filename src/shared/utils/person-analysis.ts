import { PERSON_ANALYSIS_POLICY } from '../constants/person-analysis'
import type { PersonAnalysisConfiguration, PersonAnalysisSummary } from '../types'

export function aggregatePersonPresence(
  confidences: number[],
  configuration: PersonAnalysisConfiguration
): PersonAnalysisSummary {
  const detectedConfidences = confidences.filter(
    (confidence) => confidence >= PERSON_ANALYSIS_POLICY.detectionThreshold
  )
  const presenceRatio = confidences.length > 0 ? detectedConfidences.length / confidences.length : 0
  const averageConfidence = detectedConfidences.length > 0
    ? detectedConfidences.reduce((sum, confidence) => sum + confidence, 0) / detectedConfidences.length
    : 0
  const maximumConfidence = Math.max(0, ...confidences)
  const confidence = Math.min(1,
    presenceRatio * PERSON_ANALYSIS_POLICY.presenceRatioInfluence +
    averageConfidence * PERSON_ANALYSIS_POLICY.confidenceInfluence
  )
  return {
    detected: detectedConfidences.length > 0,
    confidence,
    sampledFrames: confidences.length,
    framesContainingPerson: detectedConfidences.length,
    presenceRatio,
    averageConfidence,
    maximumConfidence,
    landmarkQuality: detectedConfidences.length > 0 ? averageConfidence : null,
    provider: configuration.provider,
    modelVersion: configuration.modelVersion,
    analyzerVersion: configuration.analyzerVersion,
    warnings: []
  }
}

