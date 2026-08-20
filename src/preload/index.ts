import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS, type AutoCutApi } from '@shared/types'

const api: AutoCutApi = {
  getFfmpegStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ffmpegStatus),
  chooseVideoFiles: () => ipcRenderer.invoke(IPC_CHANNELS.chooseVideos),
  importVideoFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.importVideos, paths),
  chooseAudioFile: () => ipcRenderer.invoke(IPC_CHANNELS.chooseAudio),
  importAudioFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.importAudio, path),
  saveProject: (project, currentPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProject, project, currentPath),
  chooseProjectFile: () => ipcRenderer.invoke(IPC_CHANNELS.chooseProject),
  openProjectFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.openProject, path),
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.recentProjects),
  removeRecentProject: (path) => ipcRenderer.invoke(IPC_CHANNELS.removeRecentProject, path),
  chooseOutputPath: (suggestedName) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseOutput, suggestedName),
  createEditPlan: (request) => ipcRenderer.invoke(IPC_CHANNELS.createEditPlan, request),
  generatePreview: (request) => ipcRenderer.invoke(IPC_CHANNELS.generatePreview, request),
  exportApprovedPreview: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportApprovedPreview, request),
  cancelRender: (renderId) => ipcRenderer.invoke(IPC_CHANNELS.cancelRender, renderId),
  onRenderProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.renderProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.renderProgress, listener)
  },
  openFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.openFile, path),
  showItemInFolder: (path) => ipcRenderer.invoke(IPC_CHANNELS.showItemInFolder, path),
  deletePreview: (projectId, previewId) =>
    ipcRenderer.invoke(IPC_CHANNELS.deletePreview, projectId, previewId),
  getPreviewStorageStats: () => ipcRenderer.invoke(IPC_CHANNELS.previewStorageStats),
  cleanOldPreviews: (projectId, versions, protectedIds) =>
    ipcRenderer.invoke(IPC_CHANNELS.cleanOldPreviews, projectId, versions, protectedIds),
  getPersonDetectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.personDetectionStatus),
  onPersonAnalysisRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => callback(request)
    ipcRenderer.on(IPC_CHANNELS.personAnalysisRequest, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.personAnalysisRequest, listener)
  },
  onPersonAnalysisCancel: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string): void => callback(requestId)
    ipcRenderer.on(IPC_CHANNELS.personAnalysisCancel, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.personAnalysisCancel, listener)
  },
  submitPersonAnalysisResponse: (response) => ipcRenderer.send(IPC_CHANNELS.personAnalysisResponse, response),
  getTranscriptionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.transcriptionStatus),
  installTranscriptionModel: (model) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionInstallModel, model),
  removeTranscriptionModel: (model) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionRemoveModel, model),
  onTranscriptionModelProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.transcriptionModelProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptionModelProgress, listener)
  },
  transcribe: (request) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionRun, request),
  cancelTranscription: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionCancel, jobId),
  onTranscriptionProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.transcriptionProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptionProgress, listener)
  },
  loadTranscripts: (projectId, references) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionLoad, projectId, references),
  updateTranscript: (transcript) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionUpdate, transcript),
  detectFillers: (transcript) => ipcRenderer.invoke(IPC_CHANNELS.transcriptionDetectFillers, transcript),
  buildCaptionTrack: (request) => ipcRenderer.invoke(IPC_CHANNELS.captionBuild, request),
  exportSubtitles: (request) => ipcRenderer.invoke(IPC_CHANNELS.subtitleExport, request),
  getSemanticModelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.semanticModelStatus),
  installSemanticModel: () => ipcRenderer.invoke(IPC_CHANNELS.semanticInstallModel),
  removeSemanticModel: () => ipcRenderer.invoke(IPC_CHANNELS.semanticRemoveModel),
  onSemanticModelProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: number): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.semanticModelProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.semanticModelProgress, listener)
  },
  analyzeSemantics: (request) => ipcRenderer.invoke(IPC_CHANNELS.semanticAnalyze, request),
  cancelSemanticAnalysis: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.semanticCancel, jobId),
  onSemanticAnalysisProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.semanticProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.semanticProgress, listener)
  },
  loadSemanticAnalysis: (projectId, reference) => ipcRenderer.invoke(IPC_CHANNELS.semanticLoad, projectId, reference),
  semanticSearch: (request) => ipcRenderer.invoke(IPC_CHANNELS.semanticSearch, request),
  findHighlights: (request) => ipcRenderer.invoke(IPC_CHANNELS.highlightFind, request),
  createHighlightReel: (request) => ipcRenderer.invoke(IPC_CHANNELS.highlightCreateReel, request),
  exportChapters: (request) => ipcRenderer.invoke(IPC_CHANNELS.chapterExport, request),
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('autoCut', api)
