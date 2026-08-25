import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../src/renderer/stores/app-store'

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
