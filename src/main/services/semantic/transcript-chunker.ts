import { createHash } from 'node:crypto'
import type { SemanticTranscriptChunk, Transcript, TranscriptWord } from '@shared/types'

export const SEMANTIC_CHUNKING_VERSION = 'semantic-chunks-v1'
const MAX_CHARACTERS = 440
const TARGET_CHARACTERS = 220
const PAUSE_BOUNDARY_SECONDS = 1.1

function chunkId(transcript: Transcript, words: TranscriptWord[]): string {
  return createHash('sha256')
    .update(`${SEMANTIC_CHUNKING_VERSION}\0${transcript.id}\0${words.map((word) => `${word.id}:${word.text}`).join('|')}`)
    .digest('hex')
    .slice(0, 24)
}

function toChunk(transcript: Transcript, words: TranscriptWord[]): SemanticTranscriptChunk {
  const id = chunkId(transcript, words)
  const segmentIds = transcript.segments
    .filter((segment) => segment.end >= words[0].start && segment.start <= words.at(-1)!.end)
    .map((segment) => segment.id)
  return {
    id,
    transcriptId: transcript.id,
    transcriptRevision: transcript.revision,
    sourceClipId: transcript.sourceClipId,
    sourcePath: transcript.sourcePath,
    start: words[0].start,
    end: words.at(-1)!.end,
    text: words.map((word) => word.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim(),
    wordIds: words.map((word) => word.id),
    segmentIds,
    embeddingId: id
  }
}

export function chunkTranscript(transcript: Transcript): SemanticTranscriptChunk[] {
  const chunks: SemanticTranscriptChunk[] = []
  let current: TranscriptWord[] = []
  const flush = (): void => {
    if (!current.length) return
    chunks.push(toChunk(transcript, current))
    current = []
  }
  for (const word of transcript.words) {
    const previous = current.at(-1)
    const nextLength = current.reduce((sum, item) => sum + item.text.length + 1, 0) + word.text.length
    if (current.length && (nextLength > MAX_CHARACTERS || (previous && word.start - previous.end >= PAUSE_BOUNDARY_SECONDS))) flush()
    current.push(word)
    const sentenceEnd = /[.!?]["')\]]?$/.test(word.text)
    const length = current.reduce((sum, item) => sum + item.text.length + 1, 0)
    if (sentenceEnd && length >= TARGET_CHARACTERS * 0.45) flush()
  }
  flush()

  return chunks
}

export function chunkTranscripts(transcripts: Transcript[]): SemanticTranscriptChunk[] {
  return transcripts.flatMap(chunkTranscript)
}
