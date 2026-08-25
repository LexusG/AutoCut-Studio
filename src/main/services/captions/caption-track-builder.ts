import type { CaptionBuildRequest, CaptionTrack, CaptionWord, Transcript } from '@shared/types'
import { chunkCaptionWords } from './caption-chunker'

function transcriptForPath(transcripts: Transcript[], path: string): Transcript | undefined {
  return transcripts.find((transcript) => transcript.sourcePath === path)
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export function buildCaptionTrack(request: CaptionBuildRequest): CaptionTrack | null {
  if (request.settings.mode === 'off') return null
  const mapped: CaptionWord[] = []
  const labelById = new Map((request.speakerLabels ?? []).map((label) => [label.speakerId, label]))
  const resolveLabel = (speakerId: string | null | undefined): string | null => {
    if (!speakerId) return null
    const label = labelById.get(speakerId)
    return (label?.mergedInto ? labelById.get(label.mergedInto) : label)?.displayName ?? null
  }
  let timeline = 0
  for (const segment of request.plan.segments) {
    const transcript = transcriptForPath(request.transcripts, segment.sourcePath)
    for (const word of transcript?.words ?? []) {
      if (word.excluded || word.end < segment.start || word.start > segment.end) continue
      const start = round(timeline + Math.max(0, word.start - segment.start))
      const end = round(timeline + Math.min(segment.duration, word.end - segment.start))
      if (end <= start) continue
      mapped.push({ id: word.id, text: word.text, start, end, speakerId: word.speakerId ?? null, speakerLabel: resolveLabel(word.speakerId) })
    }
    timeline += segment.duration - (segment.transitionToNext?.duration ?? 0)
  }
  const track = chunkCaptionWords(mapped.sort((left, right) => left.start - right.start), request.settings.mode)
  const accentColors = { 'accent-a': '#5eead4', 'accent-b': '#facc15', 'accent-c': '#f9a8d4', neutral: request.settings.style.highlightColor }
  return {
    ...track,
    chunks: track.chunks.map((chunk) => {
      const label = chunk.speakerId ? labelById.get(chunk.speakerId) : null
      const resolved = label?.mergedInto ? labelById.get(label.mergedInto) : label
      return {
        ...chunk,
        text: request.settings.showSpeakerNames && chunk.speakerLabel ? `${chunk.speakerLabel}: ${chunk.text}` : chunk.text,
        styleOverride: resolved && resolved.accent !== 'neutral' ? { highlightColor: accentColors[resolved.accent] } : null
      }
    })
  }
}
