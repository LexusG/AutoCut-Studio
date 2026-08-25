import { Check, Play, RotateCcw, Search, SkipForward, SpellCheck, UserRoundSearch } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Transcript } from '@shared/types'
import { useAppStore } from '../stores/app-store'
import { useAutoSnapshot } from '../hooks/use-auto-snapshot'

function confidence(word: Transcript['words'][number]): 'Low' | 'Medium' | 'Unknown' {
  if (word.confidence == null) return 'Unknown'
  return word.confidence < 0.45 ? 'Low' : 'Medium'
}
function replaceTranscriptText(transcript: Transcript, find: string, replacement: string): Transcript | null {
  const needle = find.toLocaleLowerCase()
  let changed = false
  const update = (word: Transcript['words'][number]): Transcript['words'][number] => {
    if (word.text.toLocaleLowerCase() !== needle) return word
    changed = true
    return { ...word, text: replacement }
  }
  const words = transcript.words.map(update)
  if (!changed) return null
  const byId = new Map(words.map((word) => [word.id, word]))
  const segments = transcript.segments.map((segment) => {
    const segmentWords = segment.words.map((word) => byId.get(word.id) ?? word)
    return { ...segment, words: segmentWords, text: segmentWords.map((word) => word.text).join(' ').replace(/\s+([,.!?;:])/g, '$1') }
  })
  return { ...transcript, words, segments, fullText: segments.map((segment) => segment.text).join(' '), revision: transcript.revision + 1, updatedAt: new Date().toISOString() }
}

