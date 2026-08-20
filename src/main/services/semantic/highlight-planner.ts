import { randomUUID } from 'node:crypto'
import type { HighlightReelRequest, RenderPlan, RenderPlanSegment } from '@shared/types'
import { calculatePlanDuration } from '@shared/utils/edit-plan'

function segmentForHighlight(plan: RenderPlan, highlight: HighlightReelRequest['highlights'][number]): RenderPlanSegment | null {
  const source = plan.segments.find((segment) => segment.sourcePath === highlight.sourcePath)
  if (!source) return null
  const end = Math.min(highlight.end, source.sourceDuration)
  const start = Math.max(0, Math.min(highlight.start, end - 0.1))
  return {
    ...structuredClone(source),
    id: `highlight-segment-${highlight.id}`,
    start,
    end,
    duration: end - start,
    automaticStart: start,
    automaticEnd: end,
    locked: highlight.locked,
    selectionSource: 'manual',
    transitionToNext: source.transitionToNext,
    selectedCandidate: source.selectedCandidate ? {
      ...source.selectedCandidate,
      reasons: [...highlight.reasons, ...source.selectedCandidate.reasons].slice(0, 6),
      decisionNotes: [...(source.selectedCandidate.decisionNotes ?? []), `Highlight score ${highlight.scores.total.toFixed(2)}`]
    } : null
  }
}

export function createHighlightReel(request: HighlightReelRequest): RenderPlan {
  const selected = request.highlights.filter((highlight) => highlight.selected && !highlight.excluded)
  if (!selected.length) throw new Error('Select at least one highlight before creating a reel.')
  const parent = request.parentPlan
  const preserved: RenderPlanSegment[] = []
  if (request.preserveIntro && parent.segments[0]?.locked) preserved.push(structuredClone(parent.segments[0]))
  if (request.preserveOutro && parent.segments.at(-1)?.locked && parent.segments.at(-1)?.id !== preserved[0]?.id) preserved.push(structuredClone(parent.segments.at(-1)!))
  const available = Math.max(0.5, request.targetDuration - calculatePlanDuration(preserved))
  const ranked = [...selected].sort((left, right) => request.mode === 'social-cut'
    ? right.scores.openingStrength - left.scores.openingStrength
    : right.scores.total - left.scores.total)
  const segments: RenderPlanSegment[] = request.preserveIntro && preserved[0] ? [preserved[0]] : []
  let used = calculatePlanDuration(segments)
  for (const highlight of ranked) {
    if (used >= request.targetDuration - 0.1) break
    const segment = segmentForHighlight(parent, highlight)
    if (!segment) continue
    const remaining = request.targetDuration - used
    if (segment.duration > remaining) {
      segment.duration = remaining
      segment.end = segment.start + remaining
      segment.automaticEnd = segment.end
    }
    if (segment.duration >= 0.5) {
      segments.push(segment)
      used = calculatePlanDuration(segments)
    }
  }
  if (request.preserveOutro && preserved.at(-1) && preserved.at(-1)!.id !== preserved[0]?.id) segments.push(preserved.at(-1)!)
  if (!segments.length) throw new Error('The selected highlights cannot be mapped to the current Edit Plan.')
  const normalized = segments.map((segment, index) => ({
    ...segment,
    id: `segment-${(index + 1).toString().padStart(3, '0')}-${randomUUID().slice(0, 6)}`,
    transitionToNext: index === segments.length - 1 ? null : segment.transitionToNext
  }))
  return {
    ...structuredClone(parent),
    id: randomUUID(),
    generation: parent.generation + 1,
    createdAt: new Date().toISOString(),
    segments: normalized,
    expectedDuration: calculatePlanDuration(normalized),
    requestedDuration: request.targetDuration,
    variantId: request.variantId ?? null,
    generationMode: request.mode,
    highlightCandidateIds: selected.map((highlight) => highlight.id),
    revision: parent.revision + 1,
    captionTrack: null
  }
}
