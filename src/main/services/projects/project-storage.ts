import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { LoadedProject, ProjectFile, RecentProject, SavedProject } from '@shared/types'
import { parseProjectFile, serializeProjectFile } from '@shared/utils/project-codec'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'

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
  const previewHistory = await Promise.all(project.previewHistory.map(async (version) => {
    try {
      await access(version.artifact.outputPath)
      allowMediaPath(version.artifact.outputPath)
      let thumbnailUrl = ''
      try {
        await access(version.thumbnailPath)
        allowMediaPath(version.thumbnailPath)
        thumbnailUrl = createMediaUrl(version.thumbnailPath)
      } catch {
        // The video remains usable when an optional thumbnail was cleaned externally.
      }
      return {
        ...version,
        thumbnailUrl,
        artifact: {
          ...version.artifact,
          outputUrl: createMediaUrl(version.artifact.outputPath),
          thumbnailUrl
        }
      }
    } catch {
      return {
        ...version,
        outdated: true,
        thumbnailUrl: '',
        artifact: { ...version.artifact, outputUrl: '', thumbnailUrl: '' }
      }
    }
  }))
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
    previewHistory
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
