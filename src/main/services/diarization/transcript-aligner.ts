import type { DiarizationSegment, SpeakerDiarizationResult, Transcript, TranscriptSegment, TranscriptWord } from '@shared/types'

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}
function speakerForRange(start: number, end: number, regions: DiarizationSegment[]): string | null {
  const matches = regions.map((region) => ({ id: region.speakerId, amount: overlap(start, end, region.start, region.end) }))
    .filter((match) => match.amount > 0).sort((left, right) => right.amount - left.amount)
  if (!matches.length) return null
  const duration = Math.max(0.01, end - start)
  if (matches[0].amount < Math.min(0.04, duration * 0.25)) return null
  if (matches[1] && matches[1].amount >= matches[0].amount * 0.9) return null
  return matches[0].id
}

function alignWord(word: TranscriptWord, regions: DiarizationSegment[]): TranscriptWord {
  return { ...word, speakerId: speakerForRange(word.start, word.end, regions), confidenceLevel:
    word.confidence == null ? 'unknown' : word.confidence < 0.45 ? 'low' : word.confidence < 0.72 ? 'medium' : 'high',
    reviewState: word.reviewState ?? 'unreviewed' }
}

function alignSegment(segment: TranscriptSegment, words: TranscriptWord[], regions: DiarizationSegment[]): TranscriptSegment {
  const speakerTotals = new Map<string, number>()
  for (const word of words) if (word.speakerId) speakerTotals.set(word.speakerId, (speakerTotals.get(word.speakerId) ?? 0) + Math.max(0.01, word.end - word.start))
  const speakerId = [...speakerTotals].sort((left, right) => right[1] - left[1])[0]?.[0] ?? speakerForRange(segment.start, segment.end, regions)
  return { ...segment, words, speakerId }
}

export function alignTranscriptSpeakers(transcript: Transcript, diarization: SpeakerDiarizationResult): Transcript {
  const words = transcript.words.map((word) => alignWord(word, diarization.segments))
  const byId = new Map(words.map((word) => [word.id, word]))
  const segments = transcript.segments.map((segment) => alignSegment(segment, segment.words.map((word) => byId.get(word.id) ?? alignWord(word, diarization.segments)), diarization.segments))
  return { ...transcript, words, segments, updatedAt: new Date().toISOString(), revision: transcript.revision + 1 }
}
