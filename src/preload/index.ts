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
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('autoCut', api)
