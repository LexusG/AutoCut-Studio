import { describe, expect, it } from 'vitest'
import type { HighlightCandidate, Transcript, TranscriptWord } from '../src/shared/types'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { chunkTranscript } from '../src/main/services/semantic/transcript-chunker'
import { cosineSimilarity } from '../src/main/services/semantic/provider'
import { detectSimilarContent, detectTopics } from '../src/main/services/semantic/topic-segmentation'
import { createHighlightReel } from '../src/main/services/semantic/highlight-planner'
import { serializeChapters } from '../src/main/services/semantic/chapter-exporter'
import { createDefaultProjectSettings } from '../src/shared/utils/project-settings'
import { createOutputVariant, updateOutputVariant } from '../src/shared/utils/output-variants'
import { AnalysisJobScheduler } from '../src/main/services/semantic/analysis-scheduler'

function words(texts: string[], gapAfter = -1): TranscriptWord[] {
  let time = 0
  return texts.map((text, index) => {
    if (index === gapAfter + 1) time += 1.5
    const word = { id: `w${index}`, text, originalText: text, start: time, end: time + 0.3,
      confidence: 0.9, filler: false, corrected: false }
    time += 0.36
    return word
  })
}

function transcript(allWords: TranscriptWord[], revision = 1): Transcript {
  return {
    version: 1, id: 'transcript-a', projectId: 'project-a', sourceClipId: 'clip-a',
    sourcePath: '/tmp/a.mp4', sourceDuration: 30, provider: 'whisper.cpp', model: 'base.en',
    modelVersion: '1.9.1', language: 'english', detectedLanguage: 'en', revision,
    fullText: allWords.map((word) => word.text).join(' '), noSpeech: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    words: allWords,
    segments: [{ id: 's1', start: allWords[0].start, end: allWords.at(-1)!.end,
      text: allWords.map((word) => word.text).join(' '), words: allWords }]
  }
}

function media(duration = 30) {
  return { duration, size: 10_000, hasAudio: true, video: { codec: 'h264', width: 1920, height: 1080,
    frameRate: 30, rotation: 0 }, audio: { codec: 'aac', sampleRate: 48000, channels: 2, bitrate: 128000 } }
}

function highlight(id: string, start: number, score: number): HighlightCandidate {
  return { id, sourceClipId: 'clip-a', sourcePath: '/tmp/a.mp4', filename: 'a.mp4', start,
    end: start + 3, duration: 3, transcript: `Moment ${id}`, topicId: `topic-${id}`,
    scores: { visual: .8, audio: .7, speech: .8, person: .5, semantic: score,
      novelty: .9, openingStrength: score, total: score }, reasons: ['Relevant to Edit Goal'],
    personPresent: true, selected: true, locked: false, excluded: false, alternativeIds: [],
    thumbnailPath: null, thumbnailUrl: null }
}

describe('Phase 8 semantic analysis and repurposing', () => {
  it('chunks transcript at natural pauses without embedding individual words', () => {
    const input = transcript(words(['We', 'measure', 'the', 'frame.', 'Then', 'we', 'weld', 'it.'], 3))
    const chunks = chunkTranscript(input)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].text).toContain('measure')
    expect(chunks[1].text).toContain('weld')
    expect(chunks.every((chunk) => chunk.wordIds.length > 1)).toBe(true)
  })

  it('changes only the corrected semantic chunk identity', () => {
    const original = transcript(words(['Planning', 'the', 'build.', 'Welding', 'the', 'frame.'], 2), 1)
    const before = chunkTranscript(original)
    const correctedWords = original.words.map((word) => word.id === 'w1' ? { ...word, text: 'our' } : word)
    const after = chunkTranscript(transcript(correctedWords, 2))
    expect(before).toHaveLength(2)
    expect(after).toHaveLength(2)
    expect(after[0].id).not.toBe(before[0].id)
    expect(after[1].id).toBe(before[1].id)
  })

  it('computes normalized semantic similarity and detects topic shifts', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    const topicWords = words(['Plan', 'the', 'frame.', 'Weld', 'the', 'metal.', 'Serve', 'the', 'dinner.'])
      .map((word, index) => {
        const start = Math.floor(index / 3) * 8 + (index % 3) * 2
        return { ...word, start, end: start + 1.8 }
      })
    const chunks = chunkTranscript(transcript(topicWords))
    const embeddings = new Map(chunks.map((chunk, index) => [chunk.embeddingId,
      index === 0 ? [1, 0, 0] : index === 1 ? [.9, .1, 0] : [0, 0, 1]]))
    const topics = detectTopics(chunks, embeddings)
    expect(topics.length).toBeGreaterThanOrEqual(2)
    expect(topics.every((topic, index) => topic.end >= topic.start && (index === 0 || topic.start >= topics[index - 1].end))).toBe(true)
  })

  it('groups semantically repeated takes without deleting them', () => {
    const chunks = chunkTranscript(transcript(words(['Welding', 'is', 'complete.', 'The', 'frame', 'weld', 'is', 'finished.'], 2)))
    const embeddings = new Map(chunks.map((chunk, index) => [chunk.embeddingId, index ? [.99, .01] : [1, 0]]))
    const groups = detectSimilarContent(chunks, embeddings)
    expect(groups).toHaveLength(1)
    expect(groups[0].chunkIds).toHaveLength(2)
  })

  it('builds a frozen highlight reel within its target', () => {
    const plan = buildRenderPlan('project-a', 0, ['/tmp/a.mp4'], [media()], 'phase8-test', DEFAULT_RENDER_SETTINGS)
    const reel = createHighlightReel({ projectId: 'project-a', parentPlan: plan,
      highlights: [highlight('one', 1, .9), highlight('two', 8, .8)], targetDuration: 5,
      preserveIntro: false, preserveOutro: false, mode: 'highlight-reel' })
    expect(reel.version).toBe(4)
    expect(reel.generationMode).toBe('highlight-reel')
    expect(reel.expectedDuration).toBeLessThanOrEqual(5.01)
    expect(reel.highlightCandidateIds).toEqual(['one', 'two'])
  })

  it('creates independent social variants and invalidates only the changed child', () => {
    const settings = createDefaultProjectSettings()
    const reel = createOutputVariant('project-a', settings, 'instagram-reel')
    const short = createOutputVariant('project-a', settings, 'youtube-shorts')
    const changed = updateOutputVariant(reel, { targetDuration: 30 })
    expect(changed.targetDuration).toBe(30)
    expect(changed.renderPlan).toBeNull()
    expect(short.targetDuration).toBe(60)
    expect(short.captionSettings.mode).toBe('dynamic')
    expect(reel.id).not.toBe(short.id)
  })

  it('exports enabled chapters without fabricating names', () => {
    const text = serializeChapters([{ id: 't1', start: 0, end: 20, chunkIds: ['c1'], sourceClipIds: ['clip-a'],
      representativeText: 'We measured the frame.', meanNeighborSimilarity: .8, userLabel: null,
      importance: 'normal', chapterEnabled: true, chapterStart: 0 }])
    expect(text).toBe('00:00 Topic 1\n')
  })

  it('cancels active semantic analysis without corrupting the queue', async () => {
    const scheduler = new AnalysisJobScheduler()
    const job = scheduler.schedule('cancel-me', 'interactive', (signal) => new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => resolve('late'), 100)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelled')) })
    }))
    expect(scheduler.cancel('cancel-me')).toBe(true)
    await expect(job).rejects.toThrow('cancelled')
    await expect(scheduler.schedule('next', 'normal', async () => 'ready')).resolves.toBe('ready')
  })
})
