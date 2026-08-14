import { CheckCircle2, Clapperboard, Film, MonitorPlay } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

export function PreviewPanel(): React.JSX.Element {
  const selectedClip = useAppStore((state) => {
    return state.clips.find((clip) => clip.id === state.selectedClipId) ?? null
  })
  const renderResult = useAppStore((state) => state.renderResult)
  const previewMode = useAppStore((state) => state.previewMode)
  const setPreviewMode = useAppStore((state) => state.setPreviewMode)
  const showingOutput = previewMode === 'output' && renderResult
  const outputFilename = renderResult?.outputPath.split(/[\\/]/).pop() ?? 'Generated video.mp4'

  return (
    <section className="preview-panel" aria-label="Video preview">
      <div className="preview-toolbar">
        <div>
          <MonitorPlay size={17} />
          <h2>{showingOutput ? 'Output Preview' : 'Source Preview'}</h2>
        </div>
        <div className="preview-toolbar-right">
          {renderResult && (
            <div className="preview-tabs" role="tablist" aria-label="Preview source">
              <button
                type="button"
                role="tab"
                aria-selected={!showingOutput}
                onClick={() => setPreviewMode('source')}
              >Source</button>
              <button
                type="button"
                role="tab"
                aria-selected={Boolean(showingOutput)}
                onClick={() => setPreviewMode('output')}
              >Output</button>
            </div>
          )}
          <span title={showingOutput ? renderResult?.outputPath : selectedClip?.path}>
            {showingOutput ? outputFilename : selectedClip?.filename}
          </span>
        </div>
      </div>

      <div className="preview-stage">
        {showingOutput ? (
          <video key={renderResult.outputPath} src={renderResult.outputUrl} controls autoPlay preload="metadata" />
        ) : selectedClip ? (
          <video key={selectedClip.id} src={selectedClip.mediaUrl} controls preload="metadata" />
        ) : (
          <div className="preview-empty">
            <span><Clapperboard size={34} /></span>
            <h3>Select a clip to preview</h3>
            <p>Imported source footage appears in this player.</p>
          </div>
        )}
      </div>

      <div className="preview-inspector">
        {showingOutput ? (
          <>
            <div className="inspector-primary inspector-output">
              <CheckCircle2 size={18} />
              <div>
                <strong>{outputFilename}</strong>
                <span>H.264 / AAC finished video</span>
              </div>
            </div>
            <dl>
              <div><dt>Duration</dt><dd>{formatDuration(renderResult.duration)}</dd></div>
              <div><dt>Container</dt><dd>MP4</dd></div>
              <div><dt>Video</dt><dd>H.264</dd></div>
              <div><dt>Audio</dt><dd>AAC</dd></div>
              <div className="output-path-detail"><dt>Saved to</dt><dd title={renderResult.outputPath}>{renderResult.outputPath}</dd></div>
            </dl>
          </>
        ) : selectedClip ? (
          <>
            <div className="inspector-primary">
              <Film size={18} />
              <div>
                <strong>{selectedClip.filename}</strong>
                <span>{selectedClip.video.codec.toUpperCase()} source video</span>
              </div>
            </div>
            <dl>
              <div><dt>Duration</dt><dd>{formatDuration(selectedClip.duration)}</dd></div>
              <div><dt>Resolution</dt><dd>{selectedClip.video.width} x {selectedClip.video.height}</dd></div>
              <div><dt>Frame rate</dt><dd>{formatFrameRate(selectedClip.video.frameRate)}</dd></div>
              <div><dt>File size</dt><dd>{formatFileSize(selectedClip.size)}</dd></div>
              <div><dt>Audio</dt><dd>{selectedClip.hasAudio ? 'Available' : 'None'}</dd></div>
              <div><dt>Rotation</dt><dd>{selectedClip.video.rotation} deg</dd></div>
            </dl>
          </>
        ) : (
          <div className="inspector-placeholder">No clip selected</div>
        )}
      </div>
    </section>
  )
}
