import { useCallback, useEffect, useState } from 'react'
import type { ProjectFile, RecentProject } from '@shared/types'
import { validateProjectSettings } from '@shared/utils/project-validation'
import { useAppStore } from '../stores/app-store'
import { currentProjectFile } from '../stores/project-file'

interface ProjectFileActions {
  save: () => Promise<boolean>
  saveAs: () => Promise<boolean>
  openRecoveredProject: (project: ProjectFile, filePath: string | null) => Promise<void>
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
  const projectFilePath = useAppStore((state) => state.projectFilePath)
  const markSaved = useAppStore((state) => state.markProjectSaved)
  const markDirtyAfterRecovery = useAppStore((state) => state.markMeaningfulChange)
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
    async (loaded: { project: ProjectFile; filePath: string | null }): Promise<void> => {
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

  /**
   * Load recovered state into the editor without writing anything.
   *
   * The project is marked dirty on purpose: the recovered work is not on disk yet, and
   * the user must be the one who decides to save it over their known-good file.
   */
  const openRecoveredProject = useCallback(
    async (project: ProjectFile, filePath: string | null): Promise<void> => {
      // `null` must survive: an empty string is not an absolute path, and the save
      // channels would reject it instead of offering the user a destination.
      await openLoadedProject({ project, filePath })
      markDirtyAfterRecovery()
      setMessage(`Recovered ${project.settings.name}`)
    },
    [markDirtyAfterRecovery, openLoadedProject]
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
      const saved = await window.autoCut.saveProject(currentProjectFile(), projectFilePath)
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
  }, [clearFeedback, clips.length, markSaved, projectFilePath, refreshRecent, settings])

  const saveAs = useCallback(async (): Promise<boolean> => {
    clearFeedback()
    setBusy(true)
    try {
      // Save As mints a new project identity and clones the managed sidecar storage in
      // the main process, so the copy and the original never share transcripts,
      // previews, or caches.
      const saved = await window.autoCut.saveProjectAs(currentProjectFile())
      if (!saved) return false
      markSaved(saved)
      setMessage('Project saved as a new copy')
      await refreshRecent()
      return true
    } catch (operationError) {
      setError(errorMessage(operationError))
      return false
    } finally {
      setBusy(false)
    }
  }, [clearFeedback, markSaved, refreshRecent])

  const removeRecent = useCallback(
    async (path: string): Promise<void> => {
      setRecentProjects(await window.autoCut.removeRecentProject(path))
    },
    [setRecentProjects]
  )

  return {
    save,
    saveAs,
    openRecoveredProject,
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
