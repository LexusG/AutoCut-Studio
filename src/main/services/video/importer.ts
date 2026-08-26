import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import { SUPPORTED_VIDEO_EXTENSIONS } from '@shared/constants/media'
import type { ImportFailure, ImportResult, MediaClip } from '@shared/types'
import { detectFfmpeg } from '../ffmpeg/binaries'
import { ProcessExecutionError } from '../ffmpeg/process'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
import { probeMedia } from './metadata'
import { generateThumbnail } from './thumbnails'

const supportedExtensions = new Set<string>(SUPPORTED_VIDEO_EXTENSIONS)

function createClipId(filePath: string, size: number, modifiedAt: number): string {
  return createHash('sha256').update(`${filePath}:${size}:${modifiedAt}`).digest('hex').slice(0, 20)
}

function failureFor(filePath: string, error: unknown): ImportFailure {
  // A failed FFprobe run reports the absolute path of the bundled binary and its exit
  // code. That is useful for diagnosis but meaningless to a user, and the summary line
  // is always visible, so the raw text belongs in the expandable details instead.
  const message = error instanceof ProcessExecutionError
    ? 'This file could not be read as video. It may be corrupt or in an unsupported format.'
    : error instanceof Error ? error.message : 'The video could not be imported.'
  const details = error instanceof ProcessExecutionError
    ? `${error.message}\n${error.details}`
    : undefined
  return {
    path: filePath,
    filename: basename(filePath) || 'Unknown file',
    message,
    details
  }
}

async function importOneVideo(
  filePath: string,
  ffmpegPath: string,
  ffprobePath: string
): Promise<MediaClip> {
  if (!isAbsolute(filePath)) throw new Error('Only local video files can be imported.')
  if (!supportedExtensions.has(extname(filePath).toLowerCase())) {
    throw new Error('Unsupported video file. Choose MP4, MOV, MKV, WebM, AVI, or M4V.')
  }

  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) throw new Error('The selected path is not a file.')

  const metadata = await probeMedia(ffprobePath, filePath)
  const thumbnailPath = await generateThumbnail(ffmpegPath, filePath, metadata.duration)
  allowMediaPath(filePath)
  allowMediaPath(thumbnailPath)

  return {
    id: createClipId(filePath, fileStat.size, fileStat.mtimeMs),
    path: filePath,
    mediaUrl: createMediaUrl(filePath),
    thumbnailPath,
    thumbnailUrl: createMediaUrl(thumbnailPath),
    filename: basename(filePath),
    duration: metadata.duration,
    size: fileStat.size,
    video: metadata.video,
    hasAudio: metadata.hasAudio
  }
}

export async function importVideos(paths: string[]): Promise<ImportResult> {
  const status = await detectFfmpeg()
  if (!status.ready || !status.ffmpeg.path || !status.ffprobe.path) {
    const message = 'FFmpeg and FFprobe are required before videos can be imported.'
    return {
      clips: [],
      failures: paths.map((path) => ({ path, filename: basename(path), message }))
    }
  }

  const clips: MediaClip[] = []
  const failures: ImportFailure[] = []

  for (const filePath of paths) {
    try {
      clips.push(await importOneVideo(filePath, status.ffmpeg.path, status.ffprobe.path))
    } catch (error) {
      failures.push(failureFor(filePath, error))
    }
  }

  return { clips, failures }
}
