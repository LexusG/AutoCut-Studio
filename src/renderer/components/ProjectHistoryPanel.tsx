import { CameraIcon, History, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ProjectSnapshotDiff, ProjectSnapshotRef } from '@shared/types'
import { useProjectFiles } from '../hooks/use-project-files'
import { useAppStore } from '../stores/app-store'
import { currentProjectFile } from '../stores/project-file'
import { formatFileSize } from '../utils/format'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString()
}

/**
 * Project History — lightweight, restorable versions of the project's configuration.
 *
 * Distinct from Preview History, which tracks rendered video. A snapshot holds only
 * project state, so restoring one never touches media or rendered output.
 */
export function ProjectHistoryPanel(): React.JSX.Element {
  const [snapshots, setSnapshots] = useState<ProjectSnapshotRef[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; diffs: ProjectSnapshotDiff[] } | null>(null)
  const projectId = useAppStore((state) => state.projectId)
  const projectRevision = useAppStore((state) => state.projectRevision)
  const readOnly = useAppStore((state) => state.projectReadOnly)
  const setProjectSnapshots = useAppStore((state) => state.setProjectSnapshots)
  const { openRestoredProject } = useProjectFiles()

  const refresh = useCallback(async (): Promise<void> => {
    const listed = await window.autoCut.listSnapshots(projectId).catch(() => [])
    setSnapshots(listed)
    setProjectSnapshots(listed)
  }, [projectId, setProjectSnapshots])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'The snapshot operation failed.')
    } finally {
      setBusy(false)
    }
  }

  const capture = (): Promise<void> =>
    run(async () => {
      const name = window.prompt('Name this snapshot', `Snapshot ${snapshots.length + 1}`)
      if (name === null) return
      await window.autoCut.createSnapshot(currentProjectFile(), { reason: 'manual', name })
      await refresh()
    })

  const showChanges = (snapshotId: string): Promise<void> =>
    run(async () => {
      if (preview?.id === snapshotId) {
        setPreview(null)
        return
      }
      const diffs = await window.autoCut.diffSnapshot(projectId, snapshotId, currentProjectFile())
      setPreview({ id: snapshotId, diffs })
    })

  const restore = (snapshotId: string): Promise<void> =>
    run(async () => {
      if (!window.confirm('Restore this snapshot? Current project settings will be replaced.')) return
      // Snapshot the present first, so restoring is itself reversible.
      await window.autoCut.createSnapshot(currentProjectFile(), { reason: 'before-restore' })
      const restored = await window.autoCut.readSnapshot(projectId, snapshotId)
      // Re-imports the snapshot's own media rather than reusing the current clip list.
      await openRestoredProject(restored)
      await refresh()
    })

  const rename = (snapshot: ProjectSnapshotRef): Promise<void> =>
    run(async () => {
      const name = window.prompt('Rename snapshot', snapshot.name)
      if (name === null) return
      setSnapshots(await window.autoCut.renameSnapshot(projectId, snapshot.id, name))
    })

  const remove = (snapshotId: string): Promise<void> =>
    run(async () => {
      setSnapshots(await window.autoCut.deleteSnapshot(projectId, snapshotId))
      if (preview?.id === snapshotId) setPreview(null)
    })

  return (
    <details className="settings-details">
      <summary><History size={14} /> Project History</summary>
      <div className="settings-details-body">
        <div className="storage-actions">
          <button type="button" disabled={busy || readOnly} onClick={() => void capture()}>
            <CameraIcon size={14} /> Take Snapshot
          </button>
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {snapshots.length === 0 ? (
          <small className="storage-location">
            No snapshots yet. One is taken automatically before regenerating the edit plan,
            changing platform preset, replacing text across transcripts, or restoring an
            older version.
          </small>
        ) : (
          <ul className="snapshot-list">
            {snapshots.map((snapshot) => (
              <li className="snapshot-row" key={snapshot.id}>
                <button
                  className="snapshot-open"
                  type="button"
                  onClick={() => void showChanges(snapshot.id)}
                  disabled={busy}
                  title="Preview Changes"
                >
                  <strong>{snapshot.name}</strong>
                  <span>
                    {formatWhen(snapshot.createdAt)} • revision {snapshot.projectRevision} •{' '}
                    {formatFileSize(snapshot.bytes)}
                    {snapshot.automatic ? ' • automatic' : ''}
                  </span>
                </button>
                <div className="snapshot-actions">
                  <button
                    type="button"
                    title={`Restore ${snapshot.name}`}
                    aria-label={`Restore ${snapshot.name}`}
                    disabled={busy || readOnly}
                    onClick={() => void restore(snapshot.id)}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    title={`Rename ${snapshot.name}`}
                    aria-label={`Rename ${snapshot.name}`}
                    disabled={busy}
                    onClick={() => void rename(snapshot)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title={`Delete ${snapshot.name}`}
                    aria-label={`Delete ${snapshot.name}`}
                    disabled={busy}
                    onClick={() => void remove(snapshot.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {preview?.id === snapshot.id && (
                  <ul className="snapshot-diff">
                    {preview.diffs.map((diff) => (
                      <li key={diff.field}>{diff.summary}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <small className="storage-location">Snapshots store project settings only — never source media.</small>
      </div>
    </details>
  )
}
