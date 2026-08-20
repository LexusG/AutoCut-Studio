import { useEffect, useState } from 'react'
import {
  ArrowLeftRight, GripVertical, Lock, LockOpen, Play, RefreshCw, RotateCcw,
  Scissors, Sparkles, Undo2, UserRound, Volume2, X
} from 'lucide-react'
import type { MediaClip, RenderPlan, RenderPlanSegment } from '@shared/types'
import {
  adjustPlanSegment, rebalancePlan, reorderPlanSegment, resetPlanSegment,
  togglePlanSegmentLock, tryAlternateSegment
} from '@shared/utils/edit-plan'
import { useVideoRender } from '../hooks/use-video-render'
import { useAppStore } from '../stores/app-store'
import { formatDuration } from '../utils/format'

function SegmentEditor({
  segment, clip, apply, close
}: {
  segment: RenderPlanSegment
  clip: MediaClip | undefined
  apply: (start: number, end: number) => void
  close: () => void
}): React.JSX.Element {
  const [start, setStart] = useState(segment.start)
  const [end, setEnd] = useState(segment.end)
  useEffect(() => { setStart(segment.start); setEnd(segment.end) }, [segment.end, segment.start])
  const step = 0.05
  return (
    <div className="segment-trimmer">
      {clip && <video src={clip.mediaUrl} controls preload="metadata" />}
      <div className="trim-range-stack">
        <input aria-label="Segment start handle" type="range" min="0" max={segment.sourceDuration} step={step} value={start} onChange={(event) => setStart(Math.min(Number(event.target.value), end - step))} />
        <input aria-label="Segment end handle" type="range" min="0" max={segment.sourceDuration} step={step} value={end} onChange={(event) => setEnd(Math.max(Number(event.target.value), start + step))} />
      </div>
      <div className="trim-time-fields">
        <label><span>Start</span><input type="number" min="0" max={end - step} step={step} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
        <label><span>End</span><input type="number" min={start + step} max={segment.sourceDuration} step={step} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label>
        <span>{formatDuration(Math.max(0, end - start))}</span>
      </div>
      <div className="trim-actions">
        <button className="button button-secondary" type="button" onClick={close}>Cancel</button>
        <button className="button button-primary" type="button" onClick={() => apply(start, end)}><Scissors size={15} /> Apply Range</button>
      </div>
    </div>
  )
}

