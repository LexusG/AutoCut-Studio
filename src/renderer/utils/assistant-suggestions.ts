import type {
  HighlightCandidate,
  OutputVariant,
  RenderPlan,
  SpeakerDiarizationResult,
  Transcript,
  TopicSegment
} from '@shared/types'

/**
 * What the assistant is proposing.
 *
 * `apply` suggestions carry a change the user can accept outright. `review` ones
 * need human judgement, so they route to the panel that can make the call rather
 * than mutating anything.
 */
export type SuggestionKind = 'apply' | 'review'

/** Where a suggestion sends the user when they act on it. */
export type SuggestionTarget =
  | 'highlights'
  | 'transcript'
  | 'captions'
  | 'speakers'
  | 'review'
  | 'topics'
  | 'versions'

export type SuggestionSeverity = 'opportunity' | 'attention'

export interface AssistantSuggestion {
  id: string
  kind: SuggestionKind
  severity: SuggestionSeverity
  /** Headline, phrased as something the assistant found or did. */
  title: string
  /** One line of supporting detail. */
  detail: string
  /** Why the assistant is raising this, shown when the row is expanded. */
  reasoning: string
  target: SuggestionTarget
  actionLabel: string
}

export interface AssistantInput {
  clipCount: number
  transcripts: Transcript[]
  highlightCandidates: HighlightCandidate[]
  topics: TopicSegment[]
  diarizationResults: SpeakerDiarizationResult[]
  outputVariants: OutputVariant[]
  editPlan: RenderPlan | null
  captionsEnabled: boolean
  hasCaptionTrack: boolean
  /** Pauses longer than this many seconds count as dead space. */
  pauseThreshold?: number
}

/** Words the transcriber flagged, or scored, as unreliable. */
export function lowConfidenceWords(transcripts: Transcript[]): Transcript['words'] {
  return transcripts.flatMap((transcript) => transcript.words.filter((word) =>
    word.confidenceLevel === 'low' || (word.confidence != null && word.confidence < 0.45)
  ))
}

/** Total seconds sitting in pauses longer than `threshold`. */
export function deadSpaceSeconds(transcripts: Transcript[], threshold: number): number {
  let total = 0
  for (const transcript of transcripts) {
    for (let index = 1; index < transcript.words.length; index += 1) {
      const gap = transcript.words[index].start - transcript.words[index - 1].end
      if (gap >= threshold) total += gap
    }
  }
  return total
}

function plural(count: number, singular: string, suffix = 's'): string {
  return `${count} ${singular}${count === 1 ? '' : suffix}`
}

function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return whole >= 60 ? `${Math.floor(whole / 60)}m ${whole % 60}s` : `${whole}s`
}

/**
 * Turns the analysis the project already carries into a reviewable list.
 *
 * Everything here is derived from state the app has computed elsewhere; nothing
 * runs a model. Ordering puts problems the user should look at before
 * opportunities, because unattended audio issues degrade every later step.
 */
