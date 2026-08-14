import { CheckCircle2, CircleX, LoaderCircle, OctagonX, TimerReset, X } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

function formatElapsed(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  return `${minutes}:${(rounded % 60).toString().padStart(2, '0')}`
}

export function RenderDialog({ onCancel }: { onCancel: () => Promise<void> }): React.JSX.Element | null {
  const status = useAppStore((state) => state.renderStatus)
  const operation = useAppStore((state) => state.renderOperation)
  const progress = useAppStore((state) => state.renderProgress)
  const error = useAppStore((state) => state.renderError)
  const durationIssue = useAppStore((state) => state.durationIssue)
  const exportResult = useAppStore((state) => state.exportResult)
  const dismiss = useAppStore((state) => state.dismissRenderDialog)
  const useMinimumDuration = useAppStore((state) => state.useMinimumDuration)
  const updateEditing = useAppStore((state) => state.updateEditing)
  const backToEdit = useAppStore((state) => state.backToEdit)
  if (status === 'idle') return null

  const returnToSettings = (): void => {
    dismiss()
    backToEdit()
  }

  return (
    <div className="render-overlay" role="dialog" aria-modal="true" aria-labelledby="render-title">
      <div className="render-dialog">
        {status !== 'rendering' && (
          <button className="render-close" type="button" onClick={dismiss} title="Close" aria-label="Close">
            <X size={17} />
          </button>
        )}

        {status === 'rendering' && (
          <>
            <span className="render-status-icon render-status-active"><LoaderCircle className="spin" size={25} /></span>
            <h2 id="render-title">{operation === 'export' ? 'Exporting approved video' : operation === 'analysis' ? 'Creating Edit Plan' : 'Generating preview'}</h2>
            <p className="render-stage">{progress?.stage ?? (operation === 'analysis' ? 'Starting analysis' : 'Starting render')}</p>
            <div className="render-progress-copy">
              <span>
                {progress?.currentClipIndex
                  ? `Clip ${progress.currentClipIndex} of ${progress.totalClips}`
                  : `${progress?.totalClips ?? 0} clips`}
              </span>
              <strong>{Math.round(progress?.percent ?? 0)}%</strong>
            </div>
            <div className="render-progress-track" aria-label="Render progress">
              <span style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <div className="render-current">
              <span title={progress?.currentClip ?? undefined}>{progress?.currentClip ?? 'Preparing files'}</span>
              <span>{formatElapsed(progress?.elapsedSeconds ?? 0)}</span>
            </div>
            <button className="button button-danger" type="button" onClick={() => void onCancel()}>
              <OctagonX size={16} /> Cancel
            </button>
          </>
        )}

        {status === 'complete' && (
          <>
            <span className="render-status-icon render-status-success"><CheckCircle2 size={27} /></span>
            <h2 id="render-title">{exportResult ? 'Export complete' : 'Preview ready'}</h2>
            <p className="render-message">
              {exportResult
                ? 'The approved MP4 passed verification and is ready.'
                : 'Watch the complete generated edit before approving it.'}
            </p>
            {exportResult && <div className="render-output-path" title={exportResult.outputPath}>{exportResult.outputPath}</div>}
            <button className="button button-primary" type="button" onClick={dismiss}>
              {exportResult ? 'View Export Summary' : 'Review Preview'}
            </button>
          </>
        )}

        {status === 'constraint' && durationIssue && (
          <>
            <span className="render-status-icon render-status-warning"><TimerReset size={27} /></span>
            <h2 id="render-title">Target duration is too short</h2>
            <p className="render-message">{durationIssue.message}</p>
            <div className="duration-constraint-actions">
              <button className="button button-primary" type="button" onClick={() => { useMinimumDuration(); backToEdit() }}>
                Use {durationIssue.minimumDuration} Seconds
              </button>
              <button className="button button-secondary" type="button" onClick={returnToSettings}>Change Target Duration</button>
              <button className="button button-secondary" type="button" onClick={() => { updateEditing('useEveryClip', false); returnToSettings() }}>
                Disable Use Every Clip
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <span className="render-status-icon render-status-error"><CircleX size={27} /></span>
            <h2 id="render-title">{operation === 'export' ? 'Export failed' : operation === 'analysis' ? 'Edit Plan analysis failed' : 'Preview generation failed'}</h2>
            <p className="render-message">No source footage was changed.</p>
            <details className="render-error-details">
              <summary>Show Technical Details</summary>
              <pre>{error}</pre>
            </details>
            <button className="button button-secondary" type="button" onClick={dismiss}>Close</button>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <span className="render-status-icon"><OctagonX size={27} /></span>
            <h2 id="render-title">{operation === 'analysis' ? 'Analysis cancelled' : 'Render cancelled'}</h2>
            <p className="render-message">Incomplete files were removed. Your project and source media are unchanged.</p>
            <button className="button button-secondary" type="button" onClick={dismiss}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
