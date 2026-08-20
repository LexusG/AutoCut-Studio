import type {
  AspectRatio,
  EditingMode,
  EditingPace,
  FitMode,
  OutputFrameRate,
  PreviewQuality,
  RenderQuality,
  TransitionPreference,
  SelectionMode,
  AnalysisQuality,
  FitBackgroundMode,
  BlurStrength,
  AudioNormalizationMode,
  FinalMixNormalizationMode,
  PersonAnalysisConfiguration,
  ContentAwarenessMode,
  CropFocusMode,
  CutSyncMode,
  DuckingTrigger,
  RenderPlan,
  SpeechCutProtection
} from './render'
import type {
  CaptionSettings,
  TranscriptCorrection,
  TranscriptReference,
  TranscriptTextEdit,
  TranscriptionSettings
} from './transcription'

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
  fitBackground: FitBackgroundMode
  blurStrength: BlurStrength
  cropFocus: CropFocusMode
}

export interface SmartPreferences {
  preferPeople: boolean
  preferMotion: boolean
  preferClearFootage: boolean
  preferAudibleMoments: boolean
  preferSpeech: boolean
}

export interface EditingSettings {
  arrangement: EditingMode
  pace: EditingPace
  useEveryClip: boolean
  targetDuration: TargetDurationSettings
  transitionPreference: TransitionPreference
  transitionDuration: number
  selectionMode: SelectionMode
  analysisQuality: AnalysisQuality
  smartPreferences: SmartPreferences
  selectionSeed: number
  contentAwareness: ContentAwarenessMode
  speechCutProtection: SpeechCutProtection
  cutSync: CutSyncMode
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

export interface SoundtrackTrack extends AudioTrack {
  enabled: boolean
  volume: number
  startPosition: number
  fadeIn: FadeSettings
  fadeOut: FadeSettings
}

export interface SoundtrackSettings {
  enabled: boolean
  tracks: SoundtrackTrack[]
  masterVolume: number
  loop: boolean
  crossfadeEnabled: boolean
  crossfadeDuration: number
}

export interface ProjectAudioSettings {
  /** Phase 2/3 compatibility field. Version 3 projects use soundtrack.tracks. */
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
  soundtrack: SoundtrackSettings
  normalizationMode: AudioNormalizationMode
  finalMixNormalizationMode: FinalMixNormalizationMode
  duckingTrigger: DuckingTrigger
}

export type PreviewStorageState = 'available' | 'missing' | 'migrating'

export interface PreviewStorageReference {
  key: string
  relativePath: string
  state: PreviewStorageState
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
  personAnalysis: PersonAnalysisConfiguration
  transcription: TranscriptionSettings
  captions: CaptionSettings
}

export interface ProjectFile {
  version: 6
  id: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  sourcePaths: string[]
  previewHistory: PreviewVersion[]
  editPlan: RenderPlan | null
  transcriptReferences: TranscriptReference[]
  transcriptCorrections: TranscriptCorrection[]
  textEdits: TranscriptTextEdit[]
  transcriptEditRevision: number
}

export interface PreviewVersion {
  id: string
  versionNumber: number
  createdAt: string
  artifact: import('./render').RenderArtifact
  thumbnailPath: string
  thumbnailUrl: string
  approved: boolean
  outdated: boolean
  pinned: boolean
  storage: PreviewStorageReference
  presetName: string
  pace: EditingPace
  selectionMode: SelectionMode
  targetDuration: number | null
  settingsSnapshot: ProjectSettings
}

export interface PreviewStorageStats {
  bytes: number
  previewCount: number
  location: string
  retentionLimit: number
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
