import type { FfmpegStatus, ImportResult } from './media'
import type {
  AudioImportResult,
  LoadedProject,
  ProjectFile,
  PreviewStorageStats,
  PreviewVersion,
  RecentProject,
  SavedProject
} from './project'
import type {
  ExportRenderRequest,
  EditPlanOutcome,
  EditPlanRequest,
  PreviewRenderOutcome,
  PreviewRenderRequest,
  RenderArtifact,
  RenderPlan,
  RenderProgress
} from './render'
import type { PersonAnalysisConfiguration, PersonAnalysisSummary } from './render'
import type {
  CaptionBuildRequest,
  CaptionTrack,
  SubtitleExportRequest,
  Transcript,
  TranscriptReference,
  TranscriptionModelInfo,
  TranscriptionModelProgress,
  TranscriptionProgress,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionStatus
} from './transcription'
import type { CaptionTemplate } from './phase9'
import type {
  ChapterExportRequest,
  HighlightCandidate,
  HighlightDiscoveryRequest,
  HighlightReelRequest,
  SemanticAnalysisProgress,
  SemanticAnalysisReference,
  SemanticAnalysisRequest,
  SemanticAnalysisResult,
  SemanticModelStatus,
  SemanticProjectAnalysis,
  SemanticSearchRequest,
  SemanticSearchResult
} from './semantic'
import type { ProcessingResourceMode, RuntimeComponentId, RuntimeDiagnostics, RuntimeRepairResult } from './runtime'
import type {
  DiarizationAnalysisResult,
  DiarizationModelStatus,
  DiarizationProgress,
  DiarizationRequest,
  SpeakerDiarizationReference,
  SpeakerDiarizationResult
} from './phase9'
import type { TranscriptionQueueProgress, TranscriptionQueueRequest } from './phase9'
import type {
  ProjectIntegrityReport,
  ProjectSnapshotDiff,
  ProjectSnapshotRef,
  RecoverySessionState,
  SnapshotReason
} from './phase10'

export interface PersonAnalysisFrame {
  timestamp: number
  dataUrl: string
}

export interface PersonAnalysisRequest {
  requestId: string
  frames: PersonAnalysisFrame[]
  configuration: PersonAnalysisConfiguration
}

export interface PersonAnalysisResponse {
  requestId: string
  result: PersonAnalysisSummary | null
  error: string | null
}

export interface PersonDetectionStatus {
  state: 'ready' | 'active' | 'unavailable'
  label: string
  provider: string
  modelVersion: string
  detail: string | null
}

