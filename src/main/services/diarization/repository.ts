import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpeakerDiarizationReference, SpeakerDiarizationResult } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

function resultPath(projectId: string, clipId: string): string {
  return join(applicationStoragePaths().projects, projectId, 'analysis', 'diarization', `${clipId}.json`)
}

export async function loadDiarizationResult(projectId: string, clipId: string): Promise<SpeakerDiarizationResult | null> {
  try {
    const parsed = JSON.parse(await readFile(resultPath(projectId, clipId), 'utf8')) as SpeakerDiarizationResult
    return parsed.version === 1 && parsed.sourceClipId === clipId ? parsed : null
  } catch { return null }
}

export async function loadProjectDiarization(
  projectId: string,
  references: SpeakerDiarizationReference[]
): Promise<SpeakerDiarizationResult[]> {
  const results = await Promise.all(references.map((reference) => loadDiarizationResult(projectId, reference.sourceClipId)))
  return results.filter((result): result is SpeakerDiarizationResult => result !== null)
}

export async function saveDiarizationResult(projectId: string, result: SpeakerDiarizationResult): Promise<SpeakerDiarizationReference> {
  const path = resultPath(projectId, result.sourceClipId)
  await writeFileAtomic(path, `${JSON.stringify(result, null, 2)}\n`)
  return {
    sourceClipId: result.sourceClipId,
    relativePath: join('projects', projectId, 'analysis', 'diarization', `${result.sourceClipId}.json`),
    provider: result.provider, modelVersion: result.modelVersion, speakerCount: result.speakerCount,
    updatedAt: result.createdAt
  }
}
