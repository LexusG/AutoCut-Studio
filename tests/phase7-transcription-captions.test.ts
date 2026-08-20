import { describe, expect, it } from 'vitest'
import type { CaptionWord, RenderPlan, Transcript } from '../src/shared/types'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { chunkCaptionWords } from '../src/main/services/captions/caption-chunker'
import { buildCaptionTrack } from '../src/main/services/captions/caption-track-builder'
import { serializeAss, serializeSrt, serializeVtt } from '../src/main/services/captions/subtitle-exporter'
import { detectFillerWords, findLongPauses } from '../src/main/services/transcription/filler-detection'
import { parseWhisperJson } from '../src/main/services/transcription/whisper-cpp-provider'
import { removeTranscriptRange, restoreTranscriptRange } from '../src/shared/utils/transcript-edit'
import { transitionFilters } from '../src/main/services/video/render-executor'

function plan(useEveryClip = false): RenderPlan {
  return buildRenderPlan('project-7', 0, ['/clips/a.mp4'], [{
    duration: 12, hasAudio: true,
    video: { codec: 'h264', width: 1920, height: 1080, frameRate: 30, rotation: 0, bitrate: 1_000_000 }
  }], 'phase7-test', { ...structuredClone(DEFAULT_RENDER_SETTINGS), useEveryClip })
}

function transcript(): Transcript {
  const words = [
    { id: 'w1', start: 1, end: 1.3, text: 'Hello', originalText: 'Hello', confidence: 0.9, filler: false, excluded: false },
    { id: 'w2', start: 1.35, end: 1.6, text: 'um', originalText: 'um', confidence: 0.8, filler: false, excluded: false },
    { id: 'w3', start: 1.65, end: 2, text: 'world.', originalText: 'world.', confidence: 0.7, filler: false, excluded: false },
    { id: 'w4', start: 4, end: 4.4, text: 'Like', originalText: 'Like', confidence: 0.6, filler: false, excluded: false },
    { id: 'w5', start: 4.45, end: 5, text: 'this.', originalText: 'this.', confidence: 0.95, filler: false, excluded: false }
  ]
  return {
    version: 1, id: 'transcript-1', projectId: 'project-7', sourceClipId: 'clip-a',
    sourcePath: '/clips/a.mp4', sourceDuration: 12, language: 'english', detectedLanguage: 'en',
    provider: 'whisper.cpp', model: 'base.en', analyzerVersion: 'test',
    fullText: 'Hello um world. Like this.', originalText: 'Hello um world. Like this.',
    segments: [{ id: 's1', start: 1, end: 5, text: 'Hello um world. Like this.', originalText: 'Hello um world. Like this.', words, confidence: 0.79 }],
    words, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    averageConfidence: 0.79, noSpeech: false, revision: 1
  }
}

