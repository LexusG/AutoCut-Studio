import { randomInt } from 'node:crypto'
import { basename } from 'node:path'
import type {
  AspectRatio,
  EditingMode,
  EditingPace,
  OutputFrameRate,
  OutputResolution,
  RenderSettings
} from '@shared/types'
import type { ProbedMedia } from './metadata'

export interface RenderSource extends ProbedMedia {
  path: string
  filename: string
}

export interface PlannedSegment extends RenderSource {
  start: number
  segmentDuration: number
}

export interface OutputSpec {
  width: number
  height: number
  frameRate: number
}

const preferredDurations: Record<EditingPace, number> = {
  slow: 7.5,
  normal: 4.5,
  fast: 2.5
}

function effectiveDimensions(source: RenderSource): { width: number; height: number } {
  const quarterTurn = Math.abs(source.video.rotation) % 180 === 90
  return quarterTurn
    ? { width: source.video.height, height: source.video.width }
    : { width: source.video.width, height: source.video.height }
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1)
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}

export function arrangeSources(
  sources: RenderSource[],
  mode: EditingMode,
  aspectRatio: AspectRatio
): RenderSource[] {
  if (mode === 'random') return shuffle(sources)
  if (mode === 'original-order') return [...sources]

  const targetIsPortrait = aspectRatio === '9:16' || aspectRatio === '4:5'
  return [...sources].sort((left, right) => {
    const leftDimensions = effectiveDimensions(left)
    const rightDimensions = effectiveDimensions(right)
    const leftMatches = (leftDimensions.height > leftDimensions.width) === targetIsPortrait
    const rightMatches = (rightDimensions.height > rightDimensions.width) === targetIsPortrait
    if (leftMatches !== rightMatches) return leftMatches ? -1 : 1
    if (left.hasAudio !== right.hasAudio) return left.hasAudio ? -1 : 1
    return right.duration - left.duration
  })
}

export function selectSegment(source: RenderSource, pace: EditingPace): PlannedSegment {
  const preferred = preferredDurations[pace]
  if (source.duration <= preferred + 0.25) {
    return { ...source, start: 0, segmentDuration: source.duration }
  }

  const edgeMargin = Math.min(source.duration * 0.08, 2)
  const usableDuration = Math.max(0.25, source.duration - edgeMargin * 2)
  const segmentDuration = Math.min(preferred, usableDuration)
  const start = edgeMargin + Math.max(0, (usableDuration - segmentDuration) / 2)
  return { ...source, start, segmentDuration }
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function resolveAspectRatio(aspectRatio: AspectRatio, firstSource: RenderSource): number {
  if (aspectRatio === '16:9') return 16 / 9
  if (aspectRatio === '9:16') return 9 / 16
  if (aspectRatio === '1:1') return 1
  if (aspectRatio === '4:5') return 4 / 5
  const dimensions = effectiveDimensions(firstSource)
  return dimensions.width / dimensions.height
}

function resolveFrameRate(value: OutputFrameRate, sources: RenderSource[]): number {
  if (value !== 'auto') return value
  const detected = sources.find((source) => source.video.frameRate > 0)?.video.frameRate ?? 30
  return [24, 30, 60].reduce((closest, candidate) =>
    Math.abs(candidate - detected) < Math.abs(closest - detected) ? candidate : closest
  )
}

export function getOutputSpec(
  settings: RenderSettings,
  sources: RenderSource[]
): OutputSpec {
  const firstSource = sources[0]
  if (!firstSource) throw new Error('Add at least one video before rendering.')
  const shortEdge = settings.resolution === '1080p' ? 1080 : 720
  const ratio = resolveAspectRatio(settings.aspectRatio, firstSource)
  const width = ratio >= 1 ? even(shortEdge * ratio) : shortEdge
  const height = ratio >= 1 ? shortEdge : even(shortEdge / ratio)
  return { width, height, frameRate: resolveFrameRate(settings.frameRate, sources) }
}

export function createRenderPlan(
  paths: string[],
  metadata: ProbedMedia[],
  settings: RenderSettings
): PlannedSegment[] {
  const sources = paths.map((path, index) => ({
    path,
    filename: basename(path),
    ...metadata[index]
  }))
  return arrangeSources(sources, settings.editingMode, settings.aspectRatio).map((source) =>
    selectSegment(source, settings.pace)
  )
}
