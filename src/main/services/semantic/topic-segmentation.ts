import { randomUUID } from 'node:crypto'
import type { SemanticTranscriptChunk, SimilarContentGroup, TopicSegment } from '@shared/types'
import { cosineSimilarity } from './provider'

const BOUNDARY_SIMILARITY = 0.43
const DUPLICATE_SIMILARITY = 0.86

export function detectTopics(
  chunks: SemanticTranscriptChunk[],
  embeddings: Map<string, number[]>
): TopicSegment[] {
  if (!chunks.length) return []
  const groups: SemanticTranscriptChunk[][] = [[chunks[0]]]
  for (let index = 1; index < chunks.length; index += 1) {
    const previous = embeddings.get(chunks[index - 1].embeddingId)
    const current = embeddings.get(chunks[index].embeddingId)
    const similarity = previous && current ? cosineSimilarity(previous, current) : 1
    const currentGroup = groups.at(-1)!
    const sourceChanged = chunks[index - 1].sourceClipId !== chunks[index].sourceClipId
    const duration = currentGroup.reduce((sum, chunk) => sum + Math.max(0.1, chunk.end - chunk.start), 0)
    if (similarity < BOUNDARY_SIMILARITY && (duration >= 5 || sourceChanged)) groups.push([chunks[index]])
    else currentGroup.push(chunks[index])
  }

  let timeline = 0
  return groups.map((group, index) => {
    const duration = group.reduce((sum, chunk) => sum + Math.max(0.1, chunk.end - chunk.start), 0)
    const similarities = group.slice(1).map((chunk, offset) => {
      const left = embeddings.get(group[offset].embeddingId)
      const right = embeddings.get(chunk.embeddingId)
      return left && right ? cosineSimilarity(left, right) : 0
    })
    const topic: TopicSegment = {
      id: `topic-${randomUUID()}`,
      start: timeline,
      end: timeline + duration,
      chunkIds: group.map((chunk) => chunk.id),
      sourceClipIds: [...new Set(group.map((chunk) => chunk.sourceClipId))],
      representativeText: group[0].text,
      meanNeighborSimilarity: similarities.length ? similarities.reduce((sum, value) => sum + value, 0) / similarities.length : 1,
      userLabel: null,
      importance: 'normal',
      chapterEnabled: true,
      chapterStart: timeline
    }
    timeline += duration
    return { ...topic, id: `topic-${index + 1}-${topic.id.slice(-8)}` }
  })
}

export function detectSimilarContent(
  chunks: SemanticTranscriptChunk[],
  embeddings: Map<string, number[]>
): SimilarContentGroup[] {
  const assigned = new Set<string>()
  const groups: SimilarContentGroup[] = []
  for (let leftIndex = 0; leftIndex < chunks.length; leftIndex += 1) {
    const left = chunks[leftIndex]
    if (assigned.has(left.id)) continue
    const matches = [left]
    for (let rightIndex = leftIndex + 1; rightIndex < chunks.length; rightIndex += 1) {
      const right = chunks[rightIndex]
      if (assigned.has(right.id)) continue
      const a = embeddings.get(left.embeddingId)
      const b = embeddings.get(right.embeddingId)
      if (a && b && cosineSimilarity(a, b) >= DUPLICATE_SIMILARITY) matches.push(right)
    }
    if (matches.length > 1) {
      matches.forEach((chunk) => assigned.add(chunk.id))
      const similarities = matches.slice(1).map((chunk) => cosineSimilarity(embeddings.get(left.embeddingId)!, embeddings.get(chunk.embeddingId)!))
      groups.push({
        id: `similar-${groups.length + 1}`,
        chunkIds: matches.map((chunk) => chunk.id),
        similarity: similarities.reduce((sum, value) => sum + value, 0) / similarities.length,
        recommendedChunkId: matches.reduce((best, chunk) => chunk.text.length > best.text.length ? chunk : best).id
      })
    }
  }
  return groups
}
