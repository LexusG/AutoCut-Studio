import { useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, LoaderCircle, Music2, Trash2, Upload } from 'lucide-react'
import type { SoundtrackTrack } from '@shared/types'
import { useAudioImport } from '../hooks/use-audio-import'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize } from '../utils/format'

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }): React.JSX.Element {
  return <label className="settings-toggle-row"><span><strong>{label}</strong></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}

export function AudioPanel(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [replacementError, setReplacementError] = useState<string | null>(null)
  const audio = useAppStore((state) => state.projectSettings.audio)
  const updateAudio = useAppStore((state) => state.updateAudio)
  const { browse, importPath, loading, error, clearError } = useAudioImport()
  const soundtrack = audio.soundtrack

  const updateSoundtrack = (patch: Partial<typeof soundtrack>): void =>
    updateAudio('soundtrack', { ...soundtrack, ...patch })
  const updateTrack = (id: string, patch: Partial<SoundtrackTrack>): void =>
    updateSoundtrack({ tracks: soundtrack.tracks.map((track) => track.id === id ? { ...track, ...patch } : track) })
  const removeTrack = (id: string): void =>
    updateSoundtrack({ tracks: soundtrack.tracks.filter((track) => track.id !== id) })
  const moveTrack = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= soundtrack.tracks.length) return
    const tracks = [...soundtrack.tracks]
    ;[tracks[index], tracks[target]] = [tracks[target], tracks[index]]
    updateSoundtrack({ tracks })
  }
  const locateTrack = async (track: SoundtrackTrack): Promise<void> => {
    const path = await window.autoCut.chooseAudioFile()
    if (!path) return
    const result = await window.autoCut.importAudioFile(path)
    if (!result.track) {
      setReplacementError(result.error ?? `Could not replace ${track.filename}.`)
      return
    }
    const replacement: SoundtrackTrack = {
      ...result.track,
      id: track.id,
      enabled: track.enabled,
      volume: track.volume,
      startPosition: Math.min(track.startPosition, Math.max(0, result.track.duration - 0.05)),
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut
    }
    updateSoundtrack({
      tracks: soundtrack.tracks.map((item) => item.id === track.id ? replacement : item)
    })
    if (audio.backgroundTrack?.id === track.id) updateAudio('backgroundTrack', result.track)
    setReplacementError(null)
  }
  const handleDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void importPath(window.autoCut.getPathForFile(file))
  }

  return (
    <details className="settings-details" open>
      <summary><Music2 size={14} /> Soundtrack <ChevronDown size={13} /></summary>
      <div className="settings-details-body">
        <div
          className={`audio-drop-zone audio-drop-zone-compact ${dragging ? 'audio-drop-zone-active' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={handleDrop}
        >
          {loading ? <LoaderCircle className="spin" size={18} /> : <Upload size={17} />}
          <strong>{loading ? 'Analyzing audio' : 'Add music track'}</strong>
          <button type="button" onClick={() => void browse()} disabled={loading}>Browse audio</button>
        </div>

        {(error || replacementError) && <div className="audio-error" role="alert"><AlertTriangle size={14} /><span>{error ?? replacementError}</span><button type="button" onClick={() => { clearError(); setReplacementError(null) }}>Dismiss</button></div>}

        <div className="soundtrack-list">
          {soundtrack.tracks.map((track, index) => (
            <div className={`audio-card soundtrack-track ${!track.enabled ? 'soundtrack-track-disabled' : ''}`} key={track.id}>
              <div className="audio-card-title">
                <span className="track-order">{index + 1}</span>
                <div><strong title={track.path}>{track.filename}</strong><small>{formatDuration(track.duration)} · {formatFileSize(track.size)}</small></div>
                <div className="track-order-actions">
                  <button type="button" onClick={() => moveTrack(index, -1)} disabled={index === 0} title="Move Up" aria-label={`Move ${track.filename} up`}><ArrowUp size={13} /></button>
                  <button type="button" onClick={() => moveTrack(index, 1)} disabled={index === soundtrack.tracks.length - 1} title="Move Down" aria-label={`Move ${track.filename} down`}><ArrowDown size={13} /></button>
                  <button type="button" onClick={() => removeTrack(track.id)} title="Remove Track" aria-label={`Remove ${track.filename}`}><Trash2 size={13} /></button>
                </div>
              </div>
              {track.missing
                ? <div className="track-missing"><AlertTriangle size={13} /><span>Audio file missing</span><button type="button" onClick={() => void locateTrack(track)}>Locate File</button></div>
                : <audio src={track.mediaUrl} controls preload="metadata" />}
              <ToggleRow label="Enabled" checked={track.enabled} onChange={(enabled) => updateTrack(track.id, { enabled })} />
              <label className="range-setting"><span>Track Volume <strong>{track.volume}%</strong></span><input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} /></label>
              <label className="setting-field setting-field-number"><span>Start offset</span><div><input type="number" min="0" max={track.duration} step="0.1" value={track.startPosition} onChange={(event) => updateTrack(track.id, { startPosition: Math.max(0, Number(event.target.value)) })} /><small>sec</small></div></label>
              <div className="track-fades">
                <label><input type="checkbox" checked={track.fadeIn.enabled} onChange={(event) => updateTrack(track.id, { fadeIn: { ...track.fadeIn, enabled: event.target.checked } })} /> Fade in</label>
                <label><input type="checkbox" checked={track.fadeOut.enabled} onChange={(event) => updateTrack(track.id, { fadeOut: { ...track.fadeOut, enabled: event.target.checked } })} /> Fade out</label>
              </div>
            </div>
          ))}
        </div>

        <ToggleRow label="Soundtrack Enabled" checked={soundtrack.enabled} onChange={(enabled) => updateSoundtrack({ enabled })} />
        <label className="range-setting"><span>Master Music Volume <strong>{soundtrack.masterVolume}%</strong></span><input type="range" min="0" max="100" value={soundtrack.masterVolume} onChange={(event) => updateSoundtrack({ masterVolume: Number(event.target.value) })} /></label>
        <ToggleRow label="Loop Soundtrack" checked={soundtrack.loop} onChange={(loop) => updateSoundtrack({ loop })} />
        <ToggleRow label="Crossfade Music Tracks" checked={soundtrack.crossfadeEnabled} onChange={(crossfadeEnabled) => updateSoundtrack({ crossfadeEnabled })} />
        {soundtrack.crossfadeEnabled && <label className="setting-field setting-field-number"><span>Crossfade</span><div><input type="number" min="0" max="5" step="0.1" value={soundtrack.crossfadeDuration} onChange={(event) => updateSoundtrack({ crossfadeDuration: Math.max(0, Number(event.target.value)) })} /><small>sec</small></div></label>}

        <ToggleRow label="Preserve Original Clip Audio" checked={audio.preserveOriginalAudio} onChange={(value) => updateAudio('preserveOriginalAudio', value)} />
        <label className={`range-setting ${!audio.preserveOriginalAudio ? 'setting-disabled' : ''}`}><span>Original Clip Audio Volume <strong>{audio.originalAudioVolume}%</strong></span><input type="range" min="0" max="100" value={audio.originalAudioVolume} disabled={!audio.preserveOriginalAudio} onChange={(event) => updateAudio('originalAudioVolume', Number(event.target.value))} /></label>
        <label className="stacked-setting"><span>Audio normalization</span><select value={audio.normalizationMode} onChange={(event) => updateAudio('normalizationMode', event.target.value as typeof audio.normalizationMode)}><option value="off">Off</option><option value="fast">Fast</option><option value="accurate">Accurate</option></select></label>
        <label className="stacked-setting"><span>Final mix normalization</span><select value={audio.finalMixNormalizationMode} onChange={(event) => updateAudio('finalMixNormalizationMode', event.target.value as typeof audio.finalMixNormalizationMode)}><option value="off">Off</option><option value="fast">Fast</option><option value="accurate">Accurate</option></select></label>
        <ToggleRow label="Lower Music During Clip Audio" checked={audio.duckMusicDuringClipAudio} onChange={(value) => updateAudio('duckMusicDuringClipAudio', value)} />
        {audio.duckMusicDuringClipAudio && (
          <label className="stacked-setting"><span>Ducking trigger</span><select value={audio.duckingTrigger} onChange={(event) => updateAudio('duckingTrigger', event.target.value as typeof audio.duckingTrigger)}><option value="automatic">Automatic</option><option value="audio-level">Audio Level</option><option value="speech-detection">Speech Detection</option></select></label>
        )}
      </div>
    </details>
  )
}
