import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() }
}))

import { cloneProjectIdentity } from '../src/main/services/projects/project-clone'
import type { ProjectFile, RenderPlan } from '../src/shared/types'
import { createDefaultProjectSettings, createProjectFile } from '../src/shared/utils/project-settings'

let root = ''
const ORIGINAL_ID = 'original-project'

function managedDir(projectId: string): string {
  return join(electronState.userData, 'storage', 'projects', projectId)
}

function plan(projectId: string): RenderPlan {
  return { id: 'plan-1', projectId, segments: [], version: 4 } as unknown as RenderPlan
}

function project(): ProjectFile {
  const base = createProjectFile(createDefaultProjectSettings(), ['/clips/a.mp4'], {
    id: ORIGINAL_ID,
    createdAt: '2026-01-01T00:00:00.000Z'
  })
  return {
    ...base,
    editPlan: plan(ORIGINAL_ID),
    transcriptReferences: [
      { sourceClipId: 'clip-a', relativePath: `projects/${ORIGINAL_ID}/transcripts/clip-a.json` }
    ] as ProjectFile['transcriptReferences'],
    previewHistory: [
      {
        id: 'preview-1',
        versionNumber: 1,
        storage: { key: 'preview-1', relativePath: `projects/${ORIGINAL_ID}/previews/preview-1`, state: 'available' },
        artifact: { plan: plan(ORIGINAL_ID) }
      }
    ] as unknown as ProjectFile['previewHistory'],
    outputVariants: [
      {
        id: 'variant-1',
        name: 'Reel',
        renderPlan: plan(ORIGINAL_ID),
        previewHistory: [
          {
            id: 'preview-2',
            versionNumber: 1,
            storage: { key: 'preview-2', relativePath: `projects/${ORIGINAL_ID}/previews/preview-2`, state: 'available' },
            artifact: { plan: plan(ORIGINAL_ID) }
          }
        ]
      }
    ] as unknown as ProjectFile['outputVariants'],
    snapshotRefs: [
      { id: 'snap-1', name: 'Old', reason: 'manual', automatic: false, createdAt: '2026-01-01T00:00:00.000Z', projectRevision: 1, bytes: 10 }
    ]
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-clone-test-'))
  electronState.userData = join(root, 'user-data')
  await mkdir(join(managedDir(ORIGINAL_ID), 'transcripts'), { recursive: true })
  await writeFile(join(managedDir(ORIGINAL_ID), 'transcripts', 'clip-a.json'), '{"words":[]}', 'utf8')
  await mkdir(join(managedDir(ORIGINAL_ID), 'snapshots'), { recursive: true })
  await writeFile(join(managedDir(ORIGINAL_ID), 'snapshots', 'snap-1.json'), '{}', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('Save As project cloning', () => {
  it('gives the copy a new identity and copies its managed data', async () => {
    const clone = await cloneProjectIdentity(project())
    expect(clone.id).not.toBe(ORIGINAL_ID)
    expect(await readdir(join(managedDir(clone.id), 'transcripts'))).toEqual(['clip-a.json'])
    // The original is untouched.
    expect(await readdir(join(managedDir(ORIGINAL_ID), 'transcripts'))).toEqual(['clip-a.json'])
  })

  it('rekeys every embedded project id, not just the top-level one', async () => {
    const clone = await cloneProjectIdentity(project())
    // The preview pipeline rejects a plan whose projectId does not match the project
    // being rendered, so a copy that kept these could never generate a preview.
    expect(clone.editPlan?.projectId).toBe(clone.id)
    expect(clone.outputVariants[0].renderPlan?.projectId).toBe(clone.id)
    expect(clone.previewHistory[0].artifact.plan.projectId).toBe(clone.id)
    expect(clone.outputVariants[0].previewHistory[0].artifact.plan.projectId).toBe(clone.id)
  })

  it('rekeys managed storage paths including those inside variants', async () => {
    const clone = await cloneProjectIdentity(project())
    expect(clone.transcriptReferences[0].relativePath).toBe(`projects/${clone.id}/transcripts/clip-a.json`)
    expect(clone.previewHistory[0].storage.relativePath).toBe(`projects/${clone.id}/previews/preview-1`)
    expect(clone.outputVariants[0].previewHistory[0].storage.relativePath).toBe(
      `projects/${clone.id}/previews/preview-2`
    )
  })

  it('does not carry the original project’s history into the copy', async () => {
    const clone = await cloneProjectIdentity(project())
    // Restoring a copied snapshot would switch the copy back to the original identity.
    expect(clone.snapshotRefs).toEqual([])
    await expect(readdir(join(managedDir(clone.id), 'snapshots'))).rejects.toThrow()
  })

  it('rekeys the project id stamped inside copied sidecar bodies', async () => {
    // The transcript and semantic loaders reject a body whose embedded project id does
    // not match the project asking for it, so a verbatim copy comes back empty.
    await mkdir(join(managedDir(ORIGINAL_ID), 'semantic'), { recursive: true })
    await writeFile(
      join(managedDir(ORIGINAL_ID), 'semantic', 'analysis.json'),
      JSON.stringify({ projectId: ORIGINAL_ID, chunks: [], topics: [] }),
      'utf8'
    )
    await writeFile(
      join(managedDir(ORIGINAL_ID), 'transcripts', 'clip-a.json'),
      JSON.stringify({ version: 1, projectId: ORIGINAL_ID, sourceClipId: 'clip-a', words: [] }),
      'utf8'
    )
    await mkdir(join(managedDir(ORIGINAL_ID), 'previews', 'preview-1'), { recursive: true })
    await writeFile(
      join(managedDir(ORIGINAL_ID), 'previews', 'preview-1', 'metadata.json'),
      JSON.stringify({ schemaVersion: 1, previewId: 'preview-1', projectId: ORIGINAL_ID }),
      'utf8'
    )

    const clone = await cloneProjectIdentity(project())

    const transcript = JSON.parse(
      await readFile(join(managedDir(clone.id), 'transcripts', 'clip-a.json'), 'utf8')
    ) as { projectId: string }
    const analysis = JSON.parse(
      await readFile(join(managedDir(clone.id), 'semantic', 'analysis.json'), 'utf8')
    ) as { projectId: string }
    const metadata = JSON.parse(
      await readFile(join(managedDir(clone.id), 'previews', 'preview-1', 'metadata.json'), 'utf8')
    ) as { projectId: string }

    expect(transcript.projectId).toBe(clone.id)
    expect(analysis.projectId).toBe(clone.id)
    expect(metadata.projectId).toBe(clone.id)

    // The original's bodies are untouched.
    const originalTranscript = JSON.parse(
      await readFile(join(managedDir(ORIGINAL_ID), 'transcripts', 'clip-a.json'), 'utf8')
    ) as { projectId: string }
    expect(originalTranscript.projectId).toBe(ORIGINAL_ID)
  })

  it('leaves embedding records alone, since they carry no project identity', async () => {
    await mkdir(join(managedDir(ORIGINAL_ID), 'semantic', 'embeddings'), { recursive: true })
    const record = JSON.stringify({ id: 'e1', contentHash: 'abc', vector: [0.1] })
    await writeFile(join(managedDir(ORIGINAL_ID), 'semantic', 'embeddings', 'abc.json'), record, 'utf8')
    const clone = await cloneProjectIdentity(project())
    expect(await readFile(join(managedDir(clone.id), 'semantic', 'embeddings', 'abc.json'), 'utf8')).toBe(record)
  })

  it('clones a project that has never written managed data', async () => {
    await rm(managedDir(ORIGINAL_ID), { recursive: true, force: true })
    const clone = await cloneProjectIdentity(project())
    expect(clone.id).not.toBe(ORIGINAL_ID)
  })

  it('fails loudly rather than producing a copy with missing sidecar data', async () => {
    // A destination that cannot be written must not be reported as a successful copy.
    const blocker = managedDir('blocked-destination')
    await mkdir(join(root, 'user-data', 'storage', 'projects'), { recursive: true })
    await writeFile(blocker, 'not a directory', 'utf8')
    const originalRandom = crypto.randomUUID
    ;(crypto as { randomUUID: () => string }).randomUUID = () => 'blocked-destination'
    try {
      await expect(cloneProjectIdentity(project())).rejects.toThrow()
    } finally {
      ;(crypto as { randomUUID: typeof originalRandom }).randomUUID = originalRandom
    }
  })
})
