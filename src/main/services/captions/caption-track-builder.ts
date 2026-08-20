import type { CaptionBuildRequest, CaptionTrack, CaptionWord, Transcript } from '@shared/types'
import { chunkCaptionWords } from './caption-chunker'

function transcriptForPath(transcripts: Transcript[], path: string): Transcript | undefined {
  return transcripts.find((transcript) => transcript.sourcePath === path)
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export function buildCaptionTrack(request: CaptionBuildRequest): CaptionTrack | null {
  if (request.settings.mode === 'off') return null
  const mapped: CaptionWord[] = []
  let timeline = 0
  for (const segment of request.plan.segments) {
    const transcript = transcriptForPath(request.transcripts, segment.sourcePath)
    for (const word of transcript?.words ?? []) {
      if (word.excluded || word.end < segment.start || word.start > segment.end) continue
      const start = round(timeline + Math.max(0, word.start - segment.start))
      const end = round(timeline + Math.min(segment.duration, word.end - segment.start))
      if (end <= start) continue
      mapped.push({ id: word.id, text: word.text, start, end })
    }
    timeline += segment.duration - (segment.transitionToNext?.duration ?? 0)
  }
  return chunkCaptionWords(mapped.sort((left, right) => left.start - right.start), request.settings.mode)
}
