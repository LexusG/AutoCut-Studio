import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileVideo2,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  TriangleAlert
} from 'lucide-react'
import { getPresetDisplayName } from '@shared/utils/project-settings'
import { BrandMark } from '../components/BrandMark'
import { RenderDialog } from '../components/RenderDialog'
import { PreviewHistoryPanel } from '../components/PreviewHistoryPanel'
import { useVideoRender } from '../hooks/use-video-render'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

export function FinalPreviewPage(): React.JSX.Element {
  const preview = useAppStore((state) => state.previewResult)
  const exported = useAppStore((state) => state.exportResult)
  const outdated = useAppStore((state) => state.previewOutdated)
  const settings = useAppStore((state) => state.projectSettings)
  const history = useAppStore((state) => state.previewHistory)
  const selectedPreviewId = useAppStore((state) => state.selectedPreviewId)
  const backToEdit = useAppStore((state) => state.backToEdit)
  const startProject = useAppStore((state) => state.startProject)
  const isRendering = useAppStore((state) => state.renderStatus === 'rendering')
  const { generatePreview, approveAndExport, cancel } = useVideoRender()

  if (!preview) {
    return <></>
  }
  const selectedVersion = history.find((version) => version.id === selectedPreviewId)
  const previewSettings = selectedVersion?.settingsSnapshot ?? settings
  const statusLabel = selectedVersion?.approved
    ? 'Approved Export'
    : outdated ? 'Settings Changed' : 'Preview / Not Yet Exported'

  return (
    <main className="review-page">
      <header className="review-header">
        <div className="review-header-left">
          <button className="icon-button" type="button" onClick={backToEdit} title="Back to Edit" aria-label="Back to Edit">
            <ArrowLeft size={19} />
          </button>
          <BrandMark compact />
          <span className="header-divider" />
          <span className="workflow-step">4 Review</span>
        </div>
        <span className={`preview-state ${outdated ? 'preview-state-outdated' : ''}`}>
          {outdated ? <TriangleAlert size={15} /> : <FileVideo2 size={15} />}
          {statusLabel}
        </span>
      </header>

      <section className="review-stage">
        <video
          key={preview.outputPath}
          className="final-preview-video"
          src={preview.outputUrl}
          controls
          autoPlay
          preload="metadata"
        />
      </section>

      <PreviewHistoryPanel />

      <section className="review-details" aria-label="Preview details">
        <div className="review-title">
          <div>
            <span>Generated preview</span>
            <h1>{previewSettings.name}</h1>
          </div>
          <div className="review-actions">
            <button className="button button-secondary" type="button" onClick={backToEdit} disabled={isRendering}>
              <RotateCcw size={16} /> Back to Edit
            </button>
            <button className="button button-secondary" type="button" onClick={() => void generatePreview(true)} disabled={isRendering}>
              <RefreshCw size={16} /> Regenerate
            </button>
            <button className="button button-primary" type="button" onClick={() => void approveAndExport()} disabled={isRendering || outdated}>
              <Check size={17} /> Approve & Export
            </button>
          </div>
        </div>

        {outdated && (
          <div className="preview-outdated-notice">
            <TriangleAlert size={18} />
            <div><strong>This preview is out of date.</strong><span>Regenerate it before approval so the export matches the current project settings.</span></div>
          </div>
        )}

        {!outdated && preview.plan.warnings.map((warning) => (
          <div className="preview-outdated-notice" key={warning}>
            <TriangleAlert size={18} />
            <div><strong>Render plan notice</strong><span>{warning}</span></div>
          </div>
        ))}

        <dl className="review-metadata">
          <div><dt>Preset</dt><dd>{selectedVersion?.presetName ?? getPresetDisplayName(previewSettings)}</dd></div>
          <div><dt>Resolution</dt><dd>{preview.width} x {preview.height}</dd></div>
          <div><dt>Frame rate</dt><dd>{formatFrameRate(preview.frameRate)}</dd></div>
          <div><dt>Duration</dt><dd>{formatDuration(preview.duration)}</dd></div>
          <div><dt>Clips used</dt><dd>{preview.clipCount}</dd></div>
          <div><dt>Preview size</dt><dd>{formatFileSize(preview.fileSize)}</dd></div>
          <div><dt>Preview quality</dt><dd>{preview.previewQuality === 'full' ? 'Full Quality' : 'Fast'}</dd></div>
          <div><dt>Selection</dt><dd>{preview.plan.selectionMode === 'smart' ? 'Smart' : 'Classic'}</dd></div>
          <div><dt>Soundtrack</dt><dd>{preview.plan.audio.soundtrackTracks.filter((track) => track.enabled && !track.missing).length} tracks</dd></div>
          <div><dt>Pace</dt><dd>{preview.plan.pace}</dd></div>
          <div><dt>Target</dt><dd>{preview.plan.requestedDuration ? formatDuration(preview.plan.requestedDuration) : 'Auto'}</dd></div>
        </dl>

        <details className="edit-plan-details">
          <summary>Edit details</summary>
          <div className="edit-plan-list">
            {preview.plan.segments.map((segment, index) => (
              <div key={segment.id}>
                <span>{index + 1}</span>
                <strong title={segment.sourcePath}>{segment.filename}</strong>
                <small>{segment.start.toFixed(1)}s to {segment.end.toFixed(1)}s</small>
                {segment.selectedCandidate && (
                  <div className="selection-reasons">
                    {segment.selectedCandidate.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                    <details>
                      <summary>Scores</summary>
                      <code>{JSON.stringify(segment.selectedCandidate.scores, null, 2)}</code>
                      {segment.selectedCandidate.personAnalysis && <small>Person detected in {segment.selectedCandidate.personAnalysis.framesContainingPerson}/{segment.selectedCandidate.personAnalysis.sampledFrames} sampled frames · confidence {segment.selectedCandidate.personAnalysis.confidence.toFixed(2)}</small>}
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      </section>

      {exported && (
        <section className="export-summary" aria-label="Export complete">
          <div className="export-summary-copy">
            <span className="export-success-icon"><Check size={18} /></span>
            <div>
              <strong>Export Complete</strong>
              <span title={exported.outputPath}>{exported.outputPath}</span>
            </div>
          </div>
          <dl>
            <div><dt>Duration</dt><dd>{formatDuration(exported.duration)}</dd></div>
            <div><dt>Resolution</dt><dd>{exported.width} x {exported.height}</dd></div>
            <div><dt>FPS</dt><dd>{formatFrameRate(exported.frameRate)}</dd></div>
            <div><dt>File size</dt><dd>{formatFileSize(exported.fileSize)}</dd></div>
            <div><dt>Encoding</dt><dd>{exported.reusedPreview ? 'Preview reused' : 'Full quality render'}</dd></div>
          </dl>
          {exported.finalLoudness && (
            <details className="export-technical-details">
              <summary>Advanced export details</summary>
              <dl>
                <div><dt>Final mix normalization</dt><dd>{exported.finalLoudness.appliedMode}</dd></div>
                <div><dt>Target</dt><dd>{exported.finalLoudness.targetIntegrated} LUFS / {exported.finalLoudness.targetTruePeak} dBTP</dd></div>
                <div><dt>Measured</dt><dd>{exported.finalLoudness.measuredIntegrated == null ? 'Not available' : `${exported.finalLoudness.measuredIntegrated.toFixed(1)} LUFS`}</dd></div>
                <div><dt>True peak</dt><dd>{exported.finalLoudness.measuredTruePeak == null ? 'Not available' : `${exported.finalLoudness.measuredTruePeak.toFixed(1)} dBTP`}</dd></div>
              </dl>
              {exported.finalLoudness.fallbackReason && <small>Accurate measurement fell back to Fast: {exported.finalLoudness.fallbackReason}</small>}
            </details>
          )}
          <div className="export-summary-actions">
            <button className="button button-secondary" type="button" onClick={() => void window.autoCut.openFile(exported.outputPath)}>
              <ExternalLink size={16} /> Open File
            </button>
            <button className="button button-secondary" type="button" onClick={() => void window.autoCut.showItemInFolder(exported.outputPath)}>
              <FolderOpen size={16} /> Open Folder
            </button>
            <button className="button button-secondary" type="button" onClick={startProject}>New Project</button>
            <button className="button button-secondary" type="button" onClick={backToEdit}>Back to Project</button>
          </div>
        </section>
      )}

      <RenderDialog onCancel={cancel} />
    </main>
  )
}
