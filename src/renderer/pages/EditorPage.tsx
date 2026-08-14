import { ArrowLeft, ChevronDown, Play } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { MediaPanel } from '../components/MediaPanel'
import { PreviewPanel } from '../components/PreviewPanel'
import { useAppStore } from '../stores/app-store'

export function EditorPage(): React.JSX.Element {
  const returnHome = useAppStore((state) => state.returnHome)
  const projectName = useAppStore((state) => state.projectName)
  const clipCount = useAppStore((state) => state.clips.length)
  const ffmpegStatus = useAppStore((state) => state.ffmpegStatus)

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="icon-button" type="button" onClick={returnHome} title="Back to Home" aria-label="Back to Home">
            <ArrowLeft size={19} />
          </button>
          <BrandMark compact />
          <span className="header-divider" />
          <button className="project-menu" type="button">
            <span>{projectName}</span>
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="editor-header-right">
          <FfmpegNotice status={ffmpegStatus} />
          <button className="button button-primary" type="button" disabled={clipCount === 0} title="Available after Phase 3">
            <Play size={16} fill="currentColor" /> Generate Video
          </button>
        </div>
      </header>

      <div className="editor-workspace">
        <MediaPanel />
        <PreviewPanel />
      </div>
    </main>
  )
}