export function buildSuggestions(input: AssistantInput): AssistantSuggestion[] {
  const threshold = input.pauseThreshold ?? 1
  const suggestions: AssistantSuggestion[] = []
  const transcribed = input.transcripts.length > 0

  const weak = lowConfidenceWords(input.transcripts)
  if (weak.length >= 3) {
    const clips = new Set(input.transcripts
      .filter((transcript) => transcript.words.some((word) =>
        word.confidenceLevel === 'low' || (word.confidence != null && word.confidence < 0.45)))
      .map((transcript) => transcript.sourceClipId))
    suggestions.push({
      id: 'audio-quality',
      kind: 'review',
      severity: 'attention',
      title: `Unclear audio in ${plural(clips.size, 'clip')}`,
      detail: `${plural(weak.length, 'word')} transcribed with low confidence.`,
      reasoning: 'Low transcription confidence usually means background noise, distance from the microphone, or overlapping speech. Captions built on these words are likely to be wrong.',
      target: 'review',
      actionLabel: 'Review words'
    })
  }

  const dead = deadSpaceSeconds(input.transcripts, threshold)
  if (dead >= 2) {
    suggestions.push({
      id: 'dead-space',
      kind: 'review',
      severity: 'opportunity',
      title: `Remove ${clock(dead)} of dead space`,
      detail: `Pauses longer than ${threshold}s across ${plural(input.transcripts.length, 'clip')}.`,
      reasoning: 'Long gaps between words slow pacing and cost viewer retention, especially in short-form. Shortening them keeps the delivery tight without cutting content.',
      target: 'transcript',
      actionLabel: 'Review pauses'
    })
  }

  const fillers = input.transcripts.flatMap((transcript) => transcript.words.filter((word) => word.filler))
  if (fillers.length >= 3) {
    suggestions.push({
      id: 'filler-words',
      kind: 'review',
      severity: 'opportunity',
      title: `Trim ${plural(fillers.length, 'filler word')}`,
      detail: 'Detected "um", "uh", and similar hesitations.',
      reasoning: 'Removing hesitations makes delivery sound more confident. Each one is reviewed individually so genuine speech is never cut.',
      target: 'transcript',
      actionLabel: 'Review fillers'
    })
  }

  if (input.highlightCandidates.length > 0) {
    const selected = input.highlightCandidates.filter((candidate) => candidate.selected).length
    suggestions.push({
      id: 'highlights',
      kind: 'review',
      severity: 'opportunity',
      title: `Found ${plural(input.highlightCandidates.length, 'high-engagement moment')}`,
      detail: selected > 0 ? `${selected} currently selected for the edit.` : 'None selected yet.',
      reasoning: input.highlightCandidates[0]?.reasons?.length
        ? `Ranked by speech density, visual interest, and topic coverage. Top moment: ${input.highlightCandidates[0].reasons.join(', ')}.`
        : 'Ranked by speech density, visual interest, and topic coverage.',
      target: 'highlights',
      actionLabel: 'Review moments'
    })
  }

  if (input.diarizationResults.length > 0) {
    const speakers = new Set(input.diarizationResults.flatMap((result) =>
      result.segments.map((segment) => segment.speakerId)))
    if (speakers.size > 1) {
      suggestions.push({
        id: 'speakers',
        kind: 'review',
        severity: 'opportunity',
        title: `${plural(speakers.size, 'speaker')} detected`,
        detail: 'Name them to label captions and lower thirds.',
        reasoning: 'Named speakers let captions attribute dialogue, which matters for interviews and panel footage.',
        target: 'speakers',
        actionLabel: 'Name speakers'
      })
    }
  }

  if (transcribed && input.captionsEnabled && !input.hasCaptionTrack) {
    suggestions.push({
      id: 'captions-pending',
      kind: 'apply',
      severity: 'opportunity',
      title: 'Captions are ready to generate',
      detail: 'A transcript exists but no caption track has been built.',
      reasoning: 'Most short-form video is watched muted, so burned-in captions materially affect watch time.',
      target: 'captions',
      actionLabel: 'Open captions'
    })
  }

  if (input.topics.length > 1) {
    suggestions.push({
      id: 'topics',
      kind: 'review',
      severity: 'opportunity',
      title: `${plural(input.topics.length, 'topic')} identified`,
      detail: 'Choose which subjects the edit should cover.',
      reasoning: 'Selecting topics keeps the edit focused on one subject rather than sampling all of them shallowly.',
      target: 'topics',
      actionLabel: 'Choose topics'
    })
  }

  if (input.outputVariants.length > 0) {
    suggestions.push({
      id: 'variants',
      kind: 'review',
      severity: 'opportunity',
      title: `${plural(input.outputVariants.length, 'social version')} prepared`,
      detail: input.outputVariants.map((variant) => variant.name).join(', '),
      reasoning: 'Each version carries its own aspect ratio, caption settings, and duration target for its platform.',
      target: 'versions',
      actionLabel: 'Review versions'
    })
  }

  return suggestions
}

/** Short status line describing where the project is in the workflow. */
export function assistantStatus(input: AssistantInput): string {
  if (input.clipCount === 0) return 'Import footage to begin.'
  if (input.transcripts.length === 0) return 'Analysing footage. Transcribe to unlock suggestions.'
  if (!input.editPlan) return 'Ready to build an edit from your footage.'
  return 'Edit plan ready. Review the suggestions below.'
}
