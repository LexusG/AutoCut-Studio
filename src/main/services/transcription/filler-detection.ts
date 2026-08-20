import type { Transcript, TranscriptWord } from '@shared/types'

const CONSERVATIVE_ENGLISH_FILLERS = new Set(['um', 'uh', 'erm', 'hmm'])

export function detectFillerWords(transcript: Transcript): Transcript {
  const marked = new Map<string, TranscriptWord>()
  const words = transcript.words.map((word) => {
    const normalized = word.text.toLowerCase().replace(/[^a-z]/g, '')
    const next = { ...word, filler: CONSERVATIVE_ENGLISH_FILLERS.has(normalized) }
    marked.set(word.id, next)
    return next
  })
  return {
    ...transcript,
    words,
    segments: transcript.segments.map((segment) => ({
      ...segment, words: segment.words.map((word) => marked.get(word.id) ?? word)
    })),
    revision: transcript.revision + 1,
    updatedAt: new Date().toISOString()
  }
}

export function findLongPauses(transcript: Transcript, threshold: number): Array<{ start: number; end: number; duration: number }> {
  const pauses = []
  const words = transcript.words.filter((word) => !word.excluded).sort((left, right) => left.start - right.start)
  for (let index = 1; index < words.length; index += 1) {
    const start = words[index - 1].end
    const end = words[index].start
    if (end - start >= threshold) pauses.push({ start, end, duration: end - start })
  }
  return pauses
}
