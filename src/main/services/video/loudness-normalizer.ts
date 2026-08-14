import { appendFile } from 'node:fs/promises'
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
