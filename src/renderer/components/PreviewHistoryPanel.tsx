import { History, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize } from '../utils/format'

function versionStatus(version: { approved: boolean; outdated: boolean; pinned: boolean; storage: { state: string } }): string {
  if (version.storage.state === 'missing') return 'Preview Media Missing'
  if (version.approved) return 'Approved Export'
  if (version.outdated) return 'Settings Changed'
  return version.pinned ? 'Current Preview - Pinned' : 'Current Preview'
}

export function PreviewHistoryPanel(): React.JSX.Element | null {
  const history = useAppStore((state) => state.previewHistory)
  const selectedId = useAppStore((state) => state.selectedPreviewId)
  const select = useAppStore((state) => state.selectPreviewVersion)
  const remove = useAppStore((state) => state.removePreviewVersion)
  const restore = useAppStore((state) => state.restorePreviewSettings)
  const projectId = useAppStore((state) => state.projectId)
  const togglePinned = useAppStore((state) => state.togglePreviewPinned)
  if (history.length === 0) return null

  const deleteVersion = async (id: string): Promise<void> => {
    const version = history.find((item) => item.id === id)
    if (!version || version.approved || id === selectedId) return
    await window.autoCut.deletePreview(projectId, version.id)
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
                  <strong>V{version.versionNumber} · {versionStatus(version)}</strong>
                  <small>{version.selectionMode === 'smart' ? 'Smart' : 'Classic'} · {version.pace} · {version.presetName}</small>
                  <small>{formatDuration(version.artifact.duration)} · {formatFileSize(version.artifact.fileSize)}</small>
                </span>
              </button>
              <div className="preview-version-actions">
                <button type="button" onClick={() => togglePinned(version.id)} title={version.pinned ? 'Unpin Preview' : 'Pin Preview'} aria-label={`${version.pinned ? 'Unpin' : 'Pin'} V${version.versionNumber}`}>
                  {version.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
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
