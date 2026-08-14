import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { runProcess } from '../ffmpeg/process'

export async function generateThumbnail(
  ffmpegPath: string,
  sourcePath: string,
  duration: number
): Promise<string> {
  const sourceStat = await stat(sourcePath)
  const cacheKey = createHash('sha256')
    .update(`${sourcePath}:${sourceStat.size}:${sourceStat.mtimeMs}`)
    .digest('hex')
  const thumbnailDirectory = join(app.getPath('userData'), 'thumbnails')
  const thumbnailPath = join(thumbnailDirectory, `${cacheKey}.jpg`)

  await mkdir(thumbnailDirectory, { recursive: true })

  try {
    const thumbnailStat = await stat(thumbnailPath)
    if (thumbnailStat.size > 0) return thumbnailPath
  } catch {
    // The cache will be populated below.
  }

  const seekTime = Math.max(0, Math.min(duration * 0.5, duration - 0.05))
  await runProcess(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    seekTime.toFixed(3),
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    "scale='min(640,iw)':-2",
    '-q:v',
    '3',
    '-y',
    thumbnailPath
  ])

  return thumbnailPath
}
