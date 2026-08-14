import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS, type BeatAnalysisResult, type RenderPlan, type RenderSoundtrackTrack } from '../src/shared/types'
import { buildRenderPlan } from '../src/main/services/video/render-planner'
import { parseSilenceDetection } from '../src/main/services/video/content/speech-analysis'
import { adjustRangeForSpeech } from '../src/main/services/video/content/speech-boundaries'
import { buildSoundtrackBeatTimeline, detectBeatsFromPcm } from '../src/main/services/video/content/beat-analysis'
import { snapSegmentsToBeats } from '../src/main/services/video/content/beat-snap'
import { applySpeechAwarenessToSegment, preserveLockedSegments } from '../src/main/services/video/content/content-plan'
import { createSubjectTrack, smartCropFilter, smoothFocusPoints } from '../src/main/services/video/content/subject-crop'
import {
  adjustPlanSegment, rebalancePlan, reorderPlanSegment, resetPlanSegment,
  togglePlanSegmentLock, tryAlternateSegment
} from '../src/shared/utils/edit-plan'

const metadata = (duration = 30, hasAudio = true) => ({
  duration, hasAudio,
  video: { codec: 'h264', width: 1920, height: 1080, frameRate: 30, rotation: 0, bitrate: null }
})

function plan(count = 2, targetDuration = 10): RenderPlan {
  const paths = Array.from({ length: count }, (_, index) => `/clip-${index + 1}.mp4`)
  return buildRenderPlan('phase-6', 0, paths, paths.map(() => metadata()), 'phase6-test', {
    ...DEFAULT_RENDER_SETTINGS, targetDuration, transitionPreference: 'crossfade', transitionDuration: 0.5
  })
}

function beatResult(timestamps: number[]): BeatAnalysisResult {
  return {
    bpm: 120,
    beats: timestamps.map((timestamp, index) => ({ timestamp, strength: 0.9, strong: index % 4 === 0, sourceTrackId: 'music' })),
    confidence: 0.9, analyzedDuration: 10, analyzerVersion: 'test', warnings: []
  }
}

function track(id: string, duration: number, startPosition = 0): RenderSoundtrackTrack {
  return {
    id, filename: `${id}.wav`, path: `/music/${id}.wav`, duration, startPosition,
    missing: false, enabled: true, volume: 100,
    fadeIn: { enabled: false, duration: 0 }, fadeOut: { enabled: false, duration: 0 }
  }
}

describe('Phase 6 speech activity and cut safety', () => {
  it('derives speech and silence regions without claiming transcription', () => {
    const result = parseSilenceDetection(`silence_start: 0\nsilence_end: 1.2\nsilence_start: 3.8\nsilence_end: 5.0`, 5)
    expect(result.silenceRegions).toEqual([
      { startTime: 0, endTime: 1.2, duration: 1.2 },
      { startTime: 3.8, endTime: 5, duration: 1.2 }
    ])
    expect(result.speechRegions).toEqual([{ startTime: 1.2, endTime: 3.8, duration: 2.6 }])
    expect(result.speechRatio).toBeCloseTo(0.52)
  })

  it('handles silence and continuous activity', () => {
    expect(parseSilenceDetection('silence_start: 0\nsilence_end: 4', 4).speechRegions).toEqual([])
    expect(parseSilenceDetection('', 4).speechRegions).toEqual([{ startTime: 0, endTime: 4, duration: 4 }])
  })

  it('moves a cut to a nearby speech pause while Off retains the exact range', () => {
    const segment = { ...plan(1, 5).segments[0], start: 2, end: 7, duration: 5 }
    const speech = parseSilenceDetection('silence_start: 1.8\nsilence_end: 2.3\nsilence_start: 7.2\nsilence_end: 7.7', 30)
    const normal = adjustRangeForSpeech(segment, speech, 'normal')
    const off = adjustRangeForSpeech(segment, speech, 'off')
    expect(normal.end).toBe(7.2)
    expect(normal.start).toBe(2.2)
    expect(normal.note).toContain('speech pause')
    expect(off).toMatchObject({ start: 2, end: 7, note: null })
  })

  it('lets Prefer Spoken Moments choose a stronger speech candidate from the shortlist', () => {
    const segment = plan(1, 5).segments[0]
    const scores = {
      sharpness: 0.8, exposure: 0.8, motion: 0.7, stability: 0.8, audioActivity: 0.5,
      personPresence: 0, sceneQuality: 0.7, blackFramePenalty: 0, duplicatePenalty: 0,
      speechActivity: 0, speechBoundaryQuality: 0, speechCompleteness: 0, total: 0.8
    }
    segment.selectedCandidate = {
      candidateId: 'visual', scores, reasons: ['Visual candidate'], analysisFallback: false,
      alternatives: [{ candidateId: 'spoken', start: 2, end: 7, scores: { ...scores, total: 0.7 }, reasons: ['Speech candidate'] }]
    }
    const speech = {
      speechRegions: [{ startTime: 2, endTime: 7, duration: 5 }], silenceRegions: [], speechRatio: 1,
      confidence: 0.8, analyzerVersion: 'test', warnings: [], noAudioStream: false
    }
    const selected = applySpeechAwarenessToSegment(segment, speech, {
      ...DEFAULT_RENDER_SETTINGS,
      contentAwareness: 'strong', speechCutProtection: 'off',
      smartPreferences: { ...DEFAULT_RENDER_SETTINGS.smartPreferences, preferSpeech: true }
    })
    expect(selected.selectedCandidate?.candidateId).toBe('spoken')
    expect(selected.start).toBe(2)
  })
})

