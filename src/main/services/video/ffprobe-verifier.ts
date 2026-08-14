import { stat } from 'node:fs/promises'
import { runProcess } from '../ffmpeg/process'
import { parseFrameRate } from './metadata'

interface ProbeStream {
  codec_type?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
}

interface ProbeOutput {
  streams?: ProbeStream[]
  format?: { duration?: string }
}

export interface VerifiedOutput {
  duration: number
  width: number
  height: number
  frameRate: number
  hasAudio: boolean
  fileSize: number
}

export async function verifyRenderedOutput(
  ffprobePath: string,
  outputPath: string,
  expected: { width: number; height: number; frameRate: number; duration: number }
): Promise<VerifiedOutput> {
  const [file, result] = await Promise.all([
    stat(outputPath),
    runProcess(ffprobePath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      outputPath
    ])
  ])
  let probe: ProbeOutput
  try {
    probe = JSON.parse(result.stdout) as ProbeOutput
  } catch {
    throw new Error('FFprobe could not read the generated MP4.')
  }
  const streams = probe.streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const duration = Number(probe.format?.duration)
  if (!file.isFile() || file.size === 0 || !video?.width || !video.height || !Number.isFinite(duration)) {
    throw new Error('The generated MP4 is incomplete or unreadable.')
  }
  const frameRate = parseFrameRate(video.avg_frame_rate || video.r_frame_rate)
  if (video.width !== expected.width || video.height !== expected.height) {
    throw new Error(
      `Export verification expected ${expected.width}x${expected.height}, but received ${video.width}x${video.height}.`
    )
  }
  if (Math.abs(frameRate - expected.frameRate) > 0.6) {
    throw new Error(
      `Export verification expected ${expected.frameRate} FPS, but received ${frameRate.toFixed(2)} FPS.`
    )
  }
  if (Math.abs(duration - expected.duration) > Math.max(0.75, expected.duration * 0.02)) {
    throw new Error(
      `Export verification expected approximately ${expected.duration.toFixed(2)} seconds, but received ${duration.toFixed(2)} seconds.`
    )
  }
  return {
    duration,
    width: video.width,
    height: video.height,
    frameRate,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    fileSize: file.size
  }
}
