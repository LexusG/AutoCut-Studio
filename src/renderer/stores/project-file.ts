import type { ProjectFile } from '@shared/types'
import { createProjectFile } from '@shared/utils/project-settings'
import { useAppStore } from './app-store'

type AppState = ReturnType<typeof useAppStore.getState>

/**
 * Assemble the persisted project from live store state.
 *
 * Manual save and autosave must produce byte-identical projects, so both go through
 * here rather than each listing the twenty-odd persisted slices themselves.
 */
export function projectFileFromState(state: AppState): ProjectFile {
  return createProjectFile(
    state.projectSettings,
    state.clips.map((clip) => clip.path),
    { id: state.projectId, createdAt: state.projectCreatedAt },
    state.previewHistory,
    state.editPlan,
    {
      transcriptReferences: state.transcriptReferences,
      transcriptCorrections: state.transcriptCorrections,
      textEdits: state.textEdits,
      transcriptEditRevision: state.transcriptEditRevision
    },
    {
      semanticAnalysis: state.semanticAnalysisReference,
      topics: state.topics,
      semanticHints: state.semanticHints,
      highlightCandidates: state.highlightCandidates,
      outputVariants: state.outputVariants
    },
    {
      diarizationReferences: state.diarizationReferences,
      speakerLabels: state.speakerLabels,
      confidenceReviews: state.confidenceReviews,
      userVocabulary: state.userVocabulary,
      semanticCollections: state.semanticCollections,
      projectCaptionTemplates: state.projectCaptionTemplates
    },
    {
      sourceMedia: state.sourceMedia,
      proxyRecords: state.proxyRecords,
      snapshotRefs: state.projectSnapshots,
      projectRevision: state.projectRevision
    }
  )
}

/** The current project, read imperatively — safe to call from a store subscription. */
export function currentProjectFile(): ProjectFile {
  return projectFileFromState(useAppStore.getState())
}
