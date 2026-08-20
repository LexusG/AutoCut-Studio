import { appendFile, copyFile, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type {
  ExportRenderRequest,
  EditPlanOutcome,
  EditPlanRequest,
  PreviewRenderOutcome,
  PreviewRenderRequest,
  RenderArtifact,
  RenderPlan,
  RenderProgress,
  RenderStage
} from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { ProcessExecutionError, runProcess } from '../ffmpeg/process'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
import { verifyRenderedOutput } from './ffprobe-verifier'
import {
  cleanFailedPreview,
  cleanPromotedPreview,
  cleanPreviewIntermediates,
  createPreviewWorkspace,
  type PreviewWorkspace
} from './preview-manager'
import { promotePreview } from './preview-storage'
import { buildRenderPlan } from './render-planner'
import { executeRender, renderDimensions } from './render-executor'
import { InfeasibleDurationError } from './segment-allocator'
import { probeMedia } from './metadata'
import { applySmartSelection } from './smart/smart-selection'
import type { PersonPresenceProvider } from './smart/optional-ml'
import { applyContentAwareness, preserveLockedSegments } from './content/content-plan'
import { applySemanticSelection } from '../semantic/semantic-selection'

const activeRenders = new Map<string, AbortController>()

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled.')
    this.name = 'RenderCancelledError'
  }
}

function assertNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new RenderCancelledError()
}

function friendlyRenderError(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted || error instanceof RenderCancelledError) return new RenderCancelledError()
  if (error instanceof ProcessExecutionError) {
    return new Error(`FFmpeg could not complete the render. ${error.details || error.message}`)
  }
  if (error instanceof Error) return error
  return new Error('The video could not be rendered.')
}

function beginRender(renderId: string): { controller: AbortController; startedAt: number } {
  if (activeRenders.has(renderId)) throw new Error('This render is already running.')
  const controller = new AbortController()
  activeRenders.set(renderId, controller)
  return { controller, startedAt: Date.now() }
}

function progressReporter(
  renderId: string,
  startedAt: number,
  totalClips: number,
  onProgress: (progress: RenderProgress) => void
): (stage: RenderStage, percent: number, currentClipIndex?: number | null, currentClip?: string | null) => void {
  return (stage, percent, currentClipIndex = null, currentClip = null) => {
    onProgress({
      renderId,
      stage,
      currentClip,
      currentClipIndex,
      totalClips,
      percent: Math.min(100, Math.max(0, Math.round(percent * 10) / 10)),
      elapsedSeconds: (Date.now() - startedAt) / 1000
    })
  }
}

export function cancelRender(renderId: string): boolean {
  const controller = activeRenders.get(renderId)
  if (!controller) return false
  controller.abort()
  return true
}

