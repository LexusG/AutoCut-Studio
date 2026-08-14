import { describe, expect, it } from 'vitest'
import type { AudioTrack } from '../src/shared/types'
import { parseProjectFile, serializeProjectFile } from '../src/shared/utils/project-codec'
import {
  applyPlatformPreset,
  createDefaultProjectSettings,
  createOutputFilename,
  createProjectFile,
  updateOutputFilename
} from '../src/shared/utils/project-settings'
import { validateProjectSettings } from '../src/shared/utils/project-validation'

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

  it('generates and sanitizes output filenames while allowing overrides', () => {
    expect(createOutputFilename('Summer / Launch!', 'youtube-shorts')).toBe(
      'summer-launch_youtube-short.mp4'
    )
    const custom = updateOutputFilename(createDefaultProjectSettings(), 'My:Final*Cut')
    expect(custom.outputFilename).toBe('My_Final_Cut.mp4')
    expect(custom.outputFilenameCustom).toBe(true)
  })
})
