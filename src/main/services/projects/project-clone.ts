import { cp, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectFile, RenderPlan } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

const safeId = (value: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('The project identifier is invalid.')
  return value
}

function managedProjectDirectory(projectId: string): string {
  return join(applicationStoragePaths().projects, safeId(projectId))
}

/**
 * Snapshots describe the original project's past, and their bodies carry the original
 * project id. Copying them would let the user restore a snapshot inside the copy and
 * silently switch it back to the original's identity, so the copy starts with a clean
 * history instead.
 */
const EXCLUDED_FROM_CLONE = new Set(['snapshots'])

function isMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ENOENT'
}

async function copyManagedData(from: string, to: string): Promise<void> {
  let entries: string[]
  try {
    entries = (await readdir(from, { withFileTypes: true }))
      .filter((entry) => !EXCLUDED_FROM_CLONE.has(entry.name))
      .map((entry) => entry.name)
  } catch (error) {
    // A project that has never produced managed data has nothing to copy.
    if (isMissing(error)) return
    throw error
  }

  for (const entry of entries) {
    // Anything other than "it was not there" means the copy is incomplete, and a
    // silently incomplete copy loses transcripts, previews, and analysis data.
    await cp(join(from, entry), join(to, entry), { recursive: true, force: true })
  }
}

function rekeyPlan(plan: RenderPlan | null, projectId: string): RenderPlan | null {
  return plan ? { ...plan, projectId } : null
}

/**
 * Rewrite the `projectId` stamped inside a copied JSON artifact.
 *
 * The loaders for transcripts, semantic analysis, and preview metadata all reject a
 * body whose embedded project id does not match the project asking for it, so a
 * verbatim copy would silently come back empty after a restart.
 */
async function rekeyArtifact(path: string, projectId: string): Promise<void> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  if (!parsed || typeof parsed !== 'object' || !('projectId' in parsed)) return
  await writeFileAtomic(path, `${JSON.stringify({ ...parsed, projectId }, null, 2)}\n`)
}

async function jsonFilesIn(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(directory, entry.name))
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

async function subdirectoriesIn(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(directory, entry.name))
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

/**
 * Bring every copied artifact under the new project's identity.
 *
 * Embedding records carry no project id — they are keyed by content hash inside the
 * project directory — so they need no rewriting.
 */
async function rekeyManagedArtifacts(root: string, projectId: string): Promise<void> {
  for (const path of await jsonFilesIn(join(root, 'transcripts'))) {
    await rekeyArtifact(path, projectId)
  }
  for (const path of await jsonFilesIn(join(root, 'analysis', 'diarization'))) {
    await rekeyArtifact(path, projectId)
  }
  await rekeyArtifact(join(root, 'semantic', 'analysis.json'), projectId)
  for (const previewDirectory of await subdirectoriesIn(join(root, 'previews'))) {
    await rekeyArtifact(join(previewDirectory, 'metadata.json'), projectId)
  }
}

/**
 * Give a project a fresh identity and its own copy of the managed sidecar data.
 *
 * Previews, transcripts, semantic caches, and diarization results all live under
 * `<storage>/projects/<projectId>`. Without this the saved-as copy would keep writing
 * into the original's directory, and editing either project would corrupt the other's
 * derived data.
 *
 * Every embedded project id is rewritten as well, not just the top-level one: the
 * preview pipeline rejects a plan whose `projectId` does not match the project it is
 * rendering, so a copy that kept the original's plan ids could never render.
 */
export async function cloneProjectIdentity(project: ProjectFile): Promise<ProjectFile> {
  const nextId = crypto.randomUUID()
  const destination = managedProjectDirectory(nextId)
  await copyManagedData(managedProjectDirectory(project.id), destination)
  await rekeyManagedArtifacts(destination, nextId)

  const rekeyPath = (relativePath: string): string =>
    relativePath.replace(`projects/${project.id}/`, `projects/${nextId}/`)

  const rekeyPreview = (version: ProjectFile['previewHistory'][number]): ProjectFile['previewHistory'][number] => ({
    ...version,
    storage: { ...version.storage, relativePath: rekeyPath(version.storage.relativePath) },
    artifact: {
      ...version.artifact,
      plan: { ...version.artifact.plan, projectId: nextId }
    }
  })

  return {
    ...project,
    id: nextId,
    createdAt: new Date().toISOString(),
    editPlan: rekeyPlan(project.editPlan, nextId),
    transcriptReferences: project.transcriptReferences.map((reference) => ({
      ...reference,
      relativePath: rekeyPath(reference.relativePath)
    })),
    diarizationReferences: project.diarizationReferences.map((reference) => ({
      ...reference,
      relativePath: rekeyPath(reference.relativePath)
    })),
    semanticAnalysis: project.semanticAnalysis
      ? { ...project.semanticAnalysis, relativePath: rekeyPath(project.semanticAnalysis.relativePath) }
      : null,
    proxyRecords: project.proxyRecords.map((record) => ({
      ...record,
      relativePath: rekeyPath(record.relativePath)
    })),
    previewHistory: project.previewHistory.map(rekeyPreview),
    outputVariants: project.outputVariants.map((variant) => ({
      ...variant,
      renderPlan: rekeyPlan(variant.renderPlan, nextId),
      previewHistory: variant.previewHistory.map(rekeyPreview)
    })),
    // History belongs to the original project.
    snapshotRefs: []
  }
}
