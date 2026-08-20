import { randomUUID } from 'node:crypto'
import type { CaptionChunk, CaptionMode, CaptionTrack, CaptionWord } from '@shared/types'

export interface CaptionChunkingOptions {
  maximumWords: number
  maximumCharacters: number
  minimumDuration: number
  maximumDuration: number
  pauseBoundary: number
}

export const CAPTION_CONSTRAINTS: Record<Exclude<CaptionMode, 'off'>, CaptionChunkingOptions> = {
  standard: { maximumWords: 12, maximumCharacters: 76, minimumDuration: 0.8, maximumDuration: 6, pauseBoundary: 0.65 },
  dynamic: { maximumWords: 5, maximumCharacters: 32, minimumDuration: 0.35, maximumDuration: 2.8, pauseBoundary: 0.35 }
}

function punctuationBoundary(text: string): boolean {
  return /[.!?;:]$/.test(text.trim())
}

export function chunkCaptionWords(words: CaptionWord[], mode: Exclude<CaptionMode, 'off'>): CaptionTrack {
  const options = CAPTION_CONSTRAINTS[mode]
  const chunks: CaptionChunk[] = []
  let current: CaptionWord[] = []
  const flush = (): void => {
    if (!current.length) return
    const text = current.map((word) => word.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
    const spokenEnd = current[current.length - 1].end
    const start = current[0].start
    chunks.push({
      id: randomUUID(), start, end: Math.max(spokenEnd, Math.min(start + options.minimumDuration, start + options.maximumDuration)),
      text, words: current, styleOverride: null, deleted: false
    })
    current = []
  }
  for (const word of words) {
    const previous = current.at(-1)
    const proposedText = [...current, word].map((item) => item.text).join(' ')
    const duration = current.length ? word.end - current[0].start : word.end - word.start
    if (current.length && (
      current.length >= options.maximumWords || proposedText.length > options.maximumCharacters ||
      duration > options.maximumDuration || (previous && word.start - previous.end >= options.pauseBoundary)
    )) flush()
    current.push(word)
    if (punctuationBoundary(word.text) && current.length >= (mode === 'dynamic' ? 2 : 4)) flush()
  }
  flush()
  for (let index = 0; index < chunks.length - 1; index += 1) {
    chunks[index].end = Math.min(chunks[index].end, chunks[index + 1].start)
  }
  return { version: 1, revision: 1, mode, chunks, generatedAt: new Date().toISOString() }
}
