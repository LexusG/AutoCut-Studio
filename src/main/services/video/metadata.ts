import type { VideoStreamMetadata } from '@shared/types'
import { runProcess } from '../ffmpeg/process'

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  bit_rate?: string
  tags?: { rotate?: string }
  side_data_list?: Array<{ rotation?: number }>
}

interface ProbeOutput {
  streams?: ProbeStream[]
  format?: { duration?: string; bit_rate?: string }
}

export interface ProbedMedia {
  duration: number
  video: VideoStreamMetadata
  hasAudio: boolean
}

export function parseFrameRate(value: string | undefined): number {
  if (!value) return 0
  const [numeratorText, denominatorText] = value.split('/')
  const numerator = Number(numeratorText)
  const denominator = Number(denominatorText ?? '1')
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  return numerator / denominator
}

function parsePositiveNumber(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getRotation(stream: ProbeStream): number {
  const sideDataRotation = stream.side_data_list?.find((item) => item.rotation != null)?.rotation
  const rotation = sideDataRotation ?? Number(stream.tags?.rotate ?? 0)
  return Number.isFinite(rotation) ? rotation : 0
}

export async function probeMedia(ffprobePath: string, filePath: string): Promise<ProbedMedia> {
  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ])

  let probe: ProbeOutput
  try {
    probe = JSON.parse(stdout) as ProbeOutput
  } catch (error) {
    throw new Error(`FFprobe returned unreadable metadata: ${String(error)}`)
  }

  const streams = probe.streams ?? []
  const videoStream = streams.find((stream) => stream.codec_type === 'video')
  if (!videoStream || !videoStream.width || !videoStream.height) {
    throw new Error('Video contains no readable frames.')
  }

  const duration =
    parsePositiveNumber(probe.format?.duration) ?? parsePositiveNumber(videoStream.duration)
  if (!duration) throw new Error('Video duration could not be determined.')

  const frameRate = parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate)
  const bitrate = parsePositiveNumber(videoStream.bit_rate ?? probe.format?.bit_rate)

  return {
    duration,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    video: {
      codec: videoStream.codec_name ?? 'unknown',
      width: videoStream.width,
      height: videoStream.height,
      frameRate,
      rotation: getRotation(videoStream),
      bitrate
    }
  }
}
