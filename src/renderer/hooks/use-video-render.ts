import { useCallback, useEffect } from 'react'
import { createRenderFingerprint } from '@shared/utils/render-fingerprint'
import { toRenderSettings } from '@shared/utils/project-settings'
import { validateProjectSettings } from '@shared/utils/project-validation'
import { useAppStore } from '../stores/app-store'

function renderErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'The video could not be generated.'
}

export function useVideoRender(): {
  generatePreview: (regenerate?: boolean) => Promise<void>
  approveAndExport: () => Promise<void>
  cancel: () => Promise<void>
} {
  const clips = useAppStore((state) => state.clips)
  const projectId = useAppStore((state) => state.projectId)
  const projectSettings = useAppStore((state) => state.projectSettings)
  const activeRenderId = useAppStore((state) => state.activeRenderId)
  const previewResult = useAppStore((state) => state.previewResult)
  const previewOutdated = useAppStore((state) => state.previewOutdated)
  const previewGeneration = useAppStore((state) => state.previewGeneration)
  const beginRender = useAppStore((state) => state.beginRender)
  const setRenderProgress = useAppStore((state) => state.setRenderProgress)
  const completePreview = useAppStore((state) => state.completePreview)
  const completeExport = useAppStore((state) => state.completeExport)
  const showDurationIssue = useAppStore((state) => state.showDurationIssue)
  const failRender = useAppStore((state) => state.failRender)
  const markRenderCancelled = useAppStore((state) => state.markRenderCancelled)

  useEffect(() => window.autoCut.onRenderProgress(setRenderProgress), [setRenderProgress])

  const generatePreview = useCallback(async (regenerate = false) => {
    if (clips.length === 0 || activeRenderId) return
    const blockingIssue = validateProjectSettings(projectSettings, clips.length, true).find(
      (issue) => issue.severity === 'error'
    )
    if (blockingIssue) {
      failRender(blockingIssue.message)
      return
    }
    const generation = regenerate ? previewGeneration + 1 : previewGeneration
    const renderId = crypto.randomUUID()
    beginRender(renderId, 'preview', generation)
    try {
      const sourcePaths = clips.map((clip) => clip.path)
      const outcome = await window.autoCut.generatePreview({
        renderId,
        projectId,
        generation,
        sourcePaths,
        settingsFingerprint: createRenderFingerprint(projectSettings, sourcePaths),
        settings: toRenderSettings(projectSettings)
      })
      if (outcome.success) {
        completePreview(outcome.result)
        const current = useAppStore.getState()
        const removable = [...current.previewHistory]
          .reverse()
          .filter((version) => !version.approved && version.id !== current.selectedPreviewId)
        while (useAppStore.getState().previewHistory.length > 10 && removable.length > 0) {
          const version = removable.shift()!
          try {
            await window.autoCut.deletePreviewFiles(version.artifact.outputPath, version.thumbnailPath)
            useAppStore.getState().removePreviewVersion(version.id)
          } catch {
            break
          }
        }
      } else showDurationIssue(outcome.issue)
    } catch (error) {
      const message = renderErrorMessage(error)
      if (message.toLowerCase().includes('cancel')) markRenderCancelled()
      else failRender(message)
    }
  }, [
    activeRenderId,
    beginRender,
    clips,
    completePreview,
    failRender,
    markRenderCancelled,
    previewGeneration,
    projectId,
    projectSettings,
    showDurationIssue
  ])

  const approveAndExport = useCallback(async () => {
    if (!previewResult || previewOutdated || activeRenderId) return
    const outputPath = await window.autoCut.chooseOutputPath(projectSettings.outputFilename)
    if (!outputPath) return
    const renderId = crypto.randomUUID()
    beginRender(renderId, 'export')
    try {
      const result = await window.autoCut.exportApprovedPreview({
        renderId,
        outputPath,
        plan: previewResult.plan,
        previewPath: previewResult.outputPath,
        previewQuality: previewResult.previewQuality
      })
      completeExport(result)
    } catch (error) {
      const message = renderErrorMessage(error)
      if (message.toLowerCase().includes('cancel')) markRenderCancelled()
      else failRender(message)
    }
  }, [
    activeRenderId,
    beginRender,
    completeExport,
    failRender,
    markRenderCancelled,
    previewOutdated,
    previewResult,
    projectSettings.outputFilename
  ])

  const cancel = useCallback(async () => {
    if (!activeRenderId) return
    await window.autoCut.cancelRender(activeRenderId)
  }, [activeRenderId])

  return { generatePreview, approveAndExport, cancel }
}
