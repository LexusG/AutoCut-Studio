import type { MigrationLogEntry, MigrationOutcome } from '../../types/phase10'
import { MIGRATIONS, OLDEST_SUPPORTED_PROJECT_VERSION, PROJECT_SCHEMA_VERSION } from './steps'
import { ProjectMigrationError, UnsupportedProjectVersionError } from './types'
import type { ProjectRecord } from './types'

export { MIGRATIONS, OLDEST_SUPPORTED_PROJECT_VERSION, PROJECT_SCHEMA_VERSION }
export { ProjectMigrationError, UnsupportedProjectVersionError }
export type { ProjectMigration, ProjectRecord } from './types'

export interface MigrationResult {
  record: ProjectRecord
  outcome: MigrationOutcome
}

function readVersion(raw: ProjectRecord): number {
  const version = raw.version
  if (!Number.isInteger(version)) {
    throw new UnsupportedProjectVersionError(
      'This file does not declare an AutoCut Studio project version.',
      Number.NaN,
      PROJECT_SCHEMA_VERSION,
      false
    )
  }
  return version as number
}

/**
 * Walk a raw project record forward one version at a time to the current schema.
 *
 * Every step is applied to a fresh copy, so a step that throws leaves the caller's
 * record untouched and the original file can be opened read-only instead of being
 * partially rewritten.
 */
export function migrateProjectRecord(input: ProjectRecord): MigrationResult {
  const originalVersion = readVersion(input)

  if (originalVersion > PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(
      'This project was saved by a newer version of AutoCut Studio. Update the application to open it, or open it read-only.',
      originalVersion,
      PROJECT_SCHEMA_VERSION,
      true
    )
  }
  if (originalVersion < OLDEST_SUPPORTED_PROJECT_VERSION) {
    throw new UnsupportedProjectVersionError(
      'This project version is not supported.',
      originalVersion,
      PROJECT_SCHEMA_VERSION,
      false
    )
  }

  const steps: MigrationLogEntry[] = []
  let record: ProjectRecord = { ...input }

  for (const migration of MIGRATIONS) {
    if (migration.from < originalVersion) continue
    try {
      record = migration.migrate(record)
      steps.push({ from: migration.from, to: migration.to, describe: migration.describe, ok: true, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      steps.push({ from: migration.from, to: migration.to, describe: migration.describe, ok: false, error: message })
      throw new ProjectMigrationError(
        `This project could not be upgraded from version ${migration.from} to ${migration.to}: ${message}`,
        migration.from,
        migration.to,
        error
      )
    }
  }

  return {
    record,
    outcome: {
      originalVersion,
      targetVersion: PROJECT_SCHEMA_VERSION,
      steps,
      migrated: originalVersion !== PROJECT_SCHEMA_VERSION
    }
  }
}
