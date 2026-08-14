import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  PreviewQuality,
  RenderPlan,
  RenderPlanSegment,
  RenderQuality,
  RenderStage,
  TransitionPreference
} from '@shared/types'
import { ProcessExecutionError, runProcess } from '../ffmpeg/process'
import { musicMixFilters, sourceAudioFilter } from './audio-filters'
import { prepareSoundtrack } from './soundtrack-processor'
import { fastLoudnessFilter, measureLoudness, type LoudnessMeasurements } from './loudness-normalizer'

interface QualityOptions {
  preset: string
  crf: number
}

export interface RenderDimensions {
  width: number
  height: number
}

export interface ExecuteRenderOptions {
  ffmpegPath: string
  plan: RenderPlan
  outputPath: string
  normalizedDirectory: string
  previewQuality: PreviewQuality
  kind: 'preview' | 'export'
  signal: AbortSignal
  logPath: string
  onStage: (stage: RenderStage) => void
  onClipProgress: (index: number, fraction: number) => void
}

const qualityOptions: Record<RenderQuality, QualityOptions> = {
  draft: { preset: 'ultrafast', crf: 28 },
  balanced: { preset: 'veryfast', crf: 23 },
  high: { preset: 'medium', crf: 19 }
}

const transitionNames: Record<Exclude<TransitionPreference, 'none'>, string> = {
  crossfade: 'dissolve',
  fade: 'fade',
  'dip-to-black': 'fadeblack'
}

export function renderDimensions(plan: RenderPlan, previewQuality: PreviewQuality): RenderDimensions {
  if (previewQuality === 'full') return { width: plan.output.width, height: plan.output.height }
  const maximum = Math.max(plan.output.width, plan.output.height)
  if (maximum <= 960) return { width: plan.output.width, height: plan.output.height }
  const scale = 960 / maximum
  const even = (value: number): number => Math.max(2, Math.round(value * scale / 2) * 2)
  return { width: even(plan.output.width), height: even(plan.output.height) }
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

export function videoFilterGraph(plan: RenderPlan, dimensions: RenderDimensions): string {
  const { width, height } = dimensions
  const finish = `fps=${plan.output.frameRate},setsar=1,setpts=PTS-STARTPTS,format=yuv420p`
  if (plan.output.fitMode === 'fit' && plan.fitBackground === 'blurred') {
    const requestedRadius = { low: 12, medium: 24, high: 40 }[plan.blurStrength]
    const radius = Math.max(1, Math.min(requestedRadius, Math.floor((Math.min(width, height) - 1) / 2)))
    return [
      '[0:v:0]split=2[backgroundsource][foregroundsource]',
      `[backgroundsource]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=bilinear,crop=${width}:${height},boxblur=luma_radius=${radius}:luma_power=1,eq=brightness=-0.12[background]`,
      `[foregroundsource]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos[foreground]`,
      `[background][foreground]overlay=(W-w)/2:(H-h)/2,${finish}[video]`
    ].join(';')
  }
  const scale = plan.output.fitMode === 'crop'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
  return `[0:v:0]${scale},${finish}[video]`
}

async function logCommand(logPath: string, stage: string, command: string, args: string[]): Promise<void> {
  await appendFile(
    logPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), stage, command, args })}\n`,
    'utf8'
  )
}

async function normalizeSegment(
  options: ExecuteRenderOptions,
  segment: RenderPlanSegment,
  index: number,
  dimensions: RenderDimensions,
  outputPath: string
): Promise<void> {
  const duration = segment.duration.toFixed(3)
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-ss', segment.start.toFixed(3),
    '-t', duration,
    '-i', segment.sourcePath
  ]
  const useSourceAudio = segment.hasAudio && options.plan.audio.preserveOriginalAudio
  if (!useSourceAudio) {
    args.push(
      '-f', 'lavfi',
      '-t', duration,
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
    )
  }
  const audioLabel = useSourceAudio ? '0:a:0' : '1:a:0'
  let measurements: LoudnessMeasurements | null = null
  if (useSourceAudio && options.plan.audio.normalizationMode === 'accurate') {
    try {
      measurements = await measureLoudness(
        options.ffmpegPath,
        segment.sourcePath,
        segment.start,
        segment.duration,
        options.signal,
        options.logPath
      )
    } catch (error) {
      if (options.signal.aborted) throw error
      await appendFile(options.logPath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        stage: 'accurate-normalization-fallback',
        filename: segment.filename,
        warning: error instanceof Error ? error.message : String(error)
      })}\n`, 'utf8')
    }
  }
  const filters = [
    videoFilterGraph(options.plan, dimensions),
    sourceAudioFilter(audioLabel, segment.duration, {
      ...options.plan.audio,
      normalizeClipAudio: useSourceAudio && options.plan.audio.normalizeClipAudio,
      normalizationMode: useSourceAudio && options.plan.audio.normalizeClipAudio
        ? options.plan.audio.normalizationMode
        : 'off',
      originalAudioVolume: useSourceAudio ? options.plan.audio.originalAudioVolume : 0
    }, measurements)
  ].join(';')
  const argsTail = [
    '-filter_complex', filters,
    '-map', '[video]',
    '-map', '[audio]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-ac', '2',
    '-t', duration,
    '-metadata:s:v:0', 'rotate=0',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    '-y', outputPath
  ]
  args.push(...argsTail)
  await logCommand(options.logPath, `normalize-${index + 1}`, options.ffmpegPath, args)
  await runProcess(options.ffmpegPath, args, {
    signal: options.signal,
    onStdout: createProgressParser(segment.duration, (fraction) => options.onClipProgress(index, fraction))
  })
}

