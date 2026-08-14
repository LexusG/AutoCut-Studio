import type {
  AspectRatio,
  EditingMode,
  EditingPace,
  FitMode,
  OutputFrameRate,
  PreviewQuality,
  RenderQuality,
  TransitionPreference
} from './render'

export type PlatformId = 'instagram' | 'youtube' | 'linkedin' | 'custom'
export type Orientation = 'landscape' | 'portrait' | 'square' | 'source'
export type VideoCodec = 'h264'
export type AudioCodec = 'aac'
export type TargetDurationMode = 'auto' | '15' | '30' | '60' | '90' | 'custom'

export interface PlatformPreset {
  id: string
  platform: PlatformId
  name: string
  width: number
  height: number
  aspectRatio: AspectRatio
  frameRate: Exclude<OutputFrameRate, 'auto'>
  orientation: Orientation
  videoCodec: VideoCodec
  audioCodec: AudioCodec
  description: string
  recommendedUse?: string
}

export interface TargetDurationSettings {
  mode: TargetDurationMode
  seconds: number | null
}

export interface VideoOutputSettings {
  width: number
  height: number
  aspectRatio: AspectRatio
  frameRate: OutputFrameRate
  videoCodec: VideoCodec
  audioCodec: AudioCodec
  quality: RenderQuality
  fitMode: FitMode
}

export interface EditingSettings {
  arrangement: EditingMode
  pace: EditingPace
  useEveryClip: boolean
  targetDuration: TargetDurationSettings
  transitionPreference: TransitionPreference
  transitionDuration: number
}

export interface AudioTrack {
  id: string
  filename: string
  path: string
  mediaUrl: string
  duration: number
  codec: string
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  size: number
  missing: boolean
}

export interface FadeSettings {
  enabled: boolean
  duration: number
}

export interface ProjectAudioSettings {
  backgroundTrack: AudioTrack | null
  musicVolume: number
  preserveOriginalAudio: boolean
  originalAudioVolume: number
  normalizeClipAudio: boolean
  loopBackgroundMusic: boolean
  musicStartPosition: number
  fadeIn: FadeSettings
  fadeOut: FadeSettings
  duckMusicDuringClipAudio: boolean
}

export interface ProjectSettings {
  name: string
  platform: PlatformId
  presetId: string
  presetModified: boolean
  output: VideoOutputSettings
  editing: EditingSettings
  audio: ProjectAudioSettings
  outputFilename: string
  outputFilenameCustom: boolean
  previewQuality: PreviewQuality
}

export interface ProjectFile {
  version: 2
  id: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  sourcePaths: string[]
}

export interface LoadedProject {
  filePath: string
  project: ProjectFile
}

export interface SavedProject {
  filePath: string
  project: ProjectFile
}

export interface RecentProject {
  filePath: string
  projectName: string
  lastOpened: string
  clipCount: number
}

export interface AudioImportResult {
  track: AudioTrack | null
  error: string | null
  details?: string
}

export interface ProjectRenderConfiguration {
  sourcePaths: string[]
  clipOrder: string[]
  editing: EditingSettings
  output: VideoOutputSettings
  platform: PlatformId
  presetId: string
  presetModified: boolean
  audio: ProjectAudioSettings
  outputFilename: string
}

export type ValidationSeverity = 'error' | 'warning'

export interface ProjectValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
}