export function ConfidencePanel(): React.JSX.Element {
  const transcripts = useAppStore((state) => state.transcripts)
  const reviews = useAppStore((state) => state.confidenceReviews)
  const vocabulary = useAppStore((state) => state.userVocabulary)
  const correctWord = useAppStore((state) => state.correctTranscriptWord)
  const replaceTranscript = useAppStore((state) => state.replaceTranscript)
  const takeSnapshot = useAutoSnapshot()
  const setReview = useAppStore((state) => state.setConfidenceReview)
  const setVocabulary = useAppStore((state) => state.setUserVocabulary)
  const [index, setIndex] = useState(0)
  const [correction, setCorrection] = useState('')
  const [term, setTerm] = useState('')
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const [undo, setUndo] = useState<Transcript[] | null>(null)

  const reviewState = new Map(reviews.map((record) => [`${record.transcriptId}:${record.wordId}`, record.state]))
  const queue = useMemo(() => transcripts.flatMap((transcript) => transcript.words
    .filter((word) => (word.confidenceLevel === 'low' || (word.confidence != null && word.confidence < 0.45)) && !['accepted', 'corrected', 'ignored'].includes(reviewState.get(`${transcript.id}:${word.id}`) ?? ''))
    .map((word) => ({ transcript, word }))), [reviews, transcripts])
  const current = queue[Math.min(index, Math.max(0, queue.length - 1))]
  const replaceCount = find.trim() ? transcripts.reduce((count, transcript) => count + transcript.words.filter((word) => word.text.toLocaleLowerCase() === find.trim().toLocaleLowerCase()).length, 0) : 0

  const persist = async (transcriptId: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    const transcript = useAppStore.getState().transcripts.find((item) => item.id === transcriptId)
    if (transcript) await window.autoCut.updateTranscript(transcript)
  }
  const mark = (state: 'accepted' | 'corrected' | 'ignored'): void => {
    if (!current) return
    if (state === 'corrected' && correction.trim() && correction.trim() !== current.word.text) {
      correctWord(current.transcript.id, current.word.id, correction)
      void persist(current.transcript.id)
    }
    setReview({ transcriptId: current.transcript.id, wordId: current.word.id, state, reviewedAt: new Date().toISOString() })
    setCorrection(''); setIndex((value) => Math.min(value, Math.max(0, queue.length - 2)))
  }
  const replaceAll = (): void => {
    // Rewrites every matching word across all project transcripts.
    void takeSnapshot('before-bulk-transcript-removal')
    if (!find.trim() || !replacement.trim() || !replaceCount) return
    setUndo(transcripts.map((transcript) => structuredClone(transcript)))
    for (const transcript of transcripts) {
      const updated = replaceTranscriptText(transcript, find.trim(), replacement.trim())
      if (updated) { replaceTranscript(updated); void window.autoCut.updateTranscript(updated) }
    }
  }

  return <div className="confidence-layout">
    <section className="confidence-review">
      <header><div><h3>Confidence Review</h3><span>{queue.length} questionable word{queue.length === 1 ? '' : 's'} remaining</span></div></header>
      {!current ? <div className="transcript-empty"><Check size={28} /><strong>Review complete</strong><span>No unreviewed low-confidence words remain.</span></div> : <article className="confidence-item">
        <div className="confidence-score">{confidence(current.word)} confidence{current.word.confidence == null ? '' : ` · ${Math.round(current.word.confidence * 100)}%`}</div>
        <blockquote>{current.transcript.segments.find((segment) => segment.words.some((word) => word.id === current.word.id))?.text ?? current.word.text}</blockquote>
        <span>{current.word.start.toFixed(1)}s - {current.word.end.toFixed(1)}s</span>
        <button className="button button-secondary" type="button" onClick={() => window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId: current.transcript.sourceClipId, time: Math.max(0, current.word.start - 2) } }))}><Play size={14} /> Play Context</button>
        <label><span>Correction</span><input value={correction} placeholder={current.word.text} onChange={(event) => setCorrection(event.target.value)} /></label>
        <div className="confidence-actions"><button className="button button-primary" type="button" onClick={() => mark(correction.trim() ? 'corrected' : 'accepted')}><Check size={14} /> {correction.trim() ? 'Accept Correction' : 'Accept'}</button><button className="button button-secondary" type="button" onClick={() => mark('ignored')}><SkipForward size={14} /> Skip</button></div>
      </article>}
    </section>
    <aside className="transcript-tools-panel">
      <section><h3><SpellCheck size={14} /> Custom Vocabulary</h3><p>Terms are used for correction consistency and future Whisper prompting where supported.</p><div className="inline-entry"><input value={term} placeholder="Product or person name" onChange={(event) => setTerm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && term.trim()) { setVocabulary([...new Set([...vocabulary, term.trim()])]); setTerm('') } }} /><button type="button" disabled={!term.trim()} onClick={() => { setVocabulary([...new Set([...vocabulary, term.trim()])]); setTerm('') }}>Add</button></div><div className="vocabulary-list">{vocabulary.map((item) => <button type="button" title="Remove vocabulary term" onClick={() => setVocabulary(vocabulary.filter((term) => term !== item))} key={item}>{item}</button>)}</div></section>
      <section><h3><Search size={14} /> Find &amp; Replace</h3><label><span>Find exact word</span><input value={find} onChange={(event) => setFind(event.target.value)} /></label><label><span>Replace with</span><input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><p>{replaceCount} match{replaceCount === 1 ? '' : 'es'} across project transcripts.</p><div className="confidence-actions"><button className="button button-secondary" type="button" disabled={!replaceCount || !replacement.trim()} onClick={replaceAll}>Replace All</button><button className="button button-secondary" type="button" disabled={!undo} onClick={() => { if (!undo) return; for (const transcript of undo) { replaceTranscript(transcript); void window.autoCut.updateTranscript(transcript) } setUndo(null) }}><RotateCcw size={13} /> Undo</button></div></section>
      <section><h3><UserRoundSearch size={14} /> Names &amp; Unusual Words</h3><p>Review low-confidence terms first, then add confirmed spellings to Custom Vocabulary. AutoCut Studio does not assume a term is a person's name.</p></section>
    </aside>
  </div>
}
