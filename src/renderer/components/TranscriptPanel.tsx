import { useEffect, useMemo, useState } from 'react'
import {
  Captions, Check, Download, FileText, LoaderCircle, Pause, RotateCcw,
  Scissors, Search, Sparkles, Trash2, X
} from 'lucide-react'
import type {
  CaptionChunk, CaptionSettings, CaptionStylePreset, Transcript,
  TranscriptTextEdit, TranscriptWord, TranscriptionScope
} from '@shared/types'
import { removeTranscriptRange, restoreTranscriptRange } from '@shared/utils/transcript-edit'
import { useAppStore } from '../stores/app-store'
import { SemanticPanel } from './SemanticPanel'
import { TopicsPanel } from './TopicsPanel'
import { HighlightsPanel } from './HighlightsPanel'
import { VersionsPanel } from './VersionsPanel'

function modelFor(quality: string, language: string): string {
  const base = quality === 'fast' ? 'tiny' : quality === 'accurate' ? 'small' : 'base'
  return language === 'english' ? `${base}.en` : base
}

function stylePreset(preset: CaptionStylePreset): Partial<CaptionSettings['style']> {
  if (preset === 'bold') return { preset, fontSize: 68, fontWeight: 800, backgroundEnabled: true, outline: 2, shadow: 2 }
  if (preset === 'minimal') return { preset, fontSize: 38, fontWeight: 500, backgroundEnabled: false, outline: 1, shadow: 1 }
  if (preset === 'highlight') return { preset, fontSize: 62, fontWeight: 700, backgroundEnabled: false, outline: 3, shadow: 2 }
  return { preset, fontSize: 48, fontWeight: 600, backgroundEnabled: true, outline: 2, shadow: 1 }
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

function seek(clipId: string, time: number): void {
  window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId, time } }))
}

function rangesForPlan(path: string): Array<{ start: number; end: number }> {
  const plan = useAppStore.getState().editPlan
  return plan?.segments.filter((segment) => segment.sourcePath === path)
    .map((segment) => ({ start: segment.start, end: segment.end })) ?? []
}

