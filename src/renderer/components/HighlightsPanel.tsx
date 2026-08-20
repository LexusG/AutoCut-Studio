import { Check, Film, Lock, Play, RefreshCw, Sparkles, Unlock } from 'lucide-react'
import { useState } from 'react'
import type { HighlightCandidate } from '@shared/types'
import { useAppStore } from '../stores/app-store'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

interface HighlightsPanelProps {
  closeWorkspace: () => void
}

export function HighlightsPanel({ closeWorkspace }: HighlightsPanelProps): React.JSX.Element {
  const projectId = useAppStore((state) => state.projectId)
  const plan = useAppStore((state) => state.editPlan)
  const settings = useAppStore((state) => state.projectSettings)
  const topics = useAppStore((state) => state.topics)
  const hints = useAppStore((state) => state.semanticHints)
  const highlights = useAppStore((state) => state.highlightCandidates)
  const setHighlights = useAppStore((state) => state.setHighlightCandidates)
  const updateHighlight = useAppStore((state) => state.updateHighlightCandidate)
  const setPlan = useAppStore((state) => state.setEditPlan)
  const [durationPreset, setDurationPreset] = useState('30')
  const [customDuration, setCustomDuration] = useState(45)
  const [preserveIntro, setPreserveIntro] = useState(false)
  const [preserveOutro, setPreserveOutro] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const find = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      setHighlights(await window.autoCut.findHighlights({
        projectId, plan, editGoal: settings.semantic.editGoal,
        editGoalStrength: settings.semantic.editGoalStrength, semanticHints: hints,
        topicSelections: topics.map((topic) => ({ topicId: topic.id, importance: topic.importance }))
      }))
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : 'Highlights are unavailable.') }
    finally { setBusy(false) }
  }

  const createReel = async (): Promise<void> => {
    if (!plan) return
    const targetDuration = durationPreset === 'custom' ? customDuration : Number(durationPreset)
    setBusy(true); setError(null)
    try {
      setPlan(await window.autoCut.createHighlightReel({ projectId, parentPlan: plan, highlights,
        targetDuration, preserveIntro, preserveOutro, mode: 'highlight-reel' }))
      closeWorkspace()
    } catch (operationError) { setError(operationError instanceof Error ? operationError.message : 'The highlight reel could not be created.') }
    finally { setBusy(false) }
  }

  const alternative = (candidate: HighlightCandidate): void => {
    const next = candidate.alternativeIds.map((id) => highlights.find((item) => item.id === id)).find(Boolean)
    if (!next) return
    updateHighlight(candidate.id, { selected: false })
    updateHighlight(next.id, { selected: true })
  }

  return (
    <div className="highlights-layout">
      <aside className="highlight-controls">
        <h3>Auto Highlights</h3>
        <button className="button button-primary" type="button" disabled={!plan || busy} onClick={() => void find()}><Sparkles size={15} /> Find Highlights</button>
        <label><span>Reel Duration</span><select value={durationPreset} onChange={(event) => setDurationPreset(event.target.value)}><option value="15">15 sec</option><option value="30">30 sec</option><option value="60">60 sec</option><option value="90">90 sec</option><option value="custom">Custom</option></select></label>
        {durationPreset === 'custom' && <label><span>Custom Duration</span><input aria-label="Custom highlight reel duration" type="number" min="1" max="3600" step="1" value={customDuration} onChange={(event) => setCustomDuration(Math.max(1, Math.min(3600, Number(event.target.value) || 1)))} /></label>}
        <label className="control-check"><input type="checkbox" checked={preserveIntro} onChange={(event) => setPreserveIntro(event.target.checked)} /><span>Preserve Locked Intro</span></label>
        <label className="control-check"><input type="checkbox" checked={preserveOutro} onChange={(event) => setPreserveOutro(event.target.checked)} /><span>Preserve Locked Outro</span></label>
        <button className="button button-secondary" type="button" disabled={!plan || !highlights.some((highlight) => highlight.selected) || busy} onClick={() => void createReel()}><Film size={15} /> Create Highlight Reel</button>
        <dl><div><dt>Candidates</dt><dd>{highlights.length}</dd></div><div><dt>Selected</dt><dd>{highlights.filter((item) => item.selected).length}</dd></div><div><dt>Topics covered</dt><dd>{new Set(highlights.filter((item) => item.selected).map((item) => item.topicId).filter(Boolean)).size}</dd></div></dl>
        {error && <div className="inline-error" role="alert">{error}</div>}
      </aside>

      <section className="highlight-grid">
        {!highlights.length && <div className="transcript-empty"><Film size={30} /><strong>No highlights discovered</strong><span>Analyze semantics and create an Edit Plan, then review explainable candidate moments here.</span></div>}
        {highlights.map((candidate) => <article className={`highlight-card ${candidate.selected ? 'highlight-card-selected' : ''} ${candidate.excluded ? 'highlight-card-excluded' : ''}`} key={candidate.id}>
          <div className="highlight-thumbnail">{candidate.thumbnailUrl ? <img src={candidate.thumbnailUrl} alt="" /> : <Film size={28} />}<button type="button" title="Preview source" onClick={() => window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId: candidate.sourceClipId, time: candidate.start } }))}><Play size={16} fill="currentColor" /></button></div>
          <div className="highlight-card-copy"><header><label className="control-check"><input type="checkbox" checked={candidate.selected} disabled={candidate.excluded} onChange={(event) => updateHighlight(candidate.id, { selected: event.target.checked })} /><span>{candidate.filename}</span></label><strong>{candidate.duration.toFixed(1)}s</strong></header><p>{candidate.transcript}</p><div className="highlight-score"><span>Smart {percent(candidate.scores.total)}</span><span>Semantic {percent(candidate.scores.semantic)}</span><span>Novelty {percent(candidate.scores.novelty)}</span></div><div className="reason-tags">{candidate.reasons.map((reason) => <span key={reason}><Check size={11} /> {reason}</span>)}</div><footer><span>{candidate.topicId ? topics.findIndex((topic) => topic.id === candidate.topicId) + 1 : 'No'} topic · {candidate.personPresent ? 'Person present' : 'No person detected'}</span><div><button type="button" title={candidate.locked ? 'Unlock highlight' : 'Lock highlight'} onClick={() => updateHighlight(candidate.id, { locked: !candidate.locked })}>{candidate.locked ? <Lock size={14} /> : <Unlock size={14} />}</button><button type="button" disabled={!candidate.alternativeIds.length} onClick={() => alternative(candidate)}><RefreshCw size={13} /> Alternative</button></div></footer></div>
        </article>)}
      </section>
    </div>
  )
}
