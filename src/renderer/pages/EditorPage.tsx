import { ArrowLeft, ChevronDown, Play } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { MediaPanel } from '../components/MediaPanel'
import { PreviewPanel } from '../components/PreviewPanel'
import { RenderDialog } from '../components/RenderDialog'
import { SettingsPanel } from '../components/SettingsPanel'
import { useVideoRender } from '../hooks/use-video-render'
import { useAppStore } from '../stores/app-store'

export function EditorPage(): React.JSX.Element {
  const returnHome = useAppStore((state) => state.returnHome)
  const projectName = useAppStore((state) => state.projectName)
  const clipCount = useAppStore((state) => state.clips.length)
  const ffmpegStatus = useAppStore((state) => state.ffmpegStatus)
  const isRendering = useAppStore((state) => state.renderStatus === 'rendering')
  const { generate, cancel } = useVideoRender()

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
          <button
            className="button button-primary"
            type="button"
            disabled={clipCount === 0 || isRendering || !ffmpegStatus?.ready}
            onClick={() => void generate()}
          >
            <Play size={16} fill="currentColor" /> Generate Video
          </button>
        </div>
      </header>

      <div className="editor-workspace">
        <MediaPanel />
        <PreviewPanel />
        <SettingsPanel />
      </div>
      <RenderDialog onCancel={cancel} />
    </main>
  )
}
