import { describe, expect, it } from 'vitest'
import { EDIT_STYLES, EDIT_STYLE_VERSION, getEditStyle, recommendEditStyle } from '../src/shared/constants/edit-styles'
import type { EditStyleId, StyleRecommendationSignals } from '../src/shared/constants/edit-styles'
import type { ProjectRecord } from '../src/shared/utils/migrations'
import { migrateProjectRecord, PROJECT_SCHEMA_VERSION } from '../src/shared/utils/migrations'
import { parseProjectFile } from '../src/shared/utils/project-codec'
import {
  applyEditStyle,
  createDefaultProjectSettings,
  createProjectFile,
  toRenderSettings
} from '../src/shared/utils/project-settings'

const STYLE_IDS = EDIT_STYLES.map((style) => style.id)

/** Editing fields Phase 11 introduced; a real v9 project has none of them. */
const PHASE_11_EDITING_FIELDS = [
  'editStyle',
  'openingStrategy',
  'endingStrategy',
  'transitionStrategy',
  'autoMotion',
  'visualConsistency',
  'semanticFlow',
  'editStructure',
  'versionCount'
] as const

function signals(overrides: Partial<StyleRecommendationSignals> = {}): StyleRecommendationSignals {
  return {
    clipCount: 10,
    speechRatio: 0.05,
    motionRatio: 0.3,
    personRatio: 0.3,
    hasMusic: false,
    averageClipDuration: 6,
    ...overrides
  }
}

describe('edit style definitions', () => {
  it('defines the five documented styles and no more', () => {
    expect(STYLE_IDS).toEqual(['clean', 'social-fast', 'cinematic', 'energetic', 'story'])
  })

  it('does not define "auto" as a style, since it is a choice to be resolved', () => {
    expect(getEditStyle('auto')).toBeNull()
  })

  it('stamps every style with the current definition version', () => {
    for (const style of EDIT_STYLES) expect(style.version).toBe(EDIT_STYLE_VERSION)
  })

  it('gives every style a pacing curve that is not flat', () => {
    for (const style of EDIT_STYLES) {
      const weights = style.pacingCurve.points.map((point) => point.weight)
      // A flat curve would reproduce the metronome pacing this phase exists to fix.
      expect(Math.max(...weights)).toBeGreaterThan(Math.min(...weights))
      expect(style.pacingCurve.variation).toBeGreaterThan(0)
    }
  })

  it('covers all five pacing phases in order for every style', () => {
    for (const style of EDIT_STYLES) {
      expect(style.pacingCurve.points.map((point) => point.phase)).toEqual([
        'opening',
        'buildup',
        'middle',
        'peak',
        'ending'
      ])
      const positions = style.pacingCurve.points.map((point) => point.position)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    }
  })

  it('keeps most boundaries as hard cuts in every style', () => {
    // Part 16: professional edits are mostly cuts. No style may decorate every boundary.
    for (const style of EDIT_STYLES) {
      expect(style.transitionFrequency).toBeLessThanOrEqual(0.6)
    }
  })

  it('gives fast styles shorter hooks than slow ones', () => {
    const fast = getEditStyle('social-fast')!
    const cinematic = getEditStyle('cinematic')!
    expect(fast.hookDuration.maximum).toBeLessThan(cinematic.hookDuration.minimum + 1)
    expect(fast.pacingCurve.points[0].weight).toBeLessThan(cinematic.pacingCurve.points[0].weight)
  })
})

describe('applying an edit style', () => {
  it.each(STYLE_IDS)('produces a settings projection distinct from the others for %s', (styleId) => {
    const base = createDefaultProjectSettings()
    const applied = applyEditStyle(base, styleId)
    const others = STYLE_IDS.filter((candidate) => candidate !== styleId).map((candidate) =>
      JSON.stringify(applyEditStyle(base, candidate).editing)
    )
    expect(others).not.toContain(JSON.stringify(applied.editing))
  })

  it('moves pace, transitions, captions, motion and audio together', () => {
    const base = createDefaultProjectSettings()
    const story = applyEditStyle(base, 'story')
    const energetic = applyEditStyle(base, 'energetic')

    expect(story.editing.pace).toBe('normal')
    expect(story.editing.cutSync).toBe('natural')
    expect(story.editing.smartPreferences.preferSpeech).toBe(true)
    expect(story.audio.musicVolume).toBeLessThan(energetic.audio.musicVolume)

    expect(energetic.editing.cutSync).toBe('beat-strong')
    expect(energetic.editing.autoMotion).toBe('dynamic')
    expect(energetic.editing.pace).toBe('fast')
  })

  it('records the style id and its definition version', () => {
    const applied = applyEditStyle(createDefaultProjectSettings(), 'cinematic')
    expect(applied.editing.editStyle).toEqual({ id: 'cinematic', version: EDIT_STYLE_VERSION })
  })

  it('records Auto without committing to a look', () => {
    const base = createDefaultProjectSettings()
    const applied = applyEditStyle(base, 'auto')
    expect(applied.editing.editStyle).toEqual({ id: 'auto', version: EDIT_STYLE_VERSION })
    // The concrete style is decided from the footage at plan time, so nothing else moves.
    expect({ ...applied.editing, editStyle: null }).toEqual({ ...base.editing, editStyle: null })
  })

  it('rejects an unknown style rather than silently doing nothing', () => {
    expect(() => applyEditStyle(createDefaultProjectSettings(), 'nonsense' as EditStyleId)).toThrow(
      /unavailable/i
    )
  })

  it('survives a save and reload round-trip', () => {
    const settings = applyEditStyle(createDefaultProjectSettings(), 'social-fast')
    const project = createProjectFile(settings, ['/clips/a.mp4'])
    const reloaded = parseProjectFile(JSON.stringify(project))
    expect(reloaded.settings.editing.editStyle).toEqual({ id: 'social-fast', version: EDIT_STYLE_VERSION })
    expect(reloaded.settings.editing.autoMotion).toBe('dynamic')
  })

  it('carries the style through to render settings', () => {
    const settings = applyEditStyle(createDefaultProjectSettings(), 'clean')
    const render = toRenderSettings(settings)
    expect(render.editStyle).toEqual({ id: 'clean', version: EDIT_STYLE_VERSION })
    expect(render.transitionStrategy).toBe('automatic')
    expect(render.visualConsistency).toBe('basic')
  })
})

