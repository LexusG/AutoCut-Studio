import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Transcript, TranscriptionSource, TranscriptionSettings } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

export async function transcriptCacheKey(
  source: TranscriptionSource,
  settings: TranscriptionSettings,
  providerVersion: string,
  vocabulary: string[] = []
): Promise<string> {
  const file = await stat(source.path)
  return createHash('sha256').update(JSON.stringify({
    path: source.path, size: file.size, modifiedAt: file.mtimeMs, duration: source.duration,
    model: settings.quality, language: settings.language, provider: settings.provider,
    providerVersion, ranges: source.ranges ?? null, vocabulary: vocabulary.map((term) => term.trim()).filter(Boolean).sort()
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
  await writeFileAtomic(path, `${JSON.stringify(transcript)}\n`)
}