function transitionFilters(plan: RenderPlan): { filters: string[]; video: string; audio: string } {
  const filters: string[] = []
  if (plan.segments.length === 1) {
    filters.push(
      '[0:v:0]settb=AVTB,setpts=PTS-STARTPTS[basev]',
      '[0:a:0]asetpts=PTS-STARTPTS[basea]'
    )
    return { filters, video: 'basev', audio: 'basea' }
  }

  const hasTransitions = plan.segments.some(
    (segment) => segment.transitionToNext && segment.transitionToNext.duration > 0
  )
  if (!hasTransitions) {
    const inputs = plan.segments.map((_segment, index) => `[${index}:v:0][${index}:a:0]`).join('')
    filters.push(`${inputs}concat=n=${plan.segments.length}:v=1:a=1[basev][basea]`)
    return { filters, video: 'basev', audio: 'basea' }
  }

  plan.segments.forEach((_segment, index) => {
    filters.push(
      `[${index}:v:0]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`,
      `[${index}:a:0]asetpts=PTS-STARTPTS[a${index}]`
    )
  })
  let videoLabel = 'v0'
  let audioLabel = 'a0'
  let accumulatedDuration = plan.segments[0].duration
  for (let index = 1; index < plan.segments.length; index += 1) {
    const transition = plan.segments[index - 1].transitionToNext
    const transitionDuration = transition?.duration ?? 0
    const transitionName = transition && transition.type !== 'none'
      ? transitionNames[transition.type]
      : 'fade'
    const offset = Math.max(0, accumulatedDuration - transitionDuration)
    const nextVideo = index === plan.segments.length - 1 ? 'basev' : `vx${index}`
    const nextAudio = index === plan.segments.length - 1 ? 'basea' : `ax${index}`
    filters.push(
      `[${videoLabel}][v${index}]xfade=transition=${transitionName}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${nextVideo}]`,
      `[${audioLabel}][a${index}]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[${nextAudio}]`
    )
    accumulatedDuration += plan.segments[index].duration - transitionDuration
    videoLabel = nextVideo
    audioLabel = nextAudio
  }
  return { filters, video: videoLabel, audio: audioLabel }
}

