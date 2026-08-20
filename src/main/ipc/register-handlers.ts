import { access, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import { AUDIO_FILE_FILTER } from '@shared/constants/audio'
import { VIDEO_FILE_FILTER } from '@shared/constants/media'
import {
  IPC_CHANNELS,
  type EditPlanRequest,
  type ExportRenderRequest,
  type PersonAnalysisResponse,
  type PreviewRenderRequest,
  type ProjectFile,
  type RenderPlan,
  type RenderSettings,
  type Transcript,
  type TranscriptReference,
  type TranscriptionRequest,
  type CaptionBuildRequest,
  type SubtitleExportRequest,
  type SemanticAnalysisRequest,
  type SemanticAnalysisReference,
  type SemanticSearchRequest,
  type HighlightDiscoveryRequest,
  type HighlightReelRequest,
  type ChapterExportRequest
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
  createEditPlan,
  exportApprovedPreview,
  generatePreview
} from '../services/video/renderer'
import {
  deleteManagedPreview,
  getPreviewStorageStats,
  pruneManagedPreviews
} from '../services/video/preview-storage'
import {
  MediaPipePoseLiteProvider,
  resolvePersonAnalysisResponse
} from '../services/video/smart/optional-ml'
import { getPersonDetectionStatus } from '../services/video/smart/person-model'
import {
  getTranscriptionStatus,
  installTranscriptionModel,
  removeTranscriptionModel
} from '../services/transcription/model-manager'
import { cancelTranscription, transcribeProject } from '../services/transcription/job-manager'
import { loadProjectTranscripts, updateTranscript } from '../services/transcription/transcript-repository'
import { detectFillerWords } from '../services/transcription/filler-detection'
import { buildCaptionTrack } from '../services/captions/caption-track-builder'
import { writeSubtitleFile } from '../services/captions/subtitle-exporter'
import { getSemanticModelStatus, installSemanticModel, removeSemanticModel } from '../services/semantic/model-manager'
import { analyzeSemantics, cancelSemanticAnalysis } from '../services/semantic/job-manager'
import { loadSemanticAnalysis } from '../services/semantic/analysis-repository'
import { semanticSearch } from '../services/semantic/search-service'
import { findHighlights } from '../services/semantic/highlight-service'
import { createHighlightReel } from '../services/semantic/highlight-planner'
import { serializeChapters } from '../services/semantic/chapter-exporter'

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
  const captions = settings.captions
  const semantic = settings.semantic
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
    typeof preferences?.preferSpeech === 'boolean' &&
    Number.isInteger(settings.selectionSeed) &&
    ['black', 'blurred'].includes(settings.fitBackground ?? '') &&
    ['low', 'medium', 'high'].includes(settings.blurStrength ?? '') &&
    ['off', 'balanced', 'strong'].includes(settings.contentAwareness ?? '') &&
    ['off', 'normal', 'strong'].includes(settings.speechCutProtection ?? '') &&
    ['natural', 'beat-assisted', 'beat-strong'].includes(settings.cutSync ?? '') &&
    ['center', 'smart-subject'].includes(settings.cropFocus ?? '') &&
    Boolean(captions) &&
    ['off', 'standard', 'dynamic'].includes(captions?.mode ?? '') &&
    ['none', 'burned-in', 'file-only', 'burned-in-and-file'].includes(captions?.subtitleOutput ?? '') &&
    Boolean(captions?.style) &&
    typeof captions?.style.fontSize === 'number' && captions.style.fontSize >= 8 && captions.style.fontSize <= 240 &&
    typeof captions?.style.textColor === 'string' &&
    Boolean(semantic) &&
    semantic?.provider === 'minilm-transformers-js' &&
    semantic?.model === 'Xenova/all-MiniLM-L6-v2' &&
    typeof semantic?.enabled === 'boolean' &&
    typeof semantic?.editGoal === 'string' && semantic.editGoal.length <= 500 &&
    ['light', 'balanced', 'strong'].includes(semantic?.editGoalStrength ?? '') &&
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
    ['off', 'fast', 'accurate'].includes(audio?.finalMixNormalizationMode ?? '') &&
    ['audio-level', 'speech-detection', 'automatic'].includes(audio?.duckingTrigger ?? '') &&
    Boolean(settings.personAnalysis) &&
    typeof settings.personAnalysis?.enabled === 'boolean' &&
    settings.personAnalysis?.provider === 'mediapipe-pose-lite' &&
    typeof settings.personAnalysis?.modelVersion === 'string' &&
    typeof settings.personAnalysis?.modelHash === 'string' &&
    typeof settings.personAnalysis?.analyzerVersion === 'string' &&
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
  if (!isRenderPlan(request.plan)) throw new Error('Create a valid Edit Plan before generating a preview.')
  if (request.plan.projectId !== request.projectId || request.plan.settingsFingerprint !== request.settingsFingerprint) {
    throw new Error('The Edit Plan does not match this project configuration.')
  }
  if (request.plan.segments.some((segment) => !sourcePaths.includes(segment.sourcePath))) {
    throw new Error('The Edit Plan contains a source outside this project.')
  }
  return { ...request, renderId, sourcePaths, settings: request.settings } as PreviewRenderRequest
}

