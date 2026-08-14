import { useState } from 'react'
import { FileVideo2, LoaderCircle, Plus, Upload } from 'lucide-react'
import { useVideoImport } from '../hooks/use-video-import'
import { useAppStore } from '../stores/app-store'
import { ClipCard } from './ClipCard'
import { ImportFailures } from './ImportFailures'

export function MediaPanel(): React.JSX.Element {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null)
  const clips = useAppStore((state) => state.clips)
  const isImporting = useAppStore((state) => state.isImporting)
  const ffmpegReady = useAppStore((state) => state.ffmpegStatus?.ready ?? false)
  const moveClip = useAppStore((state) => state.moveClip)
  const { browse, importPaths } = useVideoImport()

  const handleDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    setIsDraggingFiles(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.autoCut.getPathForFile(file))
      .filter(Boolean)
    void importPaths(paths)
  }

  return (
    <aside className="media-panel" aria-label="Media library">
      <div className="panel-heading">
        <div>
          <h2>Media</h2>
          <span>{clips.length} {clips.length === 1 ? 'clip' : 'clips'}</span>
        </div>
        <button
          className="icon-button icon-button-accent"
          type="button"
          onClick={() => void browse()}
          disabled={!ffmpegReady || isImporting}
          title="Import videos"
          aria-label="Import videos"
        >
          <Plus size={18} />
        </button>
      </div>

      <div
        className={`drop-zone ${isDraggingFiles ? 'drop-zone-active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDraggingFiles(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDraggingFiles(false)
        }}
        onDrop={handleDrop}
      >
        {isImporting ? (
          <>
            <LoaderCircle className="spin" size={23} />
            <strong>Analyzing clips</strong>
            <span>Reading metadata and creating thumbnails</span>
          </>
        ) : (
          <>
            <Upload size={22} />
            <strong>Drop video clips here</strong>
            <span>MP4, MOV, MKV, WebM, AVI, M4V</span>
            <button type="button" onClick={() => void browse()} disabled={!ffmpegReady}>Browse files</button>
          </>
        )}
      </div>

      <ImportFailures />

      <div className="clip-list" aria-live="polite">
        {clips.length === 0 && !isImporting ? (
          <div className="clip-list-empty">
            <FileVideo2 size={27} />
            <p>Your imported clips will appear here.</p>
          </div>
        ) : (
          clips.map((clip, index) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={index}
              onDragStart={() => setDraggedClipId(clip.id)}
              onDragEnd={() => setDraggedClipId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedClipId) moveClip(draggedClipId, clip.id)
              }}
            />
          ))
        )}
      </div>
    </aside>
  )
}
