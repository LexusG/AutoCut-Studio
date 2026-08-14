import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RenderAudioSettings, RenderSoundtrackTrack } from '@shared/types'
import { runProcess } from '../ffmpeg/process'

function usableDuration(track: RenderSoundtrackTrack): number {
  return Math.max(0.05, track.duration - Math.min(track.startPosition, Math.max(0, track.duration - 0.05)))
}

export interface SoundtrackCommand {
  args: string[]
  tracks: RenderSoundtrackTrack[]
}

export function buildSoundtrackCommand(
  settings: RenderAudioSettings,
  outputPath: string
): SoundtrackCommand | null {
  if (!settings.soundtrackEnabled) return null
  const tracks = settings.soundtrackTracks.filter((track) => track.enabled && !track.missing)
  if (tracks.length === 0) return null
  const args = ['-hide_banner', '-loglevel', 'error']
  for (const track of tracks) {
    const start = Math.min(track.startPosition, Math.max(0, track.duration - 0.05))
    args.push('-ss', start.toFixed(3), '-i', track.path)
  }
  const filters: string[] = []
  tracks.forEach((track, index) => {
    const duration = usableDuration(track)
    const chain = [
      'aresample=48000:async=1:first_pts=0',
      'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
      `atrim=0:${duration.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
      `volume=${(track.volume / 100).toFixed(3)}`
    ]
    if (track.fadeIn.enabled && track.fadeIn.duration > 0) {
      chain.push(`afade=t=in:st=0:d=${Math.min(duration, track.fadeIn.duration).toFixed(3)}`)
    }
    if (track.fadeOut.enabled && track.fadeOut.duration > 0) {
      const fade = Math.min(duration, track.fadeOut.duration)
      chain.push(`afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}`)
    }
    filters.push(`[${index}:a:0]${chain.join(',')}[track${index}]`)
  })
  let label = 'track0'
  for (let index = 1; index < tracks.length; index += 1) {
    const crossfade = Math.min(
      settings.soundtrackCrossfade,
      usableDuration(tracks[index - 1]) * 0.4,
      usableDuration(tracks[index]) * 0.4
    )
    const next = index === tracks.length - 1 ? 'soundtrack' : `soundtrack${index}`
    if (crossfade > 0) {
      filters.push(`[${label}][track${index}]acrossfade=d=${crossfade.toFixed(3)}:c1=tri:c2=tri[${next}]`)
    } else {
      filters.push(`[${label}][track${index}]concat=n=2:v=0:a=1[${next}]`)
    }
    label = next
  }
  const outputLabel = tracks.length === 1 ? 'track0' : 'soundtrack'
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${outputLabel}]`,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-y', outputPath
  )
  return { args, tracks }
}

export async function prepareSoundtrack(
  ffmpegPath: string,
  settings: RenderAudioSettings,
  directory: string,
  signal: AbortSignal,
  logPath: string
): Promise<string | null> {
  const outputPath = join(directory, 'soundtrack.m4a')
  const command = buildSoundtrackCommand(settings, outputPath)
  if (!command) return null
  const { args, tracks } = command
  await appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    stage: 'soundtrack-plan',
    tracks: tracks.map((track) => ({ id: track.id, duration: track.duration, volume: track.volume, startPosition: track.startPosition })),
    crossfade: settings.soundtrackCrossfade,
    args
  })}\n`, 'utf8')
  await runProcess(ffmpegPath, args, { signal })
  return outputPath
}
