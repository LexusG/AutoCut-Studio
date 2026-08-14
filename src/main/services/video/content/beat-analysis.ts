import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BeatAnalysisResult, BeatMarker, RenderAudioSettings } from '@shared/types'
import { applicationStoragePaths } from '../../filesystem/application-storage'
import { runProcess } from '../../ffmpeg/process'

export const BEAT_ANALYZER_VERSION = 'phase6-pcm-onset-v1'
export const BEAT_ANALYSIS_CONFIG = {
  sampleRate: 8000,
  frameSamples: 200,
  minimumGap: 0.25,
  maximumDurationSeconds: 900
} as const

const round = (value: number): number => Math.round(value * 1000) / 1000

export function detectBeatsFromPcm(buffer: Buffer, sourceTrackId: string): BeatAnalysisResult {
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2))
  const energies: number[] = []
  for (let offset = 0; offset + BEAT_ANALYSIS_CONFIG.frameSamples <= samples.length; offset += BEAT_ANALYSIS_CONFIG.frameSamples) {
    let sum = 0
    for (let index = offset; index < offset + BEAT_ANALYSIS_CONFIG.frameSamples; index += 1) {
      const value = samples[index] / 32768
      sum += value * value
    }
    energies.push(Math.sqrt(sum / BEAT_ANALYSIS_CONFIG.frameSamples))
  }
  const flux = energies.map((value, index) => Math.max(0, value - (energies[index - 1] ?? value)))
  const mean = flux.reduce((sum, value) => sum + value, 0) / Math.max(1, flux.length)
  const deviation = Math.sqrt(flux.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, flux.length))
  const threshold = mean + deviation * 0.75
  const frameSeconds = BEAT_ANALYSIS_CONFIG.frameSamples / BEAT_ANALYSIS_CONFIG.sampleRate
  const gapFrames = Math.ceil(BEAT_ANALYSIS_CONFIG.minimumGap / frameSeconds)
  const peaks: { frame: number; strength: number }[] = []
  for (let index = 1; index < flux.length - 1; index += 1) {
    if (flux[index] < threshold || flux[index] < flux[index - 1] || flux[index] < flux[index + 1]) continue
    const prior = peaks.at(-1)
    if (prior && index - prior.frame < gapFrames) {
      if (flux[index] > prior.strength) peaks[peaks.length - 1] = { frame: index, strength: flux[index] }
    } else peaks.push({ frame: index, strength: flux[index] })
  }
  const maximum = Math.max(threshold, ...peaks.map((item) => item.strength))
  const intervals = peaks.slice(1).map((item, index) => (item.frame - peaks[index].frame) * frameSeconds)
    .filter((value) => value >= 0.28 && value <= 1.2).sort((a, b) => a - b)
  const median = intervals.length ? intervals[Math.floor(intervals.length / 2)] : null
  let bpm = median ? 60 / median : null
  while (bpm != null && bpm < 70) bpm *= 2
  while (bpm != null && bpm > 180) bpm /= 2
  const beats: BeatMarker[] = peaks.map((peak, index) => ({
    timestamp: round(peak.frame * frameSeconds),
    strength: Math.min(1, peak.strength / maximum),
    strong: index % 4 === 0 || peak.strength >= maximum * 0.82,
    sourceTrackId
  }))
  return {
    bpm: bpm == null ? null : Math.round(bpm * 10) / 10,
    beats,
    confidence: Math.min(1, intervals.length / 12) * (deviation > 0 ? 0.9 : 0),
    analyzedDuration: round(samples.length / BEAT_ANALYSIS_CONFIG.sampleRate),
    analyzerVersion: BEAT_ANALYZER_VERSION,
    warnings: beats.length < 2 ? ['No reliable repeating beat pattern was detected.'] : []
  }
}

async function trackCachePath(path: string, startPosition: number): Promise<string> {
  const file = await stat(path)
  const key = createHash('sha256').update(JSON.stringify({
    path, size: file.size, mtimeMs: file.mtimeMs, startPosition,
    version: BEAT_ANALYZER_VERSION, config: BEAT_ANALYSIS_CONFIG
  })).digest('hex')
  return join(applicationStoragePaths().analysisCache, 'music', `${key}.json`)
}