export async function createEditPlan(
  request: EditPlanRequest,
  onProgress: (progress: RenderProgress) => void,
  personProvider?: PersonPresenceProvider
): Promise<EditPlanOutcome> {
  const { controller, startedAt } = beginRender(request.renderId)
  const { signal } = controller
  const report = progressReporter(request.renderId, startedAt, request.sourcePaths.length, onProgress)
  let directory: string | null = null
  try {
    directory = await mkdtemp(join(tmpdir(), 'autocut-edit-plan-'))
    const logPath = join(directory, 'analysis.log')
    const status = await detectFfmpeg()
    if (!status.ffmpeg.path || !status.ffprobe.path || !status.ready) {
      throw new Error('FFmpeg and FFprobe are required to analyze an edit plan.')
    }
    report('Analyzing clips', 0)
    const metadata = []
    for (let index = 0; index < request.sourcePaths.length; index += 1) {
      assertNotCancelled(signal)
      metadata.push(await probeMedia(status.ffprobe.path, request.sourcePaths[index]))
      report('Analyzing clips', ((index + 1) / request.sourcePaths.length) * 12, index + 1, basename(request.sourcePaths[index]))
    }
    let plan: RenderPlan
    try {
      plan = buildRenderPlan(
        request.projectId, request.generation, request.sourcePaths, metadata,
        request.settingsFingerprint, request.settings
      )
      plan = {
        ...plan,
        semanticHints: structuredClone(request.semanticHints ?? []),
        topicSelections: structuredClone(request.topicSelections ?? []),
        variantId: request.variantId ?? null,
        generationMode: request.generationMode ?? 'full-edit'
      }
    } catch (error) {
      if (error instanceof InfeasibleDurationError) {
        return { success: false, issue: {
          code: 'target-too-short', message: error.message,
          requestedDuration: error.requestedDuration,
          minimumDuration: Math.ceil(error.minimumDuration), clipCount: error.clipCount
        } }
      }
      throw error
    }
    if (request.settings.selectionMode === 'smart') {
      plan = await applySmartSelection(
        status.ffmpeg.path, plan, request.settings, signal,
        (index, filename, stage) => report(stage, 12 + ((index + 0.5) / plan.segments.length) * 45, index + 1, filename),
        logPath, personProvider
      )
      try {
        plan = await applySemanticSelection(plan, request.settings, signal)
      } catch (error) {
        if (signal.aborted) throw error
        plan = { ...plan, warnings: [...plan.warnings, 'Semantic analysis unavailable; visual and speech Smart Selection continued.'] }
      }
    }
    plan = await applyContentAwareness(
      status.ffmpeg.path, plan, request.settings, signal,
      (stage, index, filename) => report(stage, stage === 'Detecting speech' ? 58 + (((index ?? 0) + 0.5) / plan.segments.length) * 28 : stage === 'Analyzing music' ? 88 : 94, index == null ? null : index + 1, filename ?? null)
    )
    plan = preserveLockedSegments(plan, request.currentPlan)
    report('Complete', 100)
    return { success: true, plan }
  } catch (error) {
    throw friendlyRenderError(error, signal)
  } finally {
    activeRenders.delete(request.renderId)
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

export async function generatePreview(
  request: PreviewRenderRequest,
  onProgress: (progress: RenderProgress) => void
): Promise<PreviewRenderOutcome> {
  const { controller, startedAt } = beginRender(request.renderId)
  const { signal } = controller
  const report = progressReporter(request.renderId, startedAt, request.sourcePaths.length, onProgress)
  let workspace: PreviewWorkspace | null = null
  try {
    const status = await detectFfmpeg()
    if (!status.ffmpeg.path || !status.ffprobe.path || !status.ready) {
      throw new Error('FFmpeg and FFprobe are required to generate a preview.')
    }
    report('Planning edit', 0)
    let plan: RenderPlan
    let thumbnailReady = false
    plan = { ...structuredClone(request.plan), id: randomUUID() }
    if (plan.projectId !== request.projectId || plan.settingsFingerprint !== request.settingsFingerprint) {
      throw new Error('The Edit Plan is outdated. Analyze the project again before generating a preview.')
    }

    workspace = await createPreviewWorkspace(request.projectId, request.renderId, plan)
    await writeFile(workspace.planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
    const dimensions = renderDimensions(plan, request.settings.previewQuality)
    let currentStage: RenderStage = 'Preparing clips'
    const execution = await executeRender({
      ffmpegPath: status.ffmpeg.path,
      plan,
      outputPath: workspace.previewPath,
      normalizedDirectory: workspace.normalized,
      previewQuality: request.settings.previewQuality,
      kind: 'preview',
      signal,
      logPath: workspace.logPath,
      onStage: (stage) => {
        currentStage = stage
        report(stage, stage === 'Creating transitions' || stage === 'Mixing audio' ? 72 : 5)
      },
      onClipProgress: (index, fraction) => {
        if (index < plan.segments.length) {
          const clip = plan.segments[index]
          report(currentStage, 5 + ((index + fraction) / plan.segments.length) * 65, index + 1, clip.filename)
        } else {
          report(currentStage, 72 + fraction * 22)
        }
      }
    })

    assertNotCancelled(signal)
    report('Verifying output', 96)
    const verified = await verifyRenderedOutput(status.ffprobe.path, workspace.previewPath, {
      ...dimensions,
      frameRate: plan.output.frameRate,
      duration: plan.expectedDuration
    })
    try {
      await runProcess(status.ffmpeg.path, [
        '-hide_banner', '-loglevel', 'error',
        '-ss', Math.min(verified.duration / 2, Math.max(0, verified.duration - 0.1)).toFixed(3),
        '-i', workspace.previewPath,
        '-frames:v', '1',
        '-vf', 'scale=320:-2',
        '-q:v', '3',
        '-y', workspace.thumbnailPath
      ], { signal })
      allowMediaPath(workspace.thumbnailPath)
      thumbnailReady = true
    } catch (error) {
      if (signal.aborted) throw error
      await appendFile(workspace.logPath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        stage: 'thumbnail-warning',
        warning: error instanceof Error ? error.message : String(error)
      })}\n`, 'utf8')
    }
    allowMediaPath(workspace.previewPath)
    await cleanPreviewIntermediates(workspace)
    report('Complete', 100)
    const temporaryArtifact: RenderArtifact = {
      kind: 'preview',
      outputPath: workspace.previewPath,
      outputUrl: '',
      ...verified,
      clipCount: plan.segments.length,
      plan,
      previewQuality: request.settings.previewQuality,
      reusedPreview: false,
      logPath: workspace.logPath,
      thumbnailPath: thumbnailReady ? workspace.thumbnailPath : '',
      thumbnailUrl: '',
      finalLoudness: execution.finalLoudness
    }
    const persistentArtifact = await promotePreview(request.projectId, plan.id, temporaryArtifact)
    await cleanPromotedPreview(workspace)
    workspace = null
    return {
      success: true,
      result: persistentArtifact
    }
  } catch (error) {
    if (workspace) await cleanFailedPreview(workspace)
    throw friendlyRenderError(error, signal)
  } finally {
    activeRenders.delete(request.renderId)
  }
}

export async function exportApprovedPreview(
  request: ExportRenderRequest,
  onProgress: (progress: RenderProgress) => void
): Promise<RenderArtifact> {
  const { controller, startedAt } = beginRender(request.renderId)
  const { signal } = controller
  const plan = request.plan
  const report = progressReporter(request.renderId, startedAt, plan.segments.length, onProgress)
  const workDirectory = await mkdtemp(join(tmpdir(), 'autocut-export-'))
  const renderedPath = join(workDirectory, 'approved.mp4')
  const normalizedDirectory = join(workDirectory, 'normalized')
  const logPath = join(dirname(request.previewPath), 'export.log')
  const partialPath = join(
    dirname(request.outputPath),
    `.${basename(request.outputPath)}.${request.renderId}.partial.mp4`
  )
  try {
    const status = await detectFfmpeg()
    if (!status.ffmpeg.path || !status.ffprobe.path || !status.ready) {
      throw new Error('FFmpeg and FFprobe are required to export the approved video.')
    }
    let reusedPreview = false
    let finalLoudness = request.previewFinalLoudness ?? null
    if (request.previewQuality === 'full') {
      report('Finalizing', 35)
      assertNotCancelled(signal)
      await copyFile(request.previewPath, renderedPath)
      reusedPreview = true
      await appendFile(
        logPath,
        `${JSON.stringify({ timestamp: new Date().toISOString(), stage: 'reuse-full-preview', previewPath: request.previewPath })}\n`,
        'utf8'
      )
    } else {
      let currentStage: RenderStage = 'Preparing clips'
      const execution = await executeRender({
        ffmpegPath: status.ffmpeg.path,
        plan,
        outputPath: renderedPath,
        normalizedDirectory,
        previewQuality: 'full',
        kind: 'export',
        signal,
        logPath,
        onStage: (stage) => {
          currentStage = stage
          report(stage, stage === 'Creating transitions' || stage === 'Mixing audio' ? 72 : 5)
        },
        onClipProgress: (index, fraction) => {
          if (index < plan.segments.length) {
            report(
              currentStage,
              5 + ((index + fraction) / plan.segments.length) * 62,
              index + 1,
              plan.segments[index].filename
            )
          } else {
            report(currentStage, 72 + fraction * 20)
          }
        }
      })
      finalLoudness = execution.finalLoudness
    }

    assertNotCancelled(signal)
    report('Verifying output', 94)
    const verified = await verifyRenderedOutput(status.ffprobe.path, renderedPath, {
      width: plan.output.width,
      height: plan.output.height,
      frameRate: plan.output.frameRate,
      duration: plan.expectedDuration
    })
    await copyFile(renderedPath, partialPath)
    assertNotCancelled(signal)
    await rename(partialPath, request.outputPath)
    allowMediaPath(request.outputPath)
    report('Complete', 100)
    return {
      kind: 'export',
      outputPath: request.outputPath,
      outputUrl: createMediaUrl(request.outputPath),
      ...verified,
      clipCount: plan.segments.length,
      plan,
      previewQuality: request.previewQuality,
      reusedPreview,
      logPath,
      thumbnailPath: request.plan.previewVersion ? request.previewPath.replace(/preview\.mp4$/, 'thumbnail.jpg') : '',
      thumbnailUrl: '',
      finalLoudness
    }
  } catch (error) {
    await rm(partialPath, { force: true })
    throw friendlyRenderError(error, signal)
  } finally {
    activeRenders.delete(request.renderId)
    await rm(workDirectory, { recursive: true, force: true })
  }
}
