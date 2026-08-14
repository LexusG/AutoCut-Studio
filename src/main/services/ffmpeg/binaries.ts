import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { FfmpegStatus, ToolStatus } from '@shared/types'
import { runProcess } from './process'

function executableCandidates(name: string): string[] {
  const paths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return paths.map((directory) => join(directory, name))
}

async function findExecutable(name: string): Promise<string | null> {
  for (const candidate of executableCandidates(name)) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Continue through PATH entries.
    }
  }
  return null
}

async function inspectTool(name: 'ffmpeg' | 'ffprobe'): Promise<ToolStatus> {
  const path = await findExecutable(name)
  if (!path) return { available: false, path: null, version: null }

  try {
    const output = await runProcess(path, ['-version'])
    return {
      available: true,
      path,
      version: output.stdout.split('\n')[0]?.trim() || null
    }
  } catch {
    return { available: false, path, version: null }
  }
}

let statusPromise: Promise<FfmpegStatus> | null = null

export function detectFfmpeg(): Promise<FfmpegStatus> {
  statusPromise ??= Promise.all([inspectTool('ffmpeg'), inspectTool('ffprobe')]).then(
    ([ffmpeg, ffprobe]) => ({ ffmpeg, ffprobe, ready: ffmpeg.available && ffprobe.available })
  )
  return statusPromise
}
