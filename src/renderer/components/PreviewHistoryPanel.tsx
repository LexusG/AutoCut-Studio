import { History, RotateCcw, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize } from '../utils/format'

function versionStatus(approved: boolean, outdated: boolean): string {
  if (approved) return 'Approved Export'
  if (outdated) return 'Settings Changed'
  return 'Current Preview'
}

export function PreviewHistoryPanel(): React.JSX.Element | null {
  const history = useAppStore((state) => state.previewHistory)
  const selectedId = useAppStore((state) => state.selectedPreviewId)
  const select = useAppStore((state) => state.selectPreviewVersion)
  const remove = useAppStore((state) => state.removePreviewVersion)
  const restore = useAppStore((state) => state.restorePreviewSettings)
  if (history.length === 0) return null

  const deleteVersion = async (id: string): Promise<void> => {
    const version = history.find((item) => item.id === id)
    if (!version || version.approved || id === selectedId) return
    await window.autoCut.deletePreviewFiles(version.artifact.outputPath, version.thumbnailPath)
    remove(id)
  }

  return (
    <section className="preview-history" aria-label="Preview History">
      <div className="preview-history-heading"><History size={16} /><h2>Preview History</h2><span>{history.length} version{history.length === 1 ? '' : 's'}</span></div>
      <div className="preview-history-list">
        {history.map((version) => {
          const selected = version.id === selectedId
          return (
            <article className={`preview-version ${selected ? 'preview-version-selected' : ''}`} key={version.id}>
              <button className="preview-version-open" type="button" onClick={() => select(version.id)}>
                <span className="preview-version-thumb">
                  {version.thumbnailUrl
                    ? <img src={version.thumbnailUrl} alt="" />
                    : <History size={20} />}
                </span>
                <span className="preview-version-copy">
                  <strong>V{version.versionNumber} · {versionStatus(version.approved, version.outdated)}</strong>
                  <small>{version.selectionMode === 'smart' ? 'Smart' : 'Classic'} · {version.pace} · {version.presetName}</small>
                  <small>{formatDuration(version.artifact.duration)} · {formatFileSize(version.artifact.fileSize)}</small>
                </span>
              </button>
              <div className="preview-version-actions">
                <button type="button" onClick={() => restore(version.id)} title="Restore Settings" aria-label={`Restore settings from V${version.versionNumber}`}>
                  <RotateCcw size={13} />
                </button>
                <button
                  type="button"
                  disabled={selected || version.approved}
                  onClick={() => void deleteVersion(version.id)}
                  title="Delete Preview"
                  aria-label={`Delete V${version.versionNumber}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
