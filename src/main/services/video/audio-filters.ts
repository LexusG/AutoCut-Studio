import type { RenderAudioSettings } from '@shared/types'
import { accurateLoudnessFilter, fastLoudnessFilter, type LoudnessMeasurements } from './loudness-normalizer'

export function sourceAudioFilter(
  inputLabel: string,
  duration: number,
  settings: RenderAudioSettings,
  measurements: LoudnessMeasurements | null = null
): string {
  const filters = [
    'aresample=48000:async=1:first_pts=0',
    'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
    `atrim=0:${duration.toFixed(3)}`,
    'asetpts=PTS-STARTPTS'
  ]
  if (settings.normalizationMode === 'accurate' && measurements) {
    filters.push(accurateLoudnessFilter(measurements))
  } else if (settings.normalizationMode !== 'off') {
    filters.push(fastLoudnessFilter())
  }
  filters.push(`volume=${(settings.originalAudioVolume / 100).toFixed(3)}`)
  return `[${inputLabel}]${filters.join(',')}[audio]`
}

export interface MusicMixFilters {
  filters: string[]
  outputLabel: string
}

export function musicMixFilters(
  musicInputIndex: number,
  baseAudioLabel: string,
  duration: number,
  settings: RenderAudioSettings,
  ducking: boolean
): MusicMixFilters {
  const music = [
    'aresample=48000:async=1:first_pts=0',
    'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
    `atrim=0:${duration.toFixed(3)}`,
    'asetpts=PTS-STARTPTS',
    `volume=${(settings.musicVolume / 100).toFixed(3)}`
  ]
  if (settings.fadeIn.enabled && settings.fadeIn.duration > 0) {
    music.push(`afade=t=in:st=0:d=${Math.min(duration, settings.fadeIn.duration).toFixed(3)}`)
  }
  if (settings.fadeOut.enabled && settings.fadeOut.duration > 0) {
    const fadeDuration = Math.min(duration, settings.fadeOut.duration)
    music.push(`afade=t=out:st=${Math.max(0, duration - fadeDuration).toFixed(3)}:d=${fadeDuration.toFixed(3)}`)
  }
  music.push(`apad=pad_dur=${duration.toFixed(3)}`, `atrim=0:${duration.toFixed(3)}`)

  const filters = [
    `[${baseAudioLabel}]apad=pad_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}[sourceaudio]`,
    `[${musicInputIndex}:a:0]${music.join(',')}[music]`
  ]
  if (ducking) {
    filters.push(
      '[sourceaudio]asplit=2[sourcebed][sidechain]',
      '[music][sidechain]sidechaincompress=threshold=0.035:ratio=4:attack=25:release=300[duckedmusic]',
      '[sourcebed][duckedmusic]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000:async=1:first_pts=0[mixedaudio]'
    )
  } else {
    filters.push(
      '[sourceaudio][music]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000:async=1:first_pts=0[mixedaudio]'
    )
  }
  return { filters, outputLabel: 'mixedaudio' }
}
