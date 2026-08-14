import { Clapperboard, Film, MonitorPlay } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

export function PreviewPanel(): React.JSX.Element {
  const selectedClip = useAppStore((state) => {
    return state.clips.find((clip) => clip.id === state.selectedClipId) ?? null
  })

  return (
    <section className="preview-panel" aria-label="Video preview">
      <div className="preview-toolbar">
        <div>
          <MonitorPlay size={17} />
          <h2>Source Preview</h2>
        </div>
        {selectedClip && <span title={selectedClip.path}>{selectedClip.filename}</span>}
      </div>

      <div className="preview-stage">
        {selectedClip ? (
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
