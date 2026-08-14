import { describe, expect, it } from 'vitest'
import { allocateSegmentDurations, InfeasibleDurationError } from '../src/main/services/video/segment-allocator'

const clips = (count: number, usableDuration = 120) =>
  Array.from({ length: count }, () => ({ usableDuration }))

describe('Phase 3 duration allocation', () => {
  it.each([15, 30, 60, 90])('allocates a %d second fixed target before rendering', (target) => {
    const allocation = allocateSegmentDurations(
      clips(6),
      'fast',
      target,
      true,
      'crossfade',
      0.5
    )
    expect(allocation.expectedDuration).toBeCloseTo(target, 2)
    expect(allocation.includedIndices).toHaveLength(6)
  })

  it('derives Auto duration from pace, clip count, and transition overlap', () => {
    const allocation = allocateSegmentDurations(
      clips(3),
      'normal',
      null,
      true,
      'crossfade',
      0.5
    )
    expect(allocation.durations).toEqual([4.5, 4.5, 4.5])
    expect(allocation.expectedDuration).toBe(12.5)
  })

  it('reports a minimum instead of violating Use Every Clip', () => {
    expect(() =>
      allocateSegmentDurations(clips(10), 'fast', 5, true, 'crossfade', 0.5)
    ).toThrow(InfeasibleDurationError)
    try {
      allocateSegmentDurations(clips(10), 'fast', 5, true, 'crossfade', 0.5)
    } catch (error) {
      expect(error).toMatchObject({ requestedDuration: 5, clipCount: 10 })
      expect((error as InfeasibleDurationError).minimumDuration).toBeGreaterThan(5)
    }
  })

  it('may select fewer clips when Use Every Clip is disabled', () => {
    const allocation = allocateSegmentDurations(
      clips(10),
      'slow',
      15,
      false,
      'crossfade',
      0.5
    )
    expect(allocation.includedIndices.length).toBeLessThan(10)
    expect(allocation.expectedDuration).toBeCloseTo(15, 2)
  })

  it('allows a sub-pace target when Use Every Clip is disabled', () => {
    const allocation = allocateSegmentDurations(
      clips(4),
      'normal',
      1,
      false,
      'crossfade',
      0.5
    )
    expect(allocation.includedIndices).toHaveLength(1)
    expect(allocation.expectedDuration).toBe(1)
  })

  it('clamps transitions for very short clips', () => {
    const allocation = allocateSegmentDurations(
      [{ usableDuration: 0.4 }, { usableDuration: 0.7 }],
      'fast',
      null,
      true,
      'dip-to-black',
      1
    )
    expect(allocation.durations).toEqual([0.4, 0.7])
    expect(allocation.transitionDurations[0]).toBeLessThanOrEqual(0.16)
    expect(allocation.expectedDuration).toBeGreaterThan(0)
  })

  it('accounts for transitions in final duration', () => {
    const noTransition = allocateSegmentDurations(clips(2), 'normal', null, true, 'none', 0.5)
    const crossfade = allocateSegmentDurations(clips(2), 'normal', null, true, 'crossfade', 0.5)
    expect(noTransition.expectedDuration).toBe(9)
    expect(crossfade.expectedDuration).toBe(8.5)
  })
})
