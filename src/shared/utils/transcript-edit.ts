import type { RenderPlan, RenderPlanSegment, TranscriptTextEdit } from '../types'
import { calculatePlanDuration } from './edit-plan'

const round = (value: number): number => Math.round(value * 1000) / 1000

export function removeTranscriptRange(
  plan: RenderPlan,
  sourcePath: string,
  start: number,
  end: number
): RenderPlan {
  const affected = plan.segments.filter((segment) => segment.sourcePath === sourcePath && end > segment.start && start < segment.end)
  if (!affected.length) throw new Error('That transcript range is outside the current Edit Plan.')
  if (affected.some((segment) => segment.locked)) throw new Error('This segment is locked. Unlock it before removing transcript content.')
  const next: RenderPlanSegment[] = []
  for (const segment of plan.segments) {
    if (segment.sourcePath !== sourcePath || end <= segment.start || start >= segment.end) {
      next.push(segment)
      continue
    }
    const leftEnd = Math.max(segment.start, Math.min(segment.end, start))
    const rightStart = Math.max(segment.start, Math.min(segment.end, end))
    const keepsRight = segment.end - rightStart >= 0.1
    if (leftEnd - segment.start >= 0.1) next.push({
      ...segment, id: `${segment.id}-left-${Math.round(start * 1000)}`,
      end: round(leftEnd), duration: round(leftEnd - segment.start), selectionSource: 'manual',
      transitionToNext: keepsRight ? null : segment.transitionToNext
    })
    if (keepsRight) next.push({
      ...segment, id: `${segment.id}-right-${Math.round(end * 1000)}`,
      start: round(rightStart), duration: round(segment.end - rightStart), selectionSource: 'manual'
    })
  }
  if (plan.useEveryClip && !next.some((segment) => segment.sourcePath === sourcePath)) {
    throw new Error('Use Every Clip is on. Keep a minimum segment or disable the setting before removing this range.')
  }
  if (!next.length) throw new Error('An Edit Plan must keep at least one visible segment.')
  const segments = next.map((segment, index) => ({
    ...segment,
    transitionToNext: index === next.length - 1 ? null : segment.transitionToNext
  }))
  return {
    ...plan, segments, revision: plan.revision + 1,
    transcriptEditRevision: plan.transcriptEditRevision + 1,
    expectedDuration: calculatePlanDuration(segments), captionTrack: null
  }
}

export function restoreTranscriptRange(plan: RenderPlan, edit: TranscriptTextEdit): RenderPlan {
  if (edit.restored) return plan
  if (plan.segments.some((segment) => segment.sourcePath === edit.sourcePath && segment.locked && edit.end > segment.start && edit.start < segment.end)) {
    throw new Error('Unlock the affected segment before restoring this transcript range.')
  }
  const sameSource = plan.segments.findIndex((segment) => segment.sourcePath === edit.sourcePath && Math.abs(segment.end - edit.start) < 0.11)
  let segments = [...plan.segments]
  if (sameSource >= 0) {
    const segment = segments[sameSource]
    segments[sameSource] = { ...segment, end: edit.end, duration: round(edit.end - segment.start), selectionSource: 'manual' }
  } else {
    const template = plan.segments.find((segment) => segment.sourcePath === edit.sourcePath)
    if (!template) throw new Error('The source clip is no longer in this Edit Plan.')
    segments.push({
      ...template, id: `${template.id}-restored-${Math.round(edit.start * 1000)}`,
      start: edit.start, end: edit.end, duration: round(edit.end - edit.start),
      transitionToNext: null, selectionSource: 'manual'
    })
  }
  return {
    ...plan, segments, revision: plan.revision + 1,
    transcriptEditRevision: plan.transcriptEditRevision + 1,
    expectedDuration: calculatePlanDuration(segments), captionTrack: null
  }
}