function compositionArgs(
  options: ExecuteRenderOptions,
  normalizedPaths: string[],
  ducking: boolean,
  soundtrackPath: string | null
): string[] {
  const args = ['-hide_banner', '-loglevel', 'error']
  for (const path of normalizedPaths) args.push('-i', path)
  const background = soundtrackPath
    ? { path: soundtrackPath, duration: options.plan.expectedDuration, missing: false }
    : options.plan.audio.backgroundTrack
  if (background && !background.missing) {
    if (options.plan.audio.loopBackgroundMusic) args.push('-stream_loop', '-1')
    const maximumStart = Math.max(0, background.duration - 0.05)
    const start = soundtrackPath ? 0 : Math.min(maximumStart, options.plan.audio.musicStartPosition)
    args.push('-ss', start.toFixed(3), '-i', background.path)
  }

  const transition = transitionFilters(options.plan)
  const filters = [...transition.filters]
  filters.push(
    `[${transition.video}]trim=duration=${options.plan.expectedDuration.toFixed(3)},setpts=PTS-STARTPTS[finalv]`
  )
  let audioLabel = transition.audio
  if (background && !background.missing) {
    const music = musicMixFilters(
      normalizedPaths.length,
      transition.audio,
      options.plan.expectedDuration,
      soundtrackPath ? { ...options.plan.audio, musicVolume: 100 } : options.plan.audio,
      ducking
    )
    filters.push(...music.filters)
    audioLabel = music.outputLabel
  } else {
    filters.push(
      `[${transition.audio}]apad=pad_dur=${options.plan.expectedDuration.toFixed(3)},atrim=0:${options.plan.expectedDuration.toFixed(3)}[finalaudio]`
    )
    audioLabel = 'finalaudio'
  }
  if (options.plan.audio.normalizeFinalMix) {
    filters.push(`[${audioLabel}]${fastLoudnessFilter()}[programaudio]`)
    audioLabel = 'programaudio'
  }

  const quality = options.kind === 'preview' && options.previewQuality === 'fast'
    ? qualityOptions.draft
    : qualityOptions[options.plan.output.quality]
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[finalv]',
    '-map', `[${audioLabel}]`,
    '-c:v', 'libx264',
    '-preset', quality.preset,
    '-crf', quality.crf.toString(),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', options.plan.expectedDuration.toFixed(3),
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    '-y', options.outputPath
  )
  return args
}

export async function executeRender(options: ExecuteRenderOptions): Promise<{ duckingFallback: boolean }> {
  const dimensions = renderDimensions(options.plan, options.previewQuality)
  await mkdir(options.normalizedDirectory, { recursive: true })
  const normalizedPaths: string[] = []
  options.onStage('Preparing clips')
  for (let index = 0; index < options.plan.segments.length; index += 1) {
    const segment = options.plan.segments[index]
    const outputPath = join(options.normalizedDirectory, `clip-${index.toString().padStart(4, '0')}.mp4`)
    normalizedPaths.push(outputPath)
    options.onStage(index === 0 ? 'Processing source audio' : 'Normalizing video')
    await normalizeSegment(options, segment, index, dimensions, outputPath)
  }

  options.onStage('Processing music')
  const soundtrackPath = await prepareSoundtrack(
    options.ffmpegPath,
    options.plan.audio,
    options.normalizedDirectory,
    options.signal,
    options.logPath
  )

  const hasMusic = Boolean(soundtrackPath || (options.plan.audio.backgroundTrack && !options.plan.audio.backgroundTrack.missing))
  options.onStage(options.plan.segments.length > 1 ? 'Creating transitions' : hasMusic ? 'Processing music' : options.kind === 'preview' ? 'Encoding preview' : 'Encoding export')
  const shouldDuck = hasMusic && options.plan.audio.duckMusicDuringClipAudio && options.plan.audio.preserveOriginalAudio
  const runComposition = async (ducking: boolean): Promise<void> => {
    const args = compositionArgs(options, normalizedPaths, ducking, soundtrackPath)
    await logCommand(options.logPath, ducking ? 'compose-with-ducking' : 'compose', options.ffmpegPath, args)
    await runProcess(options.ffmpegPath, args, {
      signal: options.signal,
      onStdout: createProgressParser(options.plan.expectedDuration, (fraction) => {
        options.onClipProgress(options.plan.segments.length, fraction)
      })
    })
  }

  try {
    options.onStage(hasMusic ? 'Mixing audio' : options.kind === 'preview' ? 'Encoding preview' : 'Encoding export')
    await runComposition(shouldDuck)
    return { duckingFallback: false }
  } catch (error) {
    if (!shouldDuck || !(error instanceof ProcessExecutionError) || options.signal.aborted) throw error
    await appendFile(
      options.logPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), stage: 'ducking-fallback', warning: error.details })}\n`,
      'utf8'
    )
    await runComposition(false)
    return { duckingFallback: true }
  }
}
