import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS, type RenderSoundtrackTrack } from '../src/shared/types'
import { accurateLoudnessFilter, fastLoudnessFilter, parseLoudnessMeasurements } from '../src/main/services/video/loudness-normalizer'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { videoFilterGraph } from '../src/main/services/video/render-executor'
import { generateCandidateWindows } from '../src/main/services/video/smart/candidate-generator'
import { analysisReasons, scoreCandidate, type RawCandidateMetrics } from '../src/main/services/video/smart/scoring'
import { buildSoundtrackCommand } from '../src/main/services/video/soundtrack-processor'

const metadata = (duration: number, width = 1920, height = 1080, hasAudio = true) => ({
  duration,
  hasAudio,
  video: { codec: 'h264', width, height, frameRate: 30, rotation: 0, bitrate: null }
})

const strongMetrics: RawCandidateMetrics = {
  sharpness: 0.9,
  exposure: 0.85,
  motion: 0.7,
  stability: 0.9,
  audioActivity: 0.65,
  personPresence: 0,
  sceneQuality: 0.75,
  blackFramePenalty: 0,
  duplicatePenalty: 0
}

function track(id: string, patch: Partial<RenderSoundtrackTrack> = {}): RenderSoundtrackTrack {
  return {
    id,
    filename: `${id}.wav`,
    path: `/music/${id}.wav`,
    duration: 10,
    missing: false,
    enabled: true,
    volume: 80,
    startPosition: 0,
    fadeIn: { enabled: false, duration: 1 },
    fadeOut: { enabled: false, duration: 1 },
    ...patch
  }
}

describe('Phase 4 Smart Selection', () => {
  it('generates multiple bounded candidates according to analysis quality', () => {
    expect(generateCandidateWindows(40, 5, 'fast')).toHaveLength(3)
    expect(generateCandidateWindows(40, 5, 'balanced')).toHaveLength(5)
    const detailed = generateCandidateWindows(40, 5, 'detailed')
    expect(detailed).toHaveLength(8)
    for (const candidate of detailed) {
      expect(candidate.start).toBeGreaterThanOrEqual(0)
      expect(candidate.end).toBeLessThanOrEqual(40)
      expect(candidate.end - candidate.start).toBeCloseTo(5, 3)
    }
  })

  it('penalizes black footage and rewards sharp footage', () => {
    const preferences = DEFAULT_RENDER_SETTINGS.smartPreferences
    const strong = scoreCandidate(strongMetrics, preferences)
    const black = scoreCandidate({ ...strongMetrics, exposure: 0.05, blackFramePenalty: 1 }, preferences)
    const blurred = scoreCandidate({ ...strongMetrics, sharpness: 0.05 }, preferences)
    expect(strong.total).toBeGreaterThan(black.total)
    expect(strong.total).toBeGreaterThan(blurred.total)
    expect(analysisReasons(black)).toContain('Dark frames reduced score')
  })

  it('persists Smart seed while target duration and Use Every Clip remain enforced', () => {
    const settings = {
      ...DEFAULT_RENDER_SETTINGS,
      selectionMode: 'smart' as const,
      selectionSeed: 42,
      targetDuration: 18,
      pace: 'fast' as const
    }
    const paths = ['/one.mp4', '/two.mp4', '/three.mp4', '/four.mp4', '/five.mp4']
    const plan = buildRenderPlan('project-4', 2, paths, paths.map(() => metadata(20)), 'phase4-hash', settings)
    expect(plan.selectionMode).toBe('smart')
    expect(plan.selectionSeed).toBe(44)
    expect(plan.segments).toHaveLength(5)
    expect(plan.expectedDuration).toBeCloseTo(18, 2)
    expect(plan.segments.every((segment) => segment.duration <= 4)).toBe(true)
  })
})

