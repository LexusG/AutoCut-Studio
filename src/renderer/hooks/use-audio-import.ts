import { useCallback, useState } from 'react'
import { useAppStore } from '../stores/app-store'

export function useAudioImport(): {
  browse: () => Promise<void>
  importPath: (path: string) => Promise<void>
  loading: boolean
  error: string | null
  clearError: () => void
} {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setBackgroundTrack = useAppStore((state) => state.setBackgroundTrack)

  const importPath = useCallback(
    async (path: string) => {
      if (!path) return
      setLoading(true)
      setError(null)
      try {
        const result = await window.autoCut.importAudioFile(path)
        if (!result.track) {
          setError(result.error ?? 'The audio file could not be imported.')
          return
        }
        setBackgroundTrack(result.track)
      } catch (operationError) {
        setError(operationError instanceof Error ? operationError.message : 'Audio import failed.')
      } finally {
        setLoading(false)
      }
    },
    [setBackgroundTrack]
  )

  const browse = useCallback(async () => {
    const path = await window.autoCut.chooseAudioFile()
    if (path) await importPath(path)
  }, [importPath])

  return { browse, importPath, loading, error, clearError: () => setError(null) }
}
