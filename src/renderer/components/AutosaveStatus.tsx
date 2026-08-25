import { AlertTriangle, Check, CircleDot, Lock, RefreshCw } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

/**
 * A single quiet line reporting whether the project is safe on disk.
 *
 * Deliberately understated: it changes at most once per save cycle and never
 * interrupts, except when a save has actually failed and the user needs to know.
 */
export function AutosaveStatus(): React.JSX.Element | null {
  const status = useAppStore((state) => state.autosaveStatus)
  const error = useAppStore((state) => state.autosaveError)
  const lastSavedAt = useAppStore((state) => state.lastSavedAt)
  const readOnly = useAppStore((state) => state.projectReadOnly)
  const enabled = useAppStore((state) => state.autosaveEnabled)

  if (readOnly) {
    return (
      <span className="autosave-status autosave-status-readonly" title="This project is open read-only.">
        <Lock size={13} /> Read only
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span
        className="autosave-status autosave-status-failed"
        role="status"
        title={error ?? 'The project could not be saved.'}
      >
        <AlertTriangle size={13} /> Save Failed
      </span>
    )
  }

  if (status === 'saving') {
    return (
      <span className="autosave-status" role="status">
        <RefreshCw size={13} className="spin" /> Saving…
      </span>
    )
  }

  if (status === 'saved') {
    return (
      <span className="autosave-status autosave-status-saved" title={`Last saved ${relativeTime(lastSavedAt)}`}>
        <Check size={13} /> Saved
      </span>
    )
  }

  if (status === 'unsaved') {
    return (
      <span
        className="autosave-status autosave-status-unsaved"
        title={enabled ? 'Unsaved changes. Autosave will write them shortly.' : 'Unsaved changes. Autosave is off.'}
      >
        <CircleDot size={13} /> Unsaved Changes
      </span>
    )
  }

  return null
}