describe('Phase 4 render filters', () => {
  it('builds a moving blurred fill behind an aspect-preserving foreground', () => {
    const plan = buildRenderPlan(
      'project-4', 0, ['/landscape.mp4'], [metadata(8)], 'phase4-hash',
      { ...DEFAULT_RENDER_SETTINGS, outputWidth: 1080, outputHeight: 1920, aspectRatio: '9:16', fitMode: 'fit', fitBackground: 'blurred' }
    )
    const graph = videoFilterGraph(plan, { width: 1080, height: 1920 })
    expect(graph).toContain('split=2[backgroundsource][foregroundsource]')
    expect(graph).toContain('force_original_aspect_ratio=increase')
    expect(graph).toContain('boxblur=luma_radius=24')
    expect(graph).toContain('force_original_aspect_ratio=decrease')
    expect(graph).toContain('overlay=(W-w)/2:(H-h)/2')
  })

  it('retains black Fit as the compatibility path', () => {
    const plan = buildRenderPlan(
      'project-4', 0, ['/portrait.mp4'], [metadata(8, 1080, 1920)], 'phase4-hash',
      { ...DEFAULT_RENDER_SETTINGS, fitMode: 'fit', fitBackground: 'black' }
    )
    expect(videoFilterGraph(plan, { width: 1920, height: 1080 })).toContain('pad=1920:1080')
    expect(videoFilterGraph(plan, { width: 1920, height: 1080 })).not.toContain('boxblur=')
  })

  it('caps blur radius for tiny custom output dimensions', () => {
    const plan = buildRenderPlan(
      'project-4', 0, ['/square.mp4'], [metadata(8, 100, 100)], 'phase4-hash',
      { ...DEFAULT_RENDER_SETTINGS, outputWidth: 10, outputHeight: 10, fitMode: 'fit', fitBackground: 'blurred', blurStrength: 'high' }
    )
    expect(videoFilterGraph(plan, { width: 10, height: 10 })).toContain('boxblur=luma_radius=4')
  })
})

describe('Phase 4 soundtrack and normalization', () => {
  it('plans enabled soundtrack tracks in order with offsets, volume, fades, and crossfades', () => {
    const tracks = [
      track('first', { startPosition: 2, volume: 35, fadeIn: { enabled: true, duration: 0.5 } }),
      track('disabled', { enabled: false }),
      track('third', { volume: 70, fadeOut: { enabled: true, duration: 1 } })
    ]
    const command = buildSoundtrackCommand({
      ...DEFAULT_RENDER_SETTINGS.audio,
      soundtrackEnabled: true,
      soundtrackTracks: tracks,
      soundtrackCrossfade: 1.5
    }, '/tmp/soundtrack.m4a')
    expect(command?.tracks.map((item) => item.id)).toEqual(['first', 'third'])
    const args = command?.args.join(' ') ?? ''
    expect(args).toContain('-ss 2.000 -i /music/first.wav')
    expect(args).toContain('volume=0.350')
    expect(args).toContain('afade=t=in:st=0:d=0.500')
    expect(args).toContain('volume=0.700')
    expect(args).toContain('acrossfade=d=1.500')
    expect(args).not.toContain('/music/disabled.wav')
  })

  it('returns no soundtrack for disabled or empty playlists', () => {
    expect(buildSoundtrackCommand({ ...DEFAULT_RENDER_SETTINGS.audio, soundtrackEnabled: false }, '/tmp/out.m4a')).toBeNull()
    expect(buildSoundtrackCommand({ ...DEFAULT_RENDER_SETTINGS.audio, soundtrackTracks: [] }, '/tmp/out.m4a')).toBeNull()
  })

  it('parses first-pass measurements into an accurate second-pass filter', () => {
    const measurements = parseLoudnessMeasurements(`noise\n{
      "input_i": "-28.40", "input_tp": "-5.10", "input_lra": "2.30",
      "input_thresh": "-38.80", "target_offset": "0.20"
    }\nmore noise`)
    expect(measurements).toEqual({ inputI: -28.4, inputLra: 2.3, inputTp: -5.1, inputThresh: -38.8, targetOffset: 0.2 })
    const filter = accurateLoudnessFilter(measurements)
    expect(filter).toContain('measured_I=-28.4')
    expect(filter).toContain('measured_TP=-5.1')
    expect(filter).toContain('TP=-1.5')
    expect(fastLoudnessFilter()).toBe('loudnorm=I=-16:LRA=11:TP=-1.5:linear=true')
  })

  it('rejects malformed accurate-normalization output', () => {
    expect(() => parseLoudnessMeasurements('not json')).toThrow(/structured loudness measurements/)
  })
})
