import { useEffect } from 'react'
import { EditorPage } from './pages/EditorPage'
import { FinalPreviewPage } from './pages/FinalPreviewPage'
import { HomePage } from './pages/HomePage'
import { useAppStore } from './stores/app-store'
import { usePersonAnalysisWorker } from './hooks/use-person-analysis-worker'

export function App(): React.JSX.Element {
  const screen = useAppStore((state) => state.screen)
  const setFfmpegStatus = useAppStore((state) => state.setFfmpegStatus)
  const setPersonDetectionStatus = useAppStore((state) => state.setPersonDetectionStatus)
  usePersonAnalysisWorker()

  useEffect(() => {
    let active = true
    window.autoCut
      .getFfmpegStatus()
      .then((status) => {
        if (active) setFfmpegStatus(status)
      })
      .catch(() => {
        if (active) setFfmpegStatus(null)
      })
    return () => {
      active = false
    }
  }, [setFfmpegStatus])

  useEffect(() => {
    let active = true
    window.autoCut.getPersonDetectionStatus().then((status) => {
      if (active) setPersonDetectionStatus(status)
    }).catch(() => {
      if (active) setPersonDetectionStatus(null)
    })
    return () => { active = false }
  }, [setPersonDetectionStatus])

  if (screen === 'home') return <HomePage />
  if (screen === 'review') return <FinalPreviewPage />
  return <EditorPage />
}
