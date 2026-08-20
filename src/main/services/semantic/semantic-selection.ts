import type { AlternativeCandidate, RenderPlan, RenderPlanSegment, RenderSettings, SemanticTranscriptChunk } from '@shared/types'
import { loadSemanticAnalysis } from './analysis-repository'
import { loadEmbeddingMap } from './job-manager'
import { semanticProvider } from './minilm-provider'
import { cosineSimilarity } from './provider'

const weight = { light: 0.08, balanced: 0.18, strong: 0.3 } as const
const clamp = (value: number): number => Math.max(0, Math.min(1, value))

function overlappingChunks(chunks: SemanticTranscriptChunk[], path: string, start: number, end: number): SemanticTranscriptChunk[] {
  return chunks.filter((chunk) => chunk.sourcePath === path && chunk.end > start && chunk.start < end)
}

interface CandidateView extends AlternativeCandidate {
  current: boolean
}

export async function applySemanticSelection(
  plan: RenderPlan,
  settings: RenderSettings,
  signal: AbortSignal
): Promise<RenderPlan> {
  if (!settings.semantic.enabled || !settings.semantic.editGoal.trim() || plan.selectionMode !== 'smart') return plan
  const analysis = await loadSemanticAnalysis(plan.projectId)
  if (!analysis?.chunks.length) return { ...plan, warnings: [...plan.warnings, 'Semantic analysis unavailable; existing Smart Selection was used.'] }
  if (signal.aborted) throw new Error('Render cancelled.')
  const [goal] = await semanticProvider().embed([settings.semantic.editGoal.trim()], signal)
  const embeddings = await loadEmbeddingMap(plan.projectId, analysis.chunks, analysis.modelVersion)
  const topicByChunk = new Map(analysis.topics.flatMap((topic) => topic.chunkIds.map((id) => [id, topic.id] as const)))
  const excludedTopics = new Set(plan.topicSelections.filter((item) => item.importance === 'exclude').map((item) => item.topicId))
  const importantTopics = new Set(plan.topicSelections.filter((item) => item.importance === 'important').map((item) => item.topicId))
  const warnings = [...plan.warnings]

  const segments = plan.segments.map((segment): RenderPlanSegment => {
    const metadata = segment.selectedCandidate
    if (!metadata || metadata.analysisFallback) return segment
    const views: CandidateView[] = [{
      candidateId: metadata.candidateId,
      start: segment.start,
      end: segment.end,
      scores: metadata.scores,
      reasons: metadata.reasons,
      personAnalysis: metadata.personAnalysis,
      current: true
    }, ...(metadata.alternatives ?? []).map((candidate) => ({ ...candidate, current: false }))]

    const scored = views.map((candidate) => {
      const chunks = overlappingChunks(analysis.chunks, segment.sourcePath, candidate.start, candidate.end)
      const similarities = chunks.map((chunk) => embeddings.get(chunk.embeddingId)).filter((value): value is number[] => Boolean(value)).map((embedding) => cosineSimilarity(goal, embedding))
      const semanticRelevance = similarities.length ? clamp(Math.max(...similarities)) : 0
      const excludedByHint = plan.semanticHints.some((hint) => hint.kind === 'exclude' && hint.sourcePath === segment.sourcePath && hint.end > candidate.start && hint.start < candidate.end)
      const prioritized = plan.semanticHints.some((hint) => hint.kind === 'prioritize' && hint.sourcePath === segment.sourcePath && hint.end > candidate.start && hint.start < candidate.end)
      const excludedByTopic = chunks.some((chunk) => excludedTopics.has(topicByChunk.get(chunk.id) ?? ''))
      const important = chunks.some((chunk) => importantTopics.has(topicByChunk.get(chunk.id) ?? ''))
      const semanticWeight = weight[settings.semantic.editGoalStrength]
      const base = candidate.scores.total
      let total = base * (1 - semanticWeight) + semanticRelevance * semanticWeight + (prioritized ? 0.1 : 0) + (important ? 0.06 : 0)
      if (base < 0.3) total = Math.min(total, base + 0.08)
      if (excludedByHint || excludedByTopic) total = -1
      const excerpt = chunks.map((chunk) => chunk.text).join(' ').slice(0, 220)
      return {
        ...candidate,
        transcriptExcerpt: excerpt || undefined,
        semanticRelevance,
        speechPresent: candidate.scores.speechActivity > 0.25 || chunks.length > 0,
        scores: { ...candidate.scores, semanticRelevance, total: clamp(total) },
        reasons: [
          ...candidate.reasons.filter((reason) => reason !== 'Relevant to Edit Goal'),
          ...(semanticRelevance >= 0.45 ? ['Relevant to Edit Goal'] : []),
          ...(important ? ['Strong match to selected topic'] : []),
          ...(prioritized ? ['Prioritized transcript range'] : [])
        ].slice(0, 6),
        excluded: total < 0
      }
    })
    let usable = scored.filter((candidate) => !candidate.excluded)
    if (!usable.length && plan.useEveryClip) {
      usable = scored
      warnings.push(`${segment.filename} contains only excluded semantic ranges; Use Every Clip kept its best available section.`)
    }
    const selected = [...usable].sort((left, right) => right.scores.total - left.scores.total)[0]
    if (!selected) return segment
    const alternatives = scored.filter((candidate) => candidate.candidateId !== selected.candidateId).map(({ current: _current, excluded: _excluded, ...candidate }) => candidate)
    return {
      ...segment,
      start: selected.start,
      end: selected.end,
      duration: selected.end - selected.start,
      automaticStart: selected.start,
      automaticEnd: selected.end,
      selectedCandidate: {
        ...metadata,
        candidateId: selected.candidateId,
        scores: selected.scores,
        reasons: selected.reasons,
        personAnalysis: selected.personAnalysis,
        alternatives,
        decisionNotes: [...(metadata.decisionNotes ?? []), 'Edit Goal relevance applied locally.']
      }
    }
  })
  return {
    ...plan,
    segments,
    warnings,
    editGoal: settings.semantic.editGoal,
    editGoalStrength: settings.semantic.editGoalStrength,
    semanticModelVersion: analysis.modelVersion,
    semanticAnalysisVersion: analysis.analyzerVersion
  }
}
