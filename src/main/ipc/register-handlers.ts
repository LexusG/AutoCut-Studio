import { dialog, ipcMain } from 'electron'
import { VIDEO_FILE_FILTER } from '@shared/constants/media'
import { IPC_CHANNELS } from '@shared/types'
import { detectFfmpeg } from '../services/ffmpeg/binaries'
import { importVideos } from '../services/video/importer'

const MAX_FILES_PER_IMPORT = 250

function validatePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_FILES_PER_IMPORT) {
    throw new Error(`Select no more than ${MAX_FILES_PER_IMPORT} videos at once.`)
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new Error('The import request contained an invalid file path.')
  }
  return value
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ffmpegStatus, () => detectFfmpeg())

  ipcMain.handle(IPC_CHANNELS.chooseVideos, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import video clips',
      properties: ['openFile', 'multiSelections'],
      filters: [VIDEO_FILE_FILTER]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC_CHANNELS.importVideos, (_event, paths: unknown) => {
    return importVideos(validatePaths(paths))
  })
}
