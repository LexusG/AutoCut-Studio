import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ProjectFile,
  ProjectIntegrityIssue,
  ProjectIntegrityReport
} from '@shared/types'
import { PROJECT_SCHEMA_VERSION } from '@shared/utils/migrations'
import { applicationStoragePaths } from '../filesystem/application-storage'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function managedPath(relativePath: string): string {
  return join(applicationStoragePaths().root, relativePath)
}

/**
 * Inspect a project and report what is wrong with it.
 *
 * This is strictly read-only: validation never repairs, rewrites, or reorders anything.
 * Anything actionable carries a `repair` hint that `repairProject` knows how to run.
 */
export async function validateProject(project: ProjectFile): Promise<ProjectIntegrityReport> {
  const issues: ProjectIntegrityIssue[] = []
  const add = (issue: ProjectIntegrityIssue): void => {
    issues.push(issue)
  }

  if (project.version !== PROJECT_SCHEMA_VERSION) {
    add({
      code: 'schema-version',
      severity: 'error',
      message: `The project reports schema version ${project.version}, but this build expects ${PROJECT_SCHEMA_VERSION}.`,
      repair: null,
      subject: null
    })
  }

  if (project.sourceMedia.length !== project.sourcePaths.length) {
    add({
      code: 'source-media-out-of-step',
      severity: 'warning',
      message: 'The fingerprinted source list does not match the project source paths.',
      repair: null,
      subject: null
    })
  }

  for (const path of project.sourcePaths) {
    if (!(await exists(path))) {
      add({
        code: 'source-missing',
        severity: 'error',
        message: `Source media is missing: ${path}`,
        repair: null,
        subject: path
      })
    }
  }

  const unfingerprinted = project.sourceMedia.filter((record) => record.fingerprint === null)
  if (unfingerprinted.length > 0) {
    add({
      code: 'source-not-fingerprinted',
      severity: 'info',
      message: `${unfingerprinted.length} source file(s) have not been fingerprinted yet, so they cannot be relinked automatically.`,
      repair: null,
      subject: null
    })
  }

  for (const track of project.settings.audio.soundtrack.tracks) {
    if (track.missing || !(await exists(track.path))) {
      add({
        code: 'soundtrack-missing',
        severity: 'warning',
        message: `Soundtrack file is missing: ${track.path}`,
        repair: null,
        subject: track.path
      })
    }
  }

  const clipIds = new Set(project.sourceMedia.map((record) => record.clipId).filter(Boolean))
  for (const reference of project.transcriptReferences) {
    if (!(await exists(managedPath(reference.relativePath)))) {
      add({
        code: 'transcript-missing',
        severity: 'warning',
        message: `A stored transcript is missing for clip ${reference.sourceClipId}.`,
        repair: null,
        subject: reference.sourceClipId
      })
    } else if (clipIds.size > 0 && !clipIds.has(reference.sourceClipId)) {
      add({
        code: 'transcript-orphaned',
        severity: 'info',
        message: `A transcript refers to clip ${reference.sourceClipId}, which the project no longer lists.`,
        repair: null,
        subject: reference.sourceClipId
      })
    }
  }

  for (const reference of project.diarizationReferences) {
    if (!(await exists(managedPath(reference.relativePath)))) {
      add({
        code: 'diarization-missing',
        severity: 'warning',
        message: `Stored speaker analysis is missing for clip ${reference.sourceClipId}.`,
        repair: null,
        subject: reference.sourceClipId
      })
    }
  }

  if (project.semanticAnalysis && !(await exists(managedPath(project.semanticAnalysis.relativePath)))) {
    add({
      code: 'semantic-cache-missing',
      severity: 'warning',
      message: 'The semantic analysis cache is missing and can be rebuilt from the transcripts.',
      repair: 'rebuild-semantic-cache',
      subject: null
    })
  }

  const allPreviews = [
    ...project.previewHistory,
    ...project.outputVariants.flatMap((variant) => variant.previewHistory)
  ]
  for (const preview of allPreviews) {
    if (preview.storage.state === 'missing') {
      add({
        code: 'preview-missing',
        severity: 'info',
        message: `Preview V${preview.versionNumber} is no longer on disk.`,
        repair: 'relink-preview-metadata',
        subject: preview.id
      })
    } else if (preview.storage.state === 'available' && !preview.thumbnailPath) {
      add({
        code: 'preview-thumbnail-missing',
        severity: 'info',
        message: `Preview V${preview.versionNumber} has no thumbnail.`,
        repair: 'regenerate-thumbnail',
        subject: preview.id
      })
    }
  }

  for (const record of project.proxyRecords) {
    if (record.state === 'ready' && !(await exists(managedPath(record.relativePath)))) {
      add({
        code: 'proxy-missing',
        severity: 'info',
        message: `A proxy for clip ${record.clipId} is recorded but missing; it can be regenerated.`,
        repair: 'regenerate-proxy',
        subject: record.clipId
      })
    }
  }

  for (const variant of project.outputVariants) {
    if (variant.renderPlan && variant.renderPlan.projectId !== project.id) {
      add({
        code: 'variant-plan-mismatch',
        severity: 'warning',
        message: `Output variant "${variant.name}" holds a plan belonging to a different project.`,
        repair: null,
        subject: variant.id
      })
    }
  }

  return {
    projectId: project.id,
    checkedAt: new Date().toISOString(),
    issues,
    ok: !issues.some((issue) => issue.severity === 'error')
  }
}
