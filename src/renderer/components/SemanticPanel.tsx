import { useEffect, useState } from 'react'
import { Ban, Download, LoaderCircle, Search, Sparkles, Target, Trash2, X } from 'lucide-react'
import type { SemanticSearchMode, SemanticSearchResult } from '@shared/types'
import { useAppStore } from '../stores/app-store'

function seek(clipId: string, time: number): void {
  window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId, time } }))
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes.toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export function SemanticPanel(): React.JSX.Element {
  const projectId = useAppStore((state) => state.projectId)
  const settings = useAppStore((state) => state.projectSettings)
  const transcripts = useAppStore((state) => state.transcripts)
  const modelStatus = useAppStore((state) => state.semanticModelStatus)
  const analysis = useAppStore((state) => state.semanticAnalysis)
  const progress = useAppStore((state) => state.semanticProgress)
  const jobId = useAppStore((state) => state.activeSemanticJobId)
  const error = useAppStore((state) => state.semanticError)
  const setModelStatus = useAppStore((state) => state.setSemanticModelStatus)
  const updateSettings = useAppStore((state) => state.updateSemanticSettings)
  const begin = useAppStore((state) => state.beginSemanticAnalysis)
  const setProgress = useAppStore((state) => state.setSemanticProgress)
  const complete = useAppStore((state) => state.completeSemanticAnalysis)
  const fail = useAppStore((state) => state.failSemanticAnalysis)
  const addHint = useAppStore((state) => state.addSemanticHint)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SemanticSearchMode>('exact')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installProgress, setInstallProgress] = useState<number | null>(null)

  useEffect(() => {
    void window.autoCut.getSemanticModelStatus().then(setModelStatus)
    const removeModel = window.autoCut.onSemanticModelProgress(setInstallProgress)
    const removeProgress = window.autoCut.onSemanticAnalysisProgress(setProgress)
    return () => { removeModel(); removeProgress() }
  }, [setModelStatus, setProgress])

  const analyze = async (): Promise<void> => {
    const id = crypto.randomUUID()
    begin(id)
    try {
      const result = await window.autoCut.analyzeSemantics({ jobId: id, projectId, transcripts, priority: 'normal' })
      complete(result.analysis, result.reference)
    } catch (operationError) {
      fail(operationError instanceof Error ? operationError.message : 'Semantic analysis unavailable.')
    }
  }

  const search = async (): Promise<void> => {
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    try {
      if (mode === 'exact' && !analysis) {
        const needle = query.toLocaleLowerCase()
        setResults(transcripts.flatMap((transcript) => transcript.segments
          .filter((segment) => segment.text.toLocaleLowerCase().includes(needle))
          .map((segment) => ({
            chunkId: segment.id, transcriptId: transcript.id, sourceClipId: transcript.sourceClipId,
            sourcePath: transcript.sourcePath, start: segment.start, end: segment.end, text: segment.text,
            score: 1, relevance: 'High Match' as const, topicId: null
          }))).slice(0, 12))
      } else {
        setResults(await window.autoCut.semanticSearch({ projectId, query, mode, limit: 16 }))
      }
    } catch (operationError) {
      fail(operationError instanceof Error ? operationError.message : 'Semantic search unavailable.')
      setResults([])
    } finally { setSearching(false) }
  }

  const hint = (result: SemanticSearchResult, kind: 'prioritize' | 'exclude'): void => addHint({
    id: crypto.randomUUID(), sourceClipId: result.sourceClipId, sourcePath: result.sourcePath,
    start: result.start, end: result.end, kind, createdAt: new Date().toISOString()
  })

  return (
    <div className="semantic-layout">
      <aside className="semantic-controls">
        <h3>Local Semantic Analysis</h3>
        <div className={`model-status model-status-${modelStatus?.state ?? 'unavailable'}`}>
          <span>Semantic Model</span>
          <strong>MiniLM L6 v2</strong>
          <small>{modelStatus?.state === 'ready' ? 'Installed and offline ready' : modelStatus?.state === 'loading' ? `Installing ${Math.round(installProgress ?? modelStatus.downloadProgress ?? 0)}%` : modelStatus?.state === 'not-installed' ? 'Not Installed' : 'Unavailable'}</small>
          {modelStatus?.detail && <p>{modelStatus.detail}</p>}
          {modelStatus?.state === 'not-installed' && <button className="button button-secondary" type="button" onClick={async () => { setInstallProgress(0); setModelStatus(await window.autoCut.installSemanticModel()); setInstallProgress(null) }}><Download size={15} /> Install Model ({Math.round(modelStatus.approximateBytes / 1_000_000)} MB)</button>}
          {modelStatus?.state === 'ready' && !jobId && <button className="button button-secondary" type="button" onClick={async () => { await window.autoCut.removeSemanticModel(); setModelStatus(await window.autoCut.getSemanticModelStatus()) }}><Trash2 size={15} /> Remove Model</button>}
        </div>
        <label><span>Edit Goal</span><textarea aria-label="Edit Goal" rows={3} maxLength={500} placeholder="Focus on the construction process and finished result." value={settings.semantic.editGoal} onChange={(event) => updateSettings({ editGoal: event.target.value })} /></label>
        <label><span>Edit Goal Strength</span><select aria-label="Edit Goal Strength" value={settings.semantic.editGoalStrength} onChange={(event) => updateSettings({ editGoalStrength: event.target.value as typeof settings.semantic.editGoalStrength })}><option value="light">Light</option><option value="balanced">Balanced</option><option value="strong">Strong</option></select></label>
        <button className="button button-primary" type="button" disabled={modelStatus?.state !== 'ready' || !transcripts.some((transcript) => transcript.words.length) || Boolean(jobId)} onClick={() => void analyze()}><Sparkles size={15} /> Analyze Semantics</button>
        {jobId && <button className="button button-secondary" type="button" onClick={() => void window.autoCut.cancelSemanticAnalysis(jobId)}><X size={15} /> Cancel</button>}
        {progress && <div className="transcription-progress"><LoaderCircle className="spin" size={16} /><strong>{progress.stage}</strong><span>{progress.completed} of {progress.total}</span><progress max="100" value={progress.percent} /></div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {transcripts.some((transcript) => transcript.detectedLanguage && !transcript.detectedLanguage.toLowerCase().startsWith('en')) && <div className="settings-warning">MiniLM semantic matching is English-focused. Non-English results may be unreliable.</div>}
      </aside>

      <section className="semantic-search-panel">
        <header><div><h3>Project Search</h3><span>{analysis ? `${analysis.chunks.length} chunks indexed` : 'Exact search available'}</span></div><div className="segmented-control"><button className={mode === 'exact' ? 'active' : ''} type="button" onClick={() => setMode('exact')}>Exact</button><button className={mode === 'semantic' ? 'active' : ''} type="button" onClick={() => setMode('semantic')}>Semantic</button></div></header>
        <form className="semantic-search" onSubmit={(event) => { event.preventDefault(); void search() }}><Search size={16} /><input value={query} placeholder={mode === 'semantic' ? 'Search by meaning' : 'Search exact transcript text'} onChange={(event) => setQuery(event.target.value)} /><button className="button button-secondary" type="submit" disabled={searching || (mode === 'semantic' && !analysis)}>{searching ? <LoaderCircle className="spin" size={15} /> : 'Search'}</button></form>
        <div className="semantic-results">
          {results.map((result) => <article key={`${result.chunkId}-${result.start}`}>
            <button className="semantic-result-copy" type="button" onClick={() => seek(result.sourceClipId, result.start)}><strong>{result.relevance}</strong><span>{clock(result.start)} · {result.text}</span></button>
            <div><button type="button" onClick={() => hint(result, 'prioritize')}><Target size={14} /> Prioritize</button><button type="button" onClick={() => hint(result, 'exclude')}><Ban size={14} /> Avoid</button></div>
          </article>)}
          {!results.length && <div className="transcript-empty"><Search size={28} /><strong>{query ? 'No matching sections' : 'Search project content'}</strong><span>{mode === 'semantic' ? 'Find related meaning even when the exact words differ.' : 'Exact search remains available without the semantic model.'}</span></div>}
        </div>
      </section>

      <aside className="semantic-status-panel">
        <h3>Analysis Status</h3>
        <dl><div><dt>Model</dt><dd>{analysis ? 'MiniLM' : 'Not analyzed'}</dd></div><div><dt>Transcript chunks</dt><dd>{analysis?.chunks.length ?? 0}</dd></div><div><dt>Embedded</dt><dd>{analysis?.embeddedCount ?? 0}</dd></div><div><dt>Cache hits</dt><dd>{analysis?.cachedCount ?? 0}</dd></div><div><dt>Topics</dt><dd>{analysis?.topics.length ?? 0}</dd></div><div><dt>Status</dt><dd>{analysis ? 'Ready' : modelStatus?.state === 'ready' ? 'Waiting' : 'Unavailable'}</dd></div></dl>
      </aside>
    </div>
  )
}