async function analyzeTrack(
  ffmpegPath: string,
  track: RenderAudioSettings['soundtrackTracks'][number],
  signal: AbortSignal
): Promise<{ result: BeatAnalysisResult; cacheHit: boolean }> {
  const target = await trackCachePath(track.path, track.startPosition)
  try {
    return { result: JSON.parse(await readFile(target, 'utf8')) as BeatAnalysisResult, cacheHit: true }
  } catch {
    // Continue with local analysis.
  }
  const directory = await mkdtemp(join(tmpdir(), 'autocut-beats-'))
  const pcmPath = join(directory, `${randomUUID()}.pcm`)
  try {
    const usableDuration = Math.min(
      BEAT_ANALYSIS_CONFIG.maximumDurationSeconds,
      Math.max(0.05, track.duration - Math.min(track.startPosition, track.duration - 0.05))
    )
    await runProcess(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-ss', track.startPosition.toFixed(3), '-i', track.path,
      '-t', usableDuration.toFixed(3), '-vn', '-ac', '1', '-ar', String(BEAT_ANALYSIS_CONFIG.sampleRate),
      '-f', 's16le', '-y', pcmPath
    ], { signal })
    const result = detectBeatsFromPcm(await readFile(pcmPath), track.id)
    await mkdir(join(applicationStoragePaths().analysisCache, 'music'), { recursive: true })
    await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    return { result, cacheHit: false }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function analyzeSoundtrackBeats(
  ffmpegPath: string,
  audio: RenderAudioSettings,
  finalDuration: number,
  signal: AbortSignal
): Promise<{ result: BeatAnalysisResult | null; cacheHits: number }> {
  if (!audio.soundtrackEnabled) return { result: null, cacheHits: 0 }
  const tracks = audio.soundtrackTracks.filter((track) => track.enabled && !track.missing)
  if (tracks.length === 0) return { result: null, cacheHits: 0 }
  let cacheHits = 0
  const results: BeatAnalysisResult[] = []
  for (const track of tracks) {
    const analyzed = await analyzeTrack(ffmpegPath, track, signal)
    if (analyzed.cacheHit) cacheHits += 1
    results.push(analyzed.result)
  }
  return { result: buildSoundtrackBeatTimeline(tracks, results, audio.soundtrackCrossfade, audio.loopBackgroundMusic, finalDuration), cacheHits }
}

export function buildSoundtrackBeatTimeline(
  tracks: RenderAudioSettings['soundtrackTracks'],
  results: BeatAnalysisResult[],
  crossfadeDuration: number,
  loop: boolean,
  finalDuration: number
): BeatAnalysisResult {
  const markers: BeatMarker[] = []
  const bpms: number[] = []
  const warnings: string[] = []
  let offset = 0
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]
    const result = results[index]
    if (!result) continue
    if (result.bpm) bpms.push(result.bpm)
    warnings.push(...result.warnings.map((warning) => `${track.filename}: ${warning}`))
    markers.push(...result.beats.map((beat) => ({ ...beat, timestamp: round(offset + beat.timestamp) })))
    const usable = Math.max(0.05, track.duration - Math.min(track.startPosition, track.duration - 0.05))
    const next = tracks[index + 1]
    const nextUsable = next
      ? Math.max(0.05, next.duration - Math.min(next.startPosition, next.duration - 0.05))
      : 0
    const crossfade = next ? Math.min(crossfadeDuration, usable * 0.4, nextUsable * 0.4) : 0
    offset += usable - crossfade
  }
  const timelineDuration = offset
  const base = [...markers]
  if (loop && timelineDuration > 0) {
    for (let loopOffset = timelineDuration; loopOffset < finalDuration; loopOffset += timelineDuration) {
      markers.push(...base.filter((beat) => beat.timestamp + loopOffset <= finalDuration)
        .map((beat) => ({ ...beat, timestamp: round(beat.timestamp + loopOffset) })))
    }
  }
  return {
    bpm: bpms.length ? Math.round((bpms.reduce((sum, value) => sum + value, 0) / bpms.length) * 10) / 10 : null,
    beats: markers.filter((beat) => beat.timestamp <= finalDuration).sort((a, b) => a.timestamp - b.timestamp),
    confidence: markers.length ? Math.min(1, markers.length / Math.max(8, finalDuration / 2)) : 0,
    analyzedDuration: Math.min(finalDuration, timelineDuration), analyzerVersion: BEAT_ANALYZER_VERSION, warnings
  }
}
