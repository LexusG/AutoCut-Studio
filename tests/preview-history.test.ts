import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderArtifact } from '../src/shared/types'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { createDefaultProjectSettings } from '../src/shared/utils/project-settings'
import { useAppStore } from '../src/renderer/stores/app-store'

function artifact(generation: number): RenderArtifact {
  const plan = buildRenderPlan(
    'history-project',
    generation,
    ['/clip.mp4'],
    [{ duration: 10, hasAudio: true, video: { codec: 'h264', width: 640, height: 360, frameRate: 30, rotation: 0, bitrate: null } }],
    `fingerprint-${generation}`,
    DEFAULT_RENDER_SETTINGS
  )
  return {
    kind: 'preview',
    outputPath: `/tmp/autocut-studio/history/v${generation + 1}/preview.mp4`,
    outputUrl: `autocut-media://history-v${generation + 1}`,
    duration: 4.5,
    width: 640,
    height: 360,
    frameRate: 30,
    fileSize: 10_000,
    hasAudio: true,
    clipCount: 1,
    plan,
    previewQuality: 'fast',
    reusedPreview: false,
    logPath: `/tmp/autocut-studio/history/v${generation + 1}/render.log`,
    thumbnailPath: `/tmp/autocut-studio/history/v${generation + 1}/thumbnail.jpg`,
    thumbnailUrl: `autocut-media://history-v${generation + 1}-thumb`
  }
}

describe('Preview History state', () => {
  beforeEach(() => {
    useAppStore.setState({
      projectSettings: createDefaultProjectSettings(),
      previewResult: null,
      previewHistory: [],
      selectedPreviewId: null,
      previewOutdated: false,
      exportResult: null
    })
  })

  it('creates ordered versions, preserves playable artifacts, and marks prior settings outdated', () => {
    useAppStore.getState().completePreview(artifact(0))
    useAppStore.getState().completePreview(artifact(1))
    useAppStore.getState().completePreview(artifact(2))
    const state = useAppStore.getState()
    expect(state.previewHistory.map((version) => version.versionNumber)).toEqual([3, 2, 1])
    expect(state.previewHistory[0]).toMatchObject({ outdated: false, approved: false })
    expect(state.previewHistory.slice(1).every((version) => version.outdated)).toBe(true)
    expect(state.previewHistory.every((version) => version.artifact.outputUrl.startsWith('autocut-media:'))).toBe(true)
  })

  it('marks the selected version approved and removes only the requested metadata', () => {
    useAppStore.getState().completePreview(artifact(0))
    useAppStore.getState().completePreview(artifact(1))
    const current = useAppStore.getState().previewResult!
    useAppStore.getState().completeExport({ ...current, kind: 'export', outputPath: '/exports/final.mp4' })
    expect(useAppStore.getState().previewHistory[0].approved).toBe(true)
    const oldId = useAppStore.getState().previewHistory[1].id
    useAppStore.getState().removePreviewVersion(oldId)
    expect(useAppStore.getState().previewHistory).toHaveLength(1)
    expect(useAppStore.getState().previewHistory[0].approved).toBe(true)
  })
})
