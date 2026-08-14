import { CheckCircle2, CircleX, LoaderCircle, OctagonX, X } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

function formatElapsed(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  return `${minutes}:${(rounded % 60).toString().padStart(2, '0')}`
}

export function RenderDialog({ onCancel }: { onCancel: () => Promise<void> }): React.JSX.Element | null {
  const status = useAppStore((state) => state.renderStatus)
  const progress = useAppStore((state) => state.renderProgress)
  const result = useAppStore((state) => state.renderResult)
  const error = useAppStore((state) => state.renderError)
  const dismiss = useAppStore((state) => state.dismissRenderDialog)
  if (status === 'idle') return null

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
            <h2 id="render-title">Generating video</h2>
            <p className="render-stage">{progress?.stage ?? 'Starting render'}</p>
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

        {status === 'complete' && result && (
          <>
            <span className="render-status-icon render-status-success"><CheckCircle2 size={27} /></span>
            <h2 id="render-title">Video ready</h2>
            <p className="render-message">The finished MP4 is ready in the preview.</p>
            <div className="render-output-path" title={result.outputPath}>{result.outputPath}</div>
            <button className="button button-primary" type="button" onClick={dismiss}>View Video</button>
          </>
        )}

        {status === 'error' && (
          <>
            <span className="render-status-icon render-status-error"><CircleX size={27} /></span>
            <h2 id="render-title">Video generation failed</h2>
            <p className="render-message">No source footage was changed.</p>
            <details className="render-error-details">
              <summary>Details</summary>
              <pre>{error}</pre>
            </details>
            <button className="button button-secondary" type="button" onClick={dismiss}>Close</button>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <span className="render-status-icon"><OctagonX size={27} /></span>
            <h2 id="render-title">Render cancelled</h2>
            <p className="render-message">Temporary files were removed. Your project is unchanged.</p>
            <button className="button button-secondary" type="button" onClick={dismiss}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
