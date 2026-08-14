import { useCallback } from 'react'
import { useAppStore } from '../stores/app-store'

export function useVideoImport(): {
  browse: () => Promise<void>
  importPaths: (paths: string[]) => Promise<void>
} {
  const setImporting = useAppStore((state) => state.setImporting)
  const addClips = useAppStore((state) => state.addClips)
  const setImportFailures = useAppStore((state) => state.setImportFailures)
  const clips = useAppStore((state) => state.clips)

  const importPaths = useCallback(
    async (paths: string[]) => {
      const existingPaths = new Set(clips.map((clip) => clip.path))
      const uniquePaths = [...new Set(paths)].filter((path) => path && !existingPaths.has(path))
      if (uniquePaths.length === 0) return

      setImporting(true)
      setImportFailures([])
      try {
        const result = await window.autoCut.importVideoFiles(uniquePaths)
        addClips(result.clips)
        setImportFailures(result.failures)
      } catch (error) {
        setImportFailures([
          {
            path: '',
            filename: 'Import failed',
            message: error instanceof Error ? error.message : 'The files could not be imported.'
          }
        ])
      } finally {
        setImporting(false)
      }
    },
    [addClips, clips, setImportFailures, setImporting]
  )

  const browse = useCallback(async () => {
    const paths = await window.autoCut.chooseVideoFiles()
    await importPaths(paths)
  }, [importPaths])

  return { browse, importPaths }
}
