import type { AudioTrack, PreviewVersion, ProjectFile, ProjectSettings, SoundtrackTrack } from '../types'
import { createDefaultProjectSettings } from './project-settings'

function migrateLegacyTrack(track: AudioTrack, settings: ProjectSettings): SoundtrackTrack {
  return {
    ...track,
    enabled: true,
    volume: 100,
    startPosition: settings.audio.musicStartPosition,
    fadeIn: { ...settings.audio.fadeIn },
    fadeOut: { ...settings.audio.fadeOut }
  }
}

function hydrateSettings(value: unknown): ProjectSettings {
  if (!value || typeof value !== 'object') throw new Error('Project settings are missing.')
  const raw = value as Partial<ProjectSettings>
  const defaults = createDefaultProjectSettings()
  const output = { ...defaults.output, ...(raw.output ?? {}) }
  const editing = {
    ...defaults.editing,
    ...(raw.editing ?? {}),
    targetDuration: {
      ...defaults.editing.targetDuration,
      ...(raw.editing?.targetDuration ?? {})
    },
    smartPreferences: {
      ...defaults.editing.smartPreferences,
      ...(raw.editing?.smartPreferences ?? {})
    }
  }
  const legacyAudio = raw.audio as (Partial<ProjectSettings['audio']> & { normalizeFinalMix?: boolean }) | undefined
  const audio = {
    ...defaults.audio,
    ...(raw.audio ?? {}),
    fadeIn: { ...defaults.audio.fadeIn, ...(raw.audio?.fadeIn ?? {}) },
    fadeOut: { ...defaults.audio.fadeOut, ...(raw.audio?.fadeOut ?? {}) },
    soundtrack: {
      ...defaults.audio.soundtrack,
      ...(raw.audio?.soundtrack ?? {}),
      tracks: (raw.audio?.soundtrack?.tracks ?? []).map((track) => ({
        ...track,
        enabled: track.enabled ?? true,
        volume: track.volume ?? 100,
        startPosition: track.startPosition ?? 0,
        fadeIn: { ...(track.fadeIn ?? { enabled: false, duration: 1 }) },
        fadeOut: { ...(track.fadeOut ?? { enabled: false, duration: 1 }) }
      }))
    }
  }
  const personAnalysis = {
    ...defaults.personAnalysis,
    ...(raw.personAnalysis ?? {})
  }
  const settings: ProjectSettings = { ...defaults, ...raw, output, editing, audio, personAnalysis }
  if (settings.audio.soundtrack.tracks.length === 0 && settings.audio.backgroundTrack) {
    settings.audio.soundtrack = {
      enabled: true,
      tracks: [migrateLegacyTrack(settings.audio.backgroundTrack, settings)],
      masterVolume: settings.audio.musicVolume,
      loop: settings.audio.loopBackgroundMusic,
      crossfadeEnabled: true,
      crossfadeDuration: 1.5
    }
  }
  settings.audio.normalizationMode = raw.audio?.normalizationMode
    ?? (settings.audio.normalizeClipAudio ? 'fast' : 'off')
  settings.audio.finalMixNormalizationMode = raw.audio?.finalMixNormalizationMode
    ?? (legacyAudio?.normalizeFinalMix === true ? 'fast' : 'off')
  return settings
}

function clearSettingsMediaUrls(settings: ProjectSettings): ProjectSettings {
  return {
    ...settings,
    audio: {
      ...settings.audio,
      backgroundTrack: settings.audio.backgroundTrack
        ? { ...settings.audio.backgroundTrack, mediaUrl: '', missing: false }
        : null,
      soundtrack: {
        ...settings.audio.soundtrack,
        tracks: settings.audio.soundtrack.tracks.map((track) => ({
          ...track,
          mediaUrl: '',
          missing: false
        }))
      }
    }
  }
}

function serializePreview(version: PreviewVersion): PreviewVersion {
  return {
    ...version,
    thumbnailUrl: '',
    thumbnailPath: '',
    artifact: {
      ...version.artifact,
      outputPath: '',
      outputUrl: '',
      logPath: '',
      thumbnailPath: '',
      thumbnailUrl: ''
    },
    settingsSnapshot: clearSettingsMediaUrls(version.settingsSnapshot)
  }
}

