import { useEffect } from 'react'
import { EditorPage } from './pages/EditorPage'
import { FinalPreviewPage } from './pages/FinalPreviewPage'
import { HomePage } from './pages/HomePage'
import { useAppStore } from './stores/app-store'

export function App(): React.JSX.Element {
  const screen = useAppStore((state) => state.screen)
  const setFfmpegStatus = useAppStore((state) => state.setFfmpegStatus)

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

  if (screen === 'home') return <HomePage />
  if (screen === 'review') return <FinalPreviewPage />
  return <EditorPage />
}
