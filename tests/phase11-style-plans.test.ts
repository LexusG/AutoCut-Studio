import { describe, expect, it } from 'vitest'
import { EDIT_STYLES, EDIT_STYLE_VERSION, recommendEditStyle, resolveEditStyle } from '../src/shared/constants/edit-styles'
import type { StyleRecommendationSignals } from '../src/shared/constants/edit-styles'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import type { ProbedMedia } from '../src/main/services/video/metadata'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import type { EditStyleId, RenderPlan, RenderSettings } from '../src/shared/types'

const clip = (duration: number, width = 1920, height = 1080, hasAudio = true): ProbedMedia => ({
  duration,
  hasAudio,
  video: { codec: 'h264', width, height, frameRate: 30, rotation: 0, bitrate: null }
})

const PATHS = ['/a.mp4', '/b.mp4', '/c.mp4', '/d.mp4', '/e.mp4', '/f.mp4']
const METADATA = PATHS.map(() => clip(30))

function settingsFor(styleId: EditStyleId | null): RenderSettings {
  return {
    ...DEFAULT_RENDER_SETTINGS,
    editStyle: styleId === null ? null : { id: styleId, version: EDIT_STYLE_VERSION }
  }
}

function planFor(styleId: EditStyleId | null, overrides: Partial<RenderSettings> = {}): RenderPlan {
  return buildRenderPlan('project', 0, PATHS, METADATA, 'fingerprint', {
    ...settingsFor(styleId),
    ...overrides
  })
}

const durations = (plan: RenderPlan): number[] => plan.segments.map((segment) => segment.duration)

function signals(overrides: Partial<StyleRecommendationSignals> = {}): StyleRecommendationSignals {
  return {
    clipCount: 10,
    averageClipDuration: 6,
    hasMusic: false,
    audioRatio: 0.5,
    portraitRatio: 0,
    speechRatio: null,
    motionRatio: null,
    personRatio: null,
    ...overrides
  }
}

describe('edit styles reach the render plan', () => {
  it('freezes the resolved style definition onto the plan', () => {
    const plan = planFor('cinematic')
    // The whole definition is stored, not a reference, so re-rendering an old plan
    // replays its own parameters rather than whatever this build now defines.
    expect(plan.editStyle?.id).toBe('cinematic')
    expect(plan.editStyle?.version).toBe(EDIT_STYLE_VERSION)
    expect(plan.editStyle?.pacingCurve.points).toHaveLength(5)
    expect(plan.editStyle?.hookDuration.minimum).toBe(3)
  })

  it('produces meaningfully different segment durations across styles', () => {
    const cinematic = durations(planFor('cinematic'))
    const socialFast = durations(planFor('social-fast'))

    // Cinematic is a slow style and Social Fast a fast one; the plans must reflect that.
    expect(cinematic[0]).toBeGreaterThan(socialFast[0])
    expect(cinematic.every((value) => value >= 5)).toBe(true)
    expect(socialFast.every((value) => value <= 4)).toBe(true)
  })

  it('gives every style a distinct plan shape', () => {
    const shapes = EDIT_STYLES.map((style) => {
      const plan = planFor(style.id)
      return JSON.stringify({
        durations: durations(plan),
        transition: plan.segments[0].transitionToNext,
        pace: plan.pace
      })
    })
    // Clean and Story share a pace, so they are allowed to coincide; the fast and slow
    // styles must not collapse onto the others.
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(3)
  })

  it('applies the style transition rather than the incoming setting', () => {
    const plan = planFor('story', { transitionPreference: 'dip-to-black', transitionDuration: 0.25 })
    expect(plan.segments[0].transitionToNext?.type).toBe('fade')
    expect(plan.segments[0].transitionToNext?.duration).toBeGreaterThan(0.25)
  })

  it('still honours an explicit target duration under every style', () => {
    for (const style of EDIT_STYLES) {
      const plan = planFor(style.id, { targetDuration: 30, useEveryClip: false })
      expect(plan.expectedDuration).toBeCloseTo(30, 1)
    }
  })

  it('never plans a segment longer than its source', () => {
    const shortMetadata = PATHS.map(() => clip(2))
    for (const style of EDIT_STYLES) {
      const plan = buildRenderPlan('project', 0, PATHS, shortMetadata, 'fingerprint', settingsFor(style.id))
      for (const segment of plan.segments) {
        expect(segment.end).toBeLessThanOrEqual(segment.sourceDuration + 0.001)
      }
    }
  })
})

describe('legacy projects are untouched', () => {
  it('records no style and keeps the caller-supplied pace and transitions', () => {
    const plan = planFor(null, { pace: 'slow', transitionPreference: 'dip-to-black', transitionDuration: 1 })
    expect(plan.editStyle).toBeNull()
    expect(plan.pace).toBe('slow')
    expect(plan.segments[0].transitionToNext?.type).toBe('dip-to-black')
  })

  it('produces the same plan a pre-Phase-11 build would have', () => {
    // DEFAULT_RENDER_SETTINGS has editStyle: null, so this is the untouched path.
    const plan = buildRenderPlan('project', 0, PATHS, METADATA, 'fingerprint', DEFAULT_RENDER_SETTINGS)
    expect(durations(plan)).toEqual([4.5, 4.5, 4.5, 4.5, 4.5, 4.5])
    expect(plan.editStyle).toBeNull()
  })
})

describe('resolving Auto', () => {
  it('resolves Auto to a concrete definition', () => {
    const resolved = resolveEditStyle({ id: 'auto', version: EDIT_STYLE_VERSION }, signals())
    expect(resolved).not.toBeNull()
    expect(resolved?.id).not.toBe('auto')
  })

  it('resolves Auto during planning rather than leaving it unapplied', () => {
    const plan = planFor('auto')
    expect(plan.editStyle).not.toBeNull()
    expect(plan.editStyle?.id).not.toBe('auto')
    // The resolved style must actually govern the plan.
    expect(plan.pace).toBe(plan.editStyle?.pace)
  })

  it('returns null for a legacy reference so nothing is applied', () => {
    expect(resolveEditStyle(null, signals())).toBeNull()
  })

  it('uses refined signals when Smart analysis has supplied them', () => {
    expect(recommendEditStyle(signals({ speechRatio: 0.7 }))).toBe('story')
    expect(
      recommendEditStyle(signals({ hasMusic: true, motionRatio: 0.8, averageClipDuration: 12 }))
    ).toBe('energetic')
  })

  it('falls back to structure when refined signals are unavailable', () => {
    // Long clips that all carry audio with no soundtrack read as talking footage.
    expect(recommendEditStyle(signals({ audioRatio: 1, averageClipDuration: 12 }))).toBe('story')
    // Portrait clips with music read as a social edit.
    expect(recommendEditStyle(signals({ hasMusic: true, portraitRatio: 0.9 }))).toBe('social-fast')
    expect(recommendEditStyle(signals())).toBe('clean')
  })

  it('picks a style deterministically for identical footage', () => {
    const first = planFor('auto').editStyle?.id
    const second = planFor('auto').editStyle?.id
    expect(first).toBe(second)
  })
})
