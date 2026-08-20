import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS, type AudioTrack, type RenderArtifact } from '../src/shared/types'
import { parseProjectFile, serializeProjectFile } from '../src/shared/utils/project-codec'
import {
  applyPlatformPreset,
  createDefaultProjectSettings,
  createOutputFilename,
  createProjectFile,
  updateOutputFilename
} from '../src/shared/utils/project-settings'
import { validateProjectSettings } from '../src/shared/utils/project-validation'
import { buildRenderPlan } from '../src/main/services/video/render-planner'

const track: AudioTrack = {
  id: 'track-1',
  filename: 'music.ogg',
  path: '/media/music.ogg',
  mediaUrl: 'autocut-media://local/example',
  duration: 95,
  codec: 'vorbis',
  bitrate: 192000,
  sampleRate: 48000,
  channels: 2,
  size: 123456,
  missing: false
}

describe('project settings persistence', () => {
  it('round-trips all Phase 2 editing and audio settings', () => {
    const defaults = applyPlatformPreset(createDefaultProjectSettings(), 'instagram-story')
    const settings = {
      ...defaults,
      output: { ...defaults.output, quality: 'high' as const, fitMode: 'fit' as const },
      editing: {
        ...defaults.editing,
        pace: 'fast' as const,
        useEveryClip: false,
        targetDuration: { mode: 'custom' as const, seconds: 47 },
        transitionDuration: 1
      },
      audio: {
        ...defaults.audio,
        backgroundTrack: track,
        musicVolume: 34,
        preserveOriginalAudio: false,
        originalAudioVolume: 72,
        normalizeClipAudio: false,
        loopBackgroundMusic: false,
        musicStartPosition: 3.5,
        fadeIn: { enabled: false, duration: 0.5 },
        fadeOut: { enabled: true, duration: 4 },
        duckMusicDuringClipAudio: false
      },
      previewQuality: 'full' as const
    }
    const project = createProjectFile(settings, ['/clips/a.mp4', '/clips/b.mp4'], {
      id: 'project-1',
      createdAt: '2026-01-01T00:00:00.000Z'
    })
    const restored = parseProjectFile(serializeProjectFile(project))
    expect(restored.settings.editing).toEqual(settings.editing)
    expect(restored.settings.previewQuality).toBe('full')
    expect(restored.settings.output.quality).toBe('high')
    expect(restored.settings.output.fitMode).toBe('fit')
    expect(restored.settings.audio).toMatchObject({
      musicVolume: 34,
      preserveOriginalAudio: false,
      originalAudioVolume: 72,
      normalizeClipAudio: false,
      loopBackgroundMusic: false,
      musicStartPosition: 3.5,
      fadeIn: { enabled: false, duration: 0.5 },
      fadeOut: { enabled: true, duration: 4 },
      duckMusicDuringClipAudio: false
    })
    expect(restored.settings.audio.backgroundTrack).toMatchObject({
      filename: 'music.ogg',
      path: '/media/music.ogg',
      mediaUrl: ''
    })
    expect(restored.sourcePaths).toEqual(['/clips/a.mp4', '/clips/b.mp4'])
  })

  it('warns when missing audio is restored without crashing', () => {
    const settings = createDefaultProjectSettings()
    settings.audio.backgroundTrack = { ...track, missing: true, mediaUrl: '' }
    const issues = validateProjectSettings(settings, 2)
    expect(issues).toContainEqual({
      code: 'audio-missing',
      severity: 'warning',
      message: 'Audio file missing.'
    })
  })

  it('warns when target duration conflicts with Use Every Clip', () => {
    const settings = createDefaultProjectSettings()
    settings.editing.targetDuration = { mode: '15', seconds: 15 }
    const issues = validateProjectSettings(settings, 10)
    expect(issues.some((issue) => issue.code === 'target-every-clip')).toBe(true)
  })

  it('migrates a Phase 2/3 single music track into the Phase 4 soundtrack schema', () => {
    const settings = createDefaultProjectSettings()
    settings.audio.backgroundTrack = track
    settings.audio.musicVolume = 34
    settings.audio.musicStartPosition = 3.5
    const legacy = {
      ...createProjectFile(settings, ['/clips/a.mp4']),
      version: 2,
      settings: {
        ...settings,
        output: { ...settings.output, fitBackground: undefined, blurStrength: undefined },
        editing: { ...settings.editing, selectionMode: undefined, analysisQuality: undefined, smartPreferences: undefined },
        audio: { ...settings.audio, soundtrack: undefined, normalizationMode: undefined, normalizeFinalMix: undefined }
      },
      previewHistory: undefined
    }
    const migrated = parseProjectFile(JSON.stringify(legacy))
    expect(migrated.version).toBe(6)
    expect(migrated.settings.editing.contentAwareness).toBe('off')
    expect(migrated.settings.editing.speechCutProtection).toBe('off')
    expect(migrated.settings.editing.cutSync).toBe('natural')
    expect(migrated.settings.output.cropFocus).toBe('center')
    expect(migrated.editPlan).toBeNull()
    expect(migrated.settings.editing.selectionMode).toBe('classic')
    expect(migrated.settings.output.fitBackground).toBe('black')
    expect(migrated.settings.audio.normalizationMode).toBe('fast')
    expect(migrated.settings.audio.finalMixNormalizationMode).toBe('off')
    expect(migrated.settings.audio.soundtrack).toMatchObject({
      enabled: true,
      masterVolume: 34,
      tracks: [expect.objectContaining({ path: track.path, startPosition: 3.5 })]
    })
  })

  it('generates and sanitizes output filenames while allowing overrides', () => {
    expect(createOutputFilename('Summer / Launch!', 'youtube-shorts')).toBe(
      'summer-launch_youtube-short.mp4'
    )
    const custom = updateOutputFilename(createDefaultProjectSettings(), 'My:Final*Cut')
    expect(custom.outputFilename).toBe('My_Final_Cut.mp4')
    expect(custom.outputFilenameCustom).toBe(true)
  })

  it('maps the Phase 4 final-mix boolean to Fast', () => {
    const settings = createDefaultProjectSettings()
    const legacy = JSON.parse(JSON.stringify(createProjectFile(settings, ['/clips/a.mp4']))) as Record<string, any>
    legacy.version = 3
    delete legacy.settings.audio.finalMixNormalizationMode
    legacy.settings.audio.normalizeFinalMix = true
    expect(parseProjectFile(JSON.stringify(legacy)).settings.audio.finalMixNormalizationMode).toBe('fast')
  })

  it('migrates legacy temporary preview paths to stable storage identity without persisting them again', () => {
    const settings = createDefaultProjectSettings()
    const project = createProjectFile(settings, ['/clips/a.mp4'], {
      id: 'legacy-project',
      createdAt: '2026-01-01T00:00:00.000Z'
    })
    const plan = buildRenderPlan(
      project.id,
      0,
      project.sourcePaths,
      [{ duration: 8, hasAudio: true, video: { codec: 'h264', width: 640, height: 360, frameRate: 30, rotation: 0, bitrate: null } }],
      'legacy-fingerprint',
      DEFAULT_RENDER_SETTINGS
    )
    const artifact: RenderArtifact = {
      kind: 'preview', outputPath: '/tmp/autocut-studio/legacy/preview.mp4', outputUrl: '',
      duration: 4, width: 640, height: 360, frameRate: 30, fileSize: 1000, hasAudio: true,
      clipCount: 1, plan, previewQuality: 'fast', reusedPreview: false,
      logPath: '/tmp/autocut-studio/legacy/render.log',
      thumbnailPath: '/tmp/autocut-studio/legacy/thumbnail.jpg', thumbnailUrl: '', finalLoudness: null
    }
    const raw = {
      ...project,
      version: 3,
      previewHistory: [{
        id: plan.id, versionNumber: 1, createdAt: project.createdAt, artifact,
        thumbnailPath: artifact.thumbnailPath, thumbnailUrl: '', approved: false, outdated: false,
        presetName: 'Custom', pace: 'normal', selectionMode: 'smart', targetDuration: null,
        settingsSnapshot: settings
      }]
    }
    const migrated = parseProjectFile(JSON.stringify(raw))
    expect(migrated.previewHistory[0].storage).toMatchObject({
      key: plan.id,
      state: 'migrating'
    })
    const serialized = JSON.parse(serializeProjectFile(migrated)) as {
      version: number
      previewHistory: Array<{ artifact: { outputPath: string; logPath: string }; thumbnailPath: string }>
    }
    expect(serialized.version).toBe(6)
    expect(serialized.previewHistory[0].artifact.outputPath).toBe('')
    expect(serialized.previewHistory[0].artifact.logPath).toBe('')
    expect(serialized.previewHistory[0].thumbnailPath).toBe('')
  })
})
