import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpeakerDiarizationResult, Transcript } from '../src/shared/types'
import { alignTranscriptSpeakers } from '../src/main/services/diarization/transcript-aligner'
import { chunkCaptionWords } from '../src/main/services/captions/caption-chunker'
import { chunkTranscript } from '../src/main/services/semantic/transcript-chunker'
import { contentHash } from '../src/main/services/semantic/embedding-cache'
import { executableArchitecture, validateExecutableArchitecture } from '../src/main/services/runtime/architecture'
import { BUILT_IN_CAPTION_TEMPLATES } from '../src/main/services/captions/template-manager'

function transcript(): Transcript {
  const words = [
    { id: 'w1', start: 0.1, end: 0.4, text: 'Welcome', originalText: 'Welcome', confidence: 0.31, filler: false, excluded: false },
    { id: 'w2', start: 0.92, end: 1.08, text: 'back', originalText: 'back', confidence: 0.8, filler: false, excluded: false },
    { id: 'w3', start: 1.2, end: 1.5, text: 'Jordan', originalText: 'Jordan', confidence: 0.65, filler: false, excluded: false }
  ]
  return {
    version: 1, id: 'transcript', projectId: 'project', sourceClipId: 'clip', sourcePath: '/clip.mp4', sourceDuration: 2,
    language: 'english', detectedLanguage: 'en', provider: 'whisper.cpp', model: 'base.en', analyzerVersion: 'test',
    fullText: 'Welcome back Jordan', originalText: 'Welcome back Jordan', words,
    segments: [{ id: 'segment', start: 0.1, end: 1.5, text: 'Welcome back Jordan', originalText: 'Welcome back Jordan', words, confidence: 0.59 }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', averageConfidence: 0.59, noSpeech: false, revision: 1
  }
}

function diarization(): SpeakerDiarizationResult {
  return {
    version: 1, sourceClipId: 'clip', sourcePath: '/clip.mp4', provider: 'sherpa-onnx', modelVersion: 'test', speakerCount: 2,
    requestedSpeakerCount: 'auto', analysisVersion: 'phase9', cacheKey: 'cache', warnings: [], createdAt: '2026-01-01T00:00:00.000Z',
    segments: [
      { id: 'a', speakerId: 'speaker-a', overlappingSpeakerIds: ['speaker-b'], start: 0, end: 1, confidence: null },
      { id: 'b', speakerId: 'speaker-b', overlappingSpeakerIds: ['speaker-a'], start: 1, end: 2, confidence: null }
    ]
  }
}

describe('Phase 9 packaged runtime and speaker workflows', () => {
  it('aligns clear words, preserves ambiguity, and classifies review confidence', () => {
    const aligned = alignTranscriptSpeakers(transcript(), diarization())
    expect(aligned.words.map((word) => word.speakerId)).toEqual(['speaker-a', null, 'speaker-b'])
    expect(aligned.words.map((word) => word.confidenceLevel)).toEqual(['low', 'high', 'medium'])
    expect(aligned.revision).toBe(2)
  })

  it('starts a new caption group when the speaker changes', () => {
    const track = chunkCaptionWords([
      { id: 'a', text: 'Welcome', start: 0, end: 0.4, speakerId: 'speaker-a', speakerLabel: 'Alex' },
      { id: 'b', text: 'Thanks', start: 0.45, end: 0.8, speakerId: 'speaker-b', speakerLabel: 'Jordan' }
    ], 'standard')
    expect(track.chunks).toHaveLength(2)
    expect(track.chunks.map((chunk) => chunk.speakerLabel)).toEqual(['Alex', 'Jordan'])
  })

  it('stores speaker metadata without changing the embedding content hash', () => {
    const aligned = alignTranscriptSpeakers(transcript(), diarization())
    const [chunk] = chunkTranscript(aligned)
    expect(chunk.speakerIds).toEqual(['speaker-a', 'speaker-b'])
    expect(contentHash({ ...chunk, speakerIds: ['renamed-speaker'] })).toBe(contentHash(chunk))
  })

  it('provides protected built-in caption templates', () => {
    expect(BUILT_IN_CAPTION_TEMPLATES.map((item) => item.name)).toEqual([
      'Clean', 'Social Bold', 'Minimal', 'Karaoke Highlight', 'Interview', 'Documentary', 'Lower Third',
      'Impact Pop', 'Karaoke Fill', 'Neon Glow', 'One Word Punch'
    ])
    expect(BUILT_IN_CAPTION_TEMPLATES.every((item) => item.builtIn)).toBe(true)
  })

  it('recognizes x64 and ARM64 ELF headers before execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autocut-elf-'))
    try {
      const x64 = Buffer.alloc(20); x64.set([0x7f, 0x45, 0x4c, 0x46]); x64[5] = 1; x64.writeUInt16LE(62, 18)
      const arm64 = Buffer.from(x64); arm64.writeUInt16LE(183, 18)
      await writeFile(join(directory, 'x64'), x64); await writeFile(join(directory, 'arm64'), arm64)
      expect(await executableArchitecture(join(directory, 'x64'))).toBe('x64')
      expect(await executableArchitecture(join(directory, 'arm64'))).toBe('arm64')
      expect(await validateExecutableArchitecture(join(directory, 'arm64'), 'x64')).toMatch(/mismatch.*x64.*arm64/i)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