function hydratePreviewVersion(value: unknown, projectId: string): PreviewVersion | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<PreviewVersion>
  const artifact = raw.artifact
  const plan = artifact?.plan
  if (
    typeof raw.id !== 'string' ||
    !Number.isInteger(raw.versionNumber) ||
    (raw.versionNumber ?? 0) <= 0 ||
    typeof raw.createdAt !== 'string' ||
    !artifact ||
    artifact.kind !== 'preview' ||
    typeof artifact.outputPath !== 'string' ||
    typeof artifact.duration !== 'number' ||
    typeof artifact.width !== 'number' ||
    typeof artifact.height !== 'number' ||
    !plan ||
    typeof plan.id !== 'string' ||
    !Array.isArray(plan.segments) ||
    !plan.output ||
    !plan.audio ||
    !Array.isArray(plan.audio.soundtrackTracks) ||
    !raw.settingsSnapshot
  ) return null
  try {
    const thumbnailPath = typeof raw.thumbnailPath === 'string'
      ? raw.thumbnailPath
      : typeof artifact.thumbnailPath === 'string' ? artifact.thumbnailPath : ''
    const storage = raw.storage && typeof raw.storage === 'object'
      ? {
          key: typeof raw.storage.key === 'string' ? raw.storage.key : raw.id,
          relativePath: typeof raw.storage.relativePath === 'string'
            ? raw.storage.relativePath
            : `projects/${projectId}/previews/${raw.id}`,
          state: raw.storage.state === 'available' || raw.storage.state === 'migrating'
            ? raw.storage.state
            : 'missing' as const
        }
      : {
          key: raw.id,
          relativePath: `projects/${projectId}/previews/${raw.id}`,
          state: artifact.outputPath ? 'migrating' as const : 'missing' as const
        }
    return {
      ...raw,
      artifact: {
        ...artifact,
        plan: {
          ...plan,
          audio: {
            ...plan.audio,
            finalMixNormalizationMode: plan.audio.finalMixNormalizationMode
              ?? ((plan.audio as { normalizeFinalMix?: boolean }).normalizeFinalMix ? 'fast' : 'off')
          },
          personAnalysis: plan.personAnalysis ?? {
            enabled: true,
            provider: 'mediapipe-pose-lite',
            modelVersion: 'pose-landmarker-lite-2023-04-17',
            modelHash: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
            analyzerVersion: 'phase5-person-v1'
          },
          finalLoudnessTarget: plan.finalLoudnessTarget ?? { integrated: -16, range: 11, truePeak: -1.5 }
        },
        outputUrl: '',
        thumbnailPath,
        thumbnailUrl: '',
        finalLoudness: artifact.finalLoudness ?? null
      },
      thumbnailPath,
      thumbnailUrl: '',
      approved: raw.approved === true,
      outdated: raw.outdated === true,
      pinned: raw.pinned === true,
      storage,
      presetName: typeof raw.presetName === 'string' ? raw.presetName : 'Custom',
      pace: ['slow', 'normal', 'fast'].includes(raw.pace ?? '') ? raw.pace! : plan.pace,
      selectionMode: raw.selectionMode === 'smart' ? 'smart' : 'classic',
      targetDuration: typeof raw.targetDuration === 'number' ? raw.targetDuration : null,
      settingsSnapshot: hydrateSettings(raw.settingsSnapshot)
    } as PreviewVersion
  } catch {
    return null
  }
}

export function serializeProjectFile(project: ProjectFile): string {
  const serializable: ProjectFile = {
    ...project,
    settings: clearSettingsMediaUrls(project.settings),
    previewHistory: project.previewHistory.map(serializePreview)
  }
  return `${JSON.stringify(serializable, null, 2)}\n`
}

export function parseProjectFile(contents: string): ProjectFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents) as unknown
  } catch {
    throw new Error('The selected file is not valid AutoCut Studio project JSON.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('The project file is invalid.')
  const raw = parsed as Record<string, unknown>
  if (raw.version !== 2 && raw.version !== 3 && raw.version !== 4) {
    throw new Error('This project version is not supported.')
  }
  if (typeof raw.id !== 'string' || !raw.id) throw new Error('The project identifier is missing.')
  if (!Array.isArray(raw.sourcePaths) || !raw.sourcePaths.every((path) => typeof path === 'string')) {
    throw new Error('The project source list is invalid.')
  }
  const previewHistory = (raw.version === 3 || raw.version === 4) && Array.isArray(raw.previewHistory)
    ? raw.previewHistory
        .map((value) => hydratePreviewVersion(value, raw.id as string))
        .filter((item): item is PreviewVersion => item !== null)
    : []
  return {
    version: 4,
    id: raw.id,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    settings: hydrateSettings(raw.settings),
    sourcePaths: raw.sourcePaths,
    previewHistory
  }
}
