import { describe, expect, it } from 'vitest'
import { getPreset, PLATFORM_PRESETS } from '../src/shared/constants/presets'
import {
  applyPlatformPreset,
  createDefaultProjectSettings,
  getPresetDisplayName,
  isPresetModified,
  updateOutputSettings
} from '../src/shared/utils/project-settings'

const expectedPresets = [
  ['instagram-reel', 'instagram', 1080, 1920, '9:16'],
  ['instagram-story', 'instagram', 1080, 1920, '9:16'],
  ['instagram-feed-portrait', 'instagram', 1080, 1350, '4:5'],
  ['instagram-feed-square', 'instagram', 1080, 1080, '1:1'],
  ['youtube-standard', 'youtube', 1920, 1080, '16:9'],
  ['youtube-shorts', 'youtube', 1080, 1920, '9:16'],
  ['linkedin-landscape', 'linkedin', 1920, 1080, '16:9'],
  ['linkedin-portrait', 'linkedin', 1080, 1350, '4:5'],
  ['linkedin-square', 'linkedin', 1080, 1080, '1:1']
] as const

describe('platform preset catalog', () => {
  it('contains each required Phase 2 preset exactly once', () => {
    expect(PLATFORM_PRESETS).toHaveLength(expectedPresets.length)
    expect(new Set(PLATFORM_PRESETS.map((preset) => preset.id)).size).toBe(expectedPresets.length)
  })

  it.each(expectedPresets)('%s has the required output values', (id, platform, width, height, ratio) => {
    expect(getPreset(id)).toMatchObject({
      id,
      platform,
      width,
      height,
      aspectRatio: ratio,
      frameRate: 30,
      videoCodec: 'h264',
      audioCodec: 'aac'
    })
  })

  it('custom mode keeps manually selected output values', () => {
    const settings = updateOutputSettings(createDefaultProjectSettings(), {
      width: 1440,
      height: 1080,
      aspectRatio: 'original'
    })
    const custom = applyPlatformPreset(settings, 'custom')
    expect(custom.platform).toBe('custom')
    expect(custom.output).toMatchObject({ width: 1440, height: 1080, aspectRatio: 'original' })
  })

  it('marks a preset modified after a manual override and clears when restored', () => {
    const reel = applyPlatformPreset(createDefaultProjectSettings(), 'instagram-reel')
    expect(isPresetModified(reel)).toBe(false)
    const modified = updateOutputSettings(reel, { frameRate: 60 })
    expect(modified.presetModified).toBe(true)
    expect(getPresetDisplayName(modified)).toBe('Instagram Reel — Modified')
    const restored = updateOutputSettings(modified, { frameRate: 30 })
    expect(restored.presetModified).toBe(false)
  })

  it('manual aspect-ratio overrides change the output canvas ratio data', () => {
    const standard = applyPlatformPreset(createDefaultProjectSettings(), 'youtube-standard')
    expect(standard.output.width / standard.output.height).toBeCloseTo(16 / 9)
    const square = updateOutputSettings(standard, { width: 1080, height: 1080, aspectRatio: '1:1' })
    expect(square.output.width / square.output.height).toBe(1)
    expect(square.presetModified).toBe(true)
  })
})
