import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../src/renderer/stores/app-store'
import { currentProjectFile } from '../src/renderer/stores/project-file'

const state = () => useAppStore.getState()

beforeEach(() => {
  useAppStore.getState().startProject()
})

describe('autosave dirty tracking', () => {
  it('starts a project clean and at revision zero', () => {
    expect(state().projectDirty).toBe(false)
    expect(state().projectRevision).toBe(0)
    expect(state().autosaveStatus).toBe('idle')
  })

  it('advances the revision whenever an action marks the project dirty', () => {
    state().setProjectName('First name')
    const afterFirst = state().projectRevision
    expect(afterFirst).toBeGreaterThan(0)
    expect(state().projectDirty).toBe(true)
    expect(state().autosaveStatus).toBe('unsaved')

    state().setProjectName('Second name')
    // A distinct value per edit is what lets the debouncer tell a new change from an
    // unchanged dirty flag.
    expect(state().projectRevision).toBe(afterFirst + 1)
  })

  it('does not advance the revision for actions that change nothing', () => {
    state().setProjectName('Named')
    const revision = state().projectRevision
    // A guard-style action that returns state untouched must not look like an edit.
    state().setRenderProgress({ renderId: 'not-the-active-render' } as never)
    expect(state().projectRevision).toBe(revision)
  })

  it('keeps a failed status visible until a save actually succeeds', () => {
    state().setAutosaveStatus('failed', { error: 'Disk full' })
    state().setProjectName('Still editing')
    expect(state().autosaveStatus).toBe('failed')
    expect(state().autosaveError).toBe('Disk full')
  })

  it('clears the dirty flag and records the time when a save succeeds', () => {
    state().setProjectName('Edited')
    expect(state().projectDirty).toBe(true)
    state().setAutosaveStatus('saved', { error: null, savedAt: '2026-08-25T00:00:00.000Z' })
    expect(state().projectDirty).toBe(false)
    expect(state().lastSavedAt).toBe('2026-08-25T00:00:00.000Z')
    expect(state().autosaveError).toBeNull()
  })

  it('does not report Saved when an edit landed while the save was in flight', () => {
    state().setProjectName('First')
    const inFlightRevision = state().projectRevision

    // The user keeps editing while the write is running.
    state().setProjectName('Second')
    expect(state().projectRevision).toBeGreaterThan(inFlightRevision)

    // The save completes, but it only ever covered the earlier revision.
    state().setAutosaveStatus('saved', { savedAt: '2026-08-25T00:00:00.000Z', savedRevision: inFlightRevision })

    // Reporting "Saved" here would strand the newest edit in memory with nothing
    // scheduled to persist it.
    expect(state().projectDirty).toBe(true)
    expect(state().autosaveStatus).toBe('unsaved')
  })

  it('reports Saved when the save covered the newest revision', () => {
    state().setProjectName('Only edit')
    state().setAutosaveStatus('saved', {
      savedAt: '2026-08-25T00:00:00.000Z',
      savedRevision: state().projectRevision
    })
    expect(state().projectDirty).toBe(false)
    expect(state().autosaveStatus).toBe('saved')
  })

  it('accepts a recovered project that has no file path yet', () => {
    const project = { ...currentProjectFile(), projectRevision: 4 }
    state().loadProject(project, null, [], [])
    // An empty string is not an absolute path and would be rejected by the save
    // channels instead of prompting the user for a destination.
    expect(state().projectFilePath).toBeNull()
    expect(state().projectRevision).toBe(4)
  })

  it('does not revert a live edit made while a manual save was writing', () => {
    state().setProjectName('Before save')
    const savedRevision = state().projectRevision
    const written = currentProjectFile()

    // The user keeps editing while the write is in flight.
    state().setProjectName('Typed during save')

    state().markProjectSaved({ filePath: '/projects/one.autocut.json', project: written }, savedRevision)

    // The save covered an older revision, so the project is still dirty and the newer
    // name must survive rather than being replaced by the written snapshot.
    expect(state().projectSettings.name).toBe('Typed during save')
    expect(state().projectDirty).toBe(true)
    expect(state().autosaveStatus).toBe('unsaved')
    expect(state().projectFilePath).toBe('/projects/one.autocut.json')
  })

  it('clears dirty when a manual save covered the newest revision', () => {
    state().setProjectName('Only edit')
    const written = currentProjectFile()
    state().markProjectSaved(
      { filePath: '/projects/one.autocut.json', project: written },
      state().projectRevision
    )
    expect(state().projectDirty).toBe(false)
    expect(state().autosaveStatus).toBe('saved')
  })

  it('adopts rewritten references when Save As changes the project identity', () => {
    state().setProjectName('Copy me')
    const written = currentProjectFile()
    const clone = {
      ...written,
      id: 'brand-new-identity',
      transcriptReferences: [
        { sourceClipId: 'clip-a', relativePath: 'projects/brand-new-identity/transcripts/clip-a.json' }
      ] as typeof written.transcriptReferences,
      snapshotRefs: []
    }
    state().markProjectSaved({ filePath: '/projects/copy.autocut.json', project: clone }, state().projectRevision)

    expect(state().projectId).toBe('brand-new-identity')
    // Rewritten references are the one thing the store cannot derive for itself.
    expect(state().transcriptReferences[0].relativePath).toBe(
      'projects/brand-new-identity/transcripts/clip-a.json'
    )
  })

  it('resets autosave state when a new project starts', () => {
    state().setProjectName('Edited')
    state().setAutosaveStatus('failed', { error: 'Permission denied' })
    state().startProject()
    expect(state().projectRevision).toBe(0)
    expect(state().projectDirty).toBe(false)
    expect(state().autosaveStatus).toBe('idle')
    expect(state().autosaveError).toBeNull()
  })

  it('tracks read-only state so autosave and manual save can be gated', () => {
    expect(state().projectReadOnly).toBe(false)
    state().setProjectReadOnly(true)
    expect(state().projectReadOnly).toBe(true)
  })
})
