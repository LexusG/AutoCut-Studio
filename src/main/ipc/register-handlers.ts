import { access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import { AUDIO_FILE_FILTER } from '@shared/constants/audio'
import { VIDEO_FILE_FILTER } from '@shared/constants/media'
import {
  IPC_CHANNELS,
  type ExportRenderRequest,
  type PreviewRenderRequest,
  type ProjectFile,
  type RenderPlan,
  type RenderSettings
} from '@shared/types'
import { parseProjectFile } from '@shared/utils/project-codec'
import { sanitizeFilenamePart } from '@shared/utils/project-settings'
import { importAudio } from '../services/audio/importer'
import { detectFfmpeg } from '../services/ffmpeg/binaries'
import {
  getRecentProjects,
  openProjectFile,
  removeRecentProject,
  saveProjectFile
} from '../services/projects/project-storage'
import { importVideos } from '../services/video/importer'
import {
  cancelRender,
  exportApprovedPreview,
  generatePreview
} from '../services/video/renderer'

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
  const audio = settings.audio
  const preferences = settings.smartPreferences
  const validSoundtrackTracks =
    Array.isArray(audio?.soundtrackTracks) &&
    audio.soundtrackTracks.length <= 100 &&
    audio.soundtrackTracks.every((track) =>
      Boolean(track) &&
      typeof track.id === 'string' &&
      typeof track.filename === 'string' &&
      typeof track.path === 'string' &&
      isAbsolute(track.path) &&
      typeof track.duration === 'number' &&
      track.duration > 0 &&
      typeof track.missing === 'boolean' &&
      typeof track.enabled === 'boolean' &&
      typeof track.volume === 'number' &&
      track.volume >= 0 &&
      track.volume <= 100 &&
      typeof track.startPosition === 'number' &&
      track.startPosition >= 0 &&
      Boolean(track.fadeIn) &&
      typeof track.fadeIn.enabled === 'boolean' &&
      typeof track.fadeIn.duration === 'number' &&
      track.fadeIn.duration >= 0 &&
      Boolean(track.fadeOut) &&
      typeof track.fadeOut.enabled === 'boolean' &&
      typeof track.fadeOut.duration === 'number' &&
      track.fadeOut.duration >= 0
    )
  return (
    ['original', '16:9', '9:16', '1:1', '4:5'].includes(settings.aspectRatio ?? '') &&
    ['720p', '1080p'].includes(settings.resolution ?? '') &&
    typeof settings.outputWidth === 'number' && settings.outputWidth > 0 &&
    typeof settings.outputHeight === 'number' && settings.outputHeight > 0 &&
    ['auto', 24, 30, 60].includes(settings.frameRate ?? '') &&
    ['original-order', 'automatic', 'random'].includes(settings.editingMode ?? '') &&
    ['slow', 'normal', 'fast'].includes(settings.pace ?? '') &&
    ['crop', 'fit'].includes(settings.fitMode ?? '') &&
    ['draft', 'balanced', 'high'].includes(settings.quality ?? '') &&
    ['fast', 'full'].includes(settings.previewQuality ?? '') &&
    ['classic', 'smart'].includes(settings.selectionMode ?? '') &&
    ['fast', 'balanced', 'detailed'].includes(settings.analysisQuality ?? '') &&
    Boolean(preferences) &&
    typeof preferences?.preferPeople === 'boolean' &&
    typeof preferences?.preferMotion === 'boolean' &&
    typeof preferences?.preferClearFootage === 'boolean' &&
    typeof preferences?.preferAudibleMoments === 'boolean' &&
    Number.isInteger(settings.selectionSeed) &&
    ['black', 'blurred'].includes(settings.fitBackground ?? '') &&
    ['low', 'medium', 'high'].includes(settings.blurStrength ?? '') &&
    typeof settings.useEveryClip === 'boolean' &&
    (settings.targetDuration == null ||
      (typeof settings.targetDuration === 'number' && settings.targetDuration > 0)) &&
    ['none', 'crossfade', 'fade', 'dip-to-black'].includes(settings.transitionPreference ?? '') &&
    typeof settings.transitionDuration === 'number' &&
    settings.transitionDuration >= 0 &&
    settings.transitionDuration <= 2 &&
    Boolean(audio) &&
    typeof audio?.musicVolume === 'number' && audio.musicVolume >= 0 && audio.musicVolume <= 100 &&
    typeof audio?.preserveOriginalAudio === 'boolean' &&
    typeof audio?.originalAudioVolume === 'number' && audio.originalAudioVolume >= 0 && audio.originalAudioVolume <= 100 &&
    typeof audio?.normalizeClipAudio === 'boolean' &&
    typeof audio?.loopBackgroundMusic === 'boolean' &&
    typeof audio?.musicStartPosition === 'number' && audio.musicStartPosition >= 0 &&
    typeof audio?.duckMusicDuringClipAudio === 'boolean' &&
    typeof audio?.soundtrackEnabled === 'boolean' &&
    validSoundtrackTracks &&
    typeof audio?.soundtrackCrossfade === 'number' &&
    audio.soundtrackCrossfade >= 0 &&
    audio.soundtrackCrossfade <= 5 &&
    ['off', 'fast', 'accurate'].includes(audio?.normalizationMode ?? '') &&
    typeof audio?.normalizeFinalMix === 'boolean' &&
    Boolean(audio?.fadeIn) && typeof audio?.fadeIn.duration === 'number' && audio.fadeIn.duration >= 0 &&
    Boolean(audio?.fadeOut) && typeof audio?.fadeOut.duration === 'number' && audio.fadeOut.duration >= 0 &&
    (audio?.backgroundTrack == null ||
      (typeof audio.backgroundTrack.path === 'string' &&
        isAbsolute(audio.backgroundTrack.path) &&
        typeof audio.backgroundTrack.duration === 'number' &&
        audio.backgroundTrack.duration > 0 &&
        typeof audio.backgroundTrack.missing === 'boolean'))
  )
}

