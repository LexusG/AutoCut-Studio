import type { PlatformId, PlatformPreset } from '../types'

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  custom: 'Custom'
}

export const PLATFORM_PRESETS: readonly PlatformPreset[] = [
  {
    id: 'instagram-reel',
    platform: 'instagram',
    name: 'Reel',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    frameRate: 30,
    orientation: 'portrait',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Vertical video optimized for Instagram Reels.'
  },
  {
    id: 'instagram-story',
    platform: 'instagram',
    name: 'Story',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    frameRate: 30,
    orientation: 'portrait',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Full-screen vertical format for Instagram Stories.'
  },
  {
    id: 'instagram-feed-portrait',
    platform: 'instagram',
    name: 'Feed Portrait',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    frameRate: 30,
    orientation: 'portrait',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Portrait video designed to use more vertical space in the Instagram feed.'
  },
  {
    id: 'instagram-feed-square',
    platform: 'instagram',
    name: 'Feed Square',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    frameRate: 30,
    orientation: 'square',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Square video for Instagram feed posts.'
  },
  {
    id: 'youtube-standard',
    platform: 'youtube',
    name: 'Standard',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    frameRate: 30,
    orientation: 'landscape',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Standard landscape video for YouTube.'
  },
  {
    id: 'youtube-shorts',
    platform: 'youtube',
    name: 'Shorts',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    frameRate: 30,
    orientation: 'portrait',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Vertical format for YouTube Shorts.'
  },
  {
    id: 'linkedin-landscape',
    platform: 'linkedin',
    name: 'Landscape',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    frameRate: 30,
    orientation: 'landscape',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Landscape video for LinkedIn posts.'
  },
  {
    id: 'linkedin-portrait',
    platform: 'linkedin',
    name: 'Portrait',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    frameRate: 30,
    orientation: 'portrait',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Portrait video designed to occupy more vertical feed space.'
  },
  {
    id: 'linkedin-square',
    platform: 'linkedin',
    name: 'Square',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    frameRate: 30,
    orientation: 'square',
    videoCodec: 'h264',
    audioCodec: 'aac',
    description: 'Square video for LinkedIn feeds.'
  }
]

export function getPreset(presetId: string): PlatformPreset | null {
  return PLATFORM_PRESETS.find((preset) => preset.id === presetId) ?? null
}

export function getPresetsForPlatform(platform: PlatformId): PlatformPreset[] {
  return PLATFORM_PRESETS.filter((preset) => preset.platform === platform)
}