describe('Phase 7 transcription and captions', () => {
  it('parses whisper.cpp full JSON into ordered source-relative words', () => {
    const parsed = parseWhisperJson({
      result: { language: 'en' },
      transcription: [{ text: ' Hello world', timestamps: { from: '00:00:00,000', to: '00:00:01,000' }, tokens: [
        { text: ' Hello', offsets: { from: 0, to: 400 }, p: 0.91 },
        { text: ' world', offsets: { from: 400, to: 900 }, p: 0.82 }
      ] }]
    }, {
      projectId: 'project-7', sourceClipId: 'clip-a', sourcePath: '/clips/a.mp4', sourceDuration: 10,
      timestampOffset: 2, settings: { provider: 'whisper.cpp', quality: 'balanced', language: 'english', threads: 4 }
    }, 'base.en')
    expect(parsed.detectedLanguage).toBe('en')
    expect(parsed.words.map((word) => word.text)).toEqual(['Hello', 'world'])
    expect(parsed.words[0].start).toBe(2)
    expect(parsed.words[1].end).toBe(2.9)
    expect(parsed.words.every((word) => word.start <= word.end && word.end <= 10)).toBe(true)
  })

  it('chunks standard captions at natural punctuation and pause boundaries', () => {
    const words: CaptionWord[] = transcript().words.map(({ id, text, start, end }) => ({ id, text, start, end }))
    const track = chunkCaptionWords(words, 'standard')
    expect(track.chunks).toHaveLength(2)
    expect(track.chunks[0].text).toBe('Hello um world.')
    expect(track.chunks[0].end).toBeLessThanOrEqual(track.chunks[1].start)
  })

  it('uses short chunks for dynamic social captions', () => {
    const words = Array.from({ length: 13 }, (_, index) => ({
      id: `w${index}`, text: `word${index}`, start: index * 0.25, end: index * 0.25 + 0.2
    }))
    const track = chunkCaptionWords(words, 'dynamic')
    expect(track.chunks.every((chunk) => chunk.words.length <= 5)).toBe(true)
    expect(track.chunks.every((chunk) => chunk.text.length <= 32)).toBe(true)
  })

  it('maps source timestamps into the frozen edit timeline', () => {
    const current = plan()
    current.segments[0] = { ...current.segments[0], start: 1, end: 6, duration: 5 }
    current.expectedDuration = 5
    const track = buildCaptionTrack({
      plan: current, transcripts: [transcript()],
      settings: { ...DEFAULT_RENDER_SETTINGS.captions, mode: 'standard' }
    })
    expect(track?.chunks[0].start).toBe(0)
    expect(track?.chunks.every((chunk) => chunk.end <= current.expectedDuration)).toBe(true)
  })

  it('exports corrected UTF-8 text as valid SRT and WebVTT', () => {
    const track = chunkCaptionWords([{ id: 'w', text: 'AutoCut Studio', start: 1.25, end: 2.5 }], 'standard')
    expect(serializeSrt(track)).toContain('00:00:01,250 --> 00:00:02,500')
    expect(serializeSrt(track)).toContain('AutoCut Studio')
    expect(serializeVtt(track)).toMatch(/^WEBVTT/)
    expect(serializeVtt(track)).toContain('00:00:01.250 --> 00:00:02.500')
  })

  it('renders deterministic ASS styles and dynamic word highlighting', () => {
    const track = chunkCaptionWords([
      { id: 'a', text: 'Hello', start: 0, end: 0.4 },
      { id: 'b', text: 'world', start: 0.4, end: 0.9 }
    ], 'dynamic')
    const ass = serializeAss(track, DEFAULT_RENDER_SETTINGS.captions.style, 1080, 1920, true, 'color', 'fade')
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('Dialogue:')
    expect(ass).toContain('\\fad(120,0)')
    expect(ass).toContain('Hello')
  })

  it('marks only conservative filler words and finds long pauses', () => {
    const marked = detectFillerWords(transcript())
    expect(marked.words.find((word) => word.id === 'w2')?.filler).toBe(true)
    expect(marked.words.find((word) => word.id === 'w4')?.filler).toBe(false)
    expect(findLongPauses(marked, 1)).toEqual([{ start: 2, end: 4, duration: 2 }])
  })

  it('removes and restores transcript ranges non-destructively', () => {
    const current = plan()
    current.segments[0] = { ...current.segments[0], start: 1, end: 8, duration: 7 }
    current.expectedDuration = 7
    const removed = removeTranscriptRange(current, '/clips/a.mp4', 3, 4)
    expect(removed.segments).toHaveLength(2)
    expect(removed.expectedDuration).toBeLessThan(current.expectedDuration)
    expect(removed.captionTrack).toBeNull()
    const restored = restoreTranscriptRange(removed, {
      id: 'edit-1', sourceClipId: 'clip-a', sourcePath: '/clips/a.mp4', start: 3, end: 4,
      kind: 'remove-range', restored: false, replacementDuration: null, createdAt: 'now'
    })
    expect(restored.expectedDuration).toBeGreaterThan(removed.expectedDuration)
  })

  it('protects locked segments and Use Every Clip', () => {
    const locked = plan()
    locked.segments[0].locked = true
    expect(() => removeTranscriptRange(locked, '/clips/a.mp4', locked.segments[0].start, locked.segments[0].end)).toThrow(/locked/i)
    const constrained = plan(true)
    expect(() => removeTranscriptRange(constrained, '/clips/a.mp4', constrained.segments[0].start, constrained.segments[0].end)).toThrow(/Use Every Clip/)
  })

  it('uses a hard concat when a transcript edit creates a zero-transition split', () => {
    const current = plan()
    current.segments = [
      { ...current.segments[0], id: 'left', transitionToNext: null },
      { ...current.segments[0], id: 'right', transitionToNext: { type: 'crossfade', duration: 0.5 } },
      { ...current.segments[0], id: 'next', transitionToNext: null }
    ]
    const graph = transitionFilters(current).filters.join(';')
    expect(graph).toContain('concat=n=2:v=1:a=0')
    expect(graph).not.toContain('duration=0.000')
  })
})
