import { getPreset, PLATFORM_LABELS } from '../constants/presets'
import type {
  PlatformId,
  ProjectFile,
  ProjectRenderConfiguration,
  ProjectSettings,
  RenderSettings,
  VideoOutputSettings
} from '../types'

export const MANUAL_RESOLUTIONS = [
  { label: '1280 × 720', width: 1280, height: 720, aspectRatio: '16:9' },
  { label: '1920 × 1080', width: 1920, height: 1080, aspectRatio: '16:9' },
  { label: '1080 × 1920', width: 1080, height: 1920, aspectRatio: '9:16' },
  { label: '1080 × 1350', width: 1080, height: 1350, aspectRatio: '4:5' },
  { label: '1080 × 1080', width: 1080, height: 1080, aspectRatio: '1:1' }
] as const

const presetFilenameSuffix: Record<string, string> = {
  'instagram-reel': 'instagram-reel',
  'instagram-story': 'instagram-story',
  'instagram-feed-portrait': 'instagram-feed-portrait',
  'instagram-feed-square': 'instagram-feed-square',
  'youtube-standard': 'youtube',
  'youtube-shorts': 'youtube-short',
  'linkedin-landscape': 'linkedin-landscape',
  'linkedin-portrait': 'linkedin-portrait',
  'linkedin-square': 'linkedin-square',
  custom: 'custom'
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled-project'
}

export function createOutputFilename(projectName: string, presetId: string): string {
  const suffix = presetFilenameSuffix[presetId] ?? sanitizeFilenamePart(presetId)
  return `${sanitizeFilenamePart(projectName)}_${suffix}.mp4`
}

export function createDefaultProjectSettings(): ProjectSettings {
  return {
    name: 'Untitled project',
    platform: 'custom',
    presetId: 'custom',
    presetModified: false,
    output: {
      width: 1920,
      height: 1080,
      aspectRatio: 'original',
      frameRate: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      quality: 'balanced',
      fitMode: 'crop'
    },
    editing: {
      arrangement: 'original-order',
      pace: 'normal',
      useEveryClip: true,
      targetDuration: { mode: 'auto', seconds: null },
      transitionPreference: 'crossfade'
    },
    audio: {
      backgroundTrack: null,
      musicVolume: 20,
      preserveOriginalAudio: true,
      originalAudioVolume: 100,
      normalizeClipAudio: true,
      loopBackgroundMusic: true,
      musicStartPosition: 0,
      fadeIn: { enabled: true, duration: 1 },
      fadeOut: { enabled: true, duration: 2 },
      duckMusicDuringClipAudio: true
    },
    outputFilename: createOutputFilename('Untitled project', 'custom'),
    outputFilenameCustom: false
  }
}

export function isPresetModified(settings: ProjectSettings): boolean {
  if (settings.presetId === 'custom') return false
  const preset = getPreset(settings.presetId)
  if (!preset) return true
  const output = settings.output
  return (
    output.width !== preset.width ||
    output.height !== preset.height ||
    output.aspectRatio !== preset.aspectRatio ||
    output.frameRate !== preset.frameRate ||
    output.videoCodec !== preset.videoCodec ||
    output.audioCodec !== preset.audioCodec
  )
}

function withGeneratedFilename(settings: ProjectSettings): ProjectSettings {
  if (settings.outputFilenameCustom) return settings
  return {
    ...settings,
    outputFilename: createOutputFilename(settings.name, settings.presetId)
  }
}

export function applyPlatformPreset(settings: ProjectSettings, presetId: string): ProjectSettings {
  if (presetId === 'custom') {
    return withGeneratedFilename({
      ...settings,
      platform: 'custom',
      presetId: 'custom',
      presetModified: false
    })
  }

  const preset = getPreset(presetId)
  if (!preset) throw new Error('The selected platform preset is unavailable.')
  return withGeneratedFilename({
    ...settings,
    platform: preset.platform,
    presetId: preset.id,
    presetModified: false,
    output: {
      ...settings.output,
      width: preset.width,
      height: preset.height,
      aspectRatio: preset.aspectRatio,
      frameRate: preset.frameRate,
      videoCodec: preset.videoCodec,
      audioCodec: preset.audioCodec
    }
  })
}

export function updateOutputSettings(
  settings: ProjectSettings,
  patch: Partial<VideoOutputSettings>
): ProjectSettings {
  const next = { ...settings, output: { ...settings.output, ...patch } }
  return { ...next, presetModified: isPresetModified(next) }
}

export function updateProjectName(settings: ProjectSettings, name: string): ProjectSettings {
  return withGeneratedFilename({ ...settings, name })
}

export function updateOutputFilename(settings: ProjectSettings, filename: string): ProjectSettings {
  const sanitized = filename.replace(/[\\/:*?"<>|]/g, '_').trim()
  const withExtension = sanitized.toLowerCase().endsWith('.mp4') ? sanitized : `${sanitized}.mp4`
  return { ...settings, outputFilename: withExtension, outputFilenameCustom: true }
}

export function getPresetDisplayName(settings: ProjectSettings): string {
  if (settings.presetId === 'custom') return 'Custom'
  const preset = getPreset(settings.presetId)
  if (!preset) return 'Unknown preset'
  const base = `${PLATFORM_LABELS[preset.platform]} ${preset.name}`
  return settings.presetModified ? `${base} — Modified` : base
}

export function targetDurationInSeconds(settings: ProjectSettings): number | null {
  const target = settings.editing.targetDuration
  if (target.mode === 'auto') return null
  if (target.mode === 'custom') return target.seconds
  return Number(target.mode)
}

export function toRenderSettings(settings: ProjectSettings): RenderSettings {
  const shortEdge = Math.min(settings.output.width, settings.output.height)
  return {
    aspectRatio: settings.output.aspectRatio,
    resolution: shortEdge <= 720 ? '720p' : '1080p',
    outputWidth: settings.output.width,
    outputHeight: settings.output.height,
    frameRate: settings.output.frameRate,
    editingMode: settings.editing.arrangement,
    pace: settings.editing.pace,
    fitMode: settings.output.fitMode,
    quality: settings.output.quality,
    useEveryClip: settings.editing.useEveryClip
  }
}

export function createRenderConfiguration(
  settings: ProjectSettings,
  sourcePaths: string[]
): ProjectRenderConfiguration {
  return {
    sourcePaths: [...sourcePaths],
    clipOrder: [...sourcePaths],
    editing: structuredClone(settings.editing),
    output: structuredClone(settings.output),
    platform: settings.platform,
    presetId: settings.presetId,
    presetModified: settings.presetModified,
    audio: structuredClone(settings.audio),
    outputFilename: settings.outputFilename
  }
}

export function createProjectFile(
  settings: ProjectSettings,
  sourcePaths: string[],
  existing?: Pick<ProjectFile, 'id' | 'createdAt'>
): ProjectFile {
  const now = new Date().toISOString()
  return {
    version: 2,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    settings: structuredClone(settings),
    sourcePaths: [...sourcePaths]
  }
}

export function platformForPreset(presetId: string): PlatformId {
  return getPreset(presetId)?.platform ?? 'custom'
}
