import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AnalysisQuality, SelectedCandidateMetadata } from '@shared/types'
import { SMART_ANALYSIS_VERSION } from './scoring'

export interface CachedSelection {
  start: number
  end: number
  metadata: SelectedCandidateMetadata
}

async function cacheKey(path: string, duration: number, quality: AnalysisQuality, profile: string): Promise<string> {
  const file = await stat(path)
  return createHash('sha256')
    .update(JSON.stringify({ path, size: file.size, mtimeMs: file.mtimeMs, duration, quality, profile, version: SMART_ANALYSIS_VERSION }))
    .digest('hex')
}

function cacheDirectory(): string {
  return join(app.getPath('userData'), 'analysis-cache', SMART_ANALYSIS_VERSION)
}

export async function readAnalysisCache(
  path: string,
  duration: number,
  quality: AnalysisQuality,
  profile: string
): Promise<CachedSelection[] | null> {
  try {
    const contents = await readFile(join(cacheDirectory(), `${await cacheKey(path, duration, quality, profile)}.json`), 'utf8')
    const parsed = JSON.parse(contents) as unknown
    return Array.isArray(parsed) ? parsed as CachedSelection[] : null
  } catch {
    return null
  }
}

export async function writeAnalysisCache(
  path: string,
  duration: number,
  quality: AnalysisQuality,
  profile: string,
  selections: CachedSelection[]
): Promise<void> {
  const directory = cacheDirectory()
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, `${await cacheKey(path, duration, quality, profile)}.json`),
    `${JSON.stringify(selections, null, 2)}\n`,
    'utf8'
  )
}
