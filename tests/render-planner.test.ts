import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import {
  arrangeSources,
  createRenderPlan,
  getOutputSpec,
  selectSegment,
  type RenderSource
} from '../src/main/services/video/render-planner'

const source = (path: string, duration: number, width = 1920, height = 1080): RenderSource => ({
  path,
  filename: path,
  duration,
  hasAudio: true,
  video: { codec: 'h264', width, height, frameRate: 29.97, rotation: 0, bitrate: null }
})

describe('render planner', () => {
  it('selects a middle segment away from recording edges', () => {
    const segment = selectSegment(source('/long.mp4', 40), 'normal')
    expect(segment.segmentDuration).toBe(4.5)
    expect(segment.start).toBeGreaterThan(2)
    expect(segment.start + segment.segmentDuration).toBeLessThan(38)
  })

  it('keeps every short clip in the plan', () => {
    const metadata = [source('/one.mp4', 1), source('/two.mp4', 2)]
    const plan = createRenderPlan(
      metadata.map((item) => item.path),
      metadata.map(({ duration, hasAudio, video }) => ({ duration, hasAudio, video })),
      DEFAULT_RENDER_SETTINGS
    )
    expect(plan.map((item) => item.path)).toEqual(['/one.mp4', '/two.mp4'])
    expect(plan.map((item) => item.segmentDuration)).toEqual([1, 2])
  })

  it('prefers matching orientation in automatic arrangement', () => {
    const ordered = arrangeSources(
      [source('/landscape.mp4', 5), source('/portrait.mp4', 5, 1080, 1920)],
      'automatic',
      '9:16'
    )
    expect(ordered[0].path).toBe('/portrait.mp4')
  })

  it('resolves standard output dimensions and frame rate', () => {
    const spec = getOutputSpec(
      { ...DEFAULT_RENDER_SETTINGS, aspectRatio: '9:16', resolution: '720p', frameRate: 'auto' },
      [source('/portrait.mp4', 5, 1080, 1920)]
    )
    expect(spec).toEqual({ width: 720, height: 1280, frameRate: 30 })
  })
})
