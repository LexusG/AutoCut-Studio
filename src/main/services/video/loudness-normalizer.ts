import { appendFile } from 'node:fs/promises'
import type { FinalMixNormalizationMode, LoudnessVerification } from '@shared/types'
import { runProcess } from '../ffmpeg/process'

export const LOUDNESS_TARGET = { integrated: -16, range: 11, truePeak: -1.5 } as const

export interface LoudnessMeasurements {
  inputI: number
  inputLra: number
  inputTp: number
  inputThresh: number
  targetOffset: number
}

function numberField(value: unknown, key: string): number {
  if (!value || typeof value !== 'object') throw new Error('Loudness measurements are missing.')
  const parsed = Number((value as Record<string, unknown>)[key])
  if (!Number.isFinite(parsed)) throw new Error(`Loudness measurement ${key} is invalid.`)
  return parsed
}

export function parseLoudnessMeasurements(output: string): LoudnessMeasurements {
  const blocks = [...output.matchAll(/\{[\s\S]*?"target_offset"[\s\S]*?\}/g)]
  if (blocks.length === 0) throw new Error('FFmpeg did not return structured loudness measurements.')
  let parsed: unknown
  try {
    parsed = JSON.parse(blocks.at(-1)![0]) as unknown
  } catch {
    throw new Error('FFmpeg returned malformed loudness measurements.')
  }
  return {
    inputI: numberField(parsed, 'input_i'),
    inputLra: numberField(parsed, 'input_lra'),
    inputTp: numberField(parsed, 'input_tp'),
    inputThresh: numberField(parsed, 'input_thresh'),
    targetOffset: numberField(parsed, 'target_offset')
  }
}

export function fastLoudnessFilter(): string {
  return `loudnorm=I=${LOUDNESS_TARGET.integrated}:LRA=${LOUDNESS_TARGET.range}:TP=${LOUDNESS_TARGET.truePeak}:linear=true`
}

export async function measureLoudness(
  ffmpegPath: string,
  inputPath: string,
  start: number,
  duration: number,
  signal: AbortSignal,
  logPath: string
): Promise<LoudnessMeasurements> {
  const args = [
    '-hide_banner', '-loglevel', 'info',
    '-ss', start.toFixed(3),
    '-t', duration.toFixed(3),
    '-i', inputPath,
    '-map', '0:a:0',
    '-af', `loudnorm=I=${LOUDNESS_TARGET.integrated}:LRA=${LOUDNESS_TARGET.range}:TP=${LOUDNESS_TARGET.truePeak}:print_format=json`,
    '-f', 'null', '-'
  ]
  const result = await runProcess(ffmpegPath, args, { signal })
  const measurements = parseLoudnessMeasurements(result.stderr)
  await appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    stage: 'accurate-loudness-measurement',
    measurements,
    target: LOUDNESS_TARGET
  })}\n`, 'utf8')
  return measurements
}

export function accurateLoudnessFilter(measurements: LoudnessMeasurements): string {
  return [
    `loudnorm=I=${LOUDNESS_TARGET.integrated}`,
    `LRA=${LOUDNESS_TARGET.range}`,
    `TP=${LOUDNESS_TARGET.truePeak}`,
    `measured_I=${measurements.inputI}`,
    `measured_LRA=${measurements.inputLra}`,
    `measured_TP=${measurements.inputTp}`,
    `measured_thresh=${measurements.inputThresh}`,
    `offset=${measurements.targetOffset}`,
    'linear=true',
    'print_format=summary'
  ].join(':')
}

async function renderNormalizedAudio(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  filter: string,
  signal: AbortSignal
): Promise<void> {
  await runProcess(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-map', '0:a:0',
    '-af', filter,
    '-c:a', 'pcm_s24le',
    '-ar', '48000',
    '-ac', '2',
    '-y', outputPath
  ], { signal })
}

export async function normalizeFinalMixAudio(options: {
  ffmpegPath: string
  inputPath: string
  outputPath: string
  duration: number
  requestedMode: FinalMixNormalizationMode
  effectivelySilent?: boolean
  signal: AbortSignal
  logPath: string
}): Promise<{ audioPath: string; verification: LoudnessVerification }> {
  const verification: LoudnessVerification = {
    requestedMode: options.requestedMode,
    appliedMode: options.requestedMode,
    targetIntegrated: LOUDNESS_TARGET.integrated,
    targetTruePeak: LOUDNESS_TARGET.truePeak,
    targetLoudnessRange: LOUDNESS_TARGET.range,
    measuredIntegrated: null,
    measuredTruePeak: null,
    measuredLoudnessRange: null,
    targetDifference: null,
    fallbackReason: null
  }
  if (options.effectivelySilent) {
    verification.appliedMode = 'off'
    verification.fallbackReason = 'The completed mix is silent; normalization was skipped.'
    return { audioPath: options.inputPath, verification }
  }
  if (options.requestedMode === 'off') return { audioPath: options.inputPath, verification }

  let filter = fastLoudnessFilter()
  if (options.requestedMode === 'accurate') {
    try {
      const measurement = await measureLoudness(
        options.ffmpegPath,
        options.inputPath,
        0,
        options.duration,
        options.signal,
        options.logPath
      )
      filter = accurateLoudnessFilter(measurement)
    } catch (error) {
      if (options.signal.aborted) throw error
      verification.appliedMode = 'fast'
      verification.fallbackReason = error instanceof Error ? error.message : String(error)
      await appendFile(options.logPath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        stage: 'final-mix-accurate-fallback',
        fallback: 'fast',
        warning: verification.fallbackReason
      })}\n`, 'utf8')
    }
  }

  try {
    await renderNormalizedAudio(
      options.ffmpegPath,
      options.inputPath,
      options.outputPath,
      filter,
      options.signal
    )
  } catch (error) {
    if (options.signal.aborted) throw error
    verification.appliedMode = 'off'
    verification.fallbackReason = [
      verification.fallbackReason,
      error instanceof Error ? error.message : String(error)
    ].filter(Boolean).join(' ')
    await appendFile(options.logPath, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      stage: 'final-mix-normalization-fallback',
      fallback: 'off',
      warning: verification.fallbackReason
    })}\n`, 'utf8')
    return { audioPath: options.inputPath, verification }
  }
  try {
    const measured = await measureLoudness(
      options.ffmpegPath,
      options.outputPath,
      0,
      options.duration,
      options.signal,
      options.logPath
    )
    verification.measuredIntegrated = measured.inputI
    verification.measuredTruePeak = measured.inputTp
    verification.measuredLoudnessRange = measured.inputLra
    verification.targetDifference = measured.inputI - LOUDNESS_TARGET.integrated
  } catch (error) {
    if (options.signal.aborted) throw error
    await appendFile(options.logPath, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      stage: 'final-mix-verification-warning',
      warning: error instanceof Error ? error.message : String(error)
    })}\n`, 'utf8')
  }
  return { audioPath: options.outputPath, verification }
}
