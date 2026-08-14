export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:5'
export type OutputResolution = '720p' | '1080p'
export type OutputFrameRate = 'auto' | 24 | 30 | 60
export type EditingMode = 'original-order' | 'automatic' | 'random'
export type EditingPace = 'slow' | 'normal' | 'fast'
export type FitMode = 'crop' | 'fit'
export type RenderQuality = 'draft' | 'balanced' | 'high'
export type PreviewQuality = 'fast' | 'full'
export type TransitionPreference = 'none' | 'crossfade' | 'fade' | 'dip-to-black'
export type SelectionMode = 'classic' | 'smart'
export type AnalysisQuality = 'fast' | 'balanced' | 'detailed'
export type FitBackgroundMode = 'black' | 'blurred'
export type BlurStrength = 'low' | 'medium' | 'high'
export type AudioNormalizationMode = 'off' | 'fast' | 'accurate'

export interface RenderBackgroundTrack {
  path: string
  filename: string
  duration: number
  missing: boolean
}

export interface RenderSoundtrackTrack extends RenderBackgroundTrack {
  id: string
  enabled: boolean
  volume: number
  startPosition: number
  fadeIn: { enabled: boolean; duration: number }
  fadeOut: { enabled: boolean; duration: number }
}

export interface RenderAudioSettings {
  backgroundTrack: RenderBackgroundTrack | null
  musicVolume: number
  preserveOriginalAudio: boolean
  originalAudioVolume: number
  normalizeClipAudio: boolean
  loopBackgroundMusic: boolean
  musicStartPosition: number
  fadeIn: { enabled: boolean; duration: number }
  fadeOut: { enabled: boolean; duration: number }
  duckMusicDuringClipAudio: boolean
  soundtrackEnabled: boolean
  soundtrackTracks: RenderSoundtrackTrack[]
  soundtrackCrossfade: number
  normalizationMode: AudioNormalizationMode
  normalizeFinalMix: boolean
}

export interface RenderSettings {
  aspectRatio: AspectRatio
  resolution: OutputResolution
  outputWidth: number
  outputHeight: number
  frameRate: OutputFrameRate
  editingMode: EditingMode
  pace: EditingPace
  fitMode: FitMode
  quality: RenderQuality
  previewQuality: PreviewQuality
  useEveryClip: boolean
  targetDuration: number | null
  transitionPreference: TransitionPreference
  transitionDuration: number
  audio: RenderAudioSettings
  selectionMode: SelectionMode
  analysisQuality: AnalysisQuality
  smartPreferences: {
    preferPeople: boolean
    preferMotion: boolean
    preferClearFootage: boolean
    preferAudibleMoments: boolean
  }
  selectionSeed: number
  fitBackground: FitBackgroundMode
  blurStrength: BlurStrength
}

export interface CandidateScores {
  sharpness: number
  exposure: number
  motion: number
  stability: number
  audioActivity: number
  personPresence: number
  sceneQuality: number
  blackFramePenalty: number
  duplicatePenalty: number
  total: number
}

export interface SelectedCandidateMetadata {
  candidateId: string
  scores: CandidateScores
  reasons: string[]
  analysisFallback: boolean
}

export interface RenderPlanTransition {
  type: TransitionPreference
  duration: number
}

export interface RenderPlanSegment {
  id: string
  sourcePath: string
  filename: string
  sourceDuration: number
  start: number
  duration: number
  end: number
  hasAudio: boolean
  sourceWidth: number
  sourceHeight: number
  sourceFrameRate: number
  sourceRotation: number
  transitionToNext: RenderPlanTransition | null
  selectedCandidate: SelectedCandidateMetadata | null
}

export interface RenderPlanOutput {
  width: number
  height: number
  frameRate: number
  aspectRatio: AspectRatio
  fitMode: FitMode
  quality: RenderQuality
}

export interface RenderPlan {
  version: 1
  id: string
  projectId: string
  generation: number
  createdAt: string
  settingsFingerprint: string
  segments: RenderPlanSegment[]
  output: RenderPlanOutput
  pace: EditingPace
  useEveryClip: boolean
  requestedDuration: number | null
  expectedDuration: number
  audio: RenderAudioSettings
  warnings: string[]
  selectionMode: SelectionMode
  selectionSeed: number
  analysisVersion: string | null
  fitBackground: FitBackgroundMode
  blurStrength: BlurStrength
  previewVersion: number
}

export interface PreviewRenderRequest {
  renderId: string
  projectId: string
  generation: number
  sourcePaths: string[]
  settingsFingerprint: string
  settings: RenderSettings
}

export interface ExportRenderRequest {
  renderId: string
  outputPath: string
  plan: RenderPlan
  previewPath: string
  previewQuality: PreviewQuality
}

export type RenderStage =
  | 'Analyzing clips'
  | 'Detecting scenes'
  | 'Evaluating candidate segments'
  | 'Planning edit'
  | 'Preparing clips'
  | 'Normalizing video'
  | 'Creating transitions'
  | 'Processing source audio'
  | 'Processing music'
  | 'Mixing audio'
  | 'Encoding preview'
  | 'Encoding export'
  | 'Verifying output'
  | 'Finalizing'
  | 'Complete'

export interface RenderProgress {
  renderId: string
  stage: RenderStage
  currentClip: string | null
  currentClipIndex: number | null
  totalClips: number
  percent: number
  elapsedSeconds: number
}

export interface RenderArtifact {
  kind: 'preview' | 'export'
  outputPath: string
  outputUrl: string
  duration: number
  width: number
  height: number
  frameRate: number
  fileSize: number
  hasAudio: boolean
  clipCount: number
  plan: RenderPlan
  previewQuality: PreviewQuality
  reusedPreview: boolean
  logPath: string
  thumbnailPath: string
  thumbnailUrl: string
}

export interface DurationConstraintIssue {
  code: 'target-too-short'
  message: string
  requestedDuration: number
  minimumDuration: number
  clipCount: number
}

export type PreviewRenderOutcome =
  | { success: true; result: RenderArtifact }
  | { success: false; issue: DurationConstraintIssue }

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  aspectRatio: 'original',
  resolution: '1080p',
  outputWidth: 1920,
  outputHeight: 1080,
  frameRate: 30,
  editingMode: 'original-order',
  pace: 'normal',
  fitMode: 'crop',
  quality: 'balanced',
  previewQuality: 'fast',
  useEveryClip: true,
  targetDuration: null,
  transitionPreference: 'crossfade',
  transitionDuration: 0.5,
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
    soundtrackEnabled: true,
    soundtrackTracks: [],
    soundtrackCrossfade: 1.5,
    normalizationMode: 'fast',
    normalizeFinalMix: false
  },
  selectionMode: 'classic',
  analysisQuality: 'balanced',
  smartPreferences: {
    preferPeople: false,
    preferMotion: true,
    preferClearFootage: true,
    preferAudibleMoments: true
  },
  selectionSeed: 0,
  fitBackground: 'black',
  blurStrength: 'medium'
}

// Compatibility alias for Phase 1/2 callers.
export type RenderResult = RenderArtifact