describe('Phase 6 local beat analysis and priority', () => {
  it('finds a steady 120 BPM impulse pattern from low-rate mono PCM', () => {
    const sampleRate = 8000
    const samples = new Int16Array(sampleRate * 8)
    for (let time = 0.5; time < 8; time += 0.5) {
      const offset = Math.floor(time * sampleRate)
      for (let index = 0; index < 120; index += 1) samples[offset + index] = 26000
    }
    const result = detectBeatsFromPcm(Buffer.from(samples.buffer), 'steady')
    expect(result.beats.length).toBeGreaterThan(10)
    expect(result.bpm).toBeGreaterThanOrEqual(115)
    expect(result.bpm).toBeLessThanOrEqual(125)
  })

  it('maps track offsets and crossfade overlap onto the final soundtrack timeline', () => {
    const tracks = [track('one', 10, 2), track('two', 8, 1)]
    const timeline = buildSoundtrackBeatTimeline(
      tracks,
      [beatResult([1, 2]), { ...beatResult([0.5]), beats: [{ timestamp: 0.5, strength: 1, strong: true, sourceTrackId: 'two' }] }],
      1.5, false, 20
    )
    expect(timeline.beats.map((beat) => beat.timestamp)).toEqual([1, 2, 7])
    expect(timeline.analyzedDuration).toBe(13.5)
  })

  it('snaps a feasible boundary but keeps speech safety above a beat', () => {
    const base = plan(2, 10)
    const desiredCut = base.segments[0].duration - (base.segments[0].transitionToNext?.duration ?? 0)
    const snapped = snapSegmentsToBeats(base.segments, beatResult([desiredCut + 0.2]), 'beat-strong')
    expect(snapped[0].duration).toBeCloseTo(base.segments[0].duration + 0.2, 2)
    const unsafeEnd = base.segments[0].end + 0.2
    const speechAnalysis = {
      speechRegions: [{ startTime: unsafeEnd - 0.3, endTime: unsafeEnd + 0.3, duration: 0.6 }],
      silenceRegions: [], speechRatio: 0.1, confidence: 0.8, analyzerVersion: 'test', warnings: [], noAudioStream: false
    }
    const protectedSegments = base.segments.map((segment, index) => index === 0 ? {
      ...segment,
      selectedCandidate: {
        candidateId: 'speech', scores: {
          sharpness: 0, exposure: 0, motion: 0, stability: 0, audioActivity: 0, personPresence: 0,
          sceneQuality: 0, blackFramePenalty: 0, duplicatePenalty: 0, speechActivity: 1,
          speechBoundaryQuality: 0, speechCompleteness: 0, total: 0
        }, reasons: [], analysisFallback: false, speechAnalysis
      }
    } : segment)
    const protectedResult = snapSegmentsToBeats(protectedSegments, beatResult([desiredCut + 0.2]), 'beat-strong')
    expect(protectedResult[0].duration).toBe(base.segments[0].duration)
  })
})

