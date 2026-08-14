import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import { SUPPORTED_AUDIO_EXTENSIONS } from '@shared/constants/audio'
import type { AudioImportResult, AudioTrack } from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { ProcessExecutionError, runProcess } from '../ffmpeg/process'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'

interface AudioProbeStream {
  codec_type?: string
  codec_name?: string
  duration?: string
  bit_rate?: string
  sample_rate?: string
  channels?: number
}

interface AudioProbeOutput {
  streams?: AudioProbeStream[]
  format?: { duration?: string; bit_rate?: string }
}

const supportedExtensions = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS)

function positiveNumber(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function errorResult(error: unknown): AudioImportResult {
  return {
    track: null,
    error: error instanceof Error ? error.message : 'The audio file could not be imported.',
    details: error instanceof ProcessExecutionError ? error.details : undefined
  }
}

export async function importAudio(filePath: string): Promise<AudioImportResult> {
  try {
    if (!isAbsolute(filePath)) throw new Error('Only local audio files can be imported.')
    if (!supportedExtensions.has(extname(filePath).toLowerCase())) {
      throw new Error('Unsupported audio file. Choose MP3, WAV, AAC, M4A, OGG, or FLAC.')
    }
    const status = await detectFfmpeg()
    if (!status.ready || !status.ffprobe.path) throw new Error('FFprobe is required to import audio.')
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('The selected audio path is not a file.')

    const { stdout } = await runProcess(status.ffprobe.path, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath
    ])
    const probe = JSON.parse(stdout) as AudioProbeOutput
    const stream = probe.streams?.find((candidate) => candidate.codec_type === 'audio')
    if (!stream) throw new Error('Audio file contains no readable audio stream.')
    const duration = positiveNumber(probe.format?.duration) ?? positiveNumber(stream.duration)
    if (!duration) throw new Error('Audio duration could not be determined.')

    allowMediaPath(filePath)
    const track: AudioTrack = {
      id: createHash('sha256')
        .update(`${filePath}:${fileStat.size}:${fileStat.mtimeMs}`)
        .digest('hex')
        .slice(0, 20),
      filename: basename(filePath),
      path: filePath,
      mediaUrl: createMediaUrl(filePath),
      duration,
      codec: stream.codec_name ?? 'unknown',
      bitrate: positiveNumber(stream.bit_rate ?? probe.format?.bit_rate),
      sampleRate: positiveNumber(stream.sample_rate),
      channels: stream.channels && stream.channels > 0 ? stream.channels : null,
      size: fileStat.size,
      missing: false
    }
    return { track, error: null }
  } catch (error) {
    return errorResult(error)
  }
}
