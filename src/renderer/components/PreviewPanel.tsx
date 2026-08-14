import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Eye, Film, MonitorPlay } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

export function PreviewPanel(): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 360 })
  const selectedClip = useAppStore((state) =>
    state.clips.find((clip) => clip.id === state.selectedClipId) ?? null
  )
  const outputSettings = useAppStore((state) => state.projectSettings.output)
  const previewResult = useAppStore((state) => state.previewResult)
  const previewOutdated = useAppStore((state) => state.previewOutdated)
  const showReview = useAppStore((state) => state.showReview)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const updateSize = (): void => {
      const availableWidth = Math.max(120, stage.clientWidth - 48)
      const availableHeight = Math.max(120, stage.clientHeight - 48)
      const ratio = outputSettings.width / outputSettings.height
      const availableRatio = availableWidth / availableHeight
      if (availableRatio > ratio) {
        setCanvasSize({ width: availableHeight * ratio, height: availableHeight })
      } else {
        setCanvasSize({ width: availableWidth, height: availableWidth / ratio })
      }
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    updateSize()
    return () => observer.disconnect()
  }, [outputSettings.height, outputSettings.width])

  return (
    <section className="preview-panel" aria-label="Source preview">
      <div className="preview-toolbar">
        <div><MonitorPlay size={17} /><h2>Source Preview</h2></div>
        <div className="preview-toolbar-right">
          {previewResult && (
            <button className="review-preview-link" type="button" onClick={showReview}>
              <Eye size={15} /> {previewOutdated ? 'Review Outdated Preview' : 'Review Preview'}
            </button>
          )}
          <span title={selectedClip?.path}>{selectedClip?.filename}</span>
        </div>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <div
          className="preview-canvas"
          data-aspect-ratio={outputSettings.aspectRatio}
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          {selectedClip ? (
            <video
              key={selectedClip.id}
              src={selectedClip.mediaUrl}
              controls
              preload="metadata"
              style={{ objectFit: outputSettings.fitMode === 'fit' ? 'contain' : 'cover' }}
            />
          ) : (
            <div className="preview-empty">
              <span><Clapperboard size={34} /></span>
              <h3>Select a clip to preview</h3>
              <p>Imported source footage appears in this output frame.</p>
            </div>
          )}
          <span className="preview-canvas-label">
            {outputSettings.width} × {outputSettings.height}
          </span>
        </div>
      </div>

      <div className="preview-inspector">
        {selectedClip ? (
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
