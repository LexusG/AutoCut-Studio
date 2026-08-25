import { Pause, Play, RefreshCw, Square, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TranscriptionBatchScope, TranscriptionQueueProgress } from '@shared/types'
import { useAppStore } from '../stores/app-store'

function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`
}

export function TranscriptionQueuePanel(): React.JSX.Element {
  const clips = useAppStore((state) => state.clips)
  const transcripts = useAppStore((state) => state.transcripts)
  const plan = useAppStore((state) => state.editPlan)
  const projectId = useAppStore((state) => state.projectId)
  const settings = useAppStore((state) => state.projectSettings.transcription)
  const vocabulary = useAppStore((state) => state.userVocabulary)
  const complete = useAppStore((state) => state.completeTranscription)
  const [scope, setScope] = useState<TranscriptionBatchScope>('untranscribed')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(clips.map((clip) => clip.id)))
  const [queueId, setQueueId] = useState<string | null>(null)
  const [progress, setProgress] = useState<TranscriptionQueueProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.autoCut.onTranscriptionQueueProgress((incoming) => {
    if (!queueId || incoming.queueId === queueId) setProgress(incoming)
  }), [queueId])

  const failedIds = useMemo(() => new Set(progress?.items.filter((item) => item.state === 'failed').map((item) => item.clipId) ?? []), [progress])
  const chooseSources = () => clips.filter((clip) => {
    if (scope === 'selected') return selected.has(clip.id)
    if (scope === 'untranscribed') return !transcripts.some((transcript) => transcript.sourceClipId === clip.id)
    if (scope === 'edit-plan') return plan?.segments.some((segment) => segment.sourcePath === clip.path)
    if (scope === 'retry-failed') return failedIds.has(clip.id)
    return true
  }).map((clip) => ({ clipId: clip.id, path: clip.path, filename: clip.filename, duration: clip.duration, hasAudio: clip.hasAudio,
    ...(scope === 'edit-plan' ? { ranges: plan?.segments.filter((segment) => segment.sourcePath === clip.path).map((segment) => ({ start: segment.start, end: segment.end })) } : {}) }))

  const start = async (): Promise<void> => {
    const sources = chooseSources()
    if (!sources.length) { setError('No clips match this queue scope.'); return }
    const id = crypto.randomUUID(); setQueueId(id); setError(null); setProgress(null)
    try { complete(await window.autoCut.runTranscriptionQueue({ queueId: id, projectId, sources, settings, skipNoSpeech: scope === 'with-speech', vocabulary })) }
    catch (operationError) { setError(operationError instanceof Error ? operationError.message : 'The transcription queue failed.') }
    finally { setQueueId(null) }
  }

  return <div className="queue-layout">
    <aside className="queue-controls">
      <h3>Transcription Queue</h3>
      <label><span>Queue Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as TranscriptionBatchScope)}><option value="all">Transcribe All Clips</option><option value="selected">Transcribe Selected Clips</option><option value="untranscribed">Transcribe Untranscribed Clips</option><option value="edit-plan">Transcribe Edit Plan Only</option><option value="with-speech">Transcribe Clips With Speech</option><option value="retry-failed">Retry Failed</option></select></label>
      <p>Sequential processing is used by default. One Whisper model remains selected for the queue.</p>
      {!queueId ? <button className="button button-primary" type="button" onClick={() => void start()}><Play size={14} fill="currentColor" /> Start Queue</button> : <>
        <button className="button button-secondary" type="button" onClick={() => {
          const nextPaused = !progress?.paused
          setProgress((current) => current ? { ...current, paused: nextPaused } : current)
          void (nextPaused ? window.autoCut.pauseTranscriptionQueue(queueId) : window.autoCut.resumeTranscriptionQueue(queueId))
        }}>{progress?.paused ? <Play size={14} /> : <Pause size={14} />} {progress?.paused ? 'Resume' : 'Pause Queue'}</button>
        <button className="button button-secondary" type="button" onClick={() => void window.autoCut.cancelCurrentTranscriptionQueueItem(queueId)}><Square size={13} /> Cancel Current</button>
        <button className="button button-secondary" type="button" onClick={() => void window.autoCut.cancelAllTranscriptionQueueItems(queueId)}><X size={14} /> Cancel All</button>
      </>}
      {failedIds.size > 0 && !queueId && <button className="button button-secondary" type="button" onClick={() => setScope('retry-failed')}><RefreshCw size={14} /> Retry Failed ({failedIds.size})</button>}
      {progress && <div className="queue-overall"><strong>{progress.completed} / {progress.total}</strong><progress max={progress.total} value={progress.completed} /><span>{progress.paused ? 'Paused' : queueId ? 'Processing' : 'Finished'}</span></div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </aside>
    <section className="queue-list">
      <header><h3>Clips</h3><span>{clips.length} project clips</span></header>
      {clips.map((clip) => {
        const item = progress?.items.find((candidate) => candidate.clipId === clip.id)
        return <article className="queue-item" key={clip.id}><input aria-label={`Select ${clip.filename}`} type="checkbox" checked={selected.has(clip.id)} disabled={Boolean(queueId)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(clip.id); else next.delete(clip.id); return next })} /><div><strong>{clip.filename}</strong><span>{clock(clip.duration)} · {item?.model ?? 'Current model'}</span></div><div className={`queue-status queue-status-${item?.state ?? 'waiting'}`}><strong>{item?.state.replaceAll('-', ' ') ?? (transcripts.some((transcript) => transcript.sourceClipId === clip.id) ? 'complete' : 'waiting')}</strong><span>{item?.result ?? ''}</span></div>{item && <progress max="100" value={item.progress} />}</article>
      })}
    </section>
  </div>
}
