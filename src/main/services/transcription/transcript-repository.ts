import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Transcript, TranscriptReference } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'

function safeId(value: string): string {
  if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Transcript storage identifier is invalid.')
  return value
}

export function transcriptPath(projectId: string, sourceClipId: string): string {
  return join(applicationStoragePaths().projects, safeId(projectId), 'transcripts', `${safeId(sourceClipId)}.json`)
}

export async function saveTranscript(transcript: Transcript): Promise<TranscriptReference> {
  const path = transcriptPath(transcript.projectId, transcript.sourceClipId)
  const temporary = `${path}.tmp-${process.pid}`
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
  return {
    sourceClipId: transcript.sourceClipId,
    transcriptId: transcript.id,
    relativePath: `projects/${transcript.projectId}/transcripts/${transcript.sourceClipId}.json`,
    model: transcript.model,
    language: transcript.detectedLanguage ?? transcript.language,
    revision: transcript.revision,
    createdAt: transcript.createdAt
  }
}

export async function loadProjectTranscripts(projectId: string, references: TranscriptReference[]): Promise<Transcript[]> {
  const transcripts: Transcript[] = []
  for (const reference of references) {
    try {
      const parsed = JSON.parse(await readFile(transcriptPath(projectId, reference.sourceClipId), 'utf8')) as Transcript
      if (parsed.version === 1 && parsed.projectId === projectId) transcripts.push(parsed)
    } catch {
      // A missing artifact leaves the project usable and can be regenerated.
    }
  }
  return transcripts
}

export async function updateTranscript(transcript: Transcript): Promise<TranscriptReference> {
  return saveTranscript({ ...transcript, updatedAt: new Date().toISOString() })
}