function validateEditPlanRequest(value: unknown): EditPlanRequest {
  if (!value || typeof value !== 'object') throw new Error('The Edit Plan request is invalid.')
  const request = value as Partial<EditPlanRequest>
  const renderId = validateRenderId(request.renderId)
  if (typeof request.projectId !== 'string' || !request.projectId || request.projectId.length > 100) {
    throw new Error('The project identifier is invalid.')
  }
  if (!Number.isInteger(request.generation) || (request.generation ?? -1) < 0) {
    throw new Error('The plan generation is invalid.')
  }
  if (typeof request.settingsFingerprint !== 'string' || request.settingsFingerprint.length < 8) {
    throw new Error('The project settings fingerprint is invalid.')
  }
  const sourcePaths = validatePaths(request.sourcePaths)
  if (!sourcePaths.every(isAbsolute)) throw new Error('Every source must be a local file.')
  if (!isRenderSettings(request.settings)) throw new Error('The output settings are invalid.')
  if (request.currentPlan != null && !isRenderPlan(request.currentPlan)) throw new Error('The current Edit Plan is invalid.')
  return { ...request, renderId, sourcePaths, settings: request.settings, currentPlan: request.currentPlan ?? null } as EditPlanRequest
}

function isRenderPlan(value: unknown): value is RenderPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<RenderPlan>
  return (
    plan.version === 4 &&
    typeof plan.id === 'string' &&
    typeof plan.projectId === 'string' &&
    ['classic', 'smart'].includes(plan.selectionMode ?? '') &&
    Number.isInteger(plan.selectionSeed) &&
    (plan.analysisVersion == null || typeof plan.analysisVersion === 'string') &&
    ['black', 'blurred'].includes(plan.fitBackground ?? '') &&
    ['low', 'medium', 'high'].includes(plan.blurStrength ?? '') &&
    ['off', 'balanced', 'strong'].includes(plan.contentAwareness ?? '') &&
    ['off', 'normal', 'strong'].includes(plan.speechCutProtection ?? '') &&
    ['natural', 'beat-assisted', 'beat-strong'].includes(plan.cutSync ?? '') &&
    ['center', 'smart-subject'].includes(plan.cropFocus ?? '') &&
    ['off', 'standard', 'dynamic'].includes(plan.captionMode ?? '') &&
    ['none', 'burned-in', 'file-only', 'burned-in-and-file'].includes(plan.subtitleOutput ?? '') &&
    Boolean(plan.captionStyle) &&
    typeof plan.captionHighlightSpokenWord === 'boolean' &&
    ['bold', 'scale', 'color', 'background'].includes(plan.captionHighlightBehavior ?? '') &&
    ['none', 'fade', 'pop'].includes(plan.captionAnimation ?? '') &&
    Number.isInteger(plan.transcriptVersion) &&
    Number.isInteger(plan.transcriptEditRevision) &&
    typeof plan.editGoal === 'string' &&
    ['light', 'balanced', 'strong'].includes(plan.editGoalStrength ?? '') &&
    Array.isArray(plan.topicSelections) &&
    Array.isArray(plan.semanticHints) &&
    ['full-edit', 'highlight-reel', 'social-cut', 'custom-selection'].includes(plan.generationMode ?? '') &&
    Array.isArray(plan.highlightCandidateIds) &&
    Number.isInteger(plan.previewVersion) &&
    (plan.previewVersion ?? 0) > 0 &&
    Number.isInteger(plan.revision) &&
    (plan.revision ?? 0) > 0 &&
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
      segment.end <= segment.sourceDuration + 0.01 &&
      ['classic', 'smart', 'manual'].includes(segment.selectionSource) &&
      typeof segment.locked === 'boolean' &&
      typeof segment.automaticStart === 'number' &&
      typeof segment.automaticEnd === 'number'
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

  ipcMain.handle(IPC_CHANNELS.createEditPlan, (event, value: unknown) => {
    const request = validateEditPlanRequest(value)
    return createEditPlan(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.renderProgress, progress)
    }, new MediaPipePoseLiteProvider(event.sender))
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

  ipcMain.handle(IPC_CHANNELS.deletePreview, (_event, projectId: unknown, previewId: unknown) => {
    return deleteManagedPreview(validateStorageId(projectId, 'Project'), validateStorageId(previewId, 'Preview'))
  })

  ipcMain.handle(IPC_CHANNELS.previewStorageStats, () => getPreviewStorageStats())

  ipcMain.handle(IPC_CHANNELS.personDetectionStatus, () => getPersonDetectionStatus())

  ipcMain.handle(IPC_CHANNELS.transcriptionStatus, () => getTranscriptionStatus())

  ipcMain.handle(IPC_CHANNELS.transcriptionInstallModel, (event, model: unknown) => {
    if (typeof model !== 'string') throw new Error('The model name is invalid.')
    return installTranscriptionModel(model, (percent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.transcriptionModelProgress, { model, percent })
      }
    })
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionRemoveModel, (_event, model: unknown) => {
    if (typeof model !== 'string') throw new Error('The model name is invalid.')
    return removeTranscriptionModel(model)
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionRun, (event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The transcription request is invalid.')
    const request = value as TranscriptionRequest
    validateRenderId(request.jobId)
    validateStorageId(request.projectId, 'Project')
    if (!Array.isArray(request.sources) || request.sources.length === 0 || request.sources.length > MAX_FILES_PER_IMPORT) {
      throw new Error('Choose one or more project clips to transcribe.')
    }
    for (const source of request.sources) {
      validateStorageId(source.clipId, 'Clip')
      validateLocalPath(source.path, 'Source')
      if (typeof source.duration !== 'number' || source.duration <= 0 || typeof source.hasAudio !== 'boolean') {
        throw new Error('A transcription source is invalid.')
      }
    }
    if (!['fast', 'balanced', 'accurate'].includes(request.settings?.quality) ||
      !['auto', 'english', 'multilingual'].includes(request.settings?.language)) {
      throw new Error('The transcription settings are invalid.')
    }
    return transcribeProject(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.transcriptionProgress, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionCancel, (_event, jobId: unknown) => {
    if (typeof jobId !== 'string') throw new Error('The transcription job identifier is invalid.')
    return cancelTranscription(jobId)
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionLoad, (_event, projectId: unknown, references: unknown) => {
    const id = validateStorageId(projectId, 'Project')
    if (!Array.isArray(references)) throw new Error('Transcript references are invalid.')
    return loadProjectTranscripts(id, references as TranscriptReference[])
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionUpdate, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The transcript is invalid.')
    const transcript = value as Transcript
    validateStorageId(transcript.projectId, 'Project')
    validateStorageId(transcript.sourceClipId, 'Clip')
    if (transcript.version !== 1 || !Array.isArray(transcript.words) || !Array.isArray(transcript.segments)) {
      throw new Error('The transcript data is invalid.')
    }
    return updateTranscript(transcript)
  })

  ipcMain.handle(IPC_CHANNELS.transcriptionDetectFillers, async (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The transcript is invalid.')
    const transcript = detectFillerWords(value as Transcript)
    await updateTranscript(transcript)
    return transcript
  })

  ipcMain.handle(IPC_CHANNELS.captionBuild, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The caption request is invalid.')
    const request = value as CaptionBuildRequest
    if (!isRenderPlan(request.plan) || !Array.isArray(request.transcripts)) {
      throw new Error('Create an Edit Plan and transcripts before generating captions.')
    }
    return buildCaptionTrack(request)
  })

  ipcMain.handle(IPC_CHANNELS.subtitleExport, async (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The subtitle export request is invalid.')
    const request = value as SubtitleExportRequest
    if (!['srt', 'vtt'].includes(request.format) || !request.track || !Array.isArray(request.track.chunks)) {
      throw new Error('The subtitle export request is invalid.')
    }
    const extension = request.format
    const result = await dialog.showSaveDialog({
      title: `Export ${request.format.toUpperCase()} subtitles`,
      defaultPath: `${sanitizeFilenamePart(request.projectName)}.${extension}`,
      filters: [{ name: `${request.format.toUpperCase()} subtitles`, extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeSubtitleFile(result.filePath, request.format, request.track)
    return result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.semanticModelStatus, () => getSemanticModelStatus())

  ipcMain.handle(IPC_CHANNELS.semanticInstallModel, (event) => installSemanticModel((percent) => {
    if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.semanticModelProgress, percent)
  }))

  ipcMain.handle(IPC_CHANNELS.semanticRemoveModel, () => removeSemanticModel())

  ipcMain.handle(IPC_CHANNELS.semanticAnalyze, (event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The semantic analysis request is invalid.')
    const request = value as SemanticAnalysisRequest
    validateRenderId(request.jobId)
    validateStorageId(request.projectId, 'Project')
    if (!Array.isArray(request.transcripts) || request.transcripts.length > MAX_FILES_PER_IMPORT) {
      throw new Error('Semantic analysis requires valid project transcripts.')
    }
    if (!['interactive', 'normal', 'background'].includes(request.priority)) throw new Error('The analysis priority is invalid.')
    return analyzeSemantics(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.semanticProgress, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.semanticCancel, (_event, value: unknown) => {
    if (typeof value !== 'string') throw new Error('The semantic job identifier is invalid.')
    return cancelSemanticAnalysis(value)
  })

  ipcMain.handle(IPC_CHANNELS.semanticLoad, (_event, projectId: unknown, reference: unknown) =>
    loadSemanticAnalysis(validateStorageId(projectId, 'Project'), reference as SemanticAnalysisReference | null))

  ipcMain.handle(IPC_CHANNELS.semanticSearch, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The semantic search request is invalid.')
    const request = value as SemanticSearchRequest
    validateStorageId(request.projectId, 'Project')
    if (typeof request.query !== 'string' || request.query.length > 500 || !['exact', 'semantic'].includes(request.mode)) {
      throw new Error('The semantic search request is invalid.')
    }
    return semanticSearch(request)
  })

  ipcMain.handle(IPC_CHANNELS.highlightFind, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The highlight request is invalid.')
    const request = value as HighlightDiscoveryRequest
    validateStorageId(request.projectId, 'Project')
    if (request.plan && !isRenderPlan(request.plan)) throw new Error('The highlight Edit Plan is invalid.')
    if (!Array.isArray(request.semanticHints) || !Array.isArray(request.topicSelections)) throw new Error('The highlight constraints are invalid.')
    return findHighlights(request)
  })

  ipcMain.handle(IPC_CHANNELS.highlightCreateReel, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The highlight reel request is invalid.')
    const request = value as HighlightReelRequest
    validateStorageId(request.projectId, 'Project')
    if (!isRenderPlan(request.parentPlan) || !Array.isArray(request.highlights) || request.targetDuration <= 0) {
      throw new Error('The highlight reel request is invalid.')
    }
    return createHighlightReel(request)
  })

  ipcMain.handle(IPC_CHANNELS.chapterExport, async (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The chapter export request is invalid.')
    const request = value as ChapterExportRequest
    if (!Array.isArray(request.topics)) throw new Error('The chapter list is invalid.')
    const result = await dialog.showSaveDialog({
      title: 'Export chapter markers',
      defaultPath: `${sanitizeFilenamePart(request.projectName)}_chapters.txt`,
      filters: [{ name: 'Chapter markers', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, serializeChapters(request.topics), 'utf8')
    return result.filePath
  })

  ipcMain.on(IPC_CHANNELS.personAnalysisResponse, (event, value: unknown) => {
    if (!value || typeof value !== 'object') return
    const response = value as Partial<PersonAnalysisResponse>
    if (typeof response.requestId !== 'string') return
    resolvePersonAnalysisResponse(event.sender.id, response as PersonAnalysisResponse)
  })

  ipcMain.handle(IPC_CHANNELS.cleanOldPreviews, (_event, projectId: unknown, versions: unknown, protectedIds: unknown) => {
    if (!Array.isArray(versions) || !Array.isArray(protectedIds) || !protectedIds.every((id) => typeof id === 'string')) {
      throw new Error('The preview cleanup request is invalid.')
    }
    return pruneManagedPreviews(
      validateStorageId(projectId, 'Project'),
      versions as import('@shared/types').PreviewVersion[],
      protectedIds
    )
  })
}

function validateStorageId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`${label} identifier is invalid.`)
  }
  return value
}