export function EditPlanPanel(): React.JSX.Element | null {
  const plan = useAppStore((state) => state.editPlan)
  const open = useAppStore((state) => state.editPlanOpen)
  const outdated = useAppStore((state) => state.editPlanOutdated)
  const clips = useAppStore((state) => state.clips)
  const transcripts = useAppStore((state) => state.transcripts)
  const arrangement = useAppStore((state) => state.projectSettings.editing.arrangement)
  const updatePlan = useAppStore((state) => state.updateEditPlan)
  const hide = useAppStore((state) => state.hideEditPlan)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [undoPlan, setUndoPlan] = useState<RenderPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { analyzeEditPlan, generatePreview } = useVideoRender()
  if (!plan || !open) return null

  const requested = plan.requestedDuration
  const difference = requested == null ? 0 : plan.expectedDuration - requested
  const clipFor = (segment: RenderPlanSegment): MediaClip | undefined => clips.find((clip) => clip.path === segment.sourcePath)
  const excerpt = (path: string, start: number, end: number): string => {
    const words = transcripts.find((transcript) => transcript.sourcePath === path)?.words
      .filter((word) => word.end >= start && word.start <= end)
      .map((word) => word.text) ?? []
    return words.join(' ').replace(/\s+([,.!?;:])/g, '$1')
  }
  const mutate = (operation: (current: RenderPlan) => RenderPlan): void => {
    try {
      setUndoPlan(plan)
      updatePlan(operation)
      setError(null)
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'The Edit Plan could not be changed.')
    }
  }

  return (
    <section className="edit-plan-overlay" aria-label="Edit Plan">
      <header className="edit-plan-header">
        <div><Sparkles size={18} /><span><h2>Edit Plan</h2><small>Revision {plan.revision}</small></span></div>
        <div className="edit-plan-summary">
          <span>Requested <strong>{requested == null ? 'Auto' : formatDuration(requested)}</strong></span>
          <span>Planned <strong>{formatDuration(plan.expectedDuration)}</strong></span>
          {requested != null && <span className={Math.abs(difference) > 0.25 ? 'duration-difference-warning' : ''}>Difference <strong>{difference >= 0 ? '+' : ''}{difference.toFixed(1)}s</strong></span>}
        </div>
        <button className="icon-button" type="button" onClick={hide} title="Close Edit Plan" aria-label="Close Edit Plan"><X size={18} /></button>
      </header>

      <div className="edit-plan-notices">
        {outdated && <div className="edit-plan-alert">Project settings changed. Update this plan before previewing.</div>}
        {error && <div className="edit-plan-error" role="alert">{error}</div>}
      </div>

      <div className="edit-plan-review-list">
        {plan.segments.map((segment, index) => {
          const metadata = segment.selectedCandidate
          const speech = (metadata?.scores.speechActivity ?? 0) > 0.08
          const person = metadata?.personAnalysis?.detected === true
          const clip = clipFor(segment)
          return (
            <article
              className={`edit-plan-item ${segment.locked ? 'edit-plan-item-locked' : ''}`}
              key={segment.id}
              draggable={arrangement === 'original-order'}
              onDragStart={() => setDraggedId(segment.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (draggedId) mutate((current) => reorderPlanSegment(current, draggedId, segment.id)); setDraggedId(null) }}
            >
              <div className="edit-plan-item-main">
                <span className="plan-drag" title={arrangement === 'original-order' ? 'Drag to reorder' : 'Reordering follows the selected arrangement'}><GripVertical size={16} /></span>
                <span className="plan-thumbnail">{clip?.thumbnailUrl ? <img src={clip.thumbnailUrl} alt="" /> : <Play size={18} />}</span>
                <span className="plan-order">{index + 1}</span>
                <div className="plan-copy">
                  <strong title={segment.sourcePath}>{segment.filename}</strong>
                  <span>{segment.start.toFixed(2)}s to {segment.end.toFixed(2)}s <b>{formatDuration(segment.duration)}</b></span>
                  <small>{metadata?.decisionNotes?.at(-1) ?? metadata?.reasons[0] ?? 'Classic automatic selection'}</small>
                  {excerpt(segment.sourcePath, segment.start, segment.end) && <blockquote>{excerpt(segment.sourcePath, segment.start, segment.end)}</blockquote>}
                  {metadata?.alternatives?.slice(0, 2).map((alternative, alternativeIndex) => {
                    const text = excerpt(segment.sourcePath, alternative.start, alternative.end)
                    return text ? <small className="plan-alternative-transcript" key={alternative.candidateId}>Alternative {alternativeIndex + 1}: {text}</small> : null
                  })}
                </div>
                <div className="plan-signals">
                  {metadata && <span>Score {Math.round(metadata.scores.total * 100)}</span>}
                  {speech && <span title="Speech activity detected"><Volume2 size={13} /> Speech</span>}
                  {person && <span title="Person detected"><UserRound size={13} /> Person</span>}
                  {segment.selectionSource === 'manual' && <span>Manually adjusted</span>}
                  {segment.locked && <span>Locked</span>}
                  <span>{segment.cropPlan?.track.fallback ? 'Center Crop' : plan.cropFocus === 'smart-subject' ? 'Smart Subject' : 'Center Crop'}</span>
                  <span>{segment.transitionToNext ? `${segment.transitionToNext.type} ${segment.transitionToNext.duration}s` : 'Final clip'}</span>
                </div>
                <div className="plan-actions">
                  <button type="button" onClick={() => setEditingId(editingId === segment.id ? null : segment.id)}><Scissors size={14} /> Adjust</button>
                  <button type="button" disabled={!metadata?.alternatives?.length} onClick={() => mutate((current) => tryAlternateSegment(current, segment.id))}><ArrowLeftRight size={14} /> Try Another</button>
                  <button type="button" onClick={() => mutate((current) => resetPlanSegment(current, segment.id))}><RotateCcw size={14} /> Reset</button>
                  <button type="button" onClick={() => mutate((current) => togglePlanSegmentLock(current, segment.id))}>{segment.locked ? <LockOpen size={14} /> : <Lock size={14} />}{segment.locked ? 'Unlock' : 'Lock'}</button>
                </div>
              </div>
              {editingId === segment.id && <SegmentEditor segment={segment} clip={clip} close={() => setEditingId(null)} apply={(start, end) => { mutate((current) => adjustPlanSegment(current, segment.id, start, end)); setEditingId(null) }} />}
            </article>
          )
        })}
      </div>

      <footer className="edit-plan-footer">
        <div>
          <button className="button button-secondary" type="button" disabled={!undoPlan} onClick={() => { if (undoPlan) { updatePlan((current) => ({ ...undoPlan, revision: current.revision + 1 })); setUndoPlan(null) } }}><Undo2 size={15} /> Undo Change</button>
          {requested != null && Math.abs(difference) > 0.05 && <button className="button button-secondary" type="button" onClick={() => setError(null)}>Keep Current Duration</button>}
          {requested != null && Math.abs(difference) > 0.05 && <button className="button button-secondary" type="button" onClick={() => mutate(rebalancePlan)}><RefreshCw size={15} /> Rebalance Automatically</button>}
        </div>
        <div>
          <button className="button button-secondary" type="button" onClick={() => void analyzeEditPlan(true)}><RefreshCw size={15} /> Regenerate Unlocked</button>
          <button className="button button-primary" type="button" disabled={outdated} onClick={() => void generatePreview()}><Play size={15} fill="currentColor" /> Generate Preview</button>
        </div>
      </footer>
    </section>
  )
}
