import { useEffect, useState } from 'react'
import { Database, FolderOpen, Trash2 } from 'lucide-react'
import type { PreviewStorageStats } from '@shared/types'
import { useAppStore } from '../stores/app-store'
import { formatFileSize } from '../utils/format'

export function StoragePanel(): React.JSX.Element {
  const [stats, setStats] = useState<PreviewStorageStats | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const projectId = useAppStore((state) => state.projectId)
  const history = useAppStore((state) => state.previewHistory)
  const selectedId = useAppStore((state) => state.selectedPreviewId)
  const remove = useAppStore((state) => state.removePreviewVersion)

  const refresh = (): void => {
    void window.autoCut.getPreviewStorageStats().then(setStats)
  }
  useEffect(refresh, [history.length])

  const clean = async (): Promise<void> => {
    setCleaning(true)
    try {
      const protectedIds = history
        .filter((version) => version.pinned || version.approved || version.id === selectedId)
        .map((version) => version.id)
      const removed = await window.autoCut.cleanOldPreviews(projectId, history, protectedIds)
      removed.forEach(remove)
      refresh()
    } finally {
      setCleaning(false)
    }
  }

  return (
    <details className="settings-details">
      <summary><Database size={14} /> Preview Storage</summary>
      <div className="settings-details-body">
        <div className="codec-summary">
          <span>Storage used</span><strong>{stats ? formatFileSize(stats.bytes) : 'Checking'}</strong>
          <span>Stored previews</span><strong>{stats?.previewCount ?? 0}</strong>
          <span>Retention</span><strong>Latest {stats?.retentionLimit ?? 10}</strong>
        </div>
        <small className="storage-location" title={stats?.location}>{stats?.location ?? 'Application data'}</small>
        <div className="storage-actions">
          <button type="button" disabled={!stats} onClick={() => stats && window.autoCut.showItemInFolder(stats.location)} title="Show Preview Storage"><FolderOpen size={14} /></button>
          <button type="button" disabled={cleaning || history.length <= 10} onClick={() => void clean()}><Trash2 size={14} /> {cleaning ? 'Cleaning' : 'Clean Old Previews'}</button>
        </div>
      </div>
    </details>
  )
}
