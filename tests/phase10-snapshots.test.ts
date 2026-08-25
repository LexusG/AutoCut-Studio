import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() }
}))

import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  MAX_AUTOMATIC_SNAPSHOTS,
  readSnapshot,
  renameSnapshot,
  summarizeSnapshotDiff
} from '../src/main/services/projects/project-snapshot-manager'
import type { ProjectFile } from '../src/shared/types'
import { createDefaultProjectSettings, createProjectFile } from '../src/shared/utils/project-settings'

let root = ''

function project(id = 'snapshot-project', sources = ['/clips/a.mp4']): ProjectFile {
  const settings = createDefaultProjectSettings()
  settings.name = 'Snapshot Project'
  return createProjectFile(settings, sources, { id, createdAt: '2026-01-01T00:00:00.000Z' })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-snapshot-test-'))
  electronState.userData = join(root, 'user-data')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('project snapshots', () => {
  it('creates a restorable snapshot and lists it', async () => {
    const source = project()
    source.settings.editing.pace = 'fast'
    const ref = await createSnapshot(source, { reason: 'manual', name: 'Before big change' })

    expect(ref.name).toBe('Before big change')
    expect(ref.automatic).toBe(false)
    expect(ref.bytes).toBeGreaterThan(0)

    const listed = await listSnapshots(source.id)
    expect(listed.map((item) => item.id)).toEqual([ref.id])

    const restored = await readSnapshot(source.id, ref.id)
    expect(restored.settings.editing.pace).toBe('fast')
    expect(restored.id).toBe(source.id)
  })

  it('names an automatic snapshot after the operation that triggered it', async () => {
    const ref = await createSnapshot(project(), { reason: 'before-replace-media' })
    expect(ref.automatic).toBe(true)
    expect(ref.name).toBe('Before replacing media')
  })

  it('does not duplicate source media into the snapshot body', async () => {
    const source = project('snapshot-media', ['/clips/a.mp4', '/clips/b.mp4'])
    const ref = await createSnapshot(source, { reason: 'manual' })
    const restored = await readSnapshot(source.id, ref.id)
    // Paths are referenced, never copied.
    expect(restored.sourcePaths).toEqual(['/clips/a.mp4', '/clips/b.mp4'])
    expect(ref.bytes).toBeLessThan(200_000)
  })

  it('prunes automatic snapshots past the cap but keeps every manual one', async () => {
    const source = project('snapshot-prune')
    const manual = await createSnapshot(source, { reason: 'manual', name: 'Keep me' })
    for (let index = 0; index < MAX_AUTOMATIC_SNAPSHOTS + 4; index += 1) {
      await createSnapshot(source, { reason: 'before-replan' })
    }

    const listed = await listSnapshots(source.id)
    expect(listed.filter((item) => item.automatic)).toHaveLength(MAX_AUTOMATIC_SNAPSHOTS)
    expect(listed.some((item) => item.id === manual.id)).toBe(true)

    // Pruned bodies are removed from disk too, not just from the index.
    const directory = join(electronState.userData, 'storage', 'projects', source.id, 'snapshots')
    const files = (await readdir(directory)).filter((name) => name !== 'index.json')
    expect(files).toHaveLength(listed.length)
  })

  it('renames and deletes snapshots', async () => {
    const source = project('snapshot-edit')
    const ref = await createSnapshot(source, { reason: 'manual', name: 'Original' })
    expect((await renameSnapshot(source.id, ref.id, 'Renamed'))[0].name).toBe('Renamed')
    expect(await deleteSnapshot(source.id, ref.id)).toEqual([])
    expect(await listSnapshots(source.id)).toEqual([])
  })

  it('refuses an empty snapshot name', async () => {
    const source = project('snapshot-name')
    const ref = await createSnapshot(source, { reason: 'manual' })
    await expect(renameSnapshot(source.id, ref.id, '   ')).rejects.toThrow(/name is required/i)
  })

  it('rejects a project identifier that would escape managed storage', async () => {
    await expect(createSnapshot(project('../escape'), { reason: 'manual' })).rejects.toThrow(/invalid/i)
  })

  it('summarizes what restoring a snapshot would change', async () => {
    const before = project('snapshot-diff', ['/clips/a.mp4'])
    const after = project('snapshot-diff', ['/clips/a.mp4', '/clips/b.mp4'])
    after.settings.name = 'Renamed Project'
    after.speakerLabels = [{ clipId: 'a', speakerId: 's1', label: 'Amara' }] as ProjectFile['speakerLabels']

    const diffs = summarizeSnapshotDiff(before, after)
    const text = diffs.map((diff) => diff.summary).join('\n')
    expect(text).toMatch(/Clips: 1 → 2/)
    expect(text).toMatch(/Renamed Project/)
    expect(text).toMatch(/Speaker labels: 0 → 1/)
  })

  it('reports no differences between a project and itself', async () => {
    const source = project('snapshot-same')
    expect(summarizeSnapshotDiff(source, source)).toEqual([{ field: 'none', summary: 'No tracked differences.' }])
  })

  it('returns an empty list for a project with no snapshots', async () => {
    expect(await listSnapshots('never-snapshotted')).toEqual([])
  })
})
