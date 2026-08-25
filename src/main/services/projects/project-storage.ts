import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { LoadedProject, ProjectFile, RecentProject, SavedProject } from '@shared/types'
import { parseProjectDocument, serializeProjectFile } from '@shared/utils/project-codec'
import { writeFileAtomic } from '../filesystem/atomic-write'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
import { backupBeforeMigration, recordMigration } from './migration-log'
import { recordProject } from './project-registry'
import {
  regeneratePreviewThumbnail,
  resolvePreviewVersion,
  updatePreviewMetadata
} from '../video/preview-storage'
import { detectFfmpeg } from '../ffmpeg/binaries'

const MAX_RECENT_PROJECTS = 12

function recentProjectsPath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

async function refreshLocalReferences(project: ProjectFile): Promise<ProjectFile> {
  const refreshTrack = async <Track extends { path: string; missing: boolean; mediaUrl: string }>(track: Track): Promise<Track> => {
    try {
      await access(track.path)
      allowMediaPath(track.path)
      return { ...track, missing: false, mediaUrl: createMediaUrl(track.path) }
    } catch {
      return { ...track, missing: true, mediaUrl: '' }
    }
  }
  const backgroundTrack = project.settings.audio.backgroundTrack
    ? await refreshTrack(project.settings.audio.backgroundTrack)
    : null
  const tracks = await Promise.all(project.settings.audio.soundtrack.tracks.map(refreshTrack))
  const resolveHistory = async (history: ProjectFile['previewHistory']): Promise<ProjectFile['previewHistory']> => {
    let resolved = await Promise.all(history.map((version) => resolvePreviewVersion(project.id, version)))
    if (!resolved.some((version) => version.storage.state === 'available' && !version.thumbnailPath)) return resolved
    const ffmpeg = await detectFfmpeg()
    if (ffmpeg.ffmpeg.path) {
      resolved = await Promise.all(resolved.map(async (version) => {
        try {
          return await regeneratePreviewThumbnail(ffmpeg.ffmpeg.path!, project.id, version)
        } catch {
          return version
        }
      }))
    }
    return resolved
  }
  const previewHistory = await resolveHistory(project.previewHistory)
  const outputVariants = await Promise.all(project.outputVariants.map(async (variant) => ({
    ...variant,
    previewHistory: await resolveHistory(variant.previewHistory)
  })))
  return {
    ...project,
    settings: {
      ...project.settings,
      audio: {
        ...project.settings.audio,
        backgroundTrack,
        soundtrack: { ...project.settings.audio.soundtrack, tracks }
      }
    },
    previewHistory,
    outputVariants
  }
}

async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const parsed = JSON.parse(await readFile(recentProjectsPath(), 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RecentProject => {
      if (!item || typeof item !== 'object') return false
      const recent = item as Partial<RecentProject>
      return (
        typeof recent.filePath === 'string' &&
        typeof recent.projectName === 'string' &&
        typeof recent.lastOpened === 'string' &&
        typeof recent.clipCount === 'number'
      )
    })
  } catch {
    return []
  }
}

async function writeRecentProjects(projects: RecentProject[]): Promise<void> {
  await writeFileAtomic(recentProjectsPath(), `${JSON.stringify(projects, null, 2)}\n`)
}

async function recordRecent(filePath: string, project: ProjectFile): Promise<void> {
  const existing = await readRecentProjects()
  const next: RecentProject[] = [
    {
      filePath,
      projectName: project.settings.name,
      lastOpened: new Date().toISOString(),
      clipCount: project.sourcePaths.length
    },
    ...existing.filter((item) => item.filePath !== filePath)
  ].slice(0, MAX_RECENT_PROJECTS)
  await writeRecentProjects(next)
}

/**
 * Keep the fingerprinted source list in step with the plain path list.
 *
 * `sourcePaths` remains the field every existing reader uses, so the two must never
 * disagree about which files the project references.
 */
function reconcileSourceMedia(project: ProjectFile): ProjectFile {
  const byPath = new Map(project.sourceMedia.map((record) => [record.path, record]))
  const sourceMedia = project.sourcePaths.map(
    (path) => byPath.get(path) ?? { path, clipId: null, relativePath: null, fingerprint: null }
  )
  return { ...project, sourceMedia }
}

export async function saveProjectFile(filePath: string, project: ProjectFile): Promise<SavedProject> {
  const reconciled = reconcileSourceMedia(project)
  await Promise.all([
    ...reconciled.previewHistory.map((version) => updatePreviewMetadata(reconciled.id, version)),
    ...reconciled.outputVariants.flatMap((variant) =>
      variant.previewHistory.map((version) => updatePreviewMetadata(reconciled.id, version))
    )
  ])
  await writeFileAtomic(filePath, serializeProjectFile(reconciled))
  await recordRecent(filePath, reconciled)
  await recordProject({ projectId: reconciled.id, filePath, name: reconciled.settings.name })
  return { filePath, project: reconciled }
}

export async function openProjectFile(filePath: string): Promise<LoadedProject> {
  const contents = await readFile(filePath, 'utf8')
  const { project: parsed, migration } = parseProjectDocument(contents)

  if (migration.migrated) {
    // Take the untouched original aside before this build can write the upgraded form
    // over it, so a bad upgrade is always recoverable.
    await backupBeforeMigration(filePath, migration.originalVersion)
    await recordMigration(filePath, migration)
  }

  const project = await refreshLocalReferences(reconcileSourceMedia(parsed))
  await recordRecent(filePath, project)
  await recordProject({ projectId: project.id, filePath, name: project.settings.name })
  return { filePath, project }
}

export function getRecentProjects(): Promise<RecentProject[]> {
  return readRecentProjects()
}

export async function removeRecentProject(filePath: string): Promise<RecentProject[]> {
  const next = (await readRecentProjects()).filter((item) => item.filePath !== filePath)
  await writeRecentProjects(next)
  return next
}
