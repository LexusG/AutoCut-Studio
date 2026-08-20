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
      fitMode: 'crop',
      fitBackground: 'black',
      blurStrength: 'medium',
      cropFocus: 'center'
    },
    editing: {
      arrangement: 'original-order',
      pace: 'normal',
      useEveryClip: true,
      targetDuration: { mode: 'auto', seconds: null },
      transitionPreference: 'crossfade',
      transitionDuration: 0.5,
      selectionMode: 'classic',
      analysisQuality: 'balanced',
      smartPreferences: {
        preferPeople: false,
        preferMotion: true,
        preferClearFootage: true,
        preferAudibleMoments: true,
        preferSpeech: false
      },
      selectionSeed: 0,
      contentAwareness: 'balanced',
      speechCutProtection: 'normal',
      cutSync: 'natural'
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
      duckMusicDuringClipAudio: true,
      soundtrack: {
        enabled: true,
        tracks: [],
        masterVolume: 20,
        loop: true,
        crossfadeEnabled: true,
        crossfadeDuration: 1.5
      },
      normalizationMode: 'fast',
      finalMixNormalizationMode: 'off',
      duckingTrigger: 'automatic'
    },
    outputFilename: createOutputFilename('Untitled project', 'custom'),
    outputFilenameCustom: false,
    previewQuality: 'fast',
    personAnalysis: {
      enabled: true,
      provider: 'mediapipe-pose-lite',
      modelVersion: 'pose-landmarker-lite-2023-04-17',
      modelHash: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
      analyzerVersion: 'phase5-person-v1'
    },
    transcription: {
      provider: 'whisper.cpp',
      quality: 'balanced',
      language: 'english',
      threads: 4
    },
    captions: {
      mode: 'off',
      subtitleOutput: 'none',
      style: {
        preset: 'clean',
        fontFamily: 'DejaVu Sans',
        fontSize: 48,
        fontWeight: 600,
        textColor: '#ffffff',
        highlightColor: '#facc15',
        backgroundEnabled: true,
        backgroundOpacity: 0.58,
        outline: 2,
        shadow: 1,
        alignment: 'center',
        position: 'bottom',
        verticalOffset: 8,
        maximumWidth: 84,
        lineSpacing: 1
      },
      safeAreaPreset: 'youtube-standard',
      safeAreaVisible: false,
      highlightSpokenWord: true,
      highlightBehavior: 'color',
      animation: 'none'
    }
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
  const social = preset.id === 'instagram-reel' || preset.id === 'instagram-story' || preset.id === 'youtube-shorts'
  const safeAreaPreset = preset.id === 'instagram-reel' || preset.id === 'instagram-story' || preset.id === 'youtube-shorts' || preset.id === 'youtube-standard'
    ? preset.id
    : preset.platform === 'linkedin' ? 'linkedin' : 'custom'
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
      audioCodec: preset.audioCodec,
      fitBackground: 'blurred'
    },
    captions: {
      ...settings.captions,
      mode: social ? 'dynamic' : settings.captions.mode,
      safeAreaPreset,
      style: {
        ...settings.captions.style,
        preset: social ? 'bold' : 'clean',
        position: social ? 'lower-middle' : 'bottom'
      }
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
    previewQuality: settings.previewQuality,
    useEveryClip: settings.editing.useEveryClip,
    targetDuration: targetDurationInSeconds(settings),
    transitionPreference: settings.editing.transitionPreference,
    transitionDuration: settings.editing.transitionDuration,
    audio: {
      ...structuredClone(settings.audio),
      musicVolume: settings.audio.soundtrack.tracks.length > 0 ? 100 : settings.audio.musicVolume,
      loopBackgroundMusic: settings.audio.soundtrack.tracks.length > 0
        ? settings.audio.soundtrack.loop
        : settings.audio.loopBackgroundMusic,
      backgroundTrack: settings.audio.backgroundTrack
        ? {
            path: settings.audio.backgroundTrack.path,
            filename: settings.audio.backgroundTrack.filename,
            duration: settings.audio.backgroundTrack.duration,
            missing: settings.audio.backgroundTrack.missing
          }
        : null,
      soundtrackEnabled: settings.audio.soundtrack.enabled,
      soundtrackTracks: settings.audio.soundtrack.tracks.map((track) => ({
        id: track.id,
        path: track.path,
        filename: track.filename,
        duration: track.duration,
        missing: track.missing,
        enabled: track.enabled,
        volume: Math.round(track.volume * settings.audio.soundtrack.masterVolume) / 100,
        startPosition: track.startPosition,
        fadeIn: structuredClone(track.fadeIn),
        fadeOut: structuredClone(track.fadeOut)
      })),
      soundtrackCrossfade: settings.audio.soundtrack.crossfadeEnabled
        ? settings.audio.soundtrack.crossfadeDuration
        : 0,
      normalizationMode: settings.audio.normalizationMode,
      finalMixNormalizationMode: settings.audio.finalMixNormalizationMode,
      duckingTrigger: settings.audio.duckingTrigger
    },
    personAnalysis: structuredClone(settings.personAnalysis),
    selectionMode: settings.editing.selectionMode,
    analysisQuality: settings.editing.analysisQuality,
    smartPreferences: structuredClone(settings.editing.smartPreferences),
    selectionSeed: settings.editing.selectionSeed,
    fitBackground: settings.output.fitBackground,
    blurStrength: settings.output.blurStrength,
    contentAwareness: settings.editing.contentAwareness,
    speechCutProtection: settings.editing.speechCutProtection,
    cutSync: settings.editing.cutSync,
    cropFocus: settings.output.cropFocus,
    captions: structuredClone(settings.captions)
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
  existing?: Pick<ProjectFile, 'id' | 'createdAt'>,
  previewHistory: ProjectFile['previewHistory'] = [],
  editPlan: ProjectFile['editPlan'] = null,
  phase7: Pick<ProjectFile, 'transcriptReferences' | 'transcriptCorrections' | 'textEdits' | 'transcriptEditRevision'> = {
    transcriptReferences: [], transcriptCorrections: [], textEdits: [], transcriptEditRevision: 0
  }
): ProjectFile {
  const now = new Date().toISOString()
  return {
    version: 6,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    settings: structuredClone(settings),
    sourcePaths: [...sourcePaths],
    previewHistory: structuredClone(previewHistory),
    editPlan: editPlan ? structuredClone(editPlan) : null,
    transcriptReferences: structuredClone(phase7.transcriptReferences),
    transcriptCorrections: structuredClone(phase7.transcriptCorrections),
    textEdits: structuredClone(phase7.textEdits),
    transcriptEditRevision: phase7.transcriptEditRevision
  }
}

export function platformForPreset(presetId: string): PlatformId {
  return getPreset(presetId)?.platform ?? 'custom'
}
