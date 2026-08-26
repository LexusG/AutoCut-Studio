import { describe, expect, it } from 'vitest'
import type { CaptionWord, RenderPlan, Transcript } from '../src/shared/types'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { BUILT_IN_CAPTION_TEMPLATES } from '../src/shared/constants/caption-templates'
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

  it('emits entrance tags for each caption animation', () => {
    const track = chunkCaptionWords([{ id: 'a', text: 'Hello', start: 0, end: 0.4 }], 'standard')
    const style = DEFAULT_RENDER_SETTINGS.captions.style
    expect(serializeAss(track, style, 1080, 1920, false, 'color', 'bounce')).toContain('\\t(90,170,\\fscx100\\fscy100)')
    expect(serializeAss(track, style, 1080, 1920, false, 'color', 'zoom-punch')).toContain('\\fscx145\\fscy145')
    expect(serializeAss(track, style, 1080, 1920, false, 'color', 'blur-in')).toContain('\\blur8')
  })

  it('anchors slide-up motion to the position the style would have produced', () => {
    const track = chunkCaptionWords([{ id: 'a', text: 'Hello', start: 0, end: 0.4 }], 'standard')
    const style = { ...DEFAULT_RENDER_SETTINGS.captions.style, position: 'bottom' as const, alignment: 'center' as const, verticalOffset: 10 }
    const ass = serializeAss(track, style, 1080, 1920, false, 'color', 'slide-up')
    // marginV is 10% of 1920, so a bottom-centred caption sits at y = 1920 - 192.
    expect(ass).toContain('\\an2\\move(540,1843,540,1728,0,170)')
  })

  it('resolves the slide-up anchor for every position and alignment pairing', () => {
    const track = chunkCaptionWords([{ id: 'a', text: 'Hello', start: 0, end: 0.4 }], 'standard')
    // marginH is 8% of 1080, marginV is 8% of 1920, and slide-up travels 6% of the height.
    const expected: Record<string, string> = {
      'top|left': '\\an7\\move(86,269,86,154,0,170)',
      'top|center': '\\an8\\move(540,269,540,154,0,170)',
      'top|right': '\\an9\\move(994,269,994,154,0,170)',
      'center|left': '\\an4\\move(86,1075,86,960,0,170)',
      'center|center': '\\an5\\move(540,1075,540,960,0,170)',
      'center|right': '\\an6\\move(994,1075,994,960,0,170)',
      'bottom|left': '\\an1\\move(86,1881,86,1766,0,170)',
      'bottom|center': '\\an2\\move(540,1881,540,1766,0,170)',
      'bottom|right': '\\an3\\move(994,1881,994,1766,0,170)'
    }
    for (const position of ['top', 'center', 'bottom'] as const) {
      for (const alignment of ['left', 'center', 'right'] as const) {
        const style = { ...DEFAULT_RENDER_SETTINGS.captions.style, position, alignment }
        expect(serializeAss(track, style, 1080, 1920, false, 'color', 'slide-up'))
          .toContain(expected[`${position}|${alignment}`])
      }
    }
  })

  it('ships every built-in template with a caption configuration the renderer accepts', () => {
    const track = chunkCaptionWords([
      { id: 'a', text: 'This', start: 0, end: 0.4 },
      { id: 'b', text: 'changes', start: 0.4, end: 0.9 }
    ], 'dynamic')
    for (const template of BUILT_IN_CAPTION_TEMPLATES) {
      const settings = template.settings
      const ass = serializeAss(
        track, settings.style, 1080, 1920,
        settings.highlightSpokenWord, settings.highlightBehavior, settings.animation, settings.wordDisplay
      )
      expect(ass, template.id).toContain('[Events]')
      expect(ass.split('\n').filter((line) => line.startsWith('Dialogue:')).length, template.id).toBeGreaterThan(0)
      // Unbalanced override braces would make libass drop the line entirely.
      const braces = ass.split('\n').filter((line) => line.startsWith('Dialogue:')).join('')
      expect(braces.split('{').length, template.id).toBe(braces.split('}').length)
    }
  })

  it('emphasises the spoken word differently per highlight behaviour', () => {
    const track = chunkCaptionWords([
      { id: 'a', text: 'Hello', start: 0, end: 0.4 },
      { id: 'b', text: 'world', start: 0.4, end: 0.9 }
    ], 'dynamic')
    const style = DEFAULT_RENDER_SETTINGS.captions.style
    expect(serializeAss(track, style, 1080, 1920, true, 'glow')).toContain('\\blur10')
    expect(serializeAss(track, style, 1080, 1920, true, 'underline')).toContain('\\u1')
    expect(serializeAss(track, style, 1080, 1920, true, 'box-pop')).toContain('\\bord9')
  })

  it('collapses a karaoke fill chunk into one event with per-word timings', () => {
    const track = chunkCaptionWords([
      { id: 'a', text: 'Hello', start: 0, end: 0.4 },
      { id: 'b', text: 'world', start: 0.4, end: 0.9 }
    ], 'dynamic')
    const ass = serializeAss(track, DEFAULT_RENDER_SETTINGS.captions.style, 1080, 1920, true, 'karaoke-fill')
    const dialogue = ass.split('\n').filter((line) => line.startsWith('Dialogue:'))
    expect(dialogue).toHaveLength(1)
    expect(dialogue[0]).toContain('\\kf40}Hello')
    expect(dialogue[0]).toContain('\\kf50}world')
  })

  it('reveals words progressively for cumulative and single word display', () => {
    const words = [
      { id: 'a', text: 'Hello', start: 0, end: 0.4 },
      { id: 'b', text: 'world', start: 0.4, end: 0.9 }
    ]
    const track = chunkCaptionWords(words, 'dynamic')
    const style = DEFAULT_RENDER_SETTINGS.captions.style
    const cumulative = serializeAss(track, style, 1080, 1920, true, 'color', 'none', 'cumulative')
      .split('\n').filter((line) => line.startsWith('Dialogue:'))
    expect(cumulative[0]).not.toContain('world')
    expect(cumulative[1]).toContain('Hello')
    expect(cumulative[1]).toContain('world')

    const single = serializeAss(track, style, 1080, 1920, true, 'color', 'none', 'single')
      .split('\n').filter((line) => line.startsWith('Dialogue:'))
    expect(single[0]).not.toContain('world')
    expect(single[1]).not.toContain('Hello')
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

  it('uses a one-frame hard cut when a transcript split precedes a transition', () => {
    const current = plan()
    current.segments = [
      { ...current.segments[0], id: 'left', transitionToNext: null },
      { ...current.segments[0], id: 'right', transitionToNext: { type: 'crossfade', duration: 0.5 } },
      { ...current.segments[0], id: 'next', transitionToNext: null }
    ]
    const graph = transitionFilters(current).filters.join(';')
    expect(graph).toContain("xfade=transition=custom:duration=0.033333")
    expect(graph).toContain("expr='B'")
    expect(graph).not.toContain('duration=0.000')
  })
})
