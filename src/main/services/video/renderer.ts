import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, isAbsolute, join } from 'node:path'
import type {
  RenderProgress,
  RenderQuality,
  RenderRequest,
  RenderResult,
  RenderSettings
} from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { ProcessExecutionError, runProcess } from '../ffmpeg/process'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
import { probeMedia } from './metadata'
import { createRenderPlan, getOutputSpec, type PlannedSegment } from './render-planner'

interface QualityOptions {
  preset: string
  crf: number
}

const qualityOptions: Record<RenderQuality, QualityOptions> = {
  draft: { preset: 'ultrafast', crf: 28 },
  balanced: { preset: 'veryfast', crf: 23 },
  high: { preset: 'medium', crf: 19 }
}

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

function videoFilter(settings: RenderSettings, width: number, height: number, fps: number): string {
  const scaleAndFrame =
    settings.fitMode === 'crop'
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
  return `${scaleAndFrame},fps=${fps},setsar=1,format=yuv420p`
}

function createProgressParser(duration: number, onFraction: (fraction: number) => void) {
  let buffer = ''
  return (text: string): void => {
    buffer += text
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const separator = line.indexOf('=')
      if (separator < 0) continue
      const key = line.slice(0, separator)
      if (key !== 'out_time_us' && key !== 'out_time_ms') continue
      const microseconds = Number(line.slice(separator + 1))
      if (!Number.isFinite(microseconds)) continue
      onFraction(Math.min(1, Math.max(0, microseconds / 1_000_000 / duration)))
    }
  }
}

async function normalizeSegment(
  ffmpegPath: string,
  segment: PlannedSegment,
  outputPath: string,
  settings: RenderSettings,
  width: number,
  height: number,
  fps: number,
  signal: AbortSignal,
  onFraction: (fraction: number) => void
): Promise<void> {
  const duration = segment.segmentDuration.toFixed(3)
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    segment.start.toFixed(3),
    '-t',
    duration,
    '-i',
    segment.path
  ]

  if (!segment.hasAudio) {
    args.push(
      '-f',
      'lavfi',
      '-t',
      duration,
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000'
    )
  }

  const audioInput = segment.hasAudio ? '0:a:0' : '1:a:0'
  const filters = [
    `[0:v:0]${videoFilter(settings, width, height, fps)}[video]`,
    `[${audioInput}]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${duration},asetpts=PTS-STARTPTS[audio]`
  ].join(';')
  const quality = qualityOptions[settings.quality]

  args.push(
    '-filter_complex',
    filters,
    '-map',
    '[video]',
    '-map',
    '[audio]',
    '-c:v',
    'libx264',
    '-preset',
    quality.preset,
    '-crf',
    quality.crf.toString(),
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-t',
    duration,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    outputPath
  )

  await runProcess(ffmpegPath, args, {
    signal,
    onStdout: createProgressParser(segment.segmentDuration, onFraction)
  })
}

function escapeConcatPath(path: string): string {
  return path.replaceAll("'", "'\\''")
}

function friendlyRenderError(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted || error instanceof RenderCancelledError) return new RenderCancelledError()
  if (error instanceof ProcessExecutionError) {
    return new Error(`FFmpeg could not render the video. ${error.details || error.message}`)
  }
  if (error instanceof Error) return error
  return new Error('The video could not be rendered.')
}

export function cancelRender(renderId: string): boolean {
  const controller = activeRenders.get(renderId)
  if (!controller) return false
  controller.abort()
  return true
}

export async function renderVideo(
  request: RenderRequest,
  onProgress: (progress: RenderProgress) => void
): Promise<RenderResult> {
  if (activeRenders.has(request.renderId)) throw new Error('This render is already running.')
  const controller = new AbortController()
  const { signal } = controller
  activeRenders.set(request.renderId, controller)
  const startedAt = Date.now()
  let workDirectory: string | null = null

  const progress = (
    stage: RenderProgress['stage'],
    percent: number,
    totalClips: number,
    currentClip: string | null = null,
    currentClipIndex: number | null = null
  ): void => {
    onProgress({
      renderId: request.renderId,
      stage,
      currentClip,
      currentClipIndex,
      totalClips,
      percent: Math.min(100, Math.max(0, Math.round(percent * 10) / 10)),
      elapsedSeconds: (Date.now() - startedAt) / 1000
    })
  }

  try {
    const status = await detectFfmpeg()
    if (!status.ffmpeg.path || !status.ffprobe.path || !status.ready) {
      throw new Error('FFmpeg and FFprobe are required to generate a video.')
    }

    progress('Analyzing clips', 0, request.sourcePaths.length)
    const metadata = []
    for (let index = 0; index < request.sourcePaths.length; index += 1) {
      assertNotCancelled(signal)
      metadata.push(await probeMedia(status.ffprobe.path, request.sourcePaths[index]))
      progress('Analyzing clips', ((index + 1) / request.sourcePaths.length) * 8, request.sourcePaths.length)
    }

    const plan = createRenderPlan(request.sourcePaths, metadata, request.settings)
    const outputSpec = getOutputSpec(request.settings, plan)
    workDirectory = await mkdtemp(join(tmpdir(), 'autocut-render-'))
    const processedPaths: string[] = []

    for (let index = 0; index < plan.length; index += 1) {
      assertNotCancelled(signal)
      const segment = plan[index]
      const processedPath = join(workDirectory, `clip-${index.toString().padStart(4, '0')}.mp4`)
      processedPaths.push(processedPath)
      await normalizeSegment(
        status.ffmpeg.path,
        segment,
        processedPath,
        request.settings,
        outputSpec.width,
        outputSpec.height,
        outputSpec.frameRate,
        signal,
        (fraction) => {
          const clipProgress = (index + fraction) / plan.length
          progress(
            'Preparing clips',
            8 + clipProgress * 82,
            plan.length,
            segment.filename,
            index + 1
          )
        }
      )
    }

    assertNotCancelled(signal)
    progress('Combining video', 92, plan.length)
    const concatPath = join(workDirectory, 'clips.ffconcat')
    const finalTempPath = join(workDirectory, 'final.mp4')
    await writeFile(
      concatPath,
      `ffconcat version 1.0\n${processedPaths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')}\n`,
      'utf8'
    )
    await runProcess(
      status.ffmpeg.path,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-fflags',
        '+genpts',
        '-avoid_negative_ts',
        'make_zero',
        '-y',
        finalTempPath
      ],
      { signal }
    )

    assertNotCancelled(signal)
    progress('Finalizing', 98, plan.length)
    await copyFile(finalTempPath, request.outputPath)
    allowMediaPath(request.outputPath)
    const duration = plan.reduce((total, segment) => total + segment.segmentDuration, 0)
    progress('Complete', 100, plan.length)
    return {
      outputPath: request.outputPath,
      outputUrl: createMediaUrl(request.outputPath),
      duration
    }
  } catch (error) {
    throw friendlyRenderError(error, signal)
  } finally {
    activeRenders.delete(request.renderId)
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true })
  }
}
