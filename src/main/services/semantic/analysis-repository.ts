import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SemanticAnalysisReference, SemanticProjectAnalysis } from '@shared/types'
import { semanticProjectDirectory } from './embedding-cache'

const ANALYSIS_FILENAME = 'analysis.json'

export async function saveSemanticAnalysis(analysis: SemanticProjectAnalysis): Promise<SemanticAnalysisReference> {
  const directory = semanticProjectDirectory(analysis.projectId)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, ANALYSIS_FILENAME), `${JSON.stringify(analysis, null, 2)}\n`, 'utf8')
  return {
    projectId: analysis.projectId,
    relativePath: `projects/${analysis.projectId}/semantic/${ANALYSIS_FILENAME}`,
    model: analysis.model,
    modelVersion: analysis.modelVersion,
    analyzerVersion: analysis.analyzerVersion,
    transcriptRevisionFingerprint: analysis.transcriptRevisionFingerprint,
    chunkCount: analysis.chunks.length,
    topicCount: analysis.topics.length,
    updatedAt: analysis.createdAt
  }
}

export async function loadSemanticAnalysis(
  projectId: string,
  reference?: SemanticAnalysisReference | null
): Promise<SemanticProjectAnalysis | null> {
  if (reference && reference.projectId !== projectId) return null
  try {
    const parsed = JSON.parse(await readFile(join(semanticProjectDirectory(projectId), ANALYSIS_FILENAME), 'utf8')) as SemanticProjectAnalysis
    return parsed.projectId === projectId && Array.isArray(parsed.chunks) && Array.isArray(parsed.topics) ? parsed : null
  } catch {
    return null
  }
}
