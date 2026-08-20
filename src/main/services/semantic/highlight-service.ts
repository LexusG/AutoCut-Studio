import { basename } from 'node:path'
import type { HighlightCandidate, HighlightDiscoveryRequest, RenderPlanSegment } from '@shared/types'
import { createMediaUrl, allowMediaPath } from '../filesystem/media-access'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { generateThumbnail } from '../video/thumbnails'
import { loadSemanticAnalysis } from './analysis-repository'
import { loadEmbeddingMap } from './job-manager'
import { semanticProvider } from './minilm-provider'
import { cosineSimilarity } from './provider'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

function fallbackHighlights(request: HighlightDiscoveryRequest): HighlightCandidate[] {
  return (request.plan?.segments ?? []).map((segment, index) => {
    const scores = segment.selectedCandidate?.scores
    const visual = scores ? (scores.sharpness + scores.exposure + scores.stability + scores.sceneQuality) / 4 : 0.5
    const audio = scores?.audioActivity ?? (segment.hasAudio ? 0.5 : 0)
    const speech = scores ? (scores.speechActivity + scores.speechCompleteness + scores.speechBoundaryQuality) / 3 : 0
    const person = scores?.personPresence ?? 0
    const total = clamp(visual * 0.38 + audio * 0.16 + speech * 0.28 + person * 0.1 + 0.08)
    return {
      id: `fallback-highlight-${segment.id}`,
      sourceClipId: segment.sourcePath,
      sourcePath: segment.sourcePath,
      filename: segment.filename,
      start: segment.start,
      end: segment.end,
      duration: segment.duration,
      transcript: '',
      topicId: null,
      scores: { visual, audio, speech, person, semantic: 0, novelty: 1, openingStrength: total, total },
      reasons: [visual >= 0.6 ? 'Strong visual quality' : 'Best available visual moment', ...(speech >= 0.4 ? ['Complete spoken moment'] : [])],
      personPresent: person >= 0.35,
      selected: index < 8,
      locked: segment.locked,
      excluded: false,
      alternativeIds: [],
      thumbnailPath: null,
      thumbnailUrl: null
    }
  })
}

function overlappingSegment(segments: RenderPlanSegment[], path: string, start: number, end: number): RenderPlanSegment | undefined {
  return segments.find((segment) => segment.sourcePath === path && segment.end > start && segment.start < end)
}

