import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectRegistryEntry } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

/**
 * A durable project id -> file path index.
 *
 * The recent-projects list is capped at twelve and keyed only by path, which is not
 * enough to decide whether a managed storage directory still belongs to a live project.
 * Orphan detection and project locking both need this instead.
 */
function registryPath(): string {
  return join(applicationStoragePaths().projects, 'registry.json')
}

function isEntry(value: unknown): value is ProjectRegistryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<ProjectRegistryEntry>
  return (
    typeof entry.projectId === 'string' &&
    typeof entry.filePath === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.lastOpened === 'string'
  )
}

export async function readProjectRegistry(): Promise<ProjectRegistryEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(registryPath(), 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

export async function recordProject(entry: Omit<ProjectRegistryEntry, 'lastOpened'>): Promise<void> {
  const existing = await readProjectRegistry()
  const next = [
    { ...entry, lastOpened: new Date().toISOString() },
    ...existing.filter((item) => item.projectId !== entry.projectId)
  ]
  await writeFileAtomic(registryPath(), `${JSON.stringify(next, null, 2)}\n`)
}

export async function forgetProject(projectId: string): Promise<void> {
  const next = (await readProjectRegistry()).filter((item) => item.projectId !== projectId)
  await writeFileAtomic(registryPath(), `${JSON.stringify(next, null, 2)}\n`)
}

export async function findRegisteredProject(projectId: string): Promise<ProjectRegistryEntry | null> {
  return (await readProjectRegistry()).find((item) => item.projectId === projectId) ?? null
}

/** Project ids that any known project file still claims. Everything else is orphaned. */
export async function knownProjectIds(): Promise<Set<string>> {
  return new Set((await readProjectRegistry()).map((item) => item.projectId))
}
