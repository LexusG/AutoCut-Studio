import { basename, extname, isAbsolute } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { VIDEO_FILE_FILTER } from '@shared/constants/media'
import { IPC_CHANNELS, type RenderRequest, type RenderSettings } from '@shared/types'
import { detectFfmpeg } from '../services/ffmpeg/binaries'
import { importVideos } from '../services/video/importer'
import { cancelRender, renderVideo } from '../services/video/renderer'

const MAX_FILES_PER_IMPORT = 250

function validatePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES_PER_IMPORT) {
    throw new Error(`Select no more than ${MAX_FILES_PER_IMPORT} videos at once.`)
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new Error('The import request contained an invalid file path.')
  }
  return value
}

function isRenderSettings(value: unknown): value is RenderSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<RenderSettings>
  return (
    ['original', '16:9', '9:16', '1:1', '4:5'].includes(settings.aspectRatio ?? '') &&
    ['720p', '1080p'].includes(settings.resolution ?? '') &&
    ['auto', 24, 30, 60].includes(settings.frameRate ?? '') &&
    ['original-order', 'automatic', 'random'].includes(settings.editingMode ?? '') &&
    ['slow', 'normal', 'fast'].includes(settings.pace ?? '') &&
    ['crop', 'fit'].includes(settings.fitMode ?? '') &&
    ['draft', 'balanced', 'high'].includes(settings.quality ?? '') &&
    typeof settings.useEveryClip === 'boolean'
  )
}

function validateRenderRequest(value: unknown): RenderRequest {
  if (!value || typeof value !== 'object') throw new Error('The render request is invalid.')
  const request = value as Partial<RenderRequest>
  if (typeof request.renderId !== 'string' || request.renderId.length < 8 || request.renderId.length > 100) {
    throw new Error('The render identifier is invalid.')
  }
  const sourcePaths = validatePaths(request.sourcePaths)
  if (!sourcePaths.every(isAbsolute)) throw new Error('Every source must be a local file.')
  if (
    typeof request.outputPath !== 'string' ||
    !isAbsolute(request.outputPath) ||
    extname(request.outputPath).toLowerCase() !== '.mp4'
  ) {
    throw new Error('Choose a local MP4 output path.')
  }
  if (!isRenderSettings(request.settings)) throw new Error('The output settings are invalid.')
  return { ...request, sourcePaths, settings: request.settings } as RenderRequest
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

  ipcMain.handle(IPC_CHANNELS.chooseOutput, async (_event, suggestedName: unknown) => {
    const safeName =
      typeof suggestedName === 'string' && suggestedName.trim()
        ? basename(suggestedName.trim()).replace(/[^a-zA-Z0-9._ -]/g, '_')
        : 'AutoCut Video.mp4'
    const result = await dialog.showSaveDialog({
      title: 'Save generated video',
      defaultPath: safeName.toLowerCase().endsWith('.mp4') ? safeName : `${safeName}.mp4`,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.renderVideo, (event, value: unknown) => {
    const request = validateRenderRequest(value)
    return renderVideo(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.renderProgress, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.cancelRender, (_event, renderId: unknown) => {
    if (typeof renderId !== 'string') throw new Error('The render identifier is invalid.')
    return cancelRender(renderId)
  })
}
