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
  PreviewRenderOutcome,
  PreviewRenderRequest,
  RenderArtifact,
  RenderProgress
} from './render'
import type { PersonAnalysisConfiguration, PersonAnalysisSummary } from './render'

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
  getPathForFile: (file: File) => string
}

export const IPC_CHANNELS = {
  ffmpegStatus: 'system:ffmpeg-status',
  chooseVideos: 'files:choose-videos',
  importVideos: 'media:import-videos',
  chooseAudio: 'files:choose-audio',
  importAudio: 'media:import-audio',
  saveProject: 'projects:save',
  chooseProject: 'projects:choose',
  openProject: 'projects:open',
  recentProjects: 'projects:recent',
  removeRecentProject: 'projects:remove-recent',
  chooseOutput: 'files:choose-output',
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
  personAnalysisCancel: 'person:analyze-cancel'
} as const
