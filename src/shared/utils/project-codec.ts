import type { ProjectFile, ProjectSettings } from '../types'
import { createDefaultProjectSettings } from './project-settings'

function hydrateSettings(value: unknown): ProjectSettings {
  if (!value || typeof value !== 'object') throw new Error('Project settings are missing.')
  const raw = value as Partial<ProjectSettings>
  const defaults = createDefaultProjectSettings()
  return {
    ...defaults,
    ...raw,
    output: { ...defaults.output, ...(raw.output ?? {}) },
    editing: {
      ...defaults.editing,
      ...(raw.editing ?? {}),
      targetDuration: {
        ...defaults.editing.targetDuration,
        ...(raw.editing?.targetDuration ?? {})
      }
    },
    audio: {
      ...defaults.audio,
      ...(raw.audio ?? {}),
      fadeIn: { ...defaults.audio.fadeIn, ...(raw.audio?.fadeIn ?? {}) },
      fadeOut: { ...defaults.audio.fadeOut, ...(raw.audio?.fadeOut ?? {}) }
    }
  }
}

export function serializeProjectFile(project: ProjectFile): string {
  const backgroundTrack = project.settings.audio.backgroundTrack
  const serializable = {
    ...project,
    settings: {
      ...project.settings,
      audio: {
        ...project.settings.audio,
        backgroundTrack: backgroundTrack
          ? { ...backgroundTrack, mediaUrl: '', missing: false }
          : null
      }
    }
  }
  return `${JSON.stringify(serializable, null, 2)}\n`
}

export function parseProjectFile(contents: string): ProjectFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('The selected file is not valid AutoCut Studio project JSON.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('The project file is invalid.')
  const raw = parsed as Partial<ProjectFile>
  if (raw.version !== 2) throw new Error('This project version is not supported.')
  if (typeof raw.id !== 'string' || !raw.id) throw new Error('The project identifier is missing.')
  if (!Array.isArray(raw.sourcePaths) || !raw.sourcePaths.every((path) => typeof path === 'string')) {
    throw new Error('The project source list is invalid.')
  }
  return {
    version: 2,
    id: raw.id,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    settings: hydrateSettings(raw.settings),
    sourcePaths: raw.sourcePaths
  }
}
