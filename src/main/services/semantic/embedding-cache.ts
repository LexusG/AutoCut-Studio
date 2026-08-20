import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SemanticEmbeddingRecord, SemanticTranscriptChunk } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { SEMANTIC_CHUNKING_VERSION } from './transcript-chunker'

export function semanticProjectDirectory(projectId: string): string {
  return join(applicationStoragePaths().projects, projectId, 'semantic')
}

export function contentHash(chunk: SemanticTranscriptChunk): string {
  return createHash('sha256').update(chunk.text.normalize('NFKC').trim()).digest('hex')
}

function cacheKey(projectId: string, chunk: SemanticTranscriptChunk, modelVersion: string): string {
  return createHash('sha256')
    .update(`${projectId}\0${modelVersion}\0${SEMANTIC_CHUNKING_VERSION}\0${contentHash(chunk)}`)
    .digest('hex')
}

function cachePath(projectId: string, chunk: SemanticTranscriptChunk, modelVersion: string): string {
  return join(semanticProjectDirectory(projectId), 'embeddings', `${cacheKey(projectId, chunk, modelVersion)}.json`)
}

export async function readEmbedding(
  projectId: string,
  chunk: SemanticTranscriptChunk,
  modelVersion: string
): Promise<SemanticEmbeddingRecord | null> {
  try {
    const record = JSON.parse(await readFile(cachePath(projectId, chunk, modelVersion), 'utf8')) as SemanticEmbeddingRecord
    if (record.contentHash !== contentHash(chunk) || record.embedding.length !== 384) return null
    return { ...record, sourceTranscriptId: chunk.transcriptId, transcriptRevision: chunk.transcriptRevision,
      sourceStart: chunk.start, sourceEnd: chunk.end, id: chunk.embeddingId }
  } catch {
    return null
  }
}

export async function writeEmbedding(
  projectId: string,
  chunk: SemanticTranscriptChunk,
  embedding: number[],
  modelVersion: string
): Promise<SemanticEmbeddingRecord> {
  const record: SemanticEmbeddingRecord = {
    id: chunk.embeddingId,
    provider: 'minilm-transformers-js',
    model: 'Xenova/all-MiniLM-L6-v2',
    modelVersion,
    sourceTranscriptId: chunk.transcriptId,
    transcriptRevision: chunk.transcriptRevision,
    sourceStart: chunk.start,
    sourceEnd: chunk.end,
    contentHash: contentHash(chunk),
    chunkingVersion: SEMANTIC_CHUNKING_VERSION,
    embedding,
    createdAt: new Date().toISOString(),
    analyzerVersion: 'phase8-semantic-v1'
  }
  const path = cachePath(projectId, chunk, modelVersion)
  await mkdir(join(semanticProjectDirectory(projectId), 'embeddings'), { recursive: true })
  await writeFile(path, `${JSON.stringify(record)}\n`, 'utf8')
  return record
}
