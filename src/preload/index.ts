import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS, type AutoCutApi } from '@shared/types'

const api: AutoCutApi = {
  getFfmpegStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ffmpegStatus),
  chooseVideoFiles: () => ipcRenderer.invoke(IPC_CHANNELS.chooseVideos),
  importVideoFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.importVideos, paths),
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('autoCut', api)
