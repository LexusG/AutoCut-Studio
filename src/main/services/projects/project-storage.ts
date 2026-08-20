import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { LoadedProject, ProjectFile, RecentProject, SavedProject } from '@shared/types'
import { parseProjectFile, serializeProjectFile } from '@shared/utils/project-codec'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
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
  const filePath = recentProjectsPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(projects, null, 2)}\n`, 'utf8')
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

export async function saveProjectFile(filePath: string, project: ProjectFile): Promise<SavedProject> {
  const temporaryPath = `${filePath}.tmp-${process.pid}`
  await mkdir(dirname(filePath), { recursive: true })
  try {
    await Promise.all([
      ...project.previewHistory.map((version) => updatePreviewMetadata(project.id, version)),
      ...project.outputVariants.flatMap((variant) => variant.previewHistory.map((version) => updatePreviewMetadata(project.id, version)))
    ])
    await writeFile(temporaryPath, serializeProjectFile(project), 'utf8')
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
  await recordRecent(filePath, project)
  return { filePath, project }
}

export async function openProjectFile(filePath: string): Promise<LoadedProject> {
  const project = await refreshLocalReferences(parseProjectFile(await readFile(filePath, 'utf8')))
  await recordRecent(filePath, project)
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
