import { useCallback, useEffect, useState } from 'react'
import type { LoadedProject, RecentProject } from '@shared/types'
import { createProjectFile } from '@shared/utils/project-settings'
import { validateProjectSettings } from '@shared/utils/project-validation'
import { useAppStore } from '../stores/app-store'

interface ProjectFileActions {
  save: () => Promise<boolean>
  chooseAndOpen: () => Promise<boolean>
  openRecent: (path: string) => Promise<boolean>
  removeRecent: (path: string) => Promise<void>
  refreshRecent: () => Promise<void>
  busy: boolean
  message: string | null
  error: string | null
  clearFeedback: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The project operation failed.'
}

export function useProjectFiles(): ProjectFileActions {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settings = useAppStore((state) => state.projectSettings)
  const clips = useAppStore((state) => state.clips)
  const projectId = useAppStore((state) => state.projectId)
  const projectCreatedAt = useAppStore((state) => state.projectCreatedAt)
  const projectFilePath = useAppStore((state) => state.projectFilePath)
  const previewHistory = useAppStore((state) => state.previewHistory)
  const editPlan = useAppStore((state) => state.editPlan)
  const transcriptReferences = useAppStore((state) => state.transcriptReferences)
  const transcriptCorrections = useAppStore((state) => state.transcriptCorrections)
  const textEdits = useAppStore((state) => state.textEdits)
  const transcriptEditRevision = useAppStore((state) => state.transcriptEditRevision)
  const semanticAnalysisReference = useAppStore((state) => state.semanticAnalysisReference)
  const topics = useAppStore((state) => state.topics)
  const semanticHints = useAppStore((state) => state.semanticHints)
  const highlightCandidates = useAppStore((state) => state.highlightCandidates)
  const outputVariants = useAppStore((state) => state.outputVariants)
  const diarizationReferences = useAppStore((state) => state.diarizationReferences)
  const speakerLabels = useAppStore((state) => state.speakerLabels)
  const confidenceReviews = useAppStore((state) => state.confidenceReviews)
  const userVocabulary = useAppStore((state) => state.userVocabulary)
  const semanticCollections = useAppStore((state) => state.semanticCollections)
  const projectCaptionTemplates = useAppStore((state) => state.projectCaptionTemplates)
  const markSaved = useAppStore((state) => state.markProjectSaved)
  const loadProject = useAppStore((state) => state.loadProject)
  const setRecentProjects = useAppStore((state) => state.setRecentProjects)
  const setImporting = useAppStore((state) => state.setImporting)
  const setTranscripts = useAppStore((state) => state.setTranscripts)
  const setLoadedSemanticAnalysis = useAppStore((state) => state.setLoadedSemanticAnalysis)
  const setLoadedDiarization = useAppStore((state) => state.setLoadedDiarization)

  const clearFeedback = useCallback(() => {
    setMessage(null)
    setError(null)
  }, [])

  const refreshRecent = useCallback(async () => {
    try {
      setRecentProjects(await window.autoCut.getRecentProjects())
    } catch {
      setRecentProjects([])
    }
  }, [setRecentProjects])

  useEffect(() => {
    void refreshRecent()
  }, [refreshRecent])

  const openLoadedProject = useCallback(
    async (loaded: LoadedProject): Promise<void> => {
      setImporting(true)
      try {
        const imported = loaded.project.sourcePaths.length
          ? await window.autoCut.importVideoFiles(loaded.project.sourcePaths)
          : { clips: [], failures: [] }
        loadProject(loaded.project, loaded.filePath, imported.clips, imported.failures)
        setTranscripts(await window.autoCut.loadTranscripts(loaded.project.id, loaded.project.transcriptReferences))
        setLoadedSemanticAnalysis(await window.autoCut.loadSemanticAnalysis(loaded.project.id, loaded.project.semanticAnalysis))
        setLoadedDiarization(await window.autoCut.loadDiarization(loaded.project.id, loaded.project.diarizationReferences))
        setMessage(`Opened ${loaded.project.settings.name}`)
        await refreshRecent()
      } finally {
        setImporting(false)
      }
    },
    [loadProject, refreshRecent, setImporting, setLoadedDiarization, setLoadedSemanticAnalysis, setTranscripts]
  )

  const chooseAndOpen = useCallback(async (): Promise<boolean> => {
    setBusy(true)
    clearFeedback()
    try {
      const loaded = await window.autoCut.chooseProjectFile()
      if (!loaded) return false
      await openLoadedProject(loaded)
      return true
    } catch (operationError) {
      setError(errorMessage(operationError))
      return false
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, openLoadedProject])

  const openRecent = useCallback(
    async (path: string): Promise<boolean> => {
      setBusy(true)
      clearFeedback()
      try {
        await openLoadedProject(await window.autoCut.openProjectFile(path))
        return true
      } catch (operationError) {
        setError(errorMessage(operationError))
        return false
      } finally {
        setBusy(false)
      }
    },
    [clearFeedback, openLoadedProject]
  )

  const save = useCallback(async (): Promise<boolean> => {
    clearFeedback()
    const blockingIssue = validateProjectSettings(settings, clips.length).find(
      (issue) => issue.severity === 'error'
    )
    if (blockingIssue) {
      setError(blockingIssue.message)
      return false
    }

    setBusy(true)
    try {
      const project = createProjectFile(
        settings,
        clips.map((clip) => clip.path),
        { id: projectId, createdAt: projectCreatedAt },
        previewHistory,
        editPlan,
        { transcriptReferences, transcriptCorrections, textEdits, transcriptEditRevision },
        { semanticAnalysis: semanticAnalysisReference, topics, semanticHints, highlightCandidates, outputVariants },
        { diarizationReferences, speakerLabels, confidenceReviews, userVocabulary, semanticCollections, projectCaptionTemplates }
      )
      const saved = await window.autoCut.saveProject(project, projectFilePath)
      if (!saved) return false
      markSaved(saved)
      setMessage('Project saved')
      await refreshRecent()
      return true
    } catch (operationError) {
      setError(errorMessage(operationError))
      return false
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, clips, confidenceReviews, diarizationReferences, editPlan, highlightCandidates, markSaved, outputVariants, previewHistory, projectCaptionTemplates, projectCreatedAt, projectFilePath, projectId, refreshRecent, semanticAnalysisReference, semanticCollections, semanticHints, settings, speakerLabels, textEdits, topics, transcriptCorrections, transcriptEditRevision, transcriptReferences, userVocabulary])

  const removeRecent = useCallback(
    async (path: string): Promise<void> => {
      setRecentProjects(await window.autoCut.removeRecentProject(path))
    },
    [setRecentProjects]
  )

  return {
    save,
    chooseAndOpen,
    openRecent,
    removeRecent,
    refreshRecent,
    busy,
    message,
    error,
    clearFeedback
  }
}

export function formatRecentDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function sortRecentProjects(projects: RecentProject[]): RecentProject[] {
  return [...projects].sort((left, right) => right.lastOpened.localeCompare(left.lastOpened))
}
