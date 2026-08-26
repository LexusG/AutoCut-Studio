import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Eye, Film, MonitorPlay } from 'lucide-react'
import type { CaptionHighlight } from '@shared/types'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

/**
 * Preview styling for the word currently being spoken.
 *
 * Mirrors the ASS override tags `serializeAss` emits so the preview and the burned-in
 * render agree on what each emphasis mode looks like.
 */
function emphasisStyle(behavior: CaptionHighlight, highlightColor: string): React.CSSProperties {
  switch (behavior) {
    case 'bold':
      return { fontWeight: 900 }
    case 'scale':
      return { fontWeight: 800, display: 'inline-block', transform: 'scale(1.1)' }
    case 'background':
      return { color: highlightColor, fontWeight: 800, textShadow: `0 0 6px ${highlightColor}` }
    case 'box-pop':
      return { background: highlightColor, color: '#111318', fontWeight: 900, padding: '0 .16em', borderRadius: '.14em' }
    case 'glow':
      return { color: highlightColor, fontWeight: 800, textShadow: `0 0 12px ${highlightColor}, 0 0 26px ${highlightColor}` }
    case 'underline':
      return { color: highlightColor, textDecoration: 'underline', textDecorationThickness: '.09em' }
    case 'karaoke-fill':
      return { color: highlightColor, fontWeight: 800 }
    default:
      return { color: highlightColor, fontWeight: 800 }
  }
}

export function PreviewPanel(): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pendingSeek = useRef<{ clipId: string; time: number } | null>(null)
  const [sourceTime, setSourceTime] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 360 })
  const selectedClip = useAppStore((state) =>
    state.clips.find((clip) => clip.id === state.selectedClipId) ?? null
  )
  const outputSettings = useAppStore((state) => state.projectSettings.output)
  const previewResult = useAppStore((state) => state.previewResult)
  const previewOutdated = useAppStore((state) => state.previewOutdated)
  const showReview = useAppStore((state) => state.showReview)
  const selectClip = useAppStore((state) => state.selectClip)
  const transcripts = useAppStore((state) => state.transcripts)
  const captions = useAppStore((state) => state.projectSettings.captions)

  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<{ clipId: string; time: number }>).detail
      if (!detail) return
      pendingSeek.current = detail
      selectClip(detail.clipId)
      if (selectedClip?.id === detail.clipId && videoRef.current) {
        videoRef.current.currentTime = detail.time
        void videoRef.current.play().catch(() => undefined)
      }
    }
    window.addEventListener('autocut-seek-source', listener)
    return () => window.removeEventListener('autocut-seek-source', listener)
  }, [selectClip, selectedClip?.id])

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

  const transcript = transcripts.find((item) => item.sourceClipId === selectedClip?.id)
  const activeWordIndex = transcript?.words.findIndex((word) => sourceTime >= word.start && sourceTime <= word.end) ?? -1
  const activeSegment = transcript?.segments.find((segment) => sourceTime >= segment.start && sourceTime <= segment.end)
  const dynamicWindow = captions.mode === 'dynamic' && transcript && activeWordIndex >= 0
    ? { words: transcript.words.slice(Math.max(0, activeWordIndex - 2), activeWordIndex + 3), active: activeWordIndex - Math.max(0, activeWordIndex - 2) }
    : null
  // The burned-in captions reveal words progressively, so the preview mirrors that window.
  const previewWords = dynamicWindow
    ? captions.wordDisplay === 'single'
      ? dynamicWindow.words.slice(dynamicWindow.active, dynamicWindow.active + 1)
      : captions.wordDisplay === 'cumulative'
        ? dynamicWindow.words.slice(0, dynamicWindow.active + 1)
        : dynamicWindow.words
    : activeSegment?.words ?? []
  const captionText = previewWords.length ? previewWords : activeSegment?.text ? [{ id: 'segment', text: activeSegment.text }] : []
  const activeWordId = dynamicWindow ? dynamicWindow.words[dynamicWindow.active]?.id ?? null : null

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
              ref={videoRef}
              key={selectedClip.id}
              src={selectedClip.mediaUrl}
              controls
              preload="metadata"
              style={{ objectFit: outputSettings.fitMode === 'fit' ? 'contain' : 'cover' }}
              onTimeUpdate={(event) => {
                const time = event.currentTarget.currentTime
                setSourceTime(time)
                window.dispatchEvent(new CustomEvent('autocut-source-time', { detail: { clipId: selectedClip.id, time } }))
              }}
              onLoadedMetadata={(event) => {
                if (pendingSeek.current?.clipId === selectedClip.id) {
                  event.currentTarget.currentTime = pendingSeek.current.time
                  pendingSeek.current = null
                }
              }}
            />
          ) : (
            <div className="preview-empty">
              <span><Clapperboard size={34} /></span>
              <h3>Select a clip to preview</h3>
              <p>Imported source footage appears in this output frame.</p>
            </div>
          )}
          {captions.safeAreaVisible && <div className={`safe-area-overlay safe-area-${captions.safeAreaPreset}`} aria-hidden="true"><span /></div>}
          {captions.mode !== 'off' && captionText.length > 0 && (
            <div
              key={captions.animation === 'none' ? 'static' : activeWordId ?? activeSegment?.id ?? 'static'}
              className={`caption-preview caption-position-${captions.style.position} caption-animation-${captions.animation}`}
              style={{
                color: captions.style.textColor,
                fontFamily: captions.style.fontFamily,
                fontSize: Math.max(10, captions.style.fontSize * canvasSize.height / outputSettings.height),
                fontWeight: captions.style.fontWeight,
                maxWidth: `${captions.style.maximumWidth}%`,
                textAlign: captions.style.alignment,
                background: captions.style.backgroundEnabled ? `rgba(0,0,0,${captions.style.backgroundOpacity})` : 'transparent',
                WebkitTextStroke: captions.style.outline ? `${Math.max(0.5, captions.style.outline * canvasSize.height / outputSettings.height)}px #000` : undefined,
                boxShadow: captions.style.shadow ? '0 2px 8px rgba(0,0,0,.5)' : undefined
              }}
            >
              {captionText.map((word, index) => {
                const active = captions.highlightSpokenWord && 'start' in word && sourceTime >= word.start && sourceTime <= word.end
                // The separator stays outside the span so an emphasis box hugs the word.
                return (
                  <span key={word.id}>
                    <span
                      className={active ? `caption-word-active caption-emphasis-${captions.highlightBehavior}` : undefined}
                      style={active ? emphasisStyle(captions.highlightBehavior, captions.style.highlightColor) : undefined}
                    >{word.text}</span>{index < captionText.length - 1 ? ' ' : ''}
                  </span>
                )
              })}
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
