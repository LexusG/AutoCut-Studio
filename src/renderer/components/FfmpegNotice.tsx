import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { FfmpegStatus } from '@shared/types'

export function FfmpegNotice({ status }: { status: FfmpegStatus | null }): React.JSX.Element {
  if (!status) {
    return (
      <div className="tool-status tool-status-loading" role="status">
        <span className="status-dot" /> Checking FFmpeg
      </div>
    )
  }

  if (status.ready) {
    return (
      <div className="tool-status tool-status-ready" title={status.ffmpeg.version ?? undefined}>
        <CheckCircle2 size={15} /> FFmpeg ready
      </div>
    )
  }

  return (
    <div className="ffmpeg-warning" role="alert">
      <AlertTriangle size={19} />
      <div>
        <strong>FFmpeg is missing</strong>
        <p>Install it on Ubuntu with <code>sudo apt install ffmpeg</code>, then restart AutoCut Studio.</p>
      </div>
    </div>
  )
}
