import { Download, LoaderCircle, Merge, Play, Sparkles, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { SpeakerCountSetting } from '@shared/types'
import { useAppStore } from '../stores/app-store'

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`
}

export function SpeakersPanel(): React.JSX.Element {
  const projectId = useAppStore((state) => state.projectId)
  const clips = useAppStore((state) => state.clips)
  const transcripts = useAppStore((state) => state.transcripts)
  const settings = useAppStore((state) => state.projectSettings.speakers)
  const status = useAppStore((state) => state.diarizationStatus)
  const results = useAppStore((state) => state.diarizationResults)
  const labels = useAppStore((state) => state.speakerLabels)
  const progress = useAppStore((state) => state.diarizationProgress)
  const jobId = useAppStore((state) => state.activeDiarizationJobId)
  const error = useAppStore((state) => state.diarizationError)
  const setStatus = useAppStore((state) => state.setDiarizationStatus)
  const begin = useAppStore((state) => state.beginDiarization)
  const setProgress = useAppStore((state) => state.setDiarizationProgress)
  const complete = useAppStore((state) => state.completeDiarization)
  const fail = useAppStore((state) => state.failDiarization)
  const updateSettings = useAppStore((state) => state.updateSpeakerSettings)
  const rename = useAppStore((state) => state.renameSpeaker)
  const merge = useAppStore((state) => state.mergeSpeakers)
  const splitOccurrence = useAppStore((state) => state.splitSpeakerOccurrence)
  const [countMode, setCountMode] = useState(String(settings.speakerCount))
  const [customCount, setCustomCount] = useState(typeof settings.speakerCount === 'number' ? settings.speakerCount : 5)

  useEffect(() => {
    void window.autoCut.getDiarizationStatus().then(setStatus)
    const removeProgress = window.autoCut.onDiarizationProgress(setProgress)
    const removeModelProgress = window.autoCut.onDiarizationModelProgress(() => void window.autoCut.getDiarizationStatus().then(setStatus))
    return () => { removeProgress(); removeModelProgress() }
  }, [setProgress, setStatus])

  const speakerCount = (): SpeakerCountSetting => countMode === 'auto' ? 'auto' : countMode === 'custom' ? customCount : Number(countMode)
  const run = async (): Promise<void> => {
    const id = crypto.randomUUID()
    const requested = speakerCount()
    updateSettings({ diarizationEnabled: true, speakerCount: requested })
    begin(id)
    try {
      const response = await window.autoCut.diarize({
        jobId: id, projectId, speakerCount: requested,
        sources: clips.map((clip) => ({ clipId: clip.id, path: clip.path, filename: clip.filename, duration: clip.duration, hasAudio: clip.hasAudio }))
      }, transcripts)
      complete(response.results, response.references, response.transcripts)
      setStatus(await window.autoCut.getDiarizationStatus())
    } catch (operationError) { fail(operationError instanceof Error ? operationError.message : 'Speaker detection failed.') }
  }

  const summaries = useMemo(() => labels.filter((label) => !label.mergedInto).map((label) => {
    const ids = new Set([label.speakerId, ...labels.filter((item) => item.mergedInto === label.speakerId).map((item) => item.speakerId)])
    const regions = results.flatMap((result) => result.segments.map((segment) => ({ ...segment, sourceClipId: result.sourceClipId })))
      .filter((segment) => ids.has(segment.speakerId))
    const excerpts = transcripts.flatMap((transcript) => transcript.segments.filter((segment) => segment.speakerId && ids.has(segment.speakerId)).map((segment) => segment.text)).slice(0, 3)
    return { label, regions, excerpts, duration: regions.reduce((sum, region) => sum + region.end - region.start, 0) }
  }), [labels, results, transcripts])

  return <div className="speakers-layout">
    <aside className="speaker-controls">
      <h3>Local Speaker Detection</h3>
      <div className="model-status"><span>Speaker Diarization</span><strong>sherpa-onnx · Pyannote 3</strong><small className={`status-${status?.state ?? 'unavailable'}`}>{status?.state === 'ready' ? 'Installed and offline ready' : status?.state === 'loading' ? `Loading ${Math.round(status.downloadProgress ?? 0)}%` : status?.state === 'not-installed' ? 'Not Installed' : 'Unavailable'}</small><p>Anonymous speaker labels only. No identity recognition.</p>
        {status?.state === 'not-installed' && <button className="button button-secondary" type="button" onClick={async () => setStatus(await window.autoCut.installDiarizationModels())}><Download size={14} /> Install Models ({Math.round(status.approximateBytes / 1_000_000)} MB)</button>}
        {status?.state === 'ready' && !jobId && <button className="button button-secondary" type="button" onClick={async () => { await window.autoCut.removeDiarizationModels(); setStatus(await window.autoCut.getDiarizationStatus()) }}><Trash2 size={14} /> Remove Models</button>}
      </div>
      <label><span>Speaker Count</span><select value={countMode} onChange={(event) => setCountMode(event.target.value)}><option value="auto">Auto</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="custom">Custom</option></select></label>
      {countMode === 'custom' && <label><span>Custom Count</span><input type="number" min="1" max="20" value={customCount} onChange={(event) => setCustomCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>}
      <button className="button button-primary" type="button" disabled={status?.state !== 'ready' || !clips.length || Boolean(jobId)} onClick={() => void run()}><Sparkles size={14} /> Detect Speakers</button>
      {jobId && <button className="button button-secondary" type="button" onClick={() => void window.autoCut.cancelDiarization(jobId)}><X size={14} /> Cancel</button>}
      {progress && <div className="transcription-progress"><LoaderCircle className="spin" size={15} /><strong>{progress.state}</strong><span>{progress.currentClip} · {Math.round(progress.percent)}%</span><progress max="100" value={progress.percent} /></div>}
      <label className="control-check"><input type="checkbox" checked={settings.showSpeakerNamesInCaptions} onChange={(event) => updateSettings({ showSpeakerNamesInCaptions: event.target.checked })} /><span>Show Speaker Names in Captions</span></label>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </aside>
    <section className="speaker-review">
      <header><div><h3>Review Speakers</h3><span>{summaries.length} anonymous speaker{summaries.length === 1 ? '' : 's'}</span></div></header>
      {!summaries.length && <div className="transcript-empty"><Users size={28} /><strong>No speaker analysis</strong><span>Transcribe clips, then detect and review anonymous speakers.</span></div>}
      {summaries.map(({ label, regions, excerpts, duration }) => <article className="speaker-row" key={label.speakerId}>
        <div className={`speaker-accent ${label.accent}`} />
        <div className="speaker-row-copy"><input aria-label={`Rename ${label.displayName}`} value={label.displayName} onChange={(event) => rename(label.speakerId, event.target.value)} /><span>{clock(duration)} speaking · {regions.length} region{regions.length === 1 ? '' : 's'}</span><p>{excerpts[0] ?? 'No aligned transcript excerpt.'}</p></div>
        <div className="speaker-actions">
          <button type="button" disabled={!regions[0]} onClick={() => {
            const region = regions[0]
            if (region) window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId: region.sourceClipId, time: region.start } }))
          }}><Play size={13} /> Sample</button>
          <label><Merge size={12} /><select aria-label={`Merge ${label.displayName}`} value="" onChange={(event) => { if (event.target.value) merge(label.speakerId, event.target.value) }}><option value="">Merge into...</option>{summaries.filter((item) => item.label.speakerId !== label.speakerId).map((item) => <option value={item.label.speakerId} key={item.label.speakerId}>{item.label.displayName}</option>)}</select></label>
          {regions[0] && <button type="button" title="Split this occurrence into a new manual speaker" onClick={() => {
            splitOccurrence(label.speakerId, regions[0].sourceClipId, regions[0].id)
            setTimeout(() => {
              const transcript = useAppStore.getState().transcripts.find((item) => item.sourceClipId === regions[0].sourceClipId)
              if (transcript) void window.autoCut.updateTranscript(transcript)
            }, 0)
          }}>Split Occurrence</button>}
        </div>
      </article>)}
    </section>
  </div>
}
