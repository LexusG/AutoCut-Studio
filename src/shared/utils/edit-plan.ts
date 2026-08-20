import type { RenderPlan, RenderPlanSegment } from '../types'

const round = (value: number): number => Math.round(value * 1000) / 1000

export function calculatePlanDuration(segments: RenderPlanSegment[]): number {
  return round(segments.reduce((sum, segment) =>
    sum + segment.duration - (segment.transitionToNext?.duration ?? 0), 0))
}

function revised(plan: RenderPlan, segments: RenderPlanSegment[]): RenderPlan {
  return { ...plan, revision: plan.revision + 1, segments, expectedDuration: calculatePlanDuration(segments) }
}

export function adjustPlanSegment(plan: RenderPlan, id: string, start: number, end: number): RenderPlan {
  const segment = plan.segments.find((item) => item.id === id)
  if (!segment) throw new Error('The selected segment is no longer in the Edit Plan.')
  const safeStart = round(start)
  const safeEnd = round(end)
  if (safeStart < 0 || safeEnd > segment.sourceDuration + 0.001 || safeEnd <= safeStart) {
    throw new Error('Choose a range within the source clip where End is after Start.')
  }
  const minimum = Math.max(0.1, segment.transitionToNext?.duration ?? 0)
  if (safeEnd - safeStart <= minimum) throw new Error('The selected range is too short for its transition.')
  return revised(plan, plan.segments.map((item) => item.id === id ? {
    ...item, start: safeStart, end: safeEnd, duration: round(safeEnd - safeStart), selectionSource: 'manual'
  } : item))
}

export function resetPlanSegment(plan: RenderPlan, id: string): RenderPlan {
  return revised(plan, plan.segments.map((segment) => segment.id === id ? {
    ...segment,
    start: segment.automaticStart,
    end: segment.automaticEnd,
    duration: round(segment.automaticEnd - segment.automaticStart),
    selectionSource: plan.selectionMode === 'smart' ? 'smart' : 'classic'
  } : segment))
}

export function togglePlanSegmentLock(plan: RenderPlan, id: string): RenderPlan {
  return revised(plan, plan.segments.map((segment) =>
    segment.id === id ? { ...segment, locked: !segment.locked } : segment
  ))
}

export function tryAlternateSegment(plan: RenderPlan, id: string): RenderPlan {
  const current = plan.segments.find((segment) => segment.id === id)
  const alternative = current?.selectedCandidate?.alternatives?.[0]
  if (!current || !alternative) throw new Error('No alternative section is available for this clip.')
  const previous = current.selectedCandidate!
  const replacementAlternatives = [
    {
      candidateId: previous.candidateId,
      start: current.start,
      end: current.end,
      scores: previous.scores,
      reasons: previous.reasons,
      personAnalysis: previous.personAnalysis,
      semanticRelevance: previous.scores.semanticRelevance,
      speechPresent: previous.scores.speechActivity > 0.25
    },
    ...(previous.alternatives ?? []).slice(1)
  ]
  return revised(plan, plan.segments.map((segment) => segment.id === id ? {
    ...segment,
    start: alternative.start,
    end: alternative.end,
    duration: round(alternative.end - alternative.start),
    automaticStart: alternative.start,
    automaticEnd: alternative.end,
    selectionSource: 'manual',
    selectedCandidate: {
      ...previous,
      candidateId: alternative.candidateId,
      scores: alternative.scores,
      reasons: alternative.reasons,
      personAnalysis: alternative.personAnalysis,
      alternatives: replacementAlternatives,
      decisionNotes: [...(previous.decisionNotes ?? []), 'Alternate candidate selected manually.']
    }
  } : segment))
}

export function reorderPlanSegment(plan: RenderPlan, sourceId: string, targetId: string): RenderPlan {
  const sourceIndex = plan.segments.findIndex((segment) => segment.id === sourceId)
  const targetIndex = plan.segments.findIndex((segment) => segment.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return plan
  const segments = [...plan.segments]
  const transition = segments.find((segment) => segment.transitionToNext)?.transitionToNext ?? null
  const [moved] = segments.splice(sourceIndex, 1)
  segments.splice(targetIndex, 0, moved)
  return revised(plan, segments.map((segment, index) => ({
    ...segment,
    transitionToNext: index === segments.length - 1 ? null : (segment.transitionToNext ?? transition)
  })))
}

export function rebalancePlan(plan: RenderPlan, markManual = true): RenderPlan {
  if (plan.requestedDuration == null) return plan
  const segments = plan.segments.map((segment) => ({ ...segment }))
  let difference = plan.requestedDuration - calculatePlanDuration(segments)
  const adjustable = segments.filter((segment) => !segment.locked)
  if (adjustable.length === 0) throw new Error('Unlock at least one segment before rebalancing.')
  for (let pass = 0; pass < 4 && Math.abs(difference) > 0.01; pass += 1) {
    const share = difference / adjustable.length
    for (const segment of adjustable) {
      const minimum = Math.max(0.5, (segment.transitionToNext?.duration ?? 0) + 0.05)
      const maximum = segment.sourceDuration - segment.start
      const duration = Math.max(minimum, Math.min(maximum, segment.duration + share))
      segment.duration = round(duration)
      segment.end = round(segment.start + duration)
      if (markManual) segment.selectionSource = 'manual'
    }
    difference = plan.requestedDuration - calculatePlanDuration(segments)
  }
  return revised(plan, segments)
}
