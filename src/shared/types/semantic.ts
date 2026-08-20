import type { AspectRatio, RenderPlan } from './render'
import type { CaptionSettings } from './transcription'

export type SemanticProviderId = 'minilm-transformers-js'
export type SemanticModelState = 'ready' | 'not-installed' | 'loading' | 'unavailable'
export type SemanticAnalysisState = 'idle' | 'queued' | 'running' | 'ready' | 'cancelled' | 'unavailable' | 'error'
export type EditGoalStrength = 'light' | 'balanced' | 'strong'
export type SemanticSearchMode = 'exact' | 'semantic'
export type SemanticMatchLabel = 'High Match' | 'Good Match' | 'Possible Match'
export type TopicImportance = 'important' | 'normal' | 'exclude'
export type ProjectGenerationMode = 'full-edit' | 'highlight-reel' | 'social-cut' | 'custom-selection'
export type VariantApprovalState = 'not-generated' | 'needs-changes' | 'approved'
export type VariantJobState = 'idle' | 'waiting' | 'rendering' | 'complete' | 'cancelled' | 'failed'
export type AnalysisJobPriority = 'interactive' | 'normal' | 'background'

export interface SemanticProviderConfiguration {
  enabled: boolean
  provider: SemanticProviderId
  model: 'Xenova/all-MiniLM-L6-v2'
  modelVersion: string
  analyzerVersion: string
  languageSupport: 'english'
}

export interface SemanticProjectSettings extends SemanticProviderConfiguration {
  editGoal: string
  editGoalStrength: EditGoalStrength
}

export interface SemanticModelStatus {
  state: SemanticModelState
  provider: SemanticProviderId
  model: string
  modelVersion: string
  approximateBytes: number
  path: string
  downloadProgress: number | null
  active: boolean
  detail: string | null
}

export interface SemanticTranscriptChunk {
  id: string
  transcriptId: string
  transcriptRevision: number
  sourceClipId: string
  sourcePath: string
  start: number
  end: number
  text: string
  wordIds: string[]
  segmentIds: string[]
  embeddingId: string
}

export interface SemanticEmbeddingRecord {
  id: string
  provider: SemanticProviderId
  model: string
  modelVersion: string
  sourceTranscriptId: string
  transcriptRevision: number
  sourceStart: number
  sourceEnd: number
  contentHash: string
  chunkingVersion: string
  embedding: number[]
  createdAt: string
  analyzerVersion: string
}

export interface TopicSegment {
  id: string
  start: number
  end: number
  chunkIds: string[]
  sourceClipIds: string[]
  representativeText: string
  meanNeighborSimilarity: number
  userLabel: string | null
  importance: TopicImportance
  chapterEnabled: boolean
  chapterStart: number
}

export interface SimilarContentGroup {
  id: string
  chunkIds: string[]
  similarity: number
  recommendedChunkId: string
}

export interface SemanticProjectAnalysis {
  projectId: string
  provider: SemanticProviderId
  model: string
  modelVersion: string
  analyzerVersion: string
  chunkingVersion: string
  transcriptRevisionFingerprint: string
  chunks: SemanticTranscriptChunk[]
  topics: TopicSegment[]
  similarContent: SimilarContentGroup[]
  embeddedCount: number
  cachedCount: number
  createdAt: string
}

export interface SemanticAnalysisReference {
  projectId: string
  relativePath: string
  model: string
  modelVersion: string
  analyzerVersion: string
  transcriptRevisionFingerprint: string
  chunkCount: number
  topicCount: number
  updatedAt: string
}

export interface SemanticAnalysisRequest {
  jobId: string
  projectId: string
  transcripts: import('./transcription').Transcript[]
  priority: AnalysisJobPriority
}

export interface SemanticAnalysisProgress {
  jobId: string
  state: SemanticAnalysisState
  stage: string
  completed: number
  total: number
  percent: number
}

export interface SemanticAnalysisResult {
  analysis: SemanticProjectAnalysis
  reference: SemanticAnalysisReference
}

export interface SemanticSearchRequest {
  projectId: string
  query: string
  mode: SemanticSearchMode
  limit?: number
}

export interface SemanticSearchResult {
  chunkId: string
  transcriptId: string
  sourceClipId: string
  sourcePath: string
  start: number
  end: number
  text: string
  score: number
  relevance: SemanticMatchLabel
  topicId: string | null
}

export interface SemanticHintRange {
  id: string
  sourceClipId: string
  sourcePath: string
  start: number
  end: number
  kind: 'prioritize' | 'exclude'
  createdAt: string
}

export interface HighlightScores {
  visual: number
  audio: number
  speech: number
  person: number
  semantic: number
  novelty: number
  openingStrength: number
  total: number
}

export interface HighlightCandidate {
  id: string
  sourceClipId: string
  sourcePath: string
  filename: string
  start: number
  end: number
  duration: number
  transcript: string
  topicId: string | null
  scores: HighlightScores
  reasons: string[]
  personPresent: boolean
  selected: boolean
  locked: boolean
  excluded: boolean
  alternativeIds: string[]
  thumbnailPath: string | null
  thumbnailUrl: string | null
}

export interface HighlightDiscoveryRequest {
  projectId: string
  plan: RenderPlan | null
  editGoal: string
  editGoalStrength: EditGoalStrength
  semanticHints: SemanticHintRange[]
  topicSelections: Array<{ topicId: string; importance: TopicImportance }>
}

export interface HighlightReelRequest {
  projectId: string
  parentPlan: RenderPlan
  highlights: HighlightCandidate[]
  targetDuration: number
  preserveIntro: boolean
  preserveOutro: boolean
  mode: Extract<ProjectGenerationMode, 'highlight-reel' | 'social-cut'>
  variantId?: string | null
}

export interface OutputVariant {
  id: string
  parentProjectId: string
  name: string
  platformPresetId: string
  targetDuration: number
  aspectRatio: AspectRatio
  width: number
  height: number
  captionSettings: CaptionSettings
  selectionMode: Extract<ProjectGenerationMode, 'highlight-reel' | 'social-cut' | 'custom-selection'>
  editGoal: string
  editGoalStrength: EditGoalStrength
  preserveIntro: boolean
  preserveOutro: boolean
  renderPlan: RenderPlan | null
  previewHistory: import('./project').PreviewVersion[]
  approval: VariantApprovalState
  previewStatus: VariantJobState
  exportStatus: VariantJobState
  outputPath: string | null
  fileSize: number | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface VariantPresetSelection {
  presetId: 'instagram-reel' | 'instagram-story' | 'youtube-shorts' | 'linkedin-portrait' | 'custom'
  selected: boolean
}

export interface VariantPreviewQueueItem {
  variantId: string
  state: VariantJobState
  progress: number
  error: string | null
}

export interface VariantBatchRequest {
  queueId: string
  projectId: string
  variantIds: string[]
}

export interface ChapterExportRequest {
  projectName: string
  topics: TopicSegment[]
}
