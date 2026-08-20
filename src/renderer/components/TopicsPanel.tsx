import { Ban, Download, Layers3, LocateFixed, Target } from 'lucide-react'
import { useAppStore } from '../stores/app-store'

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`
}

export function TopicsPanel(): React.JSX.Element {
  const projectName = useAppStore((state) => state.projectSettings.name)
  const analysis = useAppStore((state) => state.semanticAnalysis)
  const topics = useAppStore((state) => state.topics)
  const updateTopic = useAppStore((state) => state.updateTopic)
  const addHint = useAppStore((state) => state.addSemanticHint)

  const seekTopic = (topicId: string): void => {
    const topic = topics.find((item) => item.id === topicId)
    const chunk = analysis?.chunks.find((item) => topic?.chunkIds.includes(item.id))
    if (chunk) window.dispatchEvent(new CustomEvent('autocut-seek-source', { detail: { clipId: chunk.sourceClipId, time: chunk.start } }))
  }

  const excludeChunk = (chunkId: string): void => {
    const chunk = analysis?.chunks.find((item) => item.id === chunkId)
    if (!chunk) return
    addHint({ id: crypto.randomUUID(), sourceClipId: chunk.sourceClipId, sourcePath: chunk.sourcePath,
      start: chunk.start, end: chunk.end, kind: 'exclude', createdAt: new Date().toISOString() })
  }

  return (
    <div className="topics-layout">
      <section className="topics-list">
        <header><div><h3>Detected Topics</h3><span>{topics.length} semantic sections</span></div><button className="button button-secondary" type="button" disabled={!topics.some((topic) => topic.chapterEnabled)} onClick={() => void window.autoCut.exportChapters({ projectName, topics })}><Download size={14} /> Chapters</button></header>
        {!topics.length && <div className="transcript-empty"><Layers3 size={28} /><strong>No topics yet</strong><span>Run Semantic Analysis to detect meaningful transcript changes.</span></div>}
        {topics.map((topic, index) => <article className={topic.importance === 'exclude' ? 'topic-card topic-card-excluded' : 'topic-card'} key={topic.id}>
          <div className="topic-card-heading"><button className="icon-button" type="button" title="Preview topic source" onClick={() => seekTopic(topic.id)}><LocateFixed size={16} /></button><div><strong>{topic.userLabel?.trim() || `Topic ${index + 1}`}</strong><span>{clock(topic.start)}–{clock(topic.end)} · {topic.sourceClipIds.length} source clip{topic.sourceClipIds.length === 1 ? '' : 's'}</span></div></div>
          <p>{topic.representativeText}</p>
          <div className="topic-controls">
            <label><span>Chapter name</span><input value={topic.userLabel ?? ''} placeholder={`Topic ${index + 1}`} onChange={(event) => updateTopic(topic.id, { userLabel: event.target.value })} /></label>
            <label><span>Importance</span><select value={topic.importance} onChange={(event) => updateTopic(topic.id, { importance: event.target.value as typeof topic.importance })}><option value="important">Important</option><option value="normal">Normal</option><option value="exclude">Exclude</option></select></label>
            <label><span>Chapter start</span><input type="number" min="0" step="1" value={Number(topic.chapterStart.toFixed(1))} onChange={(event) => updateTopic(topic.id, { chapterStart: Math.max(0, Number(event.target.value)) })} /></label>
            <label className="control-check"><input type="checkbox" checked={topic.chapterEnabled} onChange={(event) => updateTopic(topic.id, { chapterEnabled: event.target.checked })} /><span>Enable Chapter</span></label>
          </div>
        </article>)}
      </section>

      <aside className="similar-content-panel">
        <h3>Similar Sections</h3>
        <p>Review semantically repeated spoken takes. The longest complete section is recommended; source media is never deleted.</p>
        {!analysis?.similarContent.length && <div className="transcript-empty"><Layers3 size={24} /><strong>No strong duplicates</strong><span>Distinct topics and takes will remain available.</span></div>}
        {analysis?.similarContent.map((group, index) => <article key={group.id}>
          <header><strong>Similar Content {index + 1}</strong><span>{group.chunkIds.length} takes</span></header>
          {group.chunkIds.map((chunkId) => {
            const chunk = analysis.chunks.find((item) => item.id === chunkId)
            if (!chunk) return null
            const recommended = chunkId === group.recommendedChunkId
            return <div className="similar-take" key={chunkId}><p>{chunk.text}</p><span>{recommended ? 'Recommended best take' : 'Alternate take'}</span><button type="button" onClick={() => addHint({ id: crypto.randomUUID(), sourceClipId: chunk.sourceClipId, sourcePath: chunk.sourcePath, start: chunk.start, end: chunk.end, kind: 'prioritize', createdAt: new Date().toISOString() })}><Target size={13} /> Keep Best</button><button type="button" onClick={() => excludeChunk(chunkId)}><Ban size={13} /> Exclude</button></div>
          })}
        </article>)}
      </aside>
    </div>
  )
}