export async function findHighlights(request: HighlightDiscoveryRequest): Promise<HighlightCandidate[]> {
  const analysis = await loadSemanticAnalysis(request.projectId)
  if (!analysis) return fallbackHighlights(request)
  const embeddings = await loadEmbeddingMap(request.projectId, analysis.chunks, analysis.modelVersion)
  const goalEmbedding = request.editGoal.trim() ? (await semanticProvider().embed([request.editGoal.trim()]))[0] : null
  const topicByChunk = new Map(analysis.topics.flatMap((topic) => topic.chunkIds.map((id) => [id, topic] as const)))
  const excludedTopics = new Set(request.topicSelections.filter((item) => item.importance === 'exclude').map((item) => item.topicId))
  const importantTopics = new Set(request.topicSelections.filter((item) => item.importance === 'important').map((item) => item.topicId))
  const candidates: HighlightCandidate[] = analysis.chunks.map((chunk) => {
    const segment = overlappingSegment(request.plan?.segments ?? [], chunk.sourcePath, chunk.start, chunk.end)
    const base = segment?.selectedCandidate?.scores
    const topic = topicByChunk.get(chunk.id)
    const hint = request.semanticHints.find((item) => item.sourcePath === chunk.sourcePath && item.end > chunk.start && item.start < chunk.end)
    const semantic = goalEmbedding && embeddings.get(chunk.embeddingId)
      ? clamp(cosineSimilarity(goalEmbedding, embeddings.get(chunk.embeddingId)!)) : 0.5
    const visual = base ? (base.sharpness + base.exposure + base.stability + base.sceneQuality) / 4 : 0.5
    const audio = base?.audioActivity ?? (chunk.text ? 0.65 : 0)
    const speech = base ? (base.speechActivity + base.speechCompleteness + base.speechBoundaryQuality) / 3 : 0.72
    const person = base?.personPresence ?? 0
    const openingStrength = clamp(visual * 0.32 + speech * 0.32 + person * 0.16 + semantic * 0.2)
    const excluded = hint?.kind === 'exclude' || (topic ? excludedTopics.has(topic.id) : false)
    const importanceBonus = topic && importantTopics.has(topic.id) ? 0.1 : 0
    const prioritizeBonus = hint?.kind === 'prioritize' ? 0.12 : 0
    const total = excluded ? 0 : clamp(visual * 0.22 + audio * 0.1 + speech * 0.2 + person * 0.08 + semantic * 0.24 + 0.16 + importanceBonus + prioritizeBonus)
    const reasons = [
      semantic >= 0.55 ? 'Relevant to Edit Goal' : null,
      speech >= 0.6 ? 'Complete spoken moment' : null,
      visual >= 0.62 ? 'Strong visual quality' : null,
      person >= 0.45 ? 'Person present' : null,
      hint?.kind === 'prioritize' ? 'Prioritized transcript range' : null,
      importantTopics.has(topic?.id ?? '') ? 'Strong match to selected topic' : null
    ].filter((value): value is string => Boolean(value))
    return {
      id: `highlight-${chunk.id}`,
      sourceClipId: chunk.sourceClipId,
      sourcePath: chunk.sourcePath,
      filename: basename(chunk.sourcePath),
      start: chunk.start,
      end: chunk.end,
      duration: Math.max(0.1, chunk.end - chunk.start),
      transcript: chunk.text,
      topicId: topic?.id ?? null,
      scores: { visual, audio, speech, person, semantic, novelty: 1, openingStrength, total },
      reasons: reasons.length ? reasons : ['Adds transcript coverage'],
      personPresent: person >= 0.35,
      selected: false,
      locked: false,
      excluded,
      alternativeIds: [],
      thumbnailPath: null,
      thumbnailUrl: null
    }
  })

  const ranked = candidates.filter((candidate) => !candidate.excluded).sort((left, right) => right.scores.total - left.scores.total)
  const chosen: HighlightCandidate[] = []
  const selectedIds = new Set<string>()
  while (chosen.length < Math.min(12, ranked.length)) {
    const next = ranked.filter((candidate) => !selectedIds.has(candidate.id)).map((candidate) => {
      const embedding = embeddings.get(candidate.id.replace('highlight-', ''))
      const redundancy = chosen.reduce((highest, prior) => {
        const priorEmbedding = embeddings.get(prior.id.replace('highlight-', ''))
        return embedding && priorEmbedding ? Math.max(highest, cosineSimilarity(embedding, priorEmbedding)) : highest
      }, 0)
      const topicBonus = chosen.some((item) => item.topicId === candidate.topicId) ? 0 : 0.08
      const sourceBonus = chosen.some((item) => item.sourceClipId === candidate.sourceClipId) ? 0 : 0.05
      return { candidate, rank: candidate.scores.total - Math.max(0, redundancy - 0.72) * 0.55 + topicBonus + sourceBonus, redundancy }
    }).sort((left, right) => right.rank - left.rank)[0]
    if (!next) break
    next.candidate.scores.novelty = clamp(1 - next.redundancy)
    chosen.push(next.candidate)
    selectedIds.add(next.candidate.id)
  }
  chosen.forEach((candidate) => { candidate.selected = true; candidate.reasons.push('Adds new topic coverage') })

  const status = await detectFfmpeg()
  if (status.ffmpeg.path) {
    for (const candidate of candidates.slice(0, 24)) {
      try {
        const path = await generateThumbnail(status.ffmpeg.path, candidate.sourcePath, candidate.end)
        allowMediaPath(path)
        candidate.thumbnailPath = path
        candidate.thumbnailUrl = createMediaUrl(path)
      } catch { /* A missing thumbnail must not block highlight review. */ }
    }
  }
  const duplicateByChunk = new Map(analysis.similarContent.flatMap((group) => group.chunkIds.map((id) => [id, group] as const)))
  candidates.forEach((candidate) => {
    const group = duplicateByChunk.get(candidate.id.replace('highlight-', ''))
    if (group) {
      candidate.alternativeIds = group.chunkIds.filter((id) => `highlight-${id}` !== candidate.id).map((id) => `highlight-${id}`)
      candidate.reasons.push('Similar content available')
    }
  })
  return candidates.sort((left, right) => right.scores.total - left.scores.total)
}