function validateRenderId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100) {
    throw new Error('The render identifier is invalid.')
  }
  return value
}

function validatePreviewRequest(value: unknown): PreviewRenderRequest {
  if (!value || typeof value !== 'object') throw new Error('The preview request is invalid.')
  const request = value as Partial<PreviewRenderRequest>
  const renderId = validateRenderId(request.renderId)
  if (typeof request.projectId !== 'string' || !request.projectId || request.projectId.length > 100) {
    throw new Error('The project identifier is invalid.')
  }
  if (!Number.isInteger(request.generation) || (request.generation ?? -1) < 0) {
    throw new Error('The preview generation is invalid.')
  }
  if (typeof request.settingsFingerprint !== 'string' || request.settingsFingerprint.length < 8) {
    throw new Error('The project settings fingerprint is invalid.')
  }
  const sourcePaths = validatePaths(request.sourcePaths)
  if (!sourcePaths.every(isAbsolute)) throw new Error('Every source must be a local file.')
  if (!isRenderSettings(request.settings)) throw new Error('The output settings are invalid.')
  return { ...request, renderId, sourcePaths, settings: request.settings } as PreviewRenderRequest
}

function isRenderPlan(value: unknown): value is RenderPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<RenderPlan>
  return (
    plan.version === 1 &&
    typeof plan.id === 'string' &&
    typeof plan.projectId === 'string' &&
    ['classic', 'smart'].includes(plan.selectionMode ?? '') &&
    Number.isInteger(plan.selectionSeed) &&
    (plan.analysisVersion == null || typeof plan.analysisVersion === 'string') &&
    ['black', 'blurred'].includes(plan.fitBackground ?? '') &&
    ['low', 'medium', 'high'].includes(plan.blurStrength ?? '') &&
    Number.isInteger(plan.previewVersion) &&
    (plan.previewVersion ?? 0) > 0 &&
    Array.isArray(plan.segments) &&
    plan.segments.length > 0 &&
    plan.segments.every((segment) =>
      Boolean(segment) &&
      typeof segment.sourcePath === 'string' &&
      isAbsolute(segment.sourcePath) &&
      typeof segment.start === 'number' &&
      segment.start >= 0 &&
      typeof segment.duration === 'number' &&
      segment.duration > 0 &&
      typeof segment.end === 'number' &&
      typeof segment.sourceDuration === 'number' &&
      segment.sourceDuration > 0 &&
      Math.abs(segment.end - (segment.start + segment.duration)) <= 0.02 &&
      segment.end <= segment.sourceDuration + 0.01
    ) &&
    Boolean(plan.output) &&
    Number.isInteger(plan.output?.width) &&
    (plan.output?.width ?? 0) > 0 &&
    (plan.output?.width ?? 0) <= 7680 &&
    Number.isInteger(plan.output?.height) &&
    (plan.output?.height ?? 0) > 0 &&
    (plan.output?.height ?? 0) <= 7680 &&
    typeof plan.output?.frameRate === 'number' &&
    plan.output.frameRate > 0 &&
    typeof plan.expectedDuration === 'number' &&
    plan.expectedDuration > 0
  )
}

