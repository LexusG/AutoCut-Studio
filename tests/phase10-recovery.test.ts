import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
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
  discardRecovery,
  inspectRecoveryState,
  listRecoveryCandidates,
  readRecoveredProject,
  writeRecoveryJournal
} from '../src/main/services/recovery/recovery-manager'
import { beginSession, clearSessionMarker, endSession } from '../src/main/services/recovery/session-marker'
import { serializeProjectFile } from '../src/shared/utils/project-codec'
import { createDefaultProjectSettings, createProjectFile } from '../src/shared/utils/project-settings'

let root = ''

function project(id: string, name = 'Recovery Project') {
  const settings = createDefaultProjectSettings()
  settings.name = name
  return createProjectFile(settings, ['/clips/a.mp4'], { id, createdAt: '2026-01-01T00:00:00.000Z' })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-recovery-test-'))
  electronState.userData = join(root, 'user-data')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('unclean shutdown detection', () => {
  it('treats a first run as clean rather than a crash', async () => {
    await clearSessionMarker()
    expect((await beginSession()).previousSessionCleanlyClosed).toBe(true)
  })

  it('reports the previous session as clean after a graceful quit', async () => {
    await beginSession()
    await endSession()
    expect((await beginSession()).previousSessionCleanlyClosed).toBe(true)
  })

  it('reports the previous session as unclean when it never ended', async () => {
    await beginSession()
    // No endSession(): this is what an abrupt termination leaves behind.
    expect((await beginSession()).previousSessionCleanlyClosed).toBe(false)
  })
})

describe('recovery journal', () => {
  it('round-trips the project it recorded', async () => {
    const original = project('recover-1')
    original.settings.editing.pace = 'fast'
    await writeRecoveryJournal(original, '/projects/one.autocut.json', true)
    const recovered = await readRecoveredProject('recover-1')
    expect(recovered.id).toBe('recover-1')
    expect(recovered.settings.editing.pace).toBe('fast')
  })

  it('offers a dirty journal for a project that was never saved to a file', async () => {
    await writeRecoveryJournal(project('recover-2'), null, true)
    const candidates = await listRecoveryCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].entry.projectFilePath).toBeNull()
    expect(candidates[0].journalIsNewer).toBe(true)
  })

  it('does not offer recovery when the journal is not dirty', async () => {
    await writeRecoveryJournal(project('recover-3'), '/projects/three.json', false)
    expect(await listRecoveryCandidates()).toEqual([])
  })

  it('does not offer recovery when the saved project is newer than the journal', async () => {
    const saved = join(root, 'saved.autocut.json')
    const original = project('recover-4')
    await writeRecoveryJournal(original, saved, true)
    await writeFile(saved, serializeProjectFile(original), 'utf8')
    // The user saved after the journal was written, so there is nothing left to recover.
    const future = new Date(Date.now() + 60_000)
    await utimes(saved, future, future)
    expect(await listRecoveryCandidates()).toEqual([])
  })

  it('offers recovery when the journal holds work the saved file does not', async () => {
    const saved = join(root, 'stale.autocut.json')
    const original = project('recover-5')
    await writeFile(saved, serializeProjectFile(original), 'utf8')
    const past = new Date(Date.now() - 60_000)
    await utimes(saved, past, past)
    await writeRecoveryJournal(original, saved, true)

    const candidates = await listRecoveryCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].entry.projectId).toBe('recover-5')
    expect(candidates[0].journalIsNewer).toBe(true)
  })

  it('never touches the saved project file when journalling', async () => {
    const saved = join(root, 'untouched.autocut.json')
    await writeFile(saved, 'KNOWN GOOD CONTENT', 'utf8')
    const before = await stat(saved)
    await writeRecoveryJournal(project('recover-6'), saved, true)
    expect(await readFile(saved, 'utf8')).toBe('KNOWN GOOD CONTENT')
    expect((await stat(saved)).mtimeMs).toBe(before.mtimeMs)
  })

  it('discards recovery data on request', async () => {
    await writeRecoveryJournal(project('recover-7'), null, true)
    expect(await listRecoveryCandidates()).toHaveLength(1)
    await discardRecovery('recover-7')
    expect(await listRecoveryCandidates()).toEqual([])
  })

  it('rejects a project identifier that would escape recovery storage', async () => {
    await expect(writeRecoveryJournal(project('../escape'), null, true)).rejects.toThrow(/identifier is invalid/i)
  })

  it('reports candidates alongside the shutdown state on startup', async () => {
    await beginSession()
    await writeRecoveryJournal(project('recover-8'), null, true)
    const state = await inspectRecoveryState()
    expect(state.previousSessionCleanlyClosed).toBe(false)
    expect(state.candidates.map((candidate) => candidate.entry.projectId)).toEqual(['recover-8'])
  })

  it('still reports unsaved work even when the previous session closed cleanly', async () => {
    await beginSession()
    await endSession()
    await writeRecoveryJournal(project('recover-9'), null, true)
    const state = await inspectRecoveryState()
    expect(state.previousSessionCleanlyClosed).toBe(true)
    expect(state.candidates).toHaveLength(1)
  })
})
