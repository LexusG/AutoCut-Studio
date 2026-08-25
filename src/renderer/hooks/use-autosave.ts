import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { currentProjectFile } from '../stores/project-file'

/** Quiet period after the last edit before a save is attempted. */
export const AUTOSAVE_DEBOUNCE_MS = 30_000

/** Retry cadence after a failed save, so a transient problem recovers on its own. */
const RETRY_DELAY_MS = 60_000

let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let rerunWhenDone = false

function cancelTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function schedule(delay = AUTOSAVE_DEBOUNCE_MS): void {
  cancelTimer()
  timer = setTimeout(() => void save(), delay)
}

async function save(): Promise<void> {
  if (inFlight) {
    rerunWhenDone = true
    return
  }
  const state = useAppStore.getState()
  if (!state.autosaveEnabled || state.projectReadOnly) return
  if (!state.projectDirty) return

  inFlight = true
  // Capture what this write covers. Anything edited after this point is not saved by
  // it, however the write turns out.
  const savedRevision = state.projectRevision
  useAppStore.getState().setAutosaveStatus('saving')
  try {
    const result = await window.autoCut.autosaveProject(currentProjectFile(), state.projectFilePath)
    if (result.state === 'failed') {
      // The in-memory project is untouched and stays open; only the write failed.
      useAppStore.getState().setAutosaveStatus('failed', { error: result.message })
      schedule(RETRY_DELAY_MS)
    } else if (result.state === 'saved') {
      useAppStore.getState().setAutosaveStatus('saved', {
        error: null,
        savedAt: result.savedAt,
        savedRevision
      })
      if (useAppStore.getState().projectRevision !== savedRevision) rerunWhenDone = true
    } else {
      // Journalled: recoverable, but the user has not chosen a destination yet.
      useAppStore.getState().setAutosaveStatus('unsaved', { error: null })
    }
  } catch (error) {
    useAppStore.getState().setAutosaveStatus('failed', {
      error: error instanceof Error ? error.message : 'The project could not be saved automatically.'
    })
    schedule(RETRY_DELAY_MS)
  } finally {
    inFlight = false
    if (rerunWhenDone) {
      rerunWhenDone = false
      schedule(0)
    }
  }
}

/**
 * Persist any pending changes right now and wait for the result.
 *
 * Navigation away from the editor must call this: a debounced save that fires after the
 * user has left would otherwise find the project already considered inactive, and the
 * last half-minute of work would exist only in memory.
 */
export async function flushAutosave(): Promise<void> {
  cancelTimer()
  if (!useAppStore.getState().projectDirty) return
  await save()
  // A save that started while another was running defers its work; drain that too.
  if (rerunWhenDone) {
    rerunWhenDone = false
    await save()
  }
}

/**
 * Persist the project shortly after it stops changing.
 *
 * Autosave deliberately does not reuse `useProjectFiles().save()`: that path refuses to
 * write while settings have any error-level issue and opens a file dialog when the
 * project has no path yet. Neither is acceptable for a background save, so this talks
 * to the autosave channel, which journals unconditionally and only writes the project
 * file when there is somewhere to write it.
 */
export function useAutosave(): void {
  useEffect(() => {
    let lastRevision = useAppStore.getState().projectRevision
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.projectRevision === lastRevision) return
      lastRevision = state.projectRevision
      if (!state.autosaveEnabled || state.projectReadOnly) return
      schedule()
    })

    // Best-effort flush when the window goes away, so work made in the last thirty
    // seconds still reaches the recovery journal on a normal close.
    const flush = (): void => {
      const state = useAppStore.getState()
      if (!state.projectDirty || state.projectReadOnly) return
      void window.autoCut.autosaveProject(currentProjectFile(), state.projectFilePath).catch(() => undefined)
    }
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('beforeunload', flush)
      unsubscribe()
      cancelTimer()
    }
  }, [])
}
