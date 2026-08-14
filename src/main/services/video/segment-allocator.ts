import type { EditingPace, TransitionPreference } from '@shared/types'

export interface SegmentCapacity {
  usableDuration: number
}

export interface DurationAllocation {
  includedIndices: number[]
  durations: number[]
  transitionDurations: number[]
  expectedDuration: number
  minimumFeasibleDuration: number
  warnings: string[]
}

export class InfeasibleDurationError extends Error {
  constructor(
    readonly requestedDuration: number,
    readonly minimumDuration: number,
    readonly clipCount: number
  ) {
    super(
      `${requestedDuration} seconds is too short to include all ${clipCount} clips using the current settings. Minimum feasible duration: approximately ${Math.ceil(minimumDuration)} seconds.`
    )
    this.name = 'InfeasibleDurationError'
  }
}

const paceRanges: Record<EditingPace, { minimum: number; preferred: number; maximum: number }> = {
  slow: { minimum: 5, preferred: 7.5, maximum: 10 },
  normal: { minimum: 3, preferred: 4.5, maximum: 6 },
  fast: { minimum: 1.5, preferred: 2.5, maximum: 4 }
}

const roundMillis = (value: number): number => Math.round(value * 1000) / 1000

function transitionOverlaps(
  durations: number[],
  type: TransitionPreference,
  requestedDuration: number
): number[] {
  if (type === 'none' || requestedDuration <= 0) return durations.slice(1).map(() => 0)
  return durations.slice(0, -1).map((duration, index) =>
    roundMillis(Math.max(0, Math.min(requestedDuration, duration * 0.4, durations[index + 1] * 0.4)))
  )
}

function distribute(
  durations: number[],
  capacities: number[],
  targetTotal: number,
  preferredMaximum: number
): void {
  let remaining = Math.max(0, targetTotal - durations.reduce((sum, value) => sum + value, 0))
  const fill = (limitFor: (index: number) => number): void => {
    for (let pass = 0; pass < 4 && remaining > 0.0005; pass += 1) {
      const available = durations.map((value, index) => Math.max(0, limitFor(index) - value))
      const active = available.filter((value) => value > 0.0005).length
      if (active === 0) return
      const share = remaining / active
      for (let index = 0; index < durations.length && remaining > 0.0005; index += 1) {
        const addition = Math.min(available[index], share, remaining)
        durations[index] += addition
        remaining -= addition
      }
    }
  }

  fill((index) => Math.min(capacities[index], preferredMaximum))
  fill((index) => capacities[index])
}

function minimumDurations(capacities: number[], pace: EditingPace): number[] {
  const minimum = paceRanges[pace].minimum
  return capacities.map((capacity) => Math.max(0.05, Math.min(capacity, minimum)))
}

function outputDuration(durations: number[], transitions: number[]): number {
  return roundMillis(
    durations.reduce((sum, value) => sum + value, 0) -
      transitions.reduce((sum, value) => sum + value, 0)
  )
}

function minimumFor(
  capacities: number[],
  pace: EditingPace,
  transitionType: TransitionPreference,
  transitionDuration: number
): number {
  const minimums = minimumDurations(capacities, pace)
  return outputDuration(minimums, transitionOverlaps(minimums, transitionType, transitionDuration))
}

export function allocateSegmentDurations(
  candidates: SegmentCapacity[],
  pace: EditingPace,
  requestedDuration: number | null,
  useEveryClip: boolean,
  transitionType: TransitionPreference,
  transitionDuration: number
): DurationAllocation {
  if (candidates.length === 0) throw new Error('Add at least one video before rendering.')
  const allCapacities = candidates.map((candidate) => Math.max(0.05, candidate.usableDuration))
  let includedIndices = candidates.map((_candidate, index) => index)
  let capacities = [...allCapacities]

  if (requestedDuration != null && requestedDuration <= 0) {
    throw new Error('Target duration must be greater than zero.')
  }

  if (requestedDuration != null && !useEveryClip) {
    while (
      capacities.length > 1 &&
      minimumFor(capacities, pace, transitionType, transitionDuration) > requestedDuration
    ) {
      capacities.pop()
      includedIndices.pop()
    }
  }

  let minimums = minimumDurations(capacities, pace)
  let minimumTransitions = transitionOverlaps(minimums, transitionType, transitionDuration)
  let minimumFeasibleDuration = outputDuration(minimums, minimumTransitions)
  if (
    requestedDuration != null &&
    !useEveryClip &&
    requestedDuration + 0.01 < minimumFeasibleDuration
  ) {
    includedIndices = includedIndices.slice(0, 1)
    capacities = capacities.slice(0, 1)
    minimums = [Math.min(capacities[0], requestedDuration)]
    minimumTransitions = []
    minimumFeasibleDuration = minimums[0]
  }
  if (requestedDuration != null && requestedDuration + 0.01 < minimumFeasibleDuration) {
    throw new InfeasibleDurationError(requestedDuration, minimumFeasibleDuration, capacities.length)
  }

  const range = paceRanges[pace]
  const durations = requestedDuration == null
    ? capacities.map((capacity) => Math.min(capacity, range.preferred))
    : [...minimums]

  if (requestedDuration != null) {
    for (let pass = 0; pass < 4; pass += 1) {
      const overlaps = transitionOverlaps(durations, transitionType, transitionDuration)
      distribute(
        durations,
        capacities,
        requestedDuration + overlaps.reduce((sum, value) => sum + value, 0),
        range.maximum
      )
    }
  }

  const roundedDurations = durations.map((value, index) =>
    roundMillis(Math.min(capacities[index], Math.max(0.05, value)))
  )
  const transitionDurations = transitionOverlaps(
    roundedDurations,
    transitionType,
    transitionDuration
  )
  const expectedDuration = outputDuration(roundedDurations, transitionDurations)
  const warnings: string[] = []
  if (requestedDuration != null && expectedDuration + 0.25 < requestedDuration) {
    warnings.push(
      `Only ${expectedDuration.toFixed(1)} seconds of usable footage is available for the ${requestedDuration}-second target.`
    )
  }

  return {
    includedIndices,
    durations: roundedDurations,
    transitionDurations,
    expectedDuration,
    minimumFeasibleDuration,
    warnings
  }
}

export function getPaceRange(pace: EditingPace): { minimum: number; preferred: number; maximum: number } {
  return { ...paceRanges[pace] }
}
