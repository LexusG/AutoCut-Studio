import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ProcessingResourceMode } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { analysisScheduler } from '../semantic/analysis-scheduler'

let current: ProcessingResourceMode = 'balanced'
const path = (): string => join(applicationStoragePaths().root, 'settings', 'processing.json')

function apply(mode: ProcessingResourceMode): void {
  current = mode
  analysisScheduler.setConcurrency(mode === 'maximum-performance' ? 2 : 1)
}

export async function initializeProcessingPreferences(): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(path(), 'utf8')) as { resourceMode?: ProcessingResourceMode }
    if (['low-memory', 'balanced', 'maximum-performance'].includes(parsed.resourceMode ?? '')) apply(parsed.resourceMode!)
  } catch { apply('balanced') }
}

export function getProcessingResourceMode(): ProcessingResourceMode { return current }

export async function setProcessingResourceMode(mode: ProcessingResourceMode): Promise<ProcessingResourceMode> {
  if (!['low-memory', 'balanced', 'maximum-performance'].includes(mode)) throw new Error('Processing resource mode is invalid.')
  apply(mode)
  const destination = path(); const temporary = `${destination}.tmp`
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify({ resourceMode: mode }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, destination)
  return mode
}
