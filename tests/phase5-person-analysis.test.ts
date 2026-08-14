import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { aggregatePersonPresence } from '../src/shared/utils/person-analysis'
import { PERSON_ANALYSIS_POLICY } from '../src/shared/constants/person-analysis'
import { scoreCandidate, type RawCandidateMetrics } from '../src/main/services/video/smart/scoring'

const configuration = DEFAULT_RENDER_SETTINGS.personAnalysis
const quality: RawCandidateMetrics = {
  sharpness: 0.88,
  exposure: 0.86,
  motion: 0.65,
  stability: 0.85,
  audioActivity: 0.5,
  personPresence: 0,
  sceneQuality: 0.75,
  blackFramePenalty: 0,
  duplicatePenalty: 0
}

describe('Phase 5 person-presence analysis', () => {
  it('distinguishes momentary detection from consistent presence', () => {
    const momentary = aggregatePersonPresence([0.9, 0.1, 0.2, 0.1, 0.2, 0.1], configuration)
    const consistent = aggregatePersonPresence([0.9, 0.84, 0.8, 0.88, 0.82, 0.86], configuration)
    expect(momentary.framesContainingPerson).toBe(1)
    expect(momentary.presenceRatio).toBeCloseTo(1 / 6)
    expect(consistent.framesContainingPerson).toBe(6)
    expect(consistent.confidence).toBeGreaterThan(momentary.confidence + 0.45)
  })

  it('uses bounded quality-specific sample counts', () => {
    expect(PERSON_ANALYSIS_POLICY.sampling).toEqual({ fast: 3, balanced: 6, detailed: 10 })
  })

  it('makes Prefer People material without overriding severely bad footage', () => {
    const preferPeople = { ...DEFAULT_RENDER_SETTINGS.smartPreferences, preferPeople: true }
    const excellentNoPerson = scoreCandidate(quality, preferPeople)
    const goodPerson = scoreCandidate({ ...quality, sharpness: 0.78, personPresence: 0.9 }, preferPeople)
    const blackPerson = scoreCandidate({
      ...quality,
      sharpness: 0.1,
      exposure: 0.05,
      stability: 0.15,
      personPresence: 1,
      blackFramePenalty: 1
    }, preferPeople)
    expect(goodPerson.total).toBeGreaterThan(excellentNoPerson.total)
    expect(excellentNoPerson.total).toBeGreaterThan(blackPerson.total)
  })
})
