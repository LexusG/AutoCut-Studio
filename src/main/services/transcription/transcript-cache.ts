import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Transcript, TranscriptionSource, TranscriptionSettings } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'

export async function transcriptCacheKey(
  source: TranscriptionSource,
  settings: TranscriptionSettings,
  providerVersion: string
): Promise<string> {
  const file = await stat(source.path)
  return createHash('sha256').update(JSON.stringify({
    path: source.path, size: file.size, modifiedAt: file.mtimeMs, duration: source.duration,
    model: settings.quality, language: settings.language, provider: settings.provider,
    providerVersion, ranges: source.ranges ?? null
  })).digest('hex')
}

function cachePath(key: string): string {
  return join(applicationStoragePaths().analysisCache, 'transcription', `${key}.json`)
}

export async function readTranscriptCache(key: string): Promise<Transcript | null> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(key), 'utf8')) as Transcript
    return parsed.version === 1 ? parsed : null
  } catch { return null }
}

export async function writeTranscriptCache(key: string, transcript: Transcript): Promise<void> {
  const path = cachePath(key)
  const temporary = `${path}.tmp-${process.pid}`
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify(transcript)}\n`, 'utf8')
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
