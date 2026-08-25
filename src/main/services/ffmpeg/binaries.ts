import type { FfmpegStatus, ToolStatus } from '@shared/types'
import { runProcess } from './process'
import { resolveRuntimeExecutable } from '../runtime/path-resolver'

async function inspectTool(name: 'ffmpeg' | 'ffprobe'): Promise<ToolStatus> {
  const candidate = await resolveRuntimeExecutable(name)
  if (!candidate) return { available: false, path: null, version: null }

  try {
    const output = await runProcess(candidate.path, ['-version'])
    return {
      available: true,
      path: candidate.path,
      version: output.stdout.split('\n')[0]?.trim() || null
    }
  } catch {
    return { available: false, path: candidate.path, version: null }
  }
}

let statusPromise: Promise<FfmpegStatus> | null = null

export function detectFfmpeg(): Promise<FfmpegStatus> {
  statusPromise ??= Promise.all([inspectTool('ffmpeg'), inspectTool('ffprobe')]).then(
    ([ffmpeg, ffprobe]) => ({ ffmpeg, ffprobe, ready: ffmpeg.available && ffprobe.available })
  )
  return statusPromise
}

export function clearFfmpegStatusCache(): void {
  statusPromise = null
}