export interface AutoCutApi {
  getRuntimeDiagnostics: (force?: boolean) => Promise<RuntimeDiagnostics>
  repairRuntime: (componentId: RuntimeComponentId) => Promise<RuntimeRepairResult>
  openProcessingStorage: () => Promise<string>
  copyRuntimeDiagnostics: () => Promise<void>
  getProcessingResourceMode: () => Promise<ProcessingResourceMode>
  setProcessingResourceMode: (mode: ProcessingResourceMode) => Promise<ProcessingResourceMode>
  getDiarizationStatus: () => Promise<DiarizationModelStatus>
  installDiarizationModels: () => Promise<DiarizationModelStatus>
  removeDiarizationModels: () => Promise<void>
  onDiarizationModelProgress: (callback: (percent: number) => void) => () => void
  diarize: (request: DiarizationRequest, transcripts: Transcript[]) => Promise<DiarizationAnalysisResult>
  cancelDiarization: (jobId: string) => Promise<boolean>
  onDiarizationProgress: (callback: (progress: DiarizationProgress) => void) => () => void
  loadDiarization: (projectId: string, references: SpeakerDiarizationReference[]) => Promise<SpeakerDiarizationResult[]>
  runTranscriptionQueue: (request: TranscriptionQueueRequest) => Promise<TranscriptionResult>
  pauseTranscriptionQueue: (queueId: string) => Promise<boolean>
  resumeTranscriptionQueue: (queueId: string) => Promise<boolean>
  cancelCurrentTranscriptionQueueItem: (queueId: string) => Promise<boolean>
  cancelAllTranscriptionQueueItems: (queueId: string) => Promise<boolean>
  onTranscriptionQueueProgress: (callback: (progress: TranscriptionQueueProgress) => void) => () => void
  getCaptionTemplates: () => Promise<CaptionTemplate[]>
  saveCaptionTemplate: (name: string, settings: import('./transcription').CaptionSettings) => Promise<CaptionTemplate>
  renameCaptionTemplate: (id: string, name: string) => Promise<CaptionTemplate[]>
  duplicateCaptionTemplate: (id: string) => Promise<CaptionTemplate>
  deleteCaptionTemplate: (id: string) => Promise<CaptionTemplate[]>
  getFfmpegStatus: () => Promise<FfmpegStatus>
  chooseVideoFiles: () => Promise<string[]>
  importVideoFiles: (paths: string[]) => Promise<ImportResult>
  chooseAudioFile: () => Promise<string | null>
  importAudioFile: (path: string) => Promise<AudioImportResult>
  saveProject: (project: ProjectFile, currentPath: string | null) => Promise<SavedProject | null>
  chooseProjectFile: () => Promise<LoadedProject | null>
  openProjectFile: (path: string) => Promise<LoadedProject>
  getRecentProjects: () => Promise<RecentProject[]>
  removeRecentProject: (path: string) => Promise<RecentProject[]>
  chooseOutputPath: (suggestedName: string) => Promise<string | null>
  createEditPlan: (request: EditPlanRequest) => Promise<EditPlanOutcome>
  generatePreview: (request: PreviewRenderRequest) => Promise<PreviewRenderOutcome>
  exportApprovedPreview: (request: ExportRenderRequest) => Promise<RenderArtifact>
  cancelRender: (renderId: string) => Promise<boolean>
  onRenderProgress: (callback: (progress: RenderProgress) => void) => () => void
  openFile: (path: string) => Promise<string>
  showItemInFolder: (path: string) => Promise<void>
  deletePreview: (projectId: string, previewId: string) => Promise<void>
  getPreviewStorageStats: () => Promise<PreviewStorageStats>
  cleanOldPreviews: (
    projectId: string,
    versions: PreviewVersion[],
    protectedIds: string[]
  ) => Promise<string[]>
  getPersonDetectionStatus: () => Promise<PersonDetectionStatus>
  onPersonAnalysisRequest: (callback: (request: PersonAnalysisRequest) => void) => () => void
  onPersonAnalysisCancel: (callback: (requestId: string) => void) => () => void
  submitPersonAnalysisResponse: (response: PersonAnalysisResponse) => void
  getTranscriptionStatus: () => Promise<TranscriptionStatus>
  installTranscriptionModel: (model: string) => Promise<TranscriptionModelInfo>
  removeTranscriptionModel: (model: string) => Promise<void>
  onTranscriptionModelProgress: (callback: (progress: TranscriptionModelProgress) => void) => () => void
  transcribe: (request: TranscriptionRequest) => Promise<TranscriptionResult>
  cancelTranscription: (jobId: string) => Promise<boolean>
  onTranscriptionProgress: (callback: (progress: TranscriptionProgress) => void) => () => void
  loadTranscripts: (projectId: string, references: TranscriptReference[]) => Promise<Transcript[]>
  updateTranscript: (transcript: Transcript) => Promise<TranscriptReference>
  detectFillers: (transcript: Transcript) => Promise<Transcript>
  buildCaptionTrack: (request: CaptionBuildRequest) => Promise<CaptionTrack | null>
  exportSubtitles: (request: SubtitleExportRequest) => Promise<string | null>
  getSemanticModelStatus: () => Promise<SemanticModelStatus>
  installSemanticModel: () => Promise<SemanticModelStatus>
  removeSemanticModel: () => Promise<void>
  onSemanticModelProgress: (callback: (progress: number) => void) => () => void
  analyzeSemantics: (request: SemanticAnalysisRequest) => Promise<SemanticAnalysisResult>
  cancelSemanticAnalysis: (jobId: string) => Promise<boolean>
  onSemanticAnalysisProgress: (callback: (progress: SemanticAnalysisProgress) => void) => () => void
  loadSemanticAnalysis: (projectId: string, reference: SemanticAnalysisReference | null) => Promise<SemanticProjectAnalysis | null>
  semanticSearch: (request: SemanticSearchRequest) => Promise<SemanticSearchResult[]>
  findHighlights: (request: HighlightDiscoveryRequest) => Promise<HighlightCandidate[]>
  createHighlightReel: (request: HighlightReelRequest) => Promise<RenderPlan>
  exportChapters: (request: ChapterExportRequest) => Promise<string | null>
  getPathForFile: (file: File) => string
  autosaveProject: (project: ProjectFile, filePath: string | null) => Promise<AutosaveResult>
  saveProjectAs: (project: ProjectFile) => Promise<SavedProject | null>
  getRecoveryState: () => Promise<RecoverySessionState>
  recoverProject: (projectId: string) => Promise<ProjectFile>
  discardRecovery: (projectId: string) => Promise<void>
  listSnapshots: (projectId: string) => Promise<ProjectSnapshotRef[]>
  createSnapshot: (project: ProjectFile, options: CreateSnapshotRequest) => Promise<ProjectSnapshotRef>
  readSnapshot: (projectId: string, snapshotId: string) => Promise<ProjectFile>
  diffSnapshot: (projectId: string, snapshotId: string, current: ProjectFile) => Promise<ProjectSnapshotDiff[]>
  renameSnapshot: (projectId: string, snapshotId: string, name: string) => Promise<ProjectSnapshotRef[]>
  deleteSnapshot: (projectId: string, snapshotId: string) => Promise<ProjectSnapshotRef[]>
  validateProject: (project: ProjectFile) => Promise<ProjectIntegrityReport>
}

