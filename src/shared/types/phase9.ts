import type { CaptionSettings, Transcript } from './transcription'

export type SpeakerCountSetting = 'auto' | 2 | 3 | 4 | number
export type SpeakerAccent = 'neutral' | 'accent-a' | 'accent-b' | 'accent-c'
export type SpeakerBalance = 'off' | 'balanced' | 'prefer-selected'

export interface DiarizationSegment {
  id: string
  speakerId: string
  overlappingSpeakerIds: string[]
  start: number
  end: number
  confidence: number | null
}

export interface SpeakerDiarizationResult {
  version: 1
  sourceClipId: string
  sourcePath: string
  provider: 'sherpa-onnx'
  modelVersion: string
  speakerCount: number
  requestedSpeakerCount: SpeakerCountSetting
  segments: DiarizationSegment[]
  analysisVersion: string
  cacheKey: string
  warnings: string[]
  createdAt: string
}

export interface SpeakerDiarizationReference {
  sourceClipId: string
  relativePath: string
  provider: 'sherpa-onnx'
  modelVersion: string
  speakerCount: number
  updatedAt: string
}

export interface SpeakerLabel {
  speakerId: string
  displayName: string
  mergedInto: string | null
  accent: SpeakerAccent
}

export interface SpeakerProjectSettings {
  diarizationEnabled: boolean
  speakerCount: SpeakerCountSetting
  showSpeakerNamesInCaptions: boolean
  preferredSpeakerId: string | null
  speakerBalance: SpeakerBalance
}

export type DiarizationModelState = 'ready' | 'not-installed' | 'loading' | 'unavailable'

export interface DiarizationModelStatus {
  state: DiarizationModelState
  provider: 'sherpa-onnx'
  providerVersion: string
  segmentationModel: string
  embeddingModel: string
  modelVersion: string
  approximateBytes: number
  path: string
  downloadProgress: number | null
  active: boolean
  detail: string | null
}

export interface DiarizationRequest {
  jobId: string
  projectId: string
  sources: Array<{ clipId: string; path: string; filename: string; duration: number; hasAudio: boolean }>
  speakerCount: SpeakerCountSetting
}

export interface DiarizationProgress {
  jobId: string
  state: 'queued' | 'preparing' | 'analyzing' | 'aligning' | 'saving' | 'complete' | 'cancelled'
  currentClip: string | null
  currentClipIndex: number
  totalClips: number
  percent: number
}

export interface DiarizationAnalysisResult {
  results: SpeakerDiarizationResult[]
  references: SpeakerDiarizationReference[]
  transcripts: Transcript[]
  cachedCount: number
  warnings: string[]
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'
export type ConfidenceReviewState = 'unreviewed' | 'accepted' | 'corrected' | 'ignored'

export interface ConfidenceReviewRecord {
  transcriptId: string
  wordId: string
  state: ConfidenceReviewState
  reviewedAt: string | null
}

export interface CaptionTemplate {
  id: string
  name: string
  builtIn: boolean
  settings: CaptionSettings
  createdAt: string
  updatedAt: string
}

export interface SemanticCollectionItem {
  id: string
  sourceClipId: string
  sourcePath: string
  start: number
  end: number
  transcript: string
  speakerId: string | null
}

export interface SemanticCollection {
  id: string
  name: string
  items: SemanticCollectionItem[]
  createdAt: string
  updatedAt: string
}

export type TranscriptionQueueState = 'waiting' | 'preparing' | 'transcribing' | 'complete' | 'no-speech' | 'failed' | 'cancelled' | 'cached' | 'paused'

export interface TranscriptionQueueItem {
  clipId: string
  filename: string
  duration: number
  model: string
  state: TranscriptionQueueState
  progress: number
  result: string | null
}

export type TranscriptionBatchScope = 'all' | 'selected' | 'untranscribed' | 'edit-plan' | 'with-speech' | 'retry-failed'

export interface TranscriptionQueueRequest {
  queueId: string
  projectId: string
  sources: import('./transcription').TranscriptionSource[]
  settings: import('./transcription').TranscriptionSettings
  skipNoSpeech: boolean
  vocabulary?: string[]
}

export interface TranscriptionQueueProgress {
  queueId: string
  items: TranscriptionQueueItem[]
  paused: boolean
  completed: number
  total: number
}