function CaptionInspector({ chunks }: { chunks: CaptionChunk[] }): React.JSX.Element {
  const setCaptionTrack = useAppStore((state) => state.setCaptionTrack)
  const plan = useAppStore((state) => state.editPlan)
  const mutate = (next: CaptionChunk[]): void => {
    if (!plan?.captionTrack) return
    setCaptionTrack({ ...plan.captionTrack, chunks: next, revision: plan.captionTrack.revision + 1 })
  }
  const update = (id: string, patch: Partial<CaptionChunk>): void => mutate(chunks.map((chunk) =>
    chunk.id === id ? { ...chunk, ...patch } : chunk
  ))
  const split = (chunk: CaptionChunk): void => {
    if (chunk.words.length < 2) return
    const midpoint = Math.ceil(chunk.words.length / 2)
    const left = chunk.words.slice(0, midpoint)
    const right = chunk.words.slice(midpoint)
    const replacement: CaptionChunk[] = [
      { ...chunk, id: `${chunk.id}-a`, end: right[0].start, words: left, text: left.map((word) => word.text).join(' ') },
      { ...chunk, id: `${chunk.id}-b`, start: right[0].start, words: right, text: right.map((word) => word.text).join(' ') }
    ]
    mutate(chunks.flatMap((item) => item.id === chunk.id ? replacement : [item]))
  }
  const merge = (index: number): void => {
    if (index >= chunks.length - 1) return
    const left = chunks[index]
    const right = chunks[index + 1]
    const merged = { ...left, end: right.end, text: `${left.text} ${right.text}`, words: [...left.words, ...right.words] }
    mutate(chunks.flatMap((item, itemIndex) => itemIndex === index ? [merged] : itemIndex === index + 1 ? [] : [item]))
  }
  return (
    <div className="caption-inspector-list">
      {chunks.map((chunk, index) => (
        <article className={chunk.deleted ? 'caption-inspector-item caption-inspector-deleted' : 'caption-inspector-item'} key={chunk.id}>
          <div className="caption-time-fields">
            <input aria-label="Caption start" type="number" step="0.05" min={index === 0 ? 0 : chunks[index - 1].end} max={chunk.end - 0.05} value={Number(chunk.start.toFixed(3))} onChange={(event) => update(chunk.id, { start: Math.max(index === 0 ? 0 : chunks[index - 1].end, Math.min(chunk.end - 0.05, Number(event.target.value))) })} />
            <span>to</span>
            <input aria-label="Caption end" type="number" step="0.05" min={chunk.start + 0.05} max={chunks[index + 1]?.start} value={Number(chunk.end.toFixed(3))} onChange={(event) => update(chunk.id, { end: Math.max(chunk.start + 0.05, Math.min(chunks[index + 1]?.start ?? Number.POSITIVE_INFINITY, Number(event.target.value))) })} />
          </div>
          <input aria-label="Caption text" value={chunk.text} onChange={(event) => update(chunk.id, { text: event.target.value })} />
          <div className="caption-row-actions">
            <button type="button" disabled={chunk.words.length < 2} onClick={() => split(chunk)}>Split</button>
            <button type="button" disabled={index === chunks.length - 1} onClick={() => merge(index)}>Merge</button>
            <button type="button" title={chunk.deleted ? 'Restore caption' : 'Delete caption'} onClick={() => update(chunk.id, { deleted: !chunk.deleted })}>
              {chunk.deleted ? <RotateCcw size={14} /> : <Trash2 size={14} />}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

export function TranscriptPanel({ open, close }: { open: boolean; close: () => void }): React.JSX.Element | null {
  const clips = useAppStore((state) => state.clips)
  const selectedClipId = useAppStore((state) => state.selectedClipId)
  const projectId = useAppStore((state) => state.projectId)
  const settings = useAppStore((state) => state.projectSettings)
  const plan = useAppStore((state) => state.editPlan)
  const transcripts = useAppStore((state) => state.transcripts)
  const status = useAppStore((state) => state.transcriptionStatus)
  const progress = useAppStore((state) => state.transcriptionProgress)
  const jobId = useAppStore((state) => state.activeTranscriptionJobId)
  const error = useAppStore((state) => state.transcriptionError)
  const textEdits = useAppStore((state) => state.textEdits)
  const setStatus = useAppStore((state) => state.setTranscriptionStatus)
  const begin = useAppStore((state) => state.beginTranscription)
  const setProgress = useAppStore((state) => state.setTranscriptionProgress)
  const complete = useAppStore((state) => state.completeTranscription)
  const fail = useAppStore((state) => state.failTranscription)
  const replaceTranscript = useAppStore((state) => state.replaceTranscript)
  const correctWord = useAppStore((state) => state.correctTranscriptWord)
  const updateTranscriptionSettings = useAppStore((state) => state.updateTranscriptionSettings)
  const updateCaptionSettings = useAppStore((state) => state.updateCaptionSettings)
  const setCaptionTrack = useAppStore((state) => state.setCaptionTrack)
  const updatePlan = useAppStore((state) => state.updateEditPlan)
  const addTextEdit = useAppStore((state) => state.addTextEdit)
  const restoreTextEdit = useAppStore((state) => state.restoreTextEdit)
  const addSemanticHint = useAppStore((state) => state.addSemanticHint)
  const [tab, setTab] = useState<'transcript' | 'captions' | 'semantic' | 'topics' | 'highlights' | 'versions'>('transcript')
  const [scope, setScope] = useState<TranscriptionScope>('all-clips')
  const [query, setQuery] = useState('')
  const [editingWord, setEditingWord] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ transcriptId: string; anchor: string; focus: string } | null>(null)
  const [pauseThreshold, setPauseThreshold] = useState(1)
  const [playback, setPlayback] = useState<{ clipId: string; time: number } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void window.autoCut.getTranscriptionStatus().then(setStatus)
    const removeProgress = window.autoCut.onTranscriptionProgress(setProgress)
    const removeModelProgress = window.autoCut.onTranscriptionModelProgress(() => {
      void window.autoCut.getTranscriptionStatus().then(setStatus)
    })
    return () => { removeProgress(); removeModelProgress() }
  }, [open, setProgress, setStatus])

  useEffect(() => {
    if (!open) return
    const listener = (event: Event): void => setPlayback((event as CustomEvent<{ clipId: string; time: number }>).detail)
    window.addEventListener('autocut-source-time', listener)
    return () => window.removeEventListener('autocut-source-time', listener)
  }, [open])

  const selectedModel = modelFor(settings.transcription.quality, settings.transcription.language)
  const model = status?.models.find((item) => item.model === selectedModel)
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return transcripts.flatMap((transcript) => transcript.segments
      .filter((segment) => segment.text.toLowerCase().includes(normalized))
      .map((segment) => ({ transcript, segment })))
  }, [query, transcripts])

  if (!open) return null

  const updateTranscription = (patch: Partial<typeof settings.transcription>): void =>
    updateTranscriptionSettings({ ...settings.transcription, ...patch })
  const updateCaptions = (patch: Partial<CaptionSettings>): void =>
    updateCaptionSettings({ ...settings.captions, ...patch })
  const updateStyle = (patch: Partial<CaptionSettings['style']>): void =>
    updateCaptions({ style: { ...settings.captions.style, ...patch } })

  const runTranscription = async (): Promise<void> => {
    const sources = clips.filter((clip) => scope === 'all-clips' || clip.id === selectedClipId ||
      (scope === 'selected-edit' && plan?.segments.some((segment) => segment.sourcePath === clip.path)))
      .map((clip) => ({
        clipId: clip.id, path: clip.path, filename: clip.filename, duration: clip.duration,
        hasAudio: clip.hasAudio,
        ...(scope === 'selected-edit' ? { ranges: rangesForPlan(clip.path) } : {})
      }))
    const id = crypto.randomUUID()
    begin(id)
    try {
      complete(await window.autoCut.transcribe({ jobId: id, projectId, sources, settings: settings.transcription }))
      setStatus(await window.autoCut.getTranscriptionStatus())
    } catch (operationError) {
      fail(operationError instanceof Error ? operationError.message : 'Transcription failed.')
    }
  }

  const persistCurrentTranscript = async (transcriptId: string): Promise<void> => {
    const transcript = useAppStore.getState().transcripts.find((item) => item.id === transcriptId)
    if (transcript) await window.autoCut.updateTranscript(transcript)
  }

  const selectedWords = (): { transcript: Transcript; words: TranscriptWord[] } | null => {
    if (!selection) return null
    const transcript = transcripts.find((item) => item.id === selection.transcriptId)
    if (!transcript) return null
    const a = transcript.words.findIndex((word) => word.id === selection.anchor)
    const b = transcript.words.findIndex((word) => word.id === selection.focus)
    if (a < 0 || b < 0) return null
    return { transcript, words: transcript.words.slice(Math.min(a, b), Math.max(a, b) + 1) }
  }

  const removeRange = (transcript: Transcript, start: number, end: number, kind: TranscriptTextEdit['kind'], replacementDuration: number | null = null): void => {
    if (!plan) return
    try {
      const paddedStart = Math.max(0, start - (kind === 'remove-filler' ? 0.04 : 0))
      const paddedEnd = Math.min(transcript.sourceDuration, end + (kind === 'remove-filler' ? 0.04 : 0))
      const next = removeTranscriptRange(plan, transcript.sourcePath, paddedStart, paddedEnd)
      updatePlan(() => next)
      addTextEdit({
        id: crypto.randomUUID(), sourceClipId: transcript.sourceClipId, sourcePath: transcript.sourcePath,
        start: paddedStart, end: paddedEnd, kind, restored: false, replacementDuration,
        createdAt: new Date().toISOString()
      })
      setSelection(null)
      setEditError(null)
    } catch (operationError) {
      setEditError(operationError instanceof Error ? operationError.message : 'The transcript edit could not be applied.')
    }
  }

  const generateCaptions = async (): Promise<void> => {
    if (!plan) return
    setCaptionTrack(await window.autoCut.buildCaptionTrack({ plan, transcripts, settings: settings.captions }))
  }

  const captionTrack = plan?.captionTrack ?? null

  return (
    <section className="transcript-overlay" aria-label="Transcript and content analysis">
      <header className="transcript-header">
        <div><FileText size={18} /><span><h2>Transcript</h2><small>Content analysis · revision {useAppStore.getState().transcriptEditRevision}</small></span></div>
        <div className="segmented-control transcript-tabs">
          <button className={tab === 'transcript' ? 'active' : ''} type="button" onClick={() => setTab('transcript')}>Transcript</button>
          <button className={tab === 'captions' ? 'active' : ''} type="button" onClick={() => setTab('captions')}>Captions</button>
          <button className={tab === 'semantic' ? 'active' : ''} type="button" onClick={() => setTab('semantic')}>Semantic</button>
          <button className={tab === 'topics' ? 'active' : ''} type="button" onClick={() => setTab('topics')}>Topics</button>
          <button className={tab === 'highlights' ? 'active' : ''} type="button" onClick={() => setTab('highlights')}>Highlights</button>
          <button className={tab === 'versions' ? 'active' : ''} type="button" onClick={() => setTab('versions')}>Versions</button>
        </div>
        <button className="icon-button" type="button" onClick={close} title="Close Transcript" aria-label="Close Transcript"><X size={18} /></button>
      </header>

      {tab === 'transcript' ? (
        <div className="transcript-layout">
          <aside className="transcription-controls">
            <h3>Local Transcription</h3>
            <label><span>Quality</span><select value={settings.transcription.quality} onChange={(event) => updateTranscription({ quality: event.target.value as typeof settings.transcription.quality })}><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="accurate">Accurate</option></select></label>
            <label><span>Language</span><select value={settings.transcription.language} onChange={(event) => updateTranscription({ language: event.target.value as typeof settings.transcription.language })}><option value="auto">Auto Detect</option><option value="english">English</option><option value="multilingual">Multilingual / Auto</option></select></label>
            <label><span>Transcribe</span><select value={scope} onChange={(event) => setScope(event.target.value as TranscriptionScope)}><option value="selected-clip">Selected Clip</option><option value="all-clips">All Clips</option><option value="selected-edit">Selected Edit Only</option></select></label>
            <div className="model-status">
              <span>Transcription Model</span><strong>{settings.transcription.quality[0].toUpperCase() + settings.transcription.quality.slice(1)} - {selectedModel}</strong>
              <small className={`status-${model?.state ?? 'unavailable'}`}>{model?.state === 'ready' ? 'Ready' : model?.state === 'loading' ? `Loading ${Math.round(model.downloadProgress ?? 0)}%` : model?.state === 'not-installed' ? 'Not Installed' : 'Unavailable'}</small>
              {status?.providerState === 'unavailable' && <p>whisper-cli is not available. Install the bundled provider or set AUTOCUT_WHISPER_CPP.</p>}
              {model?.state === 'not-installed' && <button className="button button-secondary" type="button" onClick={async () => { await window.autoCut.installTranscriptionModel(selectedModel); setStatus(await window.autoCut.getTranscriptionStatus()) }}><Download size={15} /> Install Model ({Math.round(model.approximateBytes / 1_000_000)} MB)</button>}
              {model?.state === 'ready' && !jobId && <button className="button button-secondary" type="button" onClick={async () => { await window.autoCut.removeTranscriptionModel(selectedModel); setStatus(await window.autoCut.getTranscriptionStatus()) }}><Trash2 size={15} /> Remove Model</button>}
            </div>
            <button className="button button-primary" type="button" disabled={Boolean(jobId) || model?.state !== 'ready' || status?.providerState !== 'ready'} onClick={() => void runTranscription()}><Sparkles size={15} /> Transcribe</button>
            {jobId && <button className="button button-secondary" type="button" onClick={() => void window.autoCut.cancelTranscription(jobId)}><X size={15} /> Cancel</button>}
            {progress && <div className="transcription-progress"><LoaderCircle className="spin" size={16} /><strong>{progress.stage}</strong><span>{progress.currentClip} - {Math.round(progress.percent)}%</span><progress max="100" value={progress.percent} /></div>}
            {error && <div className="inline-error" role="alert">{error}</div>}
          </aside>

          <div className="transcript-browser">
            <label className="transcript-search"><Search size={15} /><input placeholder="Search transcript" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {query && <div className="transcript-search-results">{results.map(({ transcript, segment }) => <button key={`${transcript.id}-${segment.id}`} type="button" onClick={() => seek(transcript.sourceClipId, segment.start)}><strong>{clips.find((clip) => clip.id === transcript.sourceClipId)?.filename}</strong><span>{clock(segment.start)} - {segment.text}</span></button>)}</div>}
            {!query && transcripts.length === 0 && <div className="transcript-empty"><Captions size={28} /><strong>No transcript yet</strong><span>Install a local model and transcribe selected media.</span></div>}
            {!query && transcripts.map((transcript) => (
              <section className="transcript-document" key={transcript.id}>
                <header><div><strong>{clips.find((clip) => clip.id === transcript.sourceClipId)?.filename ?? transcript.sourcePath}</strong><span>{transcript.noSpeech ? 'No speech detected' : `${transcript.words.length} words - ${transcript.detectedLanguage ?? transcript.language}`}</span></div><button type="button" onClick={async () => { const marked = await window.autoCut.detectFillers(transcript); replaceTranscript(marked) }}>Review Fillers</button></header>
                {transcript.segments.map((segment) => <div className="transcript-segment" key={segment.id}><button className="transcript-timestamp" type="button" onClick={() => seek(transcript.sourceClipId, segment.start)}>{clock(segment.start)}</button><p>{segment.words.length ? segment.words.map((word) => editingWord === word.id ? <input className="transcript-word-input" key={word.id} defaultValue={word.text} onBlur={(event) => { correctWord(transcript.id, word.id, event.target.value); setEditingWord(null); void persistCurrentTranscript(transcript.id) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /> : <button key={word.id} className={`transcript-word ${word.filler ? 'transcript-word-filler' : ''} ${word.confidence != null && word.confidence < 0.35 ? 'transcript-word-low' : ''} ${playback?.clipId === transcript.sourceClipId && playback.time >= word.start && playback.time <= word.end ? 'transcript-word-active' : ''} ${selection?.transcriptId === transcript.id && (selection.anchor === word.id || selection.focus === word.id) ? 'transcript-word-selected' : ''}`} title={word.confidence != null && word.confidence < 0.35 ? 'Low confidence' : word.filler ? 'Possible filler word' : 'Click to seek; Shift-click to select a range'} type="button" onClick={(event) => { seek(transcript.sourceClipId, word.start); setSelection(event.shiftKey && selection?.transcriptId === transcript.id ? { ...selection, focus: word.id } : { transcriptId: transcript.id, anchor: word.id, focus: word.id }) }} onDoubleClick={() => setEditingWord(word.id)}>{word.text}</button>) : segment.text}</p></div>)}
              </section>
            ))}
          </div>

          <aside className="transcript-edit-tools">
            <h3>Edit by Transcript</h3>
            <p>{selectedWords()?.words.map((word) => word.text).join(' ') || 'No transcript range selected.'}</p>
            {editError && <div className="inline-error" role="alert">{editError}</div>}
            <button className="button button-secondary" type="button" disabled={selectedWords()?.words.length !== 1} onClick={() => { const selected = selectedWords(); if (selected?.words.length === 1) setEditingWord(selected.words[0].id) }}>Correct Word</button>
            <button className="button button-secondary" type="button" disabled={!selectedWords() || !plan} onClick={() => { const selected = selectedWords(); if (selected) removeRange(selected.transcript, selected.words[0].start, selected.words.at(-1)!.end, selected.words.every((word) => word.filler) ? 'remove-filler' : 'remove-range') }}><Scissors size={15} /> Remove From Edit</button>
            <button className="button button-secondary" type="button" disabled={!selectedWords()} onClick={() => { const selected = selectedWords(); if (selected) addSemanticHint({ id: crypto.randomUUID(), sourceClipId: selected.transcript.sourceClipId, sourcePath: selected.transcript.sourcePath, start: selected.words[0].start, end: selected.words.at(-1)!.end, kind: 'prioritize', createdAt: new Date().toISOString() }) }}><Sparkles size={15} /> Prioritize This</button>
            <button className="button button-secondary" type="button" disabled={!selectedWords()} onClick={() => { const selected = selectedWords(); if (selected) addSemanticHint({ id: crypto.randomUUID(), sourceClipId: selected.transcript.sourceClipId, sourcePath: selected.transcript.sourcePath, start: selected.words[0].start, end: selected.words.at(-1)!.end, kind: 'exclude', createdAt: new Date().toISOString() }) }}><X size={15} /> Avoid This Section</button>
            <label><span>Long pauses</span><select value={pauseThreshold} onChange={(event) => setPauseThreshold(Number(event.target.value))}><option value="0.5">0.5 sec</option><option value="1">1 sec</option><option value="2">2 sec</option></select></label>
            <div className="pause-list">{transcripts.flatMap((transcript) => transcript.words.slice(1).flatMap((word, index) => {
              const previous = transcript.words[index]
              const duration = word.start - previous.end
              return duration >= pauseThreshold ? [{ transcript, start: previous.end, end: word.start, duration }] : []
            })).map((pause) => <div key={`${pause.transcript.id}-${pause.start}`}><span><Pause size={13} /> {clock(pause.start)} - {pause.duration.toFixed(1)}s</span><button type="button" disabled={!plan || pause.duration <= 0.55} onClick={() => removeRange(pause.transcript, pause.start + 0.25, pause.end - 0.25, 'shorten-pause', 0.5)}>Shorten</button></div>)}</div>
            {textEdits.some((edit) => !edit.restored) && <><h3>Removed Ranges</h3><div className="removed-range-list">{textEdits.filter((edit) => !edit.restored).map((edit) => <button key={edit.id} type="button" onClick={() => { if (!plan) return; try { updatePlan(() => restoreTranscriptRange(plan, edit)); restoreTextEdit(edit.id); setEditError(null) } catch (operationError) { setEditError(operationError instanceof Error ? operationError.message : 'The range could not be restored.') } }}><RotateCcw size={13} /> Restore {clock(edit.start)}-{clock(edit.end)}</button>)}</div></>}
          </aside>
        </div>
      ) : tab === 'captions' ? (
        <div className="caption-layout">
          <aside className="caption-controls">
            <h3>Caption Configuration</h3>
            <label><span>Captions</span><select value={settings.captions.mode} onChange={(event) => updateCaptions({ mode: event.target.value as CaptionSettings['mode'] })}><option value="off">Off</option><option value="standard">Standard Subtitles</option><option value="dynamic">Dynamic Social Captions</option></select></label>
            <label><span>Subtitle Output</span><select value={settings.captions.subtitleOutput} onChange={(event) => updateCaptions({ subtitleOutput: event.target.value as CaptionSettings['subtitleOutput'] })}><option value="none">None</option><option value="burned-in">Burned In</option><option value="file-only">Subtitle File Only</option><option value="burned-in-and-file">Burned In + Subtitle File</option></select></label>
            <label><span>Style</span><select value={settings.captions.style.preset} onChange={(event) => updateStyle(stylePreset(event.target.value as CaptionStylePreset))}><option value="clean">Clean</option><option value="bold">Bold</option><option value="minimal">Minimal</option><option value="highlight">Highlight</option></select></label>
            <label><span>Font</span><select value={settings.captions.style.fontFamily} onChange={(event) => updateStyle({ fontFamily: event.target.value })}><option>DejaVu Sans</option><option>Liberation Sans</option><option>Noto Sans</option></select></label>
            <label><span>Size</span><input type="number" min="18" max="120" value={settings.captions.style.fontSize} onChange={(event) => updateStyle({ fontSize: Number(event.target.value) })} /></label>
            <label><span>Text color</span><input type="color" value={settings.captions.style.textColor} onChange={(event) => updateStyle({ textColor: event.target.value })} /></label>
            <label><span>Highlight</span><input type="color" value={settings.captions.style.highlightColor} onChange={(event) => updateStyle({ highlightColor: event.target.value })} /></label>
            <label><span>Position</span><select value={settings.captions.style.position} onChange={(event) => updateStyle({ position: event.target.value as CaptionSettings['style']['position'] })}><option value="top">Top</option><option value="upper-middle">Upper Middle</option><option value="center">Center</option><option value="lower-middle">Lower Middle</option><option value="bottom">Bottom</option></select></label>
            <label><span>Alignment</span><select value={settings.captions.style.alignment} onChange={(event) => updateStyle({ alignment: event.target.value as CaptionSettings['style']['alignment'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            <label><span>Safe area</span><select value={settings.captions.safeAreaPreset} onChange={(event) => updateCaptions({ safeAreaPreset: event.target.value as CaptionSettings['safeAreaPreset'] })}><option value="instagram-reel">Instagram Reel</option><option value="instagram-story">Instagram Story</option><option value="youtube-shorts">YouTube Shorts</option><option value="youtube-standard">YouTube Standard</option><option value="linkedin">LinkedIn</option><option value="custom">Custom</option></select></label>
            <label><span>Animation</span><select value={settings.captions.animation} onChange={(event) => updateCaptions({ animation: event.target.value as CaptionSettings['animation'] })}><option value="none">None</option><option value="fade">Fade</option><option value="pop">Pop</option></select></label>
            <label><span>Word emphasis</span><select value={settings.captions.highlightBehavior} onChange={(event) => updateCaptions({ highlightBehavior: event.target.value as CaptionSettings['highlightBehavior'] })}><option value="bold">Bold</option><option value="scale">Scale slightly</option><option value="color">Different color</option><option value="background">Background emphasis</option></select></label>
            <label><span>Max width</span><input type="range" min="40" max="94" value={settings.captions.style.maximumWidth} onChange={(event) => updateStyle({ maximumWidth: Number(event.target.value) })} /></label>
            <label><span>Vertical offset</span><input type="range" min="3" max="35" value={settings.captions.style.verticalOffset} onChange={(event) => updateStyle({ verticalOffset: Number(event.target.value) })} /></label>
            <label><span>Background opacity</span><input type="range" min="0" max="1" step="0.05" value={settings.captions.style.backgroundOpacity} onChange={(event) => updateStyle({ backgroundOpacity: Number(event.target.value) })} /></label>
            <label><span>Outline</span><input type="range" min="0" max="8" step="0.5" value={settings.captions.style.outline} onChange={(event) => updateStyle({ outline: Number(event.target.value) })} /></label>
            <label><span>Shadow</span><input type="range" min="0" max="8" step="0.5" value={settings.captions.style.shadow} onChange={(event) => updateStyle({ shadow: Number(event.target.value) })} /></label>
            <label className="control-check"><input type="checkbox" checked={settings.captions.style.backgroundEnabled} onChange={(event) => updateStyle({ backgroundEnabled: event.target.checked })} /><span>Background</span></label>
            <label className="control-check"><input type="checkbox" checked={settings.captions.highlightSpokenWord} onChange={(event) => updateCaptions({ highlightSpokenWord: event.target.checked })} /><span>Highlight spoken word</span></label>
            <label className="control-check"><input type="checkbox" checked={settings.captions.safeAreaVisible} onChange={(event) => updateCaptions({ safeAreaVisible: event.target.checked })} /><span>Safe Area Overlay</span></label>
            <button className="button button-primary" type="button" disabled={!plan || !transcripts.length || settings.captions.mode === 'off'} onClick={() => void generateCaptions()}><Captions size={15} /> Generate Captions</button>
            {captionTrack && <div className="subtitle-export-actions"><button className="button button-secondary" type="button" onClick={() => void window.autoCut.exportSubtitles({ projectName: settings.name, format: 'srt', track: captionTrack })}><Download size={14} /> SRT</button><button className="button button-secondary" type="button" onClick={() => void window.autoCut.exportSubtitles({ projectName: settings.name, format: 'vtt', track: captionTrack })}><Download size={14} /> VTT</button></div>}
          </aside>
          <div className="caption-inspector"><header><div><h3>Caption Inspector</h3><span>{captionTrack?.chunks.filter((chunk) => !chunk.deleted).length ?? 0} captions</span></div>{captionTrack && <span className="caption-ready"><Check size={14} /> Preview ready</span>}</header>{captionTrack ? <CaptionInspector chunks={captionTrack.chunks} /> : <div className="transcript-empty"><Captions size={28} /><strong>No caption track</strong><span>Generate captions from the current transcript and frozen Edit Plan.</span></div>}</div>
        </div>
      ) : tab === 'semantic' ? <SemanticPanel /> : tab === 'topics' ? <TopicsPanel /> : tab === 'highlights' ? <HighlightsPanel closeWorkspace={close} /> : <VersionsPanel />}
    </section>
  )
}
