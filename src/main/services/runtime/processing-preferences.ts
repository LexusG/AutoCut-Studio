import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessingResourceMode } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'
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
  await writeFileAtomic(path(), `${JSON.stringify({ resourceMode: mode }, null, 2)}\n`, { mode: 0o600 })
  return mode
}
