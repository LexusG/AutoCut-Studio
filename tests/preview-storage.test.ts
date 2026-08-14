import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RENDER_SETTINGS, type PreviewVersion, type RenderArtifact } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { createDefaultProjectSettings } from '../src/shared/utils/project-settings'

const electronState = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() }
}))

import {
  deleteManagedPreview,
  getPreviewStorageStats,
  promotePreview,
  pruneManagedPreviews,
  resolvePreviewVersion
} from '../src/main/services/video/preview-storage'

let root = ''

function artifact(projectId: string, id: string, outputPath: string, thumbnailPath: string, logPath: string): RenderArtifact {
  const plan = buildRenderPlan(
    projectId,
    0,
    ['/source.mp4'],
    [{ duration: 8, hasAudio: true, video: { codec: 'h264', width: 640, height: 360, frameRate: 30, rotation: 0, bitrate: null } }],
    `fingerprint-${id}`,
    DEFAULT_RENDER_SETTINGS
  )
  plan.id = id
  return {
    kind: 'preview', outputPath, outputUrl: '', duration: 4, width: 640, height: 360,
    frameRate: 30, fileSize: 1024, hasAudio: true, clipCount: 1, plan,
    previewQuality: 'fast', reusedPreview: false, logPath, thumbnailPath, thumbnailUrl: '',
    finalLoudness: null
  }
}

function version(projectId: string, id: string, artifactValue: RenderArtifact, index = 1): PreviewVersion {
  return {
    id, versionNumber: index, createdAt: new Date(2026, 0, index).toISOString(), artifact: artifactValue,
    thumbnailPath: artifactValue.thumbnailPath, thumbnailUrl: artifactValue.thumbnailUrl,
    approved: false, outdated: false, pinned: false,
    storage: { key: id, relativePath: `projects/${projectId}/previews/${id}`, state: 'available' },
    presetName: 'Custom', pace: 'normal', selectionMode: 'smart', targetDuration: null,
    settingsSnapshot: createDefaultProjectSettings()
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-storage-test-'))
  electronState.userData = join(root, 'user-data')
})

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(root, { recursive: true, force: true })
})

describe('persistent preview storage', () => {
  it('promotes all review artifacts, reports usage, and deletes only the managed preview', async () => {
    const source = join(root, 'source.mp4')
    const tempVideo = join(root, 'preview.mp4')
    const tempThumb = join(root, 'thumbnail.jpg')
    const tempLog = join(root, 'render.log')
    await Promise.all([
      writeFile(source, 'source'),
      writeFile(tempVideo, 'preview-video'),
      writeFile(tempThumb, 'thumbnail'),
      writeFile(tempLog, 'render-log')
    ])
    const promoted = await promotePreview('project-a', 'preview-a', artifact('project-a', 'preview-a', tempVideo, tempThumb, tempLog))
    expect(promoted.outputPath).toContain(join('storage', 'projects', 'project-a', 'previews', 'preview-a'))
    expect(await readFile(promoted.outputPath, 'utf8')).toBe('preview-video')
    expect(await readFile(promoted.thumbnailPath, 'utf8')).toBe('thumbnail')
    expect(JSON.parse(await readFile(join(promoted.outputPath, '..', 'metadata.json'), 'utf8'))).toMatchObject({
      previewId: 'preview-a', projectId: 'project-a', storageState: 'available'
    })
    expect(await getPreviewStorageStats()).toMatchObject({ previewCount: 1 })
    await deleteManagedPreview('project-a', 'preview-a')
    await expect(stat(promoted.outputPath)).rejects.toThrow()
    expect(await readFile(source, 'utf8')).toBe('source')
  })

  it('migrates an existing legacy temp preview and marks absent legacy media missing', async () => {
    const tempVideo = join(root, 'legacy.mp4')
    const tempThumb = join(root, 'legacy.jpg')
    const tempLog = join(root, 'legacy.log')
    await Promise.all([writeFile(tempVideo, 'video'), writeFile(tempThumb, 'thumb'), writeFile(tempLog, 'log')])
    const legacyArtifact = artifact('legacy-project', 'legacy-preview', tempVideo, tempThumb, tempLog)
    const legacy = {
      ...version('legacy-project', 'legacy-preview', legacyArtifact),
      storage: { key: 'legacy-preview', relativePath: '', state: 'migrating' as const }
    }
    const migrated = await resolvePreviewVersion('legacy-project', legacy)
    expect(migrated.storage.state).toBe('available')
    expect(await readFile(migrated.artifact.outputPath, 'utf8')).toBe('video')

    const missingArtifact = artifact('legacy-project', 'missing-preview', join(root, 'absent.mp4'), '', '')
    const missing = await resolvePreviewVersion('legacy-project', {
      ...version('legacy-project', 'missing-preview', missingArtifact),
      storage: { key: 'missing-preview', relativePath: '', state: 'migrating' }
    })
    expect(missing.storage.state).toBe('missing')
    expect(missing.artifact.outputUrl).toBe('')
  })

  it('retains pinned and active previews while pruning the oldest unprotected version', async () => {
    const versions: PreviewVersion[] = []
    for (let index = 1; index <= 11; index += 1) {
      const id = `preview-${index}`
      const video = join(root, `${id}.mp4`)
      await writeFile(video, id)
      const promoted = await promotePreview('retention-project', id, artifact('retention-project', id, video, '', ''))
      versions.push({
        ...version('retention-project', id, promoted, index),
        pinned: index === 1
      })
    }
    const removed = await pruneManagedPreviews('retention-project', versions, ['preview-2'], 10)
    expect(removed).toEqual(['preview-3'])
    await stat(versions[0].artifact.outputPath)
    await stat(versions[1].artifact.outputPath)
    await expect(stat(versions[2].artifact.outputPath)).rejects.toThrow()
  })
})

