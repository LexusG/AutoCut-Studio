import { describe, expect, it } from 'vitest'
import {
  MIGRATIONS,
  migrateProjectRecord,
  OLDEST_SUPPORTED_PROJECT_VERSION,
  PROJECT_SCHEMA_VERSION,
  UnsupportedProjectVersionError
} from '../src/shared/utils/migrations'
import type { ProjectRecord } from '../src/shared/utils/migrations'
import { parseProjectDocument, parseProjectFile } from '../src/shared/utils/project-codec'
import { createDefaultProjectSettings, createProjectFile } from '../src/shared/utils/project-settings'

/**
 * A representative project record for each schema version the application has shipped,
 * built by taking a current project and stripping everything later versions introduced.
 */
function fixtureForVersion(version: number): ProjectRecord {
  const settings = createDefaultProjectSettings()
  const current = JSON.parse(
    JSON.stringify(
      createProjectFile(settings, ['/clips/a.mp4', '/clips/b.mp4'], {
        id: `fixture-v${version}`,
        createdAt: '2026-01-01T00:00:00.000Z'
      })
    )
  ) as ProjectRecord

  const raw: ProjectRecord = { ...current, version }

  const dropFrom: Record<number, string[]> = {
    10: [],
    9: ['sourceMedia', 'proxyRecords', 'snapshotRefs', 'projectRevision'],
    8: [
      'diarizationReferences',
      'speakerLabels',
      'confidenceReviews',
      'userVocabulary',
      'semanticCollections',
      'projectCaptionTemplates'
    ],
    7: ['semanticAnalysis', 'topics', 'semanticHints', 'highlightCandidates', 'outputVariants'],
    6: ['transcriptReferences', 'transcriptCorrections', 'textEdits', 'transcriptEditRevision'],
    5: ['editPlan'],
    3: ['previewHistory']
  }

  for (const [introducedAt, fields] of Object.entries(dropFrom)) {
    if (version < Number(introducedAt)) {
      for (const field of fields) delete raw[field]
    }
  }
  return raw
}

/**
 * Every schema version the application has shipped, derived from the registry so a new
 * phase extends this matrix automatically instead of silently going untested.
 */
const SHIPPED_VERSIONS = MIGRATIONS.map((migration) => migration.from)

