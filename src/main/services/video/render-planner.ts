import { randomInt, randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type {
  AspectRatio,
  EditingMode,
  EditingPace,
  OutputFrameRate,
  RenderPlan,
  RenderSettings
} from '@shared/types'
import type { ProbedMedia } from './metadata'
import { allocateSegmentDurations, getPaceRange } from './segment-allocator'

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

interface UsableSource extends RenderSource {
  usableStart: number
  usableDuration: number
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

function deterministicShuffle<T>(items: T[], generation: number): T[] {
  return [...items]
    .map((item, index) => ({ item, key: ((index + 1) * 2654435761 + generation * 1013904223) >>> 0 }))
    .sort((left, right) => left.key - right.key)
    .map(({ item }) => item)
}

export function arrangeSources(
  sources: RenderSource[],
  mode: EditingMode,
  aspectRatio: AspectRatio,
  generation?: number
): RenderSource[] {
  if (mode === 'random') {
    return generation == null ? shuffle(sources) : deterministicShuffle(sources, generation)
  }
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

function usableSource(source: RenderSource): UsableSource {
  if (source.duration <= 2) return { ...source, usableStart: 0, usableDuration: source.duration }
  const edgeMargin = Math.min(source.duration * 0.08, 2)
  return {
    ...source,
    usableStart: edgeMargin,
    usableDuration: Math.max(0.05, source.duration - edgeMargin * 2)
  }
}

export function selectSegment(source: RenderSource, pace: EditingPace): PlannedSegment {
  const usable = usableSource(source)
  const segmentDuration = Math.min(getPaceRange(pace).preferred, usable.usableDuration)
  const start = usable.usableStart + Math.max(0, (usable.usableDuration - segmentDuration) / 2)
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

export function getOutputSpec(settings: RenderSettings, sources: RenderSource[]): OutputSpec {
  const firstSource = sources[0]
  if (!firstSource) throw new Error('Add at least one video before rendering.')
  if (settings.outputWidth > 0 && settings.outputHeight > 0) {
    return {
      width: even(settings.outputWidth),
      height: even(settings.outputHeight),
      frameRate: resolveFrameRate(settings.frameRate, sources)
    }
  }
  const shortEdge = settings.resolution === '1080p' ? 1080 : 720
  const ratio = resolveAspectRatio(settings.aspectRatio, firstSource)
  const width = ratio >= 1 ? even(shortEdge * ratio) : shortEdge
  const height = ratio >= 1 ? shortEdge : even(shortEdge / ratio)
  return { width, height, frameRate: resolveFrameRate(settings.frameRate, sources) }
}

function variationPosition(generation: number, index: number): number {
  if (generation <= 0) return 0.5
  return 0.1 + ((((generation + 1) * 37 + (index + 1) * 53) % 81) / 100)
}

export function buildRenderPlan(
  projectId: string,
  generation: number,
  paths: string[],
  metadata: ProbedMedia[],
  settingsFingerprint: string,
  settings: RenderSettings
): RenderPlan {
  if (paths.length !== metadata.length) throw new Error('Source metadata is incomplete.')
  const sources = paths.map((path, index) => ({ path, filename: basename(path), ...metadata[index] }))
  const arranged = arrangeSources(sources, settings.editingMode, settings.aspectRatio, generation)
    .map(usableSource)
  const allocation = allocateSegmentDurations(
    arranged,
    settings.pace,
    settings.targetDuration,
    settings.useEveryClip,
    settings.transitionPreference,
    settings.transitionDuration
  )
  const included = allocation.includedIndices.map((index) => arranged[index])
  const output = getOutputSpec(settings, included)

  const segments = included.map((source, index) => {
    const duration = allocation.durations[index]
    const freeSpace = Math.max(0, source.usableDuration - duration)
    const start = Math.min(
      Math.max(0, source.usableStart + freeSpace * variationPosition(generation, index)),
      Math.max(0, source.duration - duration)
    )
    const transitionDuration = allocation.transitionDurations[index]
    return {
      id: `segment-${(index + 1).toString().padStart(3, '0')}`,
      sourcePath: source.path,
      filename: source.filename,
      sourceDuration: source.duration,
      start: Math.round(start * 1000) / 1000,
      duration,
      end: Math.round((start + duration) * 1000) / 1000,
      hasAudio: source.hasAudio,
      sourceWidth: source.video.width,
      sourceHeight: source.video.height,
      sourceFrameRate: source.video.frameRate,
      sourceRotation: source.video.rotation,
      selectedCandidate: null,
      transitionToNext: transitionDuration == null
        ? null
        : { type: settings.transitionPreference, duration: transitionDuration }
    }
  })

  return {
    version: 1,
    id: randomUUID(),
    projectId,
    generation,
    createdAt: new Date().toISOString(),
    settingsFingerprint,
    segments,
    output: {
      width: output.width,
      height: output.height,
      frameRate: output.frameRate,
      aspectRatio: settings.aspectRatio,
      fitMode: settings.fitMode,
      quality: settings.quality
    },
    pace: settings.pace,
    useEveryClip: settings.useEveryClip,
    requestedDuration: settings.targetDuration,
    expectedDuration: allocation.expectedDuration,
    audio: structuredClone(settings.audio),
    warnings: allocation.warnings,
    selectionMode: settings.selectionMode,
    selectionSeed: settings.selectionSeed + generation,
    analysisVersion: null,
    fitBackground: settings.fitBackground,
    blurStrength: settings.blurStrength,
    previewVersion: generation + 1
  }
}

// Phase 2 compatibility helper used by existing tests and integrations.
export function createRenderPlan(
  paths: string[],
  metadata: ProbedMedia[],
  settings: RenderSettings
): PlannedSegment[] {
  const sources = paths.map((path, index) => ({ path, filename: basename(path), ...metadata[index] }))
  return arrangeSources(sources, settings.editingMode, settings.aspectRatio).map((source) =>
    selectSegment(source, settings.pace)
  )
}
