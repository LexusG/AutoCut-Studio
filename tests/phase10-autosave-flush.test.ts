import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushAutosave } from '../src/renderer/hooks/use-autosave'
import { useAppStore } from '../src/renderer/stores/app-store'
import { currentProjectFile } from '../src/renderer/stores/project-file'

const state = () => useAppStore.getState()

interface AutosaveCall {
  filePath: string | null
  revision: number
}

let calls: AutosaveCall[] = []
let resolveNext: (() => void) | null = null

beforeEach(() => {
  calls = []
  resolveNext = null
  useAppStore.getState().startProject()
  const autosaveProject = vi.fn(async (_project: unknown, filePath: string | null) => {
    calls.push({ filePath, revision: useAppStore.getState().projectRevision })
    if (resolveNext) await new Promise<void>((resolve) => { resolveNext = resolve })
    return { state: filePath ? 'saved' : 'journalled', filePath, savedAt: new Date().toISOString(), message: null }
  })
  ;(globalThis as { window?: unknown }).window = { autoCut: { autosaveProject } }
})

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('autosave flush on navigation', () => {
  it('writes pending changes instead of leaving them to a timer that never fires', async () => {
    state().loadProject(currentProjectFile(), '/projects/a.json', [], [])
    state().setProjectName('Edited just before leaving')
    expect(state().projectDirty).toBe(true)

    // Navigating away must not strand the debounced save.
    await flushAutosave()

    expect(calls).toHaveLength(1)
    expect(calls[0].filePath).toBe('/projects/a.json')
    expect(state().projectDirty).toBe(false)
  })

  it('does nothing when there is nothing pending', async () => {
    await flushAutosave()
    expect(calls).toEqual([])
  })

  it('reports a project that still has nowhere to be written', async () => {
    state().setProjectName('Never saved anywhere')
    await flushAutosave()
    expect(calls).toHaveLength(1)
    expect(calls[0].filePath).toBeNull()
    // Journalled, not saved: the caller must warn before discarding this.
    expect(state().projectDirty).toBe(true)
    expect(state().autosaveStatus).toBe('unsaved')
  })

  it('leaves work dirty when the flush fails', async () => {
    ;(globalThis as { window: { autoCut: { autosaveProject: unknown } } }).window.autoCut.autosaveProject =
      vi.fn(async () => ({ state: 'failed', filePath: null, savedAt: '', message: 'Disk full' }))
    state().setProjectName('Edited')
    await flushAutosave()
    expect(state().projectDirty).toBe(true)
    expect(state().autosaveStatus).toBe('failed')
    expect(state().autosaveError).toBe('Disk full')
  })
})
