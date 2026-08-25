import type { SemanticMatchLabel, SemanticSearchRequest, SemanticSearchResult } from '@shared/types'
import { loadSemanticAnalysis } from './analysis-repository'
import { loadEmbeddingMap } from './job-manager'
import { semanticProvider } from './minilm-provider'
import { cosineSimilarity } from './provider'

export function relevanceLabel(score: number): SemanticMatchLabel {
  if (score >= 0.55) return 'High Match'
  if (score >= 0.32) return 'Good Match'
  return 'Possible Match'
}

export async function semanticSearch(request: SemanticSearchRequest): Promise<SemanticSearchResult[]> {
  const analysis = await loadSemanticAnalysis(request.projectId)
  if (!analysis) return []
  const query = request.query.trim()
  if (!query) return []
  const limit = Math.max(1, Math.min(50, request.limit ?? 12))
  const topicByChunk = new Map(analysis.topics.flatMap((topic) => topic.chunkIds.map((chunkId) => [chunkId, topic.id] as const)))
  const eligible = analysis.chunks.filter((chunk) =>
    (!request.speakerId || chunk.speakerIds?.includes(request.speakerId)) &&
    (!request.sourceClipId || chunk.sourceClipId === request.sourceClipId)
  )
  const result = (chunk: typeof analysis.chunks[number], score: number): SemanticSearchResult => ({
    ...chunk, chunkId: chunk.id, score, relevance: relevanceLabel(score), topicId: topicByChunk.get(chunk.id) ?? null,
    speakerId: chunk.speakerIds?.length === 1 ? chunk.speakerIds[0] : null
  })
  if (request.mode === 'exact') {
    const needle = query.toLocaleLowerCase()
    return eligible
      .filter((chunk) => chunk.text.toLocaleLowerCase().includes(needle))
      .slice(0, limit)
      .map((chunk) => result(chunk, 1))
  }
  const [queryEmbedding] = await semanticProvider().embed([query])
  const embeddings = await loadEmbeddingMap(request.projectId, analysis.chunks, analysis.modelVersion)
  return eligible
    .map((chunk) => {
      const embedding = embeddings.get(chunk.embeddingId)
      const score = embedding ? Math.max(0, cosineSimilarity(queryEmbedding, embedding)) : 0
      return result(chunk, score)
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}