describe('legacy projects', () => {
  it('marks a migrated project as having no edit style', () => {
    const settings = createDefaultProjectSettings()
    const record = JSON.parse(
      JSON.stringify(createProjectFile(settings, ['/clips/a.mp4']))
    ) as ProjectRecord
    record.version = 9
    const priorEditing = (record.settings as { editing: Record<string, unknown> }).editing
    for (const field of PHASE_11_EDITING_FIELDS) delete priorEditing[field]

    const migrated = migrateProjectRecord(record).record
    const editing = (migrated.settings as { editing: Record<string, unknown> }).editing
    expect(migrated.version).toBe(PROJECT_SCHEMA_VERSION)
    // `null` is the explicit legacy marker every Phase 11 planner checks.
    expect(editing.editStyle).toBeNull()
  })

  it('gives a migrated project inert Phase 11 defaults so its output cannot change', () => {
    const record = JSON.parse(
      JSON.stringify(createProjectFile(createDefaultProjectSettings(), ['/clips/a.mp4']))
    ) as ProjectRecord
    record.version = 9
    // A genuine v9 file predates all of these, so strip them to model one honestly.
    const priorEditing = (record.settings as { editing: Record<string, unknown> }).editing
    for (const field of PHASE_11_EDITING_FIELDS) delete priorEditing[field]

    const editing = (migrateProjectRecord(record).record.settings as { editing: Record<string, unknown> }).editing

    expect(editing.autoMotion).toBe('off')
    expect(editing.visualConsistency).toBe('off')
    expect(editing.semanticFlow).toBe('off')
    expect(editing.transitionStrategy).toBe('uniform')
    expect(editing.openingStrategy).toBe('chronological')
    expect(editing.endingStrategy).toBe('chronological')
    expect(editing.versionCount).toBe(1)
  })

  it('starts new projects on automatic style selection', () => {
    expect(createDefaultProjectSettings().editing.editStyle).toEqual({
      id: 'auto',
      version: EDIT_STYLE_VERSION
    })
  })
})

describe('automatic style recommendation', () => {
  it('picks Story for speech-heavy footage', () => {
    expect(recommendEditStyle(signals({ speechRatio: 0.6 }))).toBe('story')
  })

  it('prefers speech protection even when there is music and motion', () => {
    expect(recommendEditStyle(signals({ speechRatio: 0.5, hasMusic: true, motionRatio: 0.9 }))).toBe('story')
  })

  it('picks Energetic for long high-motion takes with music', () => {
    expect(
      recommendEditStyle(signals({ hasMusic: true, motionRatio: 0.8, averageClipDuration: 12 }))
    ).toBe('energetic')
  })

  it('picks Social Fast for short high-motion clips with music', () => {
    expect(
      recommendEditStyle(signals({ hasMusic: true, motionRatio: 0.7, averageClipDuration: 4 }))
    ).toBe('social-fast')
  })

  it('picks Cinematic for calm scenery with few people', () => {
    expect(
      recommendEditStyle(signals({ personRatio: 0.1, motionRatio: 0.2, averageClipDuration: 9 }))
    ).toBe('cinematic')
  })

  it('falls back to Clean for mixed footage', () => {
    expect(recommendEditStyle(signals({ personRatio: 0.5, motionRatio: 0.45 }))).toBe('clean')
  })

  it('only ever returns a style that exists', () => {
    const cases = [
      signals(),
      signals({ speechRatio: 1 }),
      signals({ hasMusic: true, motionRatio: 1, averageClipDuration: 30 }),
      signals({ clipCount: 1, averageClipDuration: 0.5 })
    ]
    for (const candidate of cases) {
      expect(getEditStyle(recommendEditStyle(candidate))).not.toBeNull()
    }
  })
})
