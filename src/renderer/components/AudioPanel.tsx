import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, FolderSearch, LoaderCircle, Music2, Trash2, Upload } from 'lucide-react'
import { useAudioImport } from '../hooks/use-audio-import'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize } from '../utils/format'

function ToggleRow({
  label,
  checked,
  onChange,
  detail
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  detail?: string
}): React.JSX.Element {
  return (
    <label className="settings-toggle-row">
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function AudioPanel(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audio = useAppStore((state) => state.projectSettings.audio)
  const updateAudio = useAppStore((state) => state.updateAudio)
  const setBackgroundTrack = useAppStore((state) => state.setBackgroundTrack)
  const { browse, importPath, loading, error, clearError } = useAudioImport()
  const track = audio.backgroundTrack

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audio.musicVolume / 100
  }, [audio.musicVolume, track?.id])

  const handleDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void importPath(window.autoCut.getPathForFile(file))
  }

  return (
    <details className="settings-details" open>
      <summary><Music2 size={14} /> Audio <ChevronDown size={13} /></summary>
      <div className="settings-details-body">
        {!track && (
          <div
            className={`audio-drop-zone ${dragging ? 'audio-drop-zone-active' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragging(false)
            }}
            onDrop={handleDrop}
          >
            {loading ? <LoaderCircle className="spin" size={20} /> : <Upload size={19} />}
            <strong>{loading ? 'Analyzing audio' : 'Add background audio'}</strong>
            <span>MP3, WAV, AAC, M4A, OGG, FLAC</span>
            <button type="button" onClick={() => void browse()} disabled={loading}>Browse audio</button>
          </div>
        )}

        {error && (
          <div className="audio-error" role="alert">
            <AlertTriangle size={14} /><span>{error}</span>
            <button type="button" onClick={clearError}>Dismiss</button>
          </div>
        )}

        {track?.missing && (
          <div className="missing-audio" role="alert">
            <AlertTriangle size={18} />
            <div><strong>Audio file missing</strong><span>{track.filename}</span></div>
            <button className="icon-button" type="button" onClick={() => void browse()} title="Locate File" aria-label="Locate File">
              <FolderSearch size={15} />
            </button>
            <button className="icon-button" type="button" onClick={() => setBackgroundTrack(null)} title="Remove Audio" aria-label="Remove Audio">
              <Trash2 size={15} />
            </button>
          </div>
        )}

        {track && !track.missing && (
          <div className="audio-card">
            <div className="audio-card-title">
              <span><Music2 size={16} /></span>
              <div><strong title={track.path}>{track.filename}</strong><small>{track.codec.toUpperCase()} • {formatDuration(track.duration)} • {formatFileSize(track.size)}</small></div>
              <button type="button" onClick={() => setBackgroundTrack(null)} title="Remove Audio" aria-label="Remove Audio">
                <Trash2 size={14} />
              </button>
            </div>
            <audio ref={audioRef} src={track.mediaUrl} controls preload="metadata" />
            <div className="audio-technical">
              <span>{track.sampleRate ? `${Math.round(track.sampleRate / 1000)} kHz` : 'Unknown rate'}</span>
              <span>{track.channels ? `${track.channels} channels` : 'Unknown channels'}</span>
              <span>{track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : 'Variable bitrate'}</span>
            </div>
          </div>
        )}

        <label className="range-setting">
          <span>Background Music Volume <strong>{audio.musicVolume}%</strong></span>
          <input type="range" min="0" max="100" value={audio.musicVolume} onChange={(event) => updateAudio('musicVolume', Number(event.target.value))} />
        </label>
        <ToggleRow label="Preserve Original Clip Audio" checked={audio.preserveOriginalAudio} onChange={(value) => updateAudio('preserveOriginalAudio', value)} />
        <label className={`range-setting ${!audio.preserveOriginalAudio ? 'setting-disabled' : ''}`}>
          <span>Original Clip Audio Volume <strong>{audio.originalAudioVolume}%</strong></span>
          <input type="range" min="0" max="100" value={audio.originalAudioVolume} disabled={!audio.preserveOriginalAudio} onChange={(event) => updateAudio('originalAudioVolume', Number(event.target.value))} />
        </label>
        <ToggleRow label="Normalize Clip Audio" checked={audio.normalizeClipAudio} onChange={(value) => updateAudio('normalizeClipAudio', value)} />
        <ToggleRow label="Loop Background Music" checked={audio.loopBackgroundMusic} onChange={(value) => updateAudio('loopBackgroundMusic', value)} />
        <label className="setting-field setting-field-number">
          <span>Music start</span>
          <div><input type="number" min="0" step="0.1" value={audio.musicStartPosition} onChange={(event) => updateAudio('musicStartPosition', Math.max(0, Number(event.target.value)))} /><small>sec</small></div>
        </label>
        <div className="fade-settings">
          <ToggleRow label="Fade Music In" checked={audio.fadeIn.enabled} onChange={(enabled) => updateAudio('fadeIn', { ...audio.fadeIn, enabled })} />
          <label><span>Duration</span><input type="number" min="0" step="0.1" value={audio.fadeIn.duration} onChange={(event) => updateAudio('fadeIn', { ...audio.fadeIn, duration: Math.max(0, Number(event.target.value)) })} /></label>
          <ToggleRow label="Fade Music Out" checked={audio.fadeOut.enabled} onChange={(enabled) => updateAudio('fadeOut', { ...audio.fadeOut, enabled })} />
          <label><span>Duration</span><input type="number" min="0" step="0.1" value={audio.fadeOut.duration} onChange={(event) => updateAudio('fadeOut', { ...audio.fadeOut, duration: Math.max(0, Number(event.target.value)) })} /></label>
        </div>
        <ToggleRow label="Lower Music During Clip Audio" checked={audio.duckMusicDuringClipAudio} onChange={(value) => updateAudio('duckMusicDuringClipAudio', value)} />
      </div>
    </details>
  )
}
