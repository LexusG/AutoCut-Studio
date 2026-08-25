import { AlertTriangle, FileCheck2, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RecoveryCandidate } from '@shared/types'
import { useProjectFiles } from '../hooks/use-project-files'
import { useAppStore } from '../stores/app-store'

function describeCandidate(candidate: RecoveryCandidate): string {
  const when = new Date(candidate.entry.savedAt).toLocaleString()
  if (!candidate.entry.projectFilePath) return `Never saved to a file • last change ${when}`
  return `${candidate.entry.projectFilePath} • last change ${when}`
}

/**
 * Offer unsaved work back to the user after an interrupted session.
 *
 * The saved project file is never touched here: recovering loads the journalled state
 * into the editor and leaves the user to decide whether to save over the original.
 */
export function RecoveryDialog(): React.JSX.Element | null {
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const { openRecoveredProject, openRecent } = useProjectFiles()
  const screen = useAppStore((state) => state.screen)

  useEffect(() => {
    let active = true
    void window.autoCut
      .getRecoveryState()
      .then((state) => {
        if (active) setCandidates(state.candidates)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  if (dismissed || screen !== 'home' || candidates.length === 0) return null
  const candidate = candidates[0]

  const finish = (): void => {
    setCandidates((current) => current.slice(1))
    setBusy(false)
  }

  const recover = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const project = await window.autoCut.recoverProject(candidate.entry.projectId)
      await openRecoveredProject(project, candidate.entry.projectFilePath)
      await window.autoCut.discardRecovery(candidate.entry.projectId)
      finish()
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'The recovered project could not be opened.')
      setBusy(false)
    }
  }

  const openSaved = async (): Promise<void> => {
    if (!candidate.entry.projectFilePath) return
    setBusy(true)
    setError(null)
    await openRecent(candidate.entry.projectFilePath)
    finish()
  }

  const discard = async (): Promise<void> => {
    setBusy(true)
    await window.autoCut.discardRecovery(candidate.entry.projectId).catch(() => undefined)
    finish()
  }

  return (
    <div className="recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <div className="recovery-panel">
        <div className="recovery-heading">
          <AlertTriangle size={18} />
          <h2 id="recovery-title">Recover unsaved work</h2>
        </div>
        <p className="recovery-lead">
          AutoCut Studio closed before <strong>{candidate.entry.projectName}</strong> was saved. The recovered
          changes are newer than the saved project file.
        </p>
        <p className="recovery-detail">{describeCandidate(candidate)}</p>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="recovery-actions">
          <button className="button button-primary" type="button" onClick={() => void recover()} disabled={busy}>
            <RotateCcw size={16} /> Recover
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void openSaved()}
            disabled={busy || !candidate.entry.projectFilePath}
            title={candidate.entry.projectFilePath ?? 'This project was never saved to a file.'}
          >
            <FileCheck2 size={16} /> Open Saved Version
          </button>
          <button className="button button-danger" type="button" onClick={() => void discard()} disabled={busy}>
            <Trash2 size={16} /> Discard Recovery
          </button>
        </div>
        <button className="recovery-later" type="button" onClick={() => setDismissed(true)} disabled={busy}>
          Decide later
        </button>
      </div>
    </div>
  )
}