export interface CreateSnapshotRequest {
  reason: SnapshotReason
  name?: string
}

/**
 * Autosave never opens a dialog, so it reports back rather than throwing: a project
 * with nowhere to be written yet is journalled and reported as `journalled`.
 */
export interface AutosaveResult {
  state: 'saved' | 'journalled' | 'failed'
  filePath: string | null
  savedAt: string
  message: string | null
}

export const IPC_CHANNELS = {
  runtimeDiagnostics: 'runtime:diagnostics',
  runtimeRepair: 'runtime:repair',
  runtimeOpenStorage: 'runtime:open-storage',
  runtimeCopyDiagnostics: 'runtime:copy-diagnostics',
  runtimeGetResourceMode: 'runtime:get-resource-mode',
  runtimeSetResourceMode: 'runtime:set-resource-mode',
  diarizationStatus: 'diarization:status',
  diarizationInstallModels: 'diarization:install-models',
  diarizationRemoveModels: 'diarization:remove-models',
  diarizationModelProgress: 'diarization:model-progress',
  diarizationRun: 'diarization:run',
  diarizationCancel: 'diarization:cancel',
  diarizationProgress: 'diarization:progress',
  diarizationLoad: 'diarization:load',
  transcriptionQueueRun: 'transcription-queue:run',
  transcriptionQueuePause: 'transcription-queue:pause',
  transcriptionQueueResume: 'transcription-queue:resume',
  transcriptionQueueCancelCurrent: 'transcription-queue:cancel-current',
  transcriptionQueueCancelAll: 'transcription-queue:cancel-all',
  transcriptionQueueProgress: 'transcription-queue:progress',
  captionTemplatesGet: 'caption-templates:get',
  captionTemplatesSave: 'caption-templates:save',
  captionTemplatesRename: 'caption-templates:rename',
  captionTemplatesDuplicate: 'caption-templates:duplicate',
  captionTemplatesDelete: 'caption-templates:delete',
  ffmpegStatus: 'system:ffmpeg-status',
  chooseVideos: 'files:choose-videos',
  importVideos: 'media:import-videos',
  chooseAudio: 'files:choose-audio',
  importAudio: 'media:import-audio',
  saveProject: 'projects:save',
  autosaveProject: 'projects:autosave',
  saveProjectAs: 'projects:save-as',
  recoveryState: 'projects:recovery-state',
  recoverProject: 'projects:recover',
  discardRecovery: 'projects:discard-recovery',
  snapshotList: 'projects:snapshot-list',
  snapshotCreate: 'projects:snapshot-create',
  snapshotRead: 'projects:snapshot-read',
  snapshotDiff: 'projects:snapshot-diff',
  snapshotRename: 'projects:snapshot-rename',
  snapshotDelete: 'projects:snapshot-delete',
  validateProject: 'projects:validate',
  chooseProject: 'projects:choose',
  openProject: 'projects:open',
  recentProjects: 'projects:recent',
  removeRecentProject: 'projects:remove-recent',
  chooseOutput: 'files:choose-output',
  createEditPlan: 'video:create-edit-plan',
  generatePreview: 'video:generate-preview',
  exportApprovedPreview: 'video:export-approved-preview',
  cancelRender: 'video:cancel-render',
  renderProgress: 'video:render-progress',
  openFile: 'files:open',
  showItemInFolder: 'files:show-in-folder',
  deletePreview: 'preview:delete',
  previewStorageStats: 'preview:storage-stats',
  cleanOldPreviews: 'preview:clean-old',
  personDetectionStatus: 'person:status',
  personAnalysisRequest: 'person:analyze-request',
  personAnalysisResponse: 'person:analyze-response',
  personAnalysisCancel: 'person:analyze-cancel',
  transcriptionStatus: 'transcription:status',
  transcriptionInstallModel: 'transcription:install-model',
  transcriptionRemoveModel: 'transcription:remove-model',
  transcriptionModelProgress: 'transcription:model-progress',
  transcriptionRun: 'transcription:run',
  transcriptionCancel: 'transcription:cancel',
  transcriptionProgress: 'transcription:progress',
  transcriptionLoad: 'transcription:load',
  transcriptionUpdate: 'transcription:update',
  transcriptionDetectFillers: 'transcription:detect-fillers',
  captionBuild: 'captions:build',
  subtitleExport: 'captions:export-subtitles',
  semanticModelStatus: 'semantic:model-status',
  semanticInstallModel: 'semantic:install-model',
  semanticRemoveModel: 'semantic:remove-model',
  semanticModelProgress: 'semantic:model-progress',
  semanticAnalyze: 'semantic:analyze',
  semanticCancel: 'semantic:cancel',
  semanticProgress: 'semantic:progress',
  semanticLoad: 'semantic:load',
  semanticSearch: 'semantic:search',
  highlightFind: 'highlights:find',
  highlightCreateReel: 'highlights:create-reel',
  chapterExport: 'semantic:export-chapters'
} as const
