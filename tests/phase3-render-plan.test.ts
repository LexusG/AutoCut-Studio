import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'

const metadata = (duration: number, hasAudio = true) => ({
  duration,
  hasAudio,
  video: { codec: 'h264', width: 1920, height: 1080, frameRate: 30, rotation: 0, bitrate: null }
})

describe('Phase 3 render plans', () => {
  it('freezes bounded source sections and includes every clip', () => {
    const plan = buildRenderPlan(
      'project-1',
      0,
      ['/one.mp4', '/two.mp4', '/three.mp4'],
      [metadata(30), metadata(2, false), metadata(12)],
      'fingerprint-1',
      { ...DEFAULT_RENDER_SETTINGS, targetDuration: 15 }
    )
    expect(plan.segments).toHaveLength(3)
    expect(plan.expectedDuration).toBeCloseTo(15, 2)
    for (const segment of plan.segments) {
      expect(segment.start).toBeGreaterThanOrEqual(0)
      expect(segment.duration).toBeGreaterThan(0)
      expect(segment.end).toBeLessThanOrEqual(segment.sourceDuration)
      expect(segment.end).toBeCloseTo(segment.start + segment.duration, 2)
    }
  })

  it('keeps composition stable while regeneration changes valid start positions', () => {
    const args = [
      'project-1',
      ['/one.mp4', '/two.mp4'],
      [metadata(40), metadata(40)],
      'fingerprint-1',
      { ...DEFAULT_RENDER_SETTINGS, targetDuration: 12 }
    ] as const
    const first = buildRenderPlan(args[0], 0, args[1], args[2], args[3], args[4])
    const regenerated = buildRenderPlan(args[0], 1, args[1], args[2], args[3], args[4])
    expect(regenerated.segments.map((segment) => segment.duration)).toEqual(
      first.segments.map((segment) => segment.duration)
    )
    expect(regenerated.segments.map((segment) => segment.start)).not.toEqual(
      first.segments.map((segment) => segment.start)
    )
    expect(regenerated.expectedDuration).toBe(first.expectedDuration)
  })

  it('uses manually modified output dimensions and FPS', () => {
    const plan = buildRenderPlan(
      'project-1',
      0,
      ['/portrait.mp4'],
      [metadata(8)],
      'fingerprint-1',
      {
        ...DEFAULT_RENDER_SETTINGS,
        outputWidth: 1080,
        outputHeight: 1350,
        aspectRatio: '4:5',
        frameRate: 60
      }
    )
    expect(plan.output).toMatchObject({ width: 1080, height: 1350, frameRate: 60, aspectRatio: '4:5' })
  })
})
