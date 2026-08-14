import { AudioLines, GripVertical, Trash2, VolumeX } from 'lucide-react'
import type { MediaClip } from '@shared/types'
import { useAppStore } from '../stores/app-store'
import { formatDuration, formatFileSize, formatFrameRate } from '../utils/format'

interface ClipCardProps {
  clip: MediaClip
  index: number
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: () => void
}

export function ClipCard({
  clip,
  index,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: ClipCardProps): React.JSX.Element {
  const selectedClipId = useAppStore((state) => state.selectedClipId)
  const selectClip = useAppStore((state) => state.selectClip)
  const removeClip = useAppStore((state) => state.removeClip)
  const selected = selectedClipId === clip.id

  return (
    <article
      className={`clip-card ${selected ? 'clip-card-selected' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => selectClip(clip.id)}
    >
      <button className="drag-handle" type="button" title="Drag to reorder" aria-label={`Reorder ${clip.filename}`}>
        <GripVertical size={16} />
      </button>
      <div className="clip-thumbnail">
        <img src={clip.thumbnailUrl} alt="" />
        <span>{formatDuration(clip.duration)}</span>
      </div>
      <div className="clip-copy">
        <div className="clip-title-row">
          <span className="clip-index">{index + 1}</span>
          <h3 title={clip.filename}>{clip.filename}</h3>
        </div>
        <div className="clip-metadata">
          <span>{clip.video.width}x{clip.video.height}</span>
          <span>{formatFrameRate(clip.video.frameRate)}</span>
          <span>{formatFileSize(clip.size)}</span>
          <span title={clip.hasAudio ? 'Audio available' : 'No audio'}>
            {clip.hasAudio ? <AudioLines size={13} /> : <VolumeX size={13} />}
            {clip.hasAudio ? 'Audio' : 'Silent'}
          </span>
        </div>
      </div>
      <button
        className="remove-button"
        type="button"
        title="Remove clip"
        aria-label={`Remove ${clip.filename}`}
        onClick={(event) => {
          event.stopPropagation()
          removeClip(clip.id)
        }}
      >
        <Trash2 size={15} />
      </button>
    </article>
  )
}
