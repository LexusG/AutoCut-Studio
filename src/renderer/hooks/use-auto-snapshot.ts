import { useCallback } from 'react'
import type { SnapshotReason } from '@shared/types'
import { useAppStore } from '../stores/app-store'
import { currentProjectFile } from '../stores/project-file'

/**
 * Capture the project before an operation that is hard to undo by hand.
 *
 * Failure is deliberately swallowed: a snapshot is a safety net, and being unable to
 * write one must not block the edit the user actually asked for. The caller proceeds
 * either way.
 */
export function useAutoSnapshot(): (reason: SnapshotReason) => Promise<void> {
  const readOnly = useAppStore((state) => state.projectReadOnly)
  const setProjectSnapshots = useAppStore((state) => state.setProjectSnapshots)

  return useCallback(
    async (reason: SnapshotReason): Promise<void> => {
      if (readOnly) return
      try {
        const project = currentProjectFile()
        await window.autoCut.createSnapshot(project, { reason })
        setProjectSnapshots(await window.autoCut.listSnapshots(project.id))
      } catch {
        // Best effort only.
      }
    },
    [readOnly, setProjectSnapshots]
  )
}
