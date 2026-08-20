import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '../ffmpeg/process'

export async function prepareTranscriptionAudio(
  ffmpegPath: string,
  sourcePath: string,
  directory: string,
  index: number,
  signal: AbortSignal,
  range?: { start: number; end: number }
): Promise<string> {
  await mkdir(directory, { recursive: true })
  const outputPath = join(directory, `audio-${index.toString().padStart(3, '0')}.wav`)
  const args = ['-hide_banner', '-loglevel', 'error']
  if (range) args.push('-ss', range.start.toFixed(3), '-t', Math.max(0.01, range.end - range.start).toFixed(3))
  args.push('-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', outputPath)
  await runProcess(ffmpegPath, args, { signal })
  return outputPath
}
