import { describe, expect, it } from 'vitest'
import type { Transcript } from '../src/shared/types'
import {
  assistantStatus,
  buildSuggestions,
  deadSpaceSeconds,
  lowConfidenceWords,
  type AssistantInput
} from '../src/renderer/utils/assistant-suggestions'

function transcript(words: Array<Partial<Transcript['words'][number]>>): Transcript {
  return {
    id: 't1', sourceClipId: 'c1', sourcePath: '/a.mp4', filename: 'a.mp4',
    language: 'en', revision: 1, model: 'base', createdAt: '', duration: 10,
    segments: [],
    words: words.map((word, index) => ({
      id: `w${index}`, text: 'word', start: index, end: index + 0.5,
      confidence: 0.9, filler: false, ...word
    }))
  } as unknown as Transcript
}

const base: AssistantInput = {
  clipCount: 1, transcripts: [], highlightCandidates: [], topics: [],
  diarizationResults: [], outputVariants: [], editPlan: null,
  captionsEnabled: false, hasCaptionTrack: false
}

describe('assistant suggestions', () => {
  it('says nothing when there is nothing to say', () => {
    expect(buildSuggestions(base)).toHaveLength(0)
  })

  it('measures dead space only for gaps at or past the threshold', () => {
    const t = transcript([
      { start: 0, end: 1 }, { start: 4, end: 5 }, { start: 5.2, end: 6 }
    ])
    expect(deadSpaceSeconds([t], 1)).toBeCloseTo(3, 5)
    // The 0.2s gap is below a 1s threshold and must not be counted.
    expect(deadSpaceSeconds([t], 3.5)).toBe(0)
  })

  it('counts both flagged and low-scoring words as unclear audio', () => {
    const t = transcript([
      { confidence: 0.2 }, { confidenceLevel: 'low' }, { confidence: 0.95 }
    ] as never)
    expect(lowConfidenceWords([t])).toHaveLength(2)
  })

  it('raises audio problems above pacing opportunities', () => {
    const t = transcript([
      { confidence: 0.1 }, { confidence: 0.1 }, { confidence: 0.1 },
      { start: 10, end: 11 }, { start: 20, end: 21 }
    ])
    const ids = buildSuggestions({ ...base, transcripts: [t] }).map((item) => item.id)
    expect(ids[0]).toBe('audio-quality')
    expect(ids).toContain('dead-space')
  })

  it('stays quiet below the noise floor for fillers and weak audio', () => {
    const twoFillers = transcript([{ filler: true }, { filler: true }])
    const ids = buildSuggestions({ ...base, transcripts: [twoFillers] }).map((item) => item.id)
    expect(ids).not.toContain('filler-words')
  })

  it('surfaces highlight reasoning from the candidate itself', () => {
    const found = buildSuggestions({
      ...base,
      highlightCandidates: [
        { id: 'h1', selected: true, reasons: ['strong speech density'] },
        { id: 'h2', selected: false, reasons: [] }
      ] as never
    }).find((item) => item.id === 'highlights')
    expect(found?.title).toContain('2 high-engagement moments')
    expect(found?.detail).toContain('1 currently selected')
    expect(found?.reasoning).toContain('strong speech density')
  })

  it('offers caption generation only once a transcript exists', () => {
    const withCaptions = { ...base, captionsEnabled: true, hasCaptionTrack: false }
    expect(buildSuggestions(withCaptions).map((item) => item.id)).not.toContain('captions-pending')
    const ready = { ...withCaptions, transcripts: [transcript([{}])] }
    expect(buildSuggestions(ready).map((item) => item.id)).toContain('captions-pending')
    const done = { ...ready, hasCaptionTrack: true }
    expect(buildSuggestions(done).map((item) => item.id)).not.toContain('captions-pending')
  })

  it('only mentions speakers when more than one was found', () => {
    const one = [{ segments: [{ speakerId: 's1' }, { speakerId: 's1' }] }] as never
    expect(buildSuggestions({ ...base, diarizationResults: one }).map((i) => i.id)).not.toContain('speakers')
    const two = [{ segments: [{ speakerId: 's1' }, { speakerId: 's2' }] }] as never
    expect(buildSuggestions({ ...base, diarizationResults: two }).map((i) => i.id)).toContain('speakers')
  })

  it('describes the workflow position', () => {
    expect(assistantStatus({ ...base, clipCount: 0 })).toContain('Import footage')
    expect(assistantStatus(base)).toContain('Transcribe')
    expect(assistantStatus({ ...base, transcripts: [transcript([{}])] })).toContain('build an edit')
  })
})
