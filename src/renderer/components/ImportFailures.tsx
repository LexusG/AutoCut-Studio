import { AlertCircle, X } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

export function ImportFailures(): React.JSX.Element | null {
  const failures = useAppStore((state) => state.importFailures)
  const clear = useAppStore((state) => state.clearImportFailures)
  if (failures.length === 0) return null

  return (
    <div className="import-errors" role="alert">
      <AlertCircle size={17} />
      <div className="import-error-copy">
        <strong>{failures.length === 1 ? 'A clip was not imported' : `${failures.length} clips were not imported`}</strong>
        {failures.map((failure) => (
          <details key={`${failure.path}:${failure.message}`}>
            <summary>{failure.filename}: {failure.message}</summary>
            {failure.details && <pre>{failure.details}</pre>}
          </details>
        ))}
      </div>
      <button type="button" onClick={clear} title="Dismiss" aria-label="Dismiss import errors">
        <X size={15} />
      </button>
    </div>
  )
}
