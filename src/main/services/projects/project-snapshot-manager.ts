import { readFile, rm, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type {
  ProjectFile,
  ProjectSnapshotDiff,
  ProjectSnapshotRef,
  SnapshotReason
} from '@shared/types'
import { parseProjectFile, serializeProjectFile } from '@shared/utils/project-codec'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

/** Automatic snapshots are pruned first so a manual one is never silently lost. */
export const MAX_AUTOMATIC_SNAPSHOTS = 10

const REASON_LABELS: Record<SnapshotReason, string> = {
  manual: 'Manual snapshot',
  'before-replace-media': 'Before replacing media',
  'before-reset-settings': 'Before resetting project settings',
  'before-bulk-transcript-removal': 'Before bulk transcript removal',
  'before-filler-removal': 'Before filler removal',
  'before-replan': 'Before automatic replan',
  'before-restore': 'Before restoring an older version',
  'before-relink': 'Before relinking media',
  'before-migration': 'Before schema migration'
}

const safeId = (value: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('The identifier is invalid.')
  return value
}

function snapshotDirectory(projectId: string): string {
  const directory = join(applicationStoragePaths().projects, safeId(projectId), 'snapshots')
  const root = resolve(applicationStoragePaths().projects)
  if (!resolve(directory).startsWith(`${root}${sep}`)) {
    throw new Error('Refusing to write outside managed project storage.')
  }
  return directory
}

function snapshotPath(projectId: string, snapshotId: string): string {
  return join(snapshotDirectory(projectId), `${safeId(snapshotId)}.json`)
}

function indexPath(projectId: string): string {
  return join(snapshotDirectory(projectId), 'index.json')
}

function isRef(value: unknown): value is ProjectSnapshotRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Partial<ProjectSnapshotRef>
  return typeof ref.id === 'string' && typeof ref.name === 'string' && typeof ref.createdAt === 'string'
}

export async function listSnapshots(projectId: string): Promise<ProjectSnapshotRef[]> {
  try {
    const parsed = JSON.parse(await readFile(indexPath(projectId), 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRef).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return []
  }
}

async function writeIndex(projectId: string, refs: ProjectSnapshotRef[]): Promise<void> {
  await writeFileAtomic(indexPath(projectId), `${JSON.stringify(refs, null, 2)}\n`)
}

export interface CreateSnapshotOptions {
  reason?: SnapshotReason
  name?: string
  automatic?: boolean
}

/**
 * Store the project's configuration as a restorable version.
 *
 * Snapshots hold project state only. Source media is never duplicated, so taking one
 * before a destructive operation stays cheap enough to do automatically.
 */
export async function createSnapshot(
  project: ProjectFile,
  options: CreateSnapshotOptions = {}
): Promise<ProjectSnapshotRef> {
  const reason: SnapshotReason = options.reason ?? 'manual'
  const automatic = options.automatic ?? reason !== 'manual'
  const id = crypto.randomUUID().replace(/-/g, '')
  const body = serializeProjectFile(project)
  await writeFileAtomic(snapshotPath(project.id, id), body)

  const ref: ProjectSnapshotRef = {
    id,
    name: options.name?.trim() || REASON_LABELS[reason],
    reason,
    automatic,
    createdAt: new Date().toISOString(),
    projectRevision: project.projectRevision,
    bytes: Buffer.byteLength(body, 'utf8')
  }

  const refs = [ref, ...(await listSnapshots(project.id))]
  const kept: ProjectSnapshotRef[] = []
  let automaticSeen = 0
  for (const candidate of refs) {
    if (candidate.automatic) {
      automaticSeen += 1
      if (automaticSeen > MAX_AUTOMATIC_SNAPSHOTS) {
        await rm(snapshotPath(project.id, candidate.id), { force: true }).catch(() => undefined)
        continue
      }
    }
    kept.push(candidate)
  }
  await writeIndex(project.id, kept)
  return ref
}

export async function readSnapshot(projectId: string, snapshotId: string): Promise<ProjectFile> {
  return parseProjectFile(await readFile(snapshotPath(projectId, snapshotId), 'utf8'))
}

export async function deleteSnapshot(projectId: string, snapshotId: string): Promise<ProjectSnapshotRef[]> {
  await rm(snapshotPath(projectId, snapshotId), { force: true })
  const refs = (await listSnapshots(projectId)).filter((ref) => ref.id !== snapshotId)
  await writeIndex(projectId, refs)
  return refs
}

export async function renameSnapshot(
  projectId: string,
  snapshotId: string,
  name: string
): Promise<ProjectSnapshotRef[]> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A snapshot name is required.')
  const refs = (await listSnapshots(projectId)).map((ref) =>
    ref.id === snapshotId ? { ...ref, name: trimmed } : ref
  )
  await writeIndex(projectId, refs)
  return refs
}

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

/**
 * A plain-language summary of what restoring a snapshot would change.
 * Deliberately shallow: this is a preview, not a merge tool.
 */
export function summarizeSnapshotDiff(snapshot: ProjectFile, current: ProjectFile): ProjectSnapshotDiff[] {
  const diffs: ProjectSnapshotDiff[] = []
  const compare = (field: string, label: string, before: number, after: number): void => {
    if (before === after) return
    const direction = after > before ? 'added' : 'removed'
    diffs.push({ field, summary: `${label}: ${before} → ${after} (${Math.abs(after - before)} ${direction})` })
  }

  if (snapshot.settings.name !== current.settings.name) {
    diffs.push({ field: 'name', summary: `Name: "${snapshot.settings.name}" → "${current.settings.name}"` })
  }
  if (snapshot.settings.presetId !== current.settings.presetId) {
    diffs.push({ field: 'preset', summary: `Preset: ${snapshot.settings.presetId} → ${current.settings.presetId}` })
  }
  compare('sourcePaths', 'Clips', snapshot.sourcePaths.length, current.sourcePaths.length)
  compare('transcriptCorrections', 'Transcript corrections', count(snapshot.transcriptCorrections), count(current.transcriptCorrections))
  compare('textEdits', 'Transcript text edits', count(snapshot.textEdits), count(current.textEdits))
  compare('speakerLabels', 'Speaker labels', count(snapshot.speakerLabels), count(current.speakerLabels))
  compare('topics', 'Topics', count(snapshot.topics), count(current.topics))
  compare('outputVariants', 'Output variants', count(snapshot.outputVariants), count(current.outputVariants))
  compare('semanticCollections', 'Semantic collections', count(snapshot.semanticCollections), count(current.semanticCollections))
  compare('previewHistory', 'Previews', count(snapshot.previewHistory), count(current.previewHistory))

  const snapshotSegments = snapshot.editPlan?.segments.length ?? 0
  const currentSegments = current.editPlan?.segments.length ?? 0
  compare('editPlan', 'Edit plan segments', snapshotSegments, currentSegments)

  if (diffs.length === 0) diffs.push({ field: 'none', summary: 'No tracked differences.' })
  return diffs
}

export async function snapshotStorageBytes(projectId: string): Promise<number> {
  const refs = await listSnapshots(projectId)
  let total = 0
  for (const ref of refs) {
    try {
      total += (await stat(snapshotPath(projectId, ref.id))).size
    } catch {
      // A missing body just means the snapshot is already gone.
    }
  }
  return total
}
