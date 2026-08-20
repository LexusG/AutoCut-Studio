import { createHash } from 'node:crypto'
import type {
  SemanticAnalysisProgress,
  SemanticAnalysisRequest,
  SemanticAnalysisResult,
  SemanticEmbeddingRecord,
  SemanticProjectAnalysis,
  SemanticTranscriptChunk
} from '@shared/types'
import { analysisScheduler } from './analysis-scheduler'
import { loadSemanticAnalysis, saveSemanticAnalysis } from './analysis-repository'
import { readEmbedding, writeEmbedding } from './embedding-cache'
import { semanticProvider } from './minilm-provider'
import { getSemanticModelStatus } from './model-manager'
import { detectSimilarContent, detectTopics } from './topic-segmentation'
import { chunkTranscripts, SEMANTIC_CHUNKING_VERSION } from './transcript-chunker'

export const SEMANTIC_ANALYZER_VERSION = 'phase8-semantic-v1'

export function transcriptRevisionFingerprint(request: Pick<SemanticAnalysisRequest, 'transcripts'>): string {
  return createHash('sha256')
    .update(request.transcripts.map((transcript) => `${transcript.id}:${transcript.revision}:${transcript.fullText}`).join('\0'))
    .digest('hex')
}

export async function loadEmbeddingMap(
  projectId: string,
  chunks: SemanticTranscriptChunk[],
  modelVersion: string
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (const chunk of chunks) {
    const record = await readEmbedding(projectId, chunk, modelVersion)
    if (record) map.set(chunk.embeddingId, record.embedding)
  }
  return map
}

export async function analyzeSemantics(
  request: SemanticAnalysisRequest,
  onProgress: (progress: SemanticAnalysisProgress) => void
): Promise<SemanticAnalysisResult> {
  return analysisScheduler.schedule(request.jobId, request.priority, async (signal) => {
    const report = (state: SemanticAnalysisProgress['state'], stage: string, completed: number, total: number): void =>
      onProgress({ jobId: request.jobId, state, stage, completed, total, percent: total ? completed / total * 100 : 100 })
    const status = await getSemanticModelStatus()
    if (status.state !== 'ready') throw new Error('Semantic analysis unavailable. Install the local MiniLM model first.')
    const chunks = chunkTranscripts(request.transcripts.filter((transcript) => !transcript.noSpeech && transcript.words.length > 0))
    const fingerprint = transcriptRevisionFingerprint(request)
    const previous = await loadSemanticAnalysis(request.projectId)
    if (previous?.transcriptRevisionFingerprint === fingerprint && previous.modelVersion === status.modelVersion) {
      report('ready', 'Semantic analysis is current', chunks.length, chunks.length)
      return { analysis: previous, reference: await saveSemanticAnalysis(previous) }
    }
    report('running', 'Preparing transcript chunks', 0, chunks.length)
    const records = new Map<string, SemanticEmbeddingRecord>()
    let cachedCount = 0
    const missing: SemanticTranscriptChunk[] = []
    for (const chunk of chunks) {
      const cached = await readEmbedding(request.projectId, chunk, status.modelVersion)
      if (cached) { records.set(chunk.embeddingId, cached); cachedCount += 1 }
      else missing.push(chunk)
    }
    const provider = semanticProvider()
    for (let index = 0; index < missing.length; index += 8) {
      if (signal.aborted) throw new Error('Semantic analysis cancelled.')
      const batch = missing.slice(index, index + 8)
      report('running', 'Embedding transcript locally', cachedCount + index, chunks.length)
      const embeddings = await provider.embed(batch.map((chunk) => chunk.text), signal)
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        const record = await writeEmbedding(request.projectId, batch[batchIndex], embeddings[batchIndex], status.modelVersion)
        records.set(record.id, record)
      }
    }
    if (signal.aborted) throw new Error('Semantic analysis cancelled.')
    report('running', 'Detecting topics and similar sections', chunks.length, chunks.length)
    const embeddings = new Map([...records].map(([id, record]) => [id, record.embedding]))
    const analysis: SemanticProjectAnalysis = {
      projectId: request.projectId,
      provider: 'minilm-transformers-js',
      model: 'Xenova/all-MiniLM-L6-v2',
      modelVersion: status.modelVersion,
      analyzerVersion: SEMANTIC_ANALYZER_VERSION,
      chunkingVersion: SEMANTIC_CHUNKING_VERSION,
      transcriptRevisionFingerprint: fingerprint,
      chunks,
      topics: detectTopics(chunks, embeddings),
      similarContent: detectSimilarContent(chunks, embeddings),
      embeddedCount: chunks.length,
      cachedCount,
      createdAt: new Date().toISOString()
    }
    const reference = await saveSemanticAnalysis(analysis)
    report('ready', 'Semantic analysis ready', chunks.length, chunks.length)
    return { analysis, reference }
  })
}

export function cancelSemanticAnalysis(jobId: string): boolean {
  return analysisScheduler.cancel(jobId)
}