describe('Phase 6 subject crop planning', () => {
  it('smooths motion, respects maximum pan speed, and falls back without a subject', () => {
    const smoothed = smoothFocusPoints([
      { timestamp: 0, x: 0.1, y: 0.5, confidence: 0.9, subjectWidth: 0.2, subjectHeight: 0.5 },
      { timestamp: 0.1, x: 0.9, y: 0.5, confidence: 0.9, subjectWidth: 0.2, subjectHeight: 0.5 }
    ])
    expect(smoothed[1].x - smoothed[0].x).toBeLessThanOrEqual(0.029)
    expect(createSubjectTrack([]).fallback).toBe(true)
  })

  it('creates an interpolated dynamic crop expression for off-center movement', () => {
    const track = createSubjectTrack([
      { timestamp: 2, x: 0.75, y: 0.5, confidence: 0.9, subjectWidth: 0.2, subjectHeight: 0.5 },
      { timestamp: 4, x: 0.85, y: 0.5, confidence: 0.9, subjectWidth: 0.2, subjectHeight: 0.5 }
    ])
    const filter = smartCropFilter(track, 2, 1080, 1920)
    expect(filter).toContain('crop=1080:1920')
    expect(filter).toContain('min(iw-ow')
    expect(filter).toContain('if(lt(t')
  })
})

describe('Phase 6 manual Edit Plan operations', () => {
  it('adjusts, resets, locks, reorders, and increments revisions', () => {
    const base = plan(3, 15)
    const first = base.segments[0]
    const adjusted = adjustPlanSegment(base, first.id, first.start + 0.2, first.end + 0.7)
    expect(adjusted.segments[0].selectionSource).toBe('manual')
    expect(adjusted.revision).toBe(2)
    const reset = resetPlanSegment(adjusted, first.id)
    expect(reset.segments[0].start).toBe(first.automaticStart)
    const locked = togglePlanSegmentLock(reset, first.id)
    expect(locked.segments[0].locked).toBe(true)
    const reordered = reorderPlanSegment(locked, first.id, locked.segments[2].id)
    expect(reordered.segments[2].sourcePath).toBe(first.sourcePath)
  })

  it('cycles a bounded alternative for only the requested source', () => {
    const base = plan(2, 10)
    const first = base.segments[0]
    const scores = {
      sharpness: 0.8, exposure: 0.8, motion: 0.8, stability: 0.8, audioActivity: 0.5,
      personPresence: 0, sceneQuality: 0.8, blackFramePenalty: 0, duplicatePenalty: 0,
      speechActivity: 0, speechBoundaryQuality: 0, speechCompleteness: 0, total: 0.8
    }
    base.segments[0].selectedCandidate = {
      candidateId: 'one', scores, reasons: ['First'], analysisFallback: false,
      alternatives: [{ candidateId: 'two', start: 9, end: 14, scores: { ...scores, total: 0.78 }, reasons: ['Alternate'] }]
    }
    const replaced = tryAlternateSegment(base, first.id)
    expect(replaced.segments[0]).toMatchObject({ start: 9, end: 14, selectionSource: 'manual' })
    expect(replaced.segments[1]).toEqual(base.segments[1])
  })

  it('rebalances unlocked segments without changing a locked manual range', () => {
    let current = plan(2, 10)
    const first = current.segments[0]
    current = adjustPlanSegment(current, first.id, first.start, first.end + 1)
    current = togglePlanSegmentLock(current, first.id)
    const lockedRange = { start: current.segments[0].start, end: current.segments[0].end }
    const balanced = rebalancePlan(current)
    expect(balanced.expectedDuration).toBeCloseTo(10, 2)
    expect(balanced.segments[0]).toMatchObject(lockedRange)
    expect(balanced.segments[1].duration).toBeLessThan(current.segments[1].duration)
  })

  it('preserves locked ranges and rebalances unlocked footage during regeneration', () => {
    const generated = plan(2, 10)
    let current = plan(2, 10)
    current = adjustPlanSegment(current, current.segments[0].id, current.segments[0].start, current.segments[0].end + 0.7)
    current = togglePlanSegmentLock(current, current.segments[0].id)
    const regenerated = preserveLockedSegments(generated, current)
    expect(regenerated.segments[0].end).toBe(current.segments[0].end)
    expect(regenerated.segments[0].locked).toBe(true)
    expect(regenerated.expectedDuration).toBeCloseTo(10, 2)
    expect(regenerated.revision).toBe(current.revision + 1)
  })
})
