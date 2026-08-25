/**
 * Phase 10 — project portability, recovery, and production workflow contracts.
 */

/**
 * A path-independent identity for a source file.
 *
 * Clip ids are derived from the absolute path (see `createClipId`), so they change
 * whenever a file is moved or touched. A fingerprint stays stable across both and is
 * what lets relinking and portable import recognise footage again.
 */
export interface MediaFingerprint {
  filename: string
  size: number
  durationMs: number
  videoCodec: string
  width: number
  height: number
  frameRate: number
  modifiedAtMs: number
  /** sha256 over three 1 MiB windows plus the size — never a full-file hash. */
  quickHash: string
}

export interface SourceMediaRecord {
  path: string
  /**
   * Null until the main process has inspected the file. Schema migration is pure and
   * cannot touch the filesystem, so records upgraded from v8 start unfingerprinted and
   * are completed the first time the project is opened.
   */
  clipId: string | null
  /** Set when the file travels inside a portable package, relative to the project root. */
  relativePath: string | null
  fingerprint: MediaFingerprint | null
}

export type MediaMatchConfidence = 'exact' | 'likely' | 'possible'

export interface MediaMatchCandidate {
  path: string
  confidence: MediaMatchConfidence
  fingerprint: MediaFingerprint
  reasons: string[]
}

export interface MissingMediaEntry {
  clipId: string
  path: string
  filename: string
  fingerprint: MediaFingerprint | null
}

export interface RelinkResolution {
  clipId: string
  fromPath: string
  toPath: string
  confidence: MediaMatchConfidence
}

export type ProxyState = 'none' | 'ready' | 'generating' | 'missing' | 'failed'

export interface ProxyRecord {
  clipId: string
  relativePath: string
  width: number
  height: number
  /** Proxy duration and source duration are recorded separately so drift is detectable. */
  durationMs: number
  sourceDurationMs: number
  frameRate: number
  state: ProxyState
  createdAt: string
  error: string | null
}

/**
 * Every member must correspond to an operation that actually creates a snapshot.
 * New reasons are added alongside the code that emits them, never ahead of it.
 */
export type SnapshotReason =
  | 'manual'
  | 'before-bulk-transcript-removal'
  | 'before-preset-change'
  | 'before-replan'
  | 'before-restore'

export interface ProjectSnapshotRef {
  id: string
  name: string
  reason: SnapshotReason
  automatic: boolean
  createdAt: string
  projectRevision: number
  bytes: number
}

export interface ProjectSnapshotDiff {
  field: string
  summary: string
}

export interface MigrationLogEntry {
  from: number
  to: number
  describe: string
  ok: boolean
  error: string | null
}

export interface MigrationOutcome {
  originalVersion: number
  targetVersion: number
  steps: MigrationLogEntry[]
  migrated: boolean
}

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed'

export interface RecoveryJournalEntry {
  projectId: string
  projectName: string
  projectFilePath: string | null
  savedAt: string
  projectRevision: number
  dirty: boolean
  /**
   * The project body this journal points at. Bodies are written under a fresh name and
   * the journal replaced last, so a journal never references a half-written body.
   */
  bodyFile: string
}

export interface RecoveryCandidate {
  entry: RecoveryJournalEntry
  /** Modification time of the saved project file, when one exists. */
  savedProjectAt: string | null
  /** True when the journal holds work the saved project file does not. */
  journalIsNewer: boolean
}

export interface RecoverySessionState {
  previousSessionCleanlyClosed: boolean
  candidates: RecoveryCandidate[]
}

export type ProjectIntegritySeverity = 'error' | 'warning' | 'info'

export type ProjectRepairAction =
  | 'regenerate-thumbnail'
  | 'regenerate-proxy'
  | 'rebuild-semantic-cache'
  | 'relink-preview-metadata'

export interface ProjectIntegrityIssue {
  code: string
  severity: ProjectIntegritySeverity
  message: string
  /** Populated only when a safe, non-inventing repair exists. */
  repair: ProjectRepairAction | null
  subject: string | null
}

export interface ProjectIntegrityReport {
  projectId: string
  checkedAt: string
  issues: ProjectIntegrityIssue[]
  ok: boolean
}

export interface ProjectRegistryEntry {
  projectId: string
  filePath: string
  name: string
  lastOpened: string
}