describe('project migration registry', () => {
  it('declares an unbroken chain from the oldest supported version to the current one', () => {
    expect(OLDEST_SUPPORTED_PROJECT_VERSION).toBe(2)
    expect(PROJECT_SCHEMA_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1].to)
    for (let index = 0; index < MIGRATIONS.length; index += 1) {
      expect(MIGRATIONS[index].to).toBe(MIGRATIONS[index].from + 1)
      if (index > 0) expect(MIGRATIONS[index].from).toBe(MIGRATIONS[index - 1].to)
    }
  })

  it.each(SHIPPED_VERSIONS)('migrates a version %i project to the current schema', (version) => {
    const { record, outcome } = migrateProjectRecord(fixtureForVersion(version))
    expect(record.version).toBe(PROJECT_SCHEMA_VERSION)
    expect(outcome.originalVersion).toBe(version)
    expect(outcome.migrated).toBe(true)
    expect(outcome.steps.every((step) => step.ok)).toBe(true)
    expect(outcome.steps.map((step) => step.from)).toEqual(
      SHIPPED_VERSIONS.filter((candidate) => candidate >= version)
    )
  })

  it.each(SHIPPED_VERSIONS)('produces a fully populated project file from version %i', (version) => {
    const project = parseProjectFile(JSON.stringify(fixtureForVersion(version)))
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION)
    expect(project.sourcePaths).toEqual(['/clips/a.mp4', '/clips/b.mp4'])
    expect(project.sourceMedia.map((record) => record.path)).toEqual(project.sourcePaths)
    expect(project.proxyRecords).toEqual([])
    expect(project.snapshotRefs).toEqual([])
    expect(project.projectRevision).toBe(0)
    expect(project.transcriptCorrections).toEqual([])
    expect(project.speakerLabels).toEqual([])
    expect(project.outputVariants).toEqual([])
  })

  it('is deterministic — migrating the same record twice gives the same result', () => {
    // One fixture, migrated twice: `createProjectFile` stamps a fresh `updatedAt` on
    // every call, so rebuilding the fixture would test the builder, not the migration.
    const raw = fixtureForVersion(2)
    expect(migrateProjectRecord(raw).record).toEqual(migrateProjectRecord(raw).record)
  })

  it('does not mutate the record it was given', () => {
    const raw = fixtureForVersion(5)
    const before = JSON.stringify(raw)
    migrateProjectRecord(raw)
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('reports no migration for a project already at the current version', () => {
    const { outcome } = migrateProjectRecord(fixtureForVersion(PROJECT_SCHEMA_VERSION))
    expect(outcome.migrated).toBe(false)
    expect(outcome.steps).toEqual([])
  })

  it('pins pre-content-aware editing defaults when upgrading from before version 5', () => {
    const raw = fixtureForVersion(4)
    const settings = raw.settings as Record<string, any>
    settings.editing.contentAwareness = 'balanced'
    settings.editing.cutSync = 'beat'
    settings.output.cropFocus = 'subject'
    const project = parseProjectFile(JSON.stringify(raw))
    expect(project.settings.editing.contentAwareness).toBe('off')
    expect(project.settings.editing.speechCutProtection).toBe('off')
    expect(project.settings.editing.cutSync).toBe('natural')
    expect(project.settings.output.cropFocus).toBe('center')
  })

  it('leaves content-aware settings alone from version 5 onwards', () => {
    const raw = fixtureForVersion(5)
    const settings = raw.settings as Record<string, any>
    settings.editing.contentAwareness = 'balanced'
    settings.output.cropFocus = 'subject'
    const project = parseProjectFile(JSON.stringify(raw))
    expect(project.settings.editing.contentAwareness).toBe('balanced')
    expect(project.settings.output.cropFocus).toBe('subject')
  })

  it('preserves user-authored data across the whole chain', () => {
    const raw = fixtureForVersion(8)
    raw.speakerLabels = [{ clipId: 'clip-a', speakerId: 'speaker-1', label: 'Amara' }]
    raw.userVocabulary = ['AutoCut']
    raw.transcriptCorrections = [{ clipId: 'clip-a', wordIndex: 3, text: 'colour' }]
    const project = parseProjectFile(JSON.stringify(raw))
    expect(project.speakerLabels).toEqual([{ clipId: 'clip-a', speakerId: 'speaker-1', label: 'Amara' }])
    expect(project.userVocabulary).toEqual(['AutoCut'])
    expect(project.transcriptCorrections).toHaveLength(1)
  })

  it('carries an existing project revision forward rather than resetting it', () => {
    const raw = fixtureForVersion(PROJECT_SCHEMA_VERSION)
    raw.projectRevision = 42
    expect(parseProjectFile(JSON.stringify(raw)).projectRevision).toBe(42)
  })

  it('rejects a project written by a newer build and says so distinctly', () => {
    const raw = { ...fixtureForVersion(PROJECT_SCHEMA_VERSION), version: PROJECT_SCHEMA_VERSION + 1 }
    let thrown: unknown
    try {
      migrateProjectRecord(raw)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(UnsupportedProjectVersionError)
    expect((thrown as UnsupportedProjectVersionError).fromNewerBuild).toBe(true)
    expect((thrown as UnsupportedProjectVersionError).message).toMatch(/newer version/i)
  })

  it('rejects a version older than the oldest supported one', () => {
    const raw = { ...fixtureForVersion(2), version: 1 }
    expect(() => migrateProjectRecord(raw)).toThrow(UnsupportedProjectVersionError)
    try {
      migrateProjectRecord(raw)
    } catch (error) {
      expect((error as UnsupportedProjectVersionError).fromNewerBuild).toBe(false)
    }
  })

  it('rejects a record with no declared version', () => {
    expect(() => migrateProjectRecord({ id: 'x' })).toThrow(UnsupportedProjectVersionError)
  })

  it('surfaces the applied steps so a caller can log or back up before rewriting', () => {
    const { migration } = parseProjectDocument(JSON.stringify(fixtureForVersion(6)))
    expect(migration.originalVersion).toBe(6)
    expect(migration.targetVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(migration.steps.map((step) => `${step.from}->${step.to}`)).toEqual(
      MIGRATIONS.filter((migration) => migration.from >= 6).map((migration) => `${migration.from}->${migration.to}`)
    )
  })
})
