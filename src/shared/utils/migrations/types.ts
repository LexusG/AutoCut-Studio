export type ProjectRecord = Record<string, unknown>

export interface ProjectMigration {
  from: number
  to: number
  describe: string
  /** Must be pure and deterministic: no filesystem, no clock, no randomness. */
  migrate: (raw: ProjectRecord) => ProjectRecord
}

export class ProjectMigrationError extends Error {
  constructor(
    message: string,
    readonly from: number,
    readonly to: number,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ProjectMigrationError'
  }
}

export class UnsupportedProjectVersionError extends Error {
  constructor(
    message: string,
    readonly foundVersion: number,
    readonly supportedVersion: number,
    /** True when the file was written by a newer build than this one. */
    readonly fromNewerBuild: boolean
  ) {
    super(message)
    this.name = 'UnsupportedProjectVersionError'
  }
}