function validateExportRequest(value: unknown): ExportRenderRequest {
  if (!value || typeof value !== 'object') throw new Error('The export request is invalid.')
  const request = value as Partial<ExportRenderRequest>
  const renderId = validateRenderId(request.renderId)
  if (
    typeof request.outputPath !== 'string' ||
    !isAbsolute(request.outputPath) ||
    extname(request.outputPath).toLowerCase() !== '.mp4'
  ) {
    throw new Error('Choose a local MP4 output path.')
  }
  if (
    typeof request.previewPath !== 'string' ||
    !isAbsolute(request.previewPath) ||
    extname(request.previewPath).toLowerCase() !== '.mp4'
  ) {
    throw new Error('The approved preview path is invalid.')
  }
  if (!['fast', 'full'].includes(request.previewQuality ?? '')) {
    throw new Error('The preview quality is invalid.')
  }
  if (!isRenderPlan(request.plan)) throw new Error('The frozen render plan is invalid.')
  if (request.plan.segments.some((segment) => resolve(segment.sourcePath) === resolve(request.outputPath!))) {
    throw new Error('The export destination cannot replace a source video.')
  }
  return { ...request, renderId } as ExportRenderRequest
}

function validateProject(value: unknown): ProjectFile {
  return parseProjectFile(JSON.stringify(value))
}

function validateLocalPath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${label} path is invalid.`)
  return value
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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

  ipcMain.handle(IPC_CHANNELS.chooseAudio, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add background audio',
      properties: ['openFile'],
      filters: [AUDIO_FILE_FILTER]
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC_CHANNELS.importAudio, (_event, value: unknown) => {
    return importAudio(validateLocalPath(value, 'Audio'))
  })

  ipcMain.handle(
    IPC_CHANNELS.saveProject,
    async (_event, value: unknown, currentPath: unknown) => {
      const project = validateProject(value)
      let filePath =
        currentPath == null ? null : validateLocalPath(currentPath, 'Project')
      if (!filePath) {
        const result = await dialog.showSaveDialog({
          title: 'Save AutoCut Studio project',
          defaultPath: `${sanitizeFilenamePart(project.settings.name)}.autocut.json`,
          filters: [{ name: 'AutoCut Studio project', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }
      return saveProjectFile(filePath, project)
    }
  )

  ipcMain.handle(IPC_CHANNELS.chooseProject, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open AutoCut Studio project',
      properties: ['openFile'],
      filters: [{ name: 'AutoCut Studio project', extensions: ['json', 'autocut'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openProjectFile(result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.openProject, (_event, value: unknown) => {
    return openProjectFile(validateLocalPath(value, 'Project'))
  })

  ipcMain.handle(IPC_CHANNELS.recentProjects, () => getRecentProjects())

  ipcMain.handle(IPC_CHANNELS.removeRecentProject, (_event, value: unknown) => {
    return removeRecentProject(validateLocalPath(value, 'Project'))
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
    if (result.canceled || !result.filePath) return null
    if (await pathExists(result.filePath)) {
      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        title: 'Replace existing video?',
        message: `${basename(result.filePath)} already exists.`,
        detail: 'The existing file will be replaced only if you continue.',
        buttons: ['Cancel', 'Replace'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      if (confirmation.response !== 1) return null
    }
    return result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.generatePreview, (event, value: unknown) => {
    const request = validatePreviewRequest(value)
    return generatePreview(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.renderProgress, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.exportApprovedPreview, (event, value: unknown) => {
    const request = validateExportRequest(value)
    return exportApprovedPreview(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.renderProgress, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.cancelRender, (_event, renderId: unknown) => {
    if (typeof renderId !== 'string') throw new Error('The render identifier is invalid.')
    return cancelRender(renderId)
  })

  ipcMain.handle(IPC_CHANNELS.openFile, (_event, value: unknown) => {
    return shell.openPath(validateLocalPath(value, 'File'))
  })

  ipcMain.handle(IPC_CHANNELS.showItemInFolder, (_event, value: unknown) => {
    shell.showItemInFolder(validateLocalPath(value, 'File'))
  })

  ipcMain.handle(IPC_CHANNELS.deletePreviewFiles, async (_event, video: unknown, thumbnail: unknown) => {
    const root = resolve(join(tmpdir(), 'autocut-studio'))
    const videoPath = resolve(validateLocalPath(video, 'Preview'))
    const thumbnailPath = typeof thumbnail === 'string' && thumbnail
      ? resolve(validateLocalPath(thumbnail, 'Thumbnail'))
      : null
    if (!videoPath.startsWith(`${root}/`) || (thumbnailPath && !thumbnailPath.startsWith(`${root}/`))) {
      throw new Error('Only AutoCut Studio temporary previews can be deleted.')
    }
    await rm(videoPath, { force: true })
    if (thumbnailPath) await rm(thumbnailPath, { force: true })
  })
}
