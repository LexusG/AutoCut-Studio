import { FolderPlus, Play, Search, Sparkles, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { HighlightCandidate, RenderPlan, RenderPlanSegment, SemanticCollectionItem, SemanticSearchResult } from '@shared/types'
import { createOutputVariant } from '@shared/utils/output-variants'
import { calculatePlanDuration } from '@shared/utils/edit-plan'
import { useAppStore } from '../stores/app-store'

function speakerName(id: string | null | undefined, labels: ReturnType<typeof useAppStore.getState>['speakerLabels']): string {
  if (!id) return 'Mixed / Unknown'
  return labels.find((label) => label.speakerId === id)?.displayName ?? id
}

function toCandidate(result: SemanticSearchResult): HighlightCandidate {
  return {
    id: result.chunkId, sourceClipId: result.sourceClipId, sourcePath: result.sourcePath,
    filename: result.sourcePath.split('/').at(-1) ?? 'Source clip', start: result.start, end: result.end,
    duration: result.end - result.start, transcript: result.text, topicId: result.topicId,
    scores: { visual: 0.5, audio: 0.5, speech: 1, person: 0.5, semantic: result.score, novelty: 0.5, openingStrength: result.score, total: result.score },
    reasons: ['Selected from semantic transcript results'], personPresent: false, selected: true, locked: false,
    excluded: false, alternativeIds: [], thumbnailPath: null, thumbnailUrl: null, speakerId: result.speakerId ?? null
  }
}

export function SemanticCollectionsPanel(): React.JSX.Element {
  const projectId = useAppStore((state) => state.projectId)
  const settings = useAppStore((state) => state.projectSettings)
  const analysis = useAppStore((state) => state.semanticAnalysis)
  const clips = useAppStore((state) => state.clips)
  const labels = useAppStore((state) => state.speakerLabels)
  const plan = useAppStore((state) => state.editPlan)
  const collections = useAppStore((state) => state.semanticCollections)
  const setCollections = useAppStore((state) => state.setSemanticCollections)
  const addHint = useAppStore((state) => state.addSemanticHint)
  const addVariants = useAppStore((state) => state.addOutputVariants)
  const updatePlan = useAppStore((state) => state.updateEditPlan)
  const [query, setQuery] = useState('')
  const [speakerId, setSpeakerId] = useState('all')
  const [clipId, setClipId] = useState('all')
  const [personOnly, setPersonOnly] = useState(false)
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingAddition, setPendingAddition] = useState<{ segments: RenderPlanSegment[]; overflow: number } | null>(null)
  const visible = useMemo(() => results.filter((result) => {
    if (!personOnly) return true
    return Boolean(plan?.segments.some((segment) => segment.sourcePath === result.sourcePath && segment.start <= result.end && segment.end >= result.start && (segment.selectedCandidate?.scores.personPresence ?? 0) >= 0.35))
  }), [personOnly, plan, results])

  const search = async (): Promise<void> => {
    if (!query.trim() || !analysis) return
    setBusy(true); setMessage(null)
    try {
      const matches = await window.autoCut.semanticSearch({ projectId, query, mode: 'semantic', limit: 50, speakerId: speakerId === 'all' ? null : speakerId, sourceClipId: clipId === 'all' ? null : clipId })
      setResults(matches); setSelected(new Set(matches.map((result) => result.chunkId)))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Related sections could not be found.') }
    finally { setBusy(false) }
  }
  const selectedResults = visible.filter((result) => selected.has(result.chunkId))
  const createCollection = (): void => {
    if (!selectedResults.length) return
    const name = window.prompt('Collection name', query.trim() || 'Related Sections')?.trim()
    if (!name) return
    const now = new Date().toISOString()
    setCollections([...collections, { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, items: selectedResults.map((result): SemanticCollectionItem => ({
      id: crypto.randomUUID(), sourceClipId: result.sourceClipId, sourcePath: result.sourcePath,
      start: result.start, end: result.end, transcript: result.text, speakerId: result.speakerId ?? null
    })) }])
  }
  const prioritize = (items: SemanticCollectionItem[]): void => items.forEach((item) => addHint({
    id: crypto.randomUUID(), sourceClipId: item.sourceClipId, sourcePath: item.sourcePath,
    start: item.start, end: item.end, kind: 'prioritize', createdAt: new Date().toISOString()
  }))
  const createEdit = async (name: string, items: SemanticCollectionItem[]): Promise<void> => {
    if (!plan || !items.length) { setMessage('Create an Edit Plan and select at least one section first.'); return }
    const variant = createOutputVariant(projectId, settings, 'custom')
    const semanticResults: SemanticSearchResult[] = items.map((item) => ({
      chunkId: item.id, transcriptId: '', sourceClipId: item.sourceClipId, sourcePath: item.sourcePath,
      start: item.start, end: item.end, text: item.transcript, speakerId: item.speakerId,
      score: 1, relevance: 'High Match', topicId: null
    }))
    try {
      const renderPlan = await window.autoCut.createHighlightReel({ projectId, parentPlan: plan, highlights: semanticResults.map(toCandidate), targetDuration: Math.max(1, items.reduce((sum, item) => sum + item.end - item.start, 0)), preserveIntro: false, preserveOutro: false, mode: 'highlight-reel', variantId: variant.id })
      addVariants([{ ...variant, name, selectionMode: 'custom-selection', renderPlan: { ...renderPlan, generationMode: 'custom-selection' } }])
      setMessage(`Created “${name}” as a separate output variant.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The custom edit could not be created.') }
  }
  const selectedPlan = async (items: SemanticCollectionItem[]): Promise<RenderPlan> => {
    if (!plan) throw new Error('Create an Edit Plan first.')
    const semanticResults: SemanticSearchResult[] = items.map((item) => ({
      chunkId: item.id, transcriptId: '', sourceClipId: item.sourceClipId, sourcePath: item.sourcePath,
      start: item.start, end: item.end, text: item.transcript, speakerId: item.speakerId,
      score: 1, relevance: 'High Match', topicId: null
    }))
    return window.autoCut.createHighlightReel({ projectId, parentPlan: plan, highlights: semanticResults.map(toCandidate),
      targetDuration: Math.max(1, items.reduce((sum, item) => sum + item.end - item.start, 0)), preserveIntro: false,
      preserveOutro: false, mode: 'highlight-reel' })
  }
  const addToExisting = async (items: SemanticCollectionItem[]): Promise<void> => {
    if (!plan || !items.length) return
    try {
      const addition = await selectedPlan(items)
      const duplicate = (segment: RenderPlanSegment): boolean => plan.segments.some((current) => current.sourcePath === segment.sourcePath && Math.min(current.end, segment.end) - Math.max(current.start, segment.start) > 0.1)
      const fresh = addition.segments.filter((segment) => !duplicate(segment)).map((segment) => ({ ...segment, id: `semantic-${crypto.randomUUID()}` }))
      if (!fresh.length) { setMessage('Those ranges are already represented in the Edit Plan.'); return }
      const duration = calculatePlanDuration([...plan.segments, ...fresh])
      const limit = plan.requestedDuration
      if (limit != null && duration > limit + 0.05) setPendingAddition({ segments: fresh, overflow: duration - limit })
      else updatePlan((current) => ({ ...current, segments: [...current.segments, ...fresh], expectedDuration: duration, captionTrack: null, revision: current.revision + 1 }))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The ranges could not be added.') }
  }
  const resolveAddition = (mode: 'rebalance' | 'longer' | 'cancel'): void => {
    if (!pendingAddition || !plan || mode === 'cancel') { setPendingAddition(null); return }
    updatePlan((current) => {
      let segments = [...current.segments, ...pendingAddition.segments]
      if (mode === 'rebalance') {
        let overflow = pendingAddition.overflow
        for (let index = current.segments.length - 1; index >= 0 && overflow > 0.01; index -= 1) {
          const segment = segments[index]
          if (segment.locked) continue
          const reducible = Math.max(0, segment.duration - 0.5)
          const reduction = Math.min(reducible, overflow)
          segments[index] = { ...segment, end: segment.end - reduction, duration: segment.duration - reduction }
          overflow -= reduction
        }
        if (overflow > 0.05) { setMessage('Locked segments and minimum segment lengths leave no room. Allow a longer duration or cancel.'); return current }
      }
      const expectedDuration = calculatePlanDuration(segments)
      return { ...current, segments, expectedDuration, requestedDuration: mode === 'longer' ? expectedDuration : current.requestedDuration, captionTrack: null, revision: current.revision + 1 }
    })
    setPendingAddition(null)
  }

  return <div className="semantic-collections-layout">
    <section className="semantic-collection-search">
      <header><div><h3>Find Related Sections</h3><span>Search by meaning, then select ranges across clips.</span></div></header>
      <form className="semantic-search" onSubmit={(event) => { event.preventDefault(); void search() }}><Search size={16} /><input value={query} placeholder="The transmission was difficult to install" onChange={(event) => setQuery(event.target.value)} /><button className="button button-primary" type="submit" disabled={!analysis || busy}><Sparkles size={14} /> Find Related</button></form>
      <div className="semantic-filter-row"><label><span>Speaker</span><select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}><option value="all">All Speakers</option>{labels.filter((label) => !label.mergedInto).map((label) => <option key={label.speakerId} value={label.speakerId}>{label.displayName}</option>)}</select></label><label><span>Clip</span><select value={clipId} onChange={(event) => setClipId(event.target.value)}><option value="all">All Clips</option>{clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.filename}</option>)}</select></label><label className="control-check"><input type="checkbox" checked={personOnly} onChange={(event) => setPersonOnly(event.target.checked)} /><span>Person present</span></label></div>
      <div className="semantic-multiselect-actions"><button type="button" disabled={!selectedResults.length} onClick={createCollection}><FolderPlus size={14} /> Add to Collection</button><button type="button" disabled={!selectedResults.length} onClick={() => prioritize(selectedResults.map((result) => ({ id: result.chunkId, sourceClipId: result.sourceClipId, sourcePath: result.sourcePath, start: result.start, end: result.end, transcript: result.text, speakerId: result.speakerId ?? null })))}><Target size={14} /> Prioritize</button><button type="button" disabled={!selectedResults.length || !plan} onClick={() => void createEdit(query.trim() || 'Semantic Selection', selectedResults.map((result) => ({ id: result.chunkId, sourceClipId: result.sourceClipId, sourcePath: result.sourcePath, start: result.start, end: result.end, transcript: result.text, speakerId: result.speakerId ?? null })))}><Play size={14} /> Create Edit From Results</button><button type="button" disabled={!selectedResults.length || !plan} onClick={() => void addToExisting(selectedResults.map((result) => ({ id: result.chunkId, sourceClipId: result.sourceClipId, sourcePath: result.sourcePath, start: result.start, end: result.end, transcript: result.text, speakerId: result.speakerId ?? null })))}>Add to Existing Edit</button></div>
      <div className="semantic-results">{visible.map((result) => <article key={result.chunkId}><input aria-label={`Select ${result.text}`} type="checkbox" checked={selected.has(result.chunkId)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(result.chunkId); else next.delete(result.chunkId); return next })} /><button className="semantic-result-copy" type="button" onClick={() => window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId: result.sourceClipId, time: result.start } }))}><strong>{result.relevance} · {speakerName(result.speakerId, labels)}</strong><span>{result.text}</span></button></article>)}</div>
      {pendingAddition && <div className="duration-choice"><strong>Addition exceeds target by {pendingAddition.overflow.toFixed(1)}s</strong><span>Manual locks are protected.</span><div><button type="button" disabled={settings.editing.useEveryClip} onClick={() => resolveAddition('rebalance')}>Rebalance</button><button type="button" onClick={() => resolveAddition('longer')}>Allow Longer Duration</button><button type="button" onClick={() => resolveAddition('cancel')}>Cancel</button></div></div>}
      {message && <div className="settings-note">{message}</div>}
    </section>
    <aside className="semantic-collection-list"><h3>Semantic Collections</h3>{collections.map((collection) => <article key={collection.id}><div><strong>{collection.name}</strong><span>{collection.items.length} ranges</span></div><p>{collection.items.slice(0, 2).map((item) => item.transcript).join(' · ')}</p><div><button type="button" onClick={() => prioritize(collection.items)}><Target size={13} /> Prioritize</button><button type="button" disabled={!plan} onClick={() => void createEdit(collection.name, collection.items)}><Play size={13} /> Create Edit</button><button type="button" disabled={!plan} onClick={() => void addToExisting(collection.items)}>Add to Edit</button><button type="button" onClick={() => setCollections(collections.filter((item) => item.id !== collection.id))}>Delete</button></div></article>)}</aside>
  </div>
}
