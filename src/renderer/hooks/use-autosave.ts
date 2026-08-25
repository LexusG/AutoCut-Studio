import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { currentProjectFile } from '../stores/project-file'

/** Quiet period after the last edit before a save is attempted. */
export const AUTOSAVE_DEBOUNCE_MS = 30_000

/** Retry cadence after a failed save, so a transient problem recovers on its own. */
const RETRY_DELAY_MS = 60_000

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const pending = useRef(false)

  useEffect(() => {
    const cancelTimer = (): void => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }

    const run = async (): Promise<void> => {
      if (inFlight.current) {
        // A save is already running; remember to re-check once it finishes so the very
        // last edit is never the one that gets dropped.
        pending.current = true
        return
      }
      const state = useAppStore.getState()
      if (!state.autosaveEnabled || state.projectReadOnly || state.screen === 'home') return
      if (!state.projectDirty) return

      inFlight.current = true
      const store = useAppStore.getState()
      store.setAutosaveStatus('saving')
      try {
        const result = await window.autoCut.autosaveProject(currentProjectFile(), state.projectFilePath)
        if (result.state === 'failed') {
          // The in-memory project is untouched and stays open; only the write failed.
          useAppStore.getState().setAutosaveStatus('failed', { error: result.message })
          timer.current = setTimeout(() => void run(), RETRY_DELAY_MS)
        } else if (result.state === 'saved') {
          useAppStore.getState().setAutosaveStatus('saved', { error: null, savedAt: result.savedAt })
        } else {
          // Journalled: recoverable, but the user has not chosen a destination yet.
          useAppStore.getState().setAutosaveStatus('unsaved', { error: null })
        }
      } catch (error) {
        useAppStore.getState().setAutosaveStatus('failed', {
          error: error instanceof Error ? error.message : 'The project could not be saved automatically.'
        })
        timer.current = setTimeout(() => void run(), RETRY_DELAY_MS)
      } finally {
        inFlight.current = false
        if (pending.current) {
          pending.current = false
          schedule()
        }
      }
    }

    const schedule = (): void => {
      cancelTimer()
      timer.current = setTimeout(() => void run(), AUTOSAVE_DEBOUNCE_MS)
    }

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
      if (!state.projectDirty || state.projectReadOnly || state.screen === 'home') return
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
