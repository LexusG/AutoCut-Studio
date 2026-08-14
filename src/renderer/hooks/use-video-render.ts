import { useCallback, useEffect } from 'react'
import { toRenderSettings } from '@shared/utils/project-settings'
import { validateProjectSettings } from '@shared/utils/project-validation'
import { useAppStore } from '../stores/app-store'

function renderErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'The video could not be generated.'
}

export function useVideoRender(): {
  generate: () => Promise<void>
  cancel: () => Promise<void>
} {
  const clips = useAppStore((state) => state.clips)
  const projectSettings = useAppStore((state) => state.projectSettings)
  const activeRenderId = useAppStore((state) => state.activeRenderId)
  const beginRender = useAppStore((state) => state.beginRender)
  const setRenderProgress = useAppStore((state) => state.setRenderProgress)
  const completeRender = useAppStore((state) => state.completeRender)
  const failRender = useAppStore((state) => state.failRender)
  const markRenderCancelled = useAppStore((state) => state.markRenderCancelled)

  useEffect(() => window.autoCut.onRenderProgress(setRenderProgress), [setRenderProgress])

  const generate = useCallback(async () => {
    if (clips.length === 0 || activeRenderId) return
    const blockingIssue = validateProjectSettings(projectSettings, clips.length, true).find(
      (issue) => issue.severity === 'error'
    )
    if (blockingIssue) {
      failRender(blockingIssue.message)
      return
    }
    const outputPath = await window.autoCut.chooseOutputPath(projectSettings.outputFilename)
    if (!outputPath) return

    const renderId = crypto.randomUUID()
    beginRender(renderId)
    try {
      const result = await window.autoCut.renderVideo({
        renderId,
        sourcePaths: clips.map((clip) => clip.path),
        outputPath,
        settings: toRenderSettings(projectSettings)
      })
      completeRender(result)
    } catch (error) {
      const message = renderErrorMessage(error)
      if (message.toLowerCase().includes('cancel')) markRenderCancelled()
      else failRender(message)
    }
  }, [activeRenderId, beginRender, clips, completeRender, failRender, markRenderCancelled, projectSettings])

  const cancel = useCallback(async () => {
    if (!activeRenderId) return
    await window.autoCut.cancelRender(activeRenderId)
  }, [activeRenderId])

  return { generate, cancel }
}
