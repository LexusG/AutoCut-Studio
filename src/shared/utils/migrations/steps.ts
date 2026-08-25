import type { ProjectMigration, ProjectRecord } from './types'

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const asRecord = (value: unknown): ProjectRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as ProjectRecord) } : {}

/**
 * Each step introduces exactly the fields its target version added, with the same
 * defaults the previous monolithic reader applied. Steps never remove data, and a
 * field that already carries a value is always left alone.
 */
export const MIGRATIONS: ProjectMigration[] = [
  {
    from: 2,
    to: 3,
    describe: 'Add preview history',
    migrate: (raw) => ({
      ...raw,
      version: 3,
      previewHistory: asArray(raw.previewHistory)
    })
  },
  {
    from: 3,
    to: 4,
    describe: 'Adopt audio normalization modes and managed preview storage',
    migrate: (raw) => ({
      ...raw,
      version: 4
    })
  },
  {
    from: 4,
    to: 5,
    describe: 'Add manual edit plan and pin pre-content-aware editing defaults',
    migrate: (raw) => {
      const settings = asRecord(raw.settings)
      const output = asRecord(settings.output)
      const editing = asRecord(settings.editing)
      const smartPreferences = asRecord(editing.smartPreferences)
      return {
        ...raw,
        version: 5,
        editPlan: raw.editPlan ?? null,
        settings: {
          ...settings,
          // Projects written before v5 predate content-aware editing. They were
          // rendered with these behaviours off, so preserving their output means
          // pinning the old defaults rather than inheriting today's.
          output: { ...output, cropFocus: 'center' },
          editing: {
            ...editing,
            contentAwareness: 'off',
            speechCutProtection: 'off',
            cutSync: 'natural',
            smartPreferences: { ...smartPreferences, preferSpeech: false }
          }
        }
      }
    }
  },
  {
    from: 5,
    to: 6,
    describe: 'Add transcripts, corrections, and text edits',
    migrate: (raw) => ({
      ...raw,
      version: 6,
      transcriptReferences: asArray(raw.transcriptReferences),
      transcriptCorrections: asArray(raw.transcriptCorrections),
      textEdits: asArray(raw.textEdits),
      transcriptEditRevision: Number.isInteger(raw.transcriptEditRevision) ? raw.transcriptEditRevision : 0
    })
  },
  {
    from: 6,
    to: 7,
    describe: 'Add semantic analysis, topics, highlights, and output variants',
    migrate: (raw) => ({
      ...raw,
      version: 7,
      semanticAnalysis:
        raw.semanticAnalysis && typeof raw.semanticAnalysis === 'object' ? raw.semanticAnalysis : null,
      topics: asArray(raw.topics),
      semanticHints: asArray(raw.semanticHints),
      highlightCandidates: asArray(raw.highlightCandidates),
      outputVariants: asArray(raw.outputVariants)
    })
  },
  {
    from: 7,
    to: 8,
    describe: 'Add speaker diarization, vocabulary, collections, and caption templates',
    migrate: (raw) => ({
      ...raw,
      version: 8,
      diarizationReferences: asArray(raw.diarizationReferences),
      speakerLabels: asArray(raw.speakerLabels),
      confidenceReviews: asArray(raw.confidenceReviews),
      userVocabulary: asArray(raw.userVocabulary).filter((item): item is string => typeof item === 'string'),
      semanticCollections: asArray(raw.semanticCollections),
      projectCaptionTemplates: asArray(raw.projectCaptionTemplates)
    })
  },
  {
    from: 8,
    to: 9,
    describe: 'Add fingerprinted source media, proxies, snapshots, and a project revision',
    migrate: (raw) => {
      const existing = asArray(raw.sourceMedia)
      const sourcePaths = asArray(raw.sourcePaths).filter((path): path is string => typeof path === 'string')
      // Fingerprints and clip ids need the files themselves, which a pure migration
      // cannot read. Records start unresolved and are completed on the next open.
      const sourceMedia =
        existing.length > 0
          ? existing
          : sourcePaths.map((path) => ({ path, clipId: null, relativePath: null, fingerprint: null }))
      return {
        ...raw,
        version: 9,
        sourceMedia,
        proxyRecords: asArray(raw.proxyRecords),
        snapshotRefs: asArray(raw.snapshotRefs),
        projectRevision: Number.isInteger(raw.projectRevision) ? raw.projectRevision : 0
      }
    }
  }
]

export const OLDEST_SUPPORTED_PROJECT_VERSION = MIGRATIONS[0].from
export const PROJECT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].to
