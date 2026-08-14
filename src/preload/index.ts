import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS, type AutoCutApi } from '@shared/types'

const api: AutoCutApi = {
  getFfmpegStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ffmpegStatus),
  chooseVideoFiles: () => ipcRenderer.invoke(IPC_CHANNELS.chooseVideos),
  importVideoFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.importVideos, paths),
  chooseOutputPath: (suggestedName) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseOutput, suggestedName),
  renderVideo: (request) => ipcRenderer.invoke(IPC_CHANNELS.renderVideo, request),
  cancelRender: (renderId) => ipcRenderer.invoke(IPC_CHANNELS.cancelRender, renderId),
  onRenderProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.renderProgress, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.renderProgress, listener)
  },
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('autoCut', api)
