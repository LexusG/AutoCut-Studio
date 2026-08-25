import { appendFile, copyFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { MigrationOutcome } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'

function logPath(): string {
  return join(applicationStoragePaths().logs, 'migrations.ndjson')
}

/**
 * Record what a migration did. Successful upgrades are logged quietly for support
 * purposes; only failures are ever surfaced to the user.
 */
export async function recordMigration(
  filePath: string,
  outcome: MigrationOutcome,
  error?: unknown
): Promise<void> {
  try {
    await mkdir(applicationStoragePaths().logs, { recursive: true })
    const entry = {
      timestamp: new Date().toISOString(),
      filePath,
      originalVersion: outcome.originalVersion,
      targetVersion: outcome.targetVersion,
      steps: outcome.steps,
      ok: error === undefined,
      error: error === undefined ? null : error instanceof Error ? error.message : String(error)
    }
    await appendFile(logPath(), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // Logging must never be the reason a project fails to open.
  }
}

/**
 * Preserve the file exactly as it was before this build upgrades it.
 *
 * Written once per source version, so repeatedly opening an old project cannot
 * overwrite the pristine copy with an already-migrated one.
 */
export async function backupBeforeMigration(filePath: string, originalVersion: number): Promise<string | null> {
  const backupPath = `${filePath}.v${originalVersion}.bak`
  try {
    await access(backupPath)
    return backupPath
  } catch {
    // No backup yet — fall through and make one.
  }
  try {
    await copyFile(filePath, backupPath)
    return backupPath
  } catch {
    return null
  }
}
