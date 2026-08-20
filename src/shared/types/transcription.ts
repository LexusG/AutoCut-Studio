export type TranscriptionProviderId = 'whisper.cpp'
export type TranscriptionQuality = 'fast' | 'balanced' | 'accurate'
export type TranscriptionLanguage = 'auto' | 'english' | 'multilingual'
export type TranscriptionScope = 'selected-clip' | 'all-clips' | 'selected-edit'
export type TranscriptionModelState = 'ready' | 'not-installed' | 'loading' | 'unavailable'

export interface TranscriptionSettings {
  provider: TranscriptionProviderId
  quality: TranscriptionQuality
  language: TranscriptionLanguage
  threads: number
}

export interface TranscriptWord {
  id: string
  start: number
  end: number
  text: string
  originalText: string
  confidence: number | null
  filler: boolean
  excluded: boolean
}

export interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  originalText: string
  words: TranscriptWord[]
  confidence: number | null
}

export interface Transcript {
  version: 1
  id: string
  projectId: string
  sourceClipId: string
  sourcePath: string
  sourceDuration: number
  language: string
  detectedLanguage: string | null
  provider: TranscriptionProviderId
  model: string
  analyzerVersion: string
  fullText: string
  originalText: string
  segments: TranscriptSegment[]
  words: TranscriptWord[]
  createdAt: string
  updatedAt: string
  averageConfidence: number | null
  noSpeech: boolean
  revision: number
}

export interface TranscriptReference {
  sourceClipId: string
  transcriptId: string
  relativePath: string
  model: string
  language: string
  revision: number
  createdAt: string
}

export interface TranscriptCorrection {
  transcriptId: string
  wordId: string
  originalText: string
  correctedText: string
}

export type TextEditKind = 'remove-range' | 'remove-filler' | 'shorten-pause'

export interface TranscriptTextEdit {
  id: string
  sourceClipId: string
  sourcePath: string
  start: number
  end: number
  kind: TextEditKind
  restored: boolean
  replacementDuration: number | null
  createdAt: string
}

export interface TranscriptionModelInfo {
  quality: TranscriptionQuality
  language: TranscriptionLanguage
  model: string
  filename: string
  approximateBytes: number
  purpose: string
  state: TranscriptionModelState
  path: string
  downloadProgress: number | null
  active: boolean
}

export interface TranscriptionStatus {
  provider: TranscriptionProviderId
  providerState: 'ready' | 'unavailable'
  executablePath: string | null
  modelsDirectory: string
  models: TranscriptionModelInfo[]
}

export interface TranscriptionModelProgress {
  model: string
  percent: number
}

export type TranscriptionStage =
  | 'Queued'
  | 'Preparing audio'
  | 'Loading transcription model'
  | 'Transcribing'
  | 'Processing timestamps'
  | 'Building transcript'
  | 'Saving transcript cache'
  | 'Complete'

export interface TranscriptionProgress {
  jobId: string
  stage: TranscriptionStage
  currentClip: string | null
  currentClipIndex: number
  totalClips: number
  percent: number
  elapsedSeconds: number
}

export interface TranscriptionSource {
  clipId: string
  path: string
  filename: string
  duration: number
  hasAudio: boolean
  ranges?: Array<{ start: number; end: number }>
}

export interface TranscriptionRequest {
  jobId: string
  projectId: string
  sources: TranscriptionSource[]
  settings: TranscriptionSettings
}

export interface TranscriptionResult {
  transcripts: Transcript[]
  references: TranscriptReference[]
  cachedCount: number
  warnings: string[]
}

export type CaptionMode = 'off' | 'standard' | 'dynamic'
export type SubtitleOutput = 'none' | 'burned-in' | 'file-only' | 'burned-in-and-file'
export type CaptionStylePreset = 'clean' | 'bold' | 'minimal' | 'highlight'
export type CaptionPosition = 'top' | 'upper-middle' | 'center' | 'lower-middle' | 'bottom'
export type CaptionAnimation = 'none' | 'fade' | 'pop'
export type CaptionHighlight = 'bold' | 'scale' | 'color' | 'background'
export type CaptionSafeAreaPreset = 'instagram-reel' | 'instagram-story' | 'youtube-shorts' | 'youtube-standard' | 'linkedin' | 'custom'

export interface CaptionStyle {
  preset: CaptionStylePreset
  fontFamily: string
  fontSize: number
  fontWeight: number
  textColor: string
  highlightColor: string
  backgroundEnabled: boolean
  backgroundOpacity: number
  outline: number
  shadow: number
  alignment: 'left' | 'center' | 'right'
  position: CaptionPosition
  verticalOffset: number
  maximumWidth: number
  lineSpacing: number
}

export interface CaptionSettings {
  mode: CaptionMode
  subtitleOutput: SubtitleOutput
  style: CaptionStyle
  safeAreaPreset: CaptionSafeAreaPreset
  safeAreaVisible: boolean
  highlightSpokenWord: boolean
  highlightBehavior: CaptionHighlight
  animation: CaptionAnimation
}

export interface CaptionWord {
  id: string
  text: string
  start: number
  end: number
}

export interface CaptionChunk {
  id: string
  start: number
  end: number
  text: string
  words: CaptionWord[]
  styleOverride: Partial<CaptionStyle> | null
  deleted: boolean
}

export interface CaptionTrack {
  version: 1
  revision: number
  mode: CaptionMode
  chunks: CaptionChunk[]
  generatedAt: string
}

export interface SubtitleExportRequest {
  projectName: string
  format: 'srt' | 'vtt'
  track: CaptionTrack
}

export interface CaptionBuildRequest {
  plan: import('./render').RenderPlan
  transcripts: Transcript[]
  settings: CaptionSettings
}
