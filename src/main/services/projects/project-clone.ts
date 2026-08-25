import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectFile } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'

const safeId = (value: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('The project identifier is invalid.')
  return value
}

function managedProjectDirectory(projectId: string): string {
  return join(applicationStoragePaths().projects, safeId(projectId))
}

/**
 * Give a project a fresh identity and its own copy of the managed sidecar data.
 *
 * Previews, transcripts, semantic caches, diarization results, and snapshots all live
 * under `<storage>/projects/<projectId>`. Without this the saved-as copy would keep
 * writing into the original's directory, and editing either project would corrupt the
 * other's derived data.
 */
export async function cloneProjectIdentity(project: ProjectFile): Promise<ProjectFile> {
  const nextId = crypto.randomUUID()
  const from = managedProjectDirectory(project.id)
  const to = managedProjectDirectory(nextId)

  // A project that has never produced managed data has nothing to copy, which is not
  // an error — the new directory is simply created on first write.
  await cp(from, to, { recursive: true, force: true, errorOnExist: false }).catch(() => undefined)

  const rekeyPath = (relativePath: string): string =>
    relativePath.split('/').join('/').replace(`projects/${project.id}/`, `projects/${nextId}/`)

  return {
    ...project,
    id: nextId,
    createdAt: new Date().toISOString(),
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
    previewHistory: project.previewHistory.map((version) => ({
      ...version,
      storage: { ...version.storage, relativePath: rekeyPath(version.storage.relativePath) }
    })),
    outputVariants: project.outputVariants.map((variant) => ({
      ...variant,
      previewHistory: variant.previewHistory.map((version) => ({
        ...version,
        storage: { ...version.storage, relativePath: rekeyPath(version.storage.relativePath) }
      }))
    }))
  }
}
