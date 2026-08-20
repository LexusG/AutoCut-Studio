import { ArrowLeft, ClipboardList, FileText, Play, Save, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { MediaPanel } from '../components/MediaPanel'
import { PreviewPanel } from '../components/PreviewPanel'
import { RenderDialog } from '../components/RenderDialog'
import { SettingsPanel } from '../components/SettingsPanel'
import { EditPlanPanel } from '../components/EditPlanPanel'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { useVideoRender } from '../hooks/use-video-render'
import { useProjectFiles } from '../hooks/use-project-files'
import { useAppStore } from '../stores/app-store'

export function EditorPage(): React.JSX.Element {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const returnHome = useAppStore((state) => state.returnHome)
  const projectName = useAppStore((state) => state.projectSettings.name)
  const setProjectName = useAppStore((state) => state.setProjectName)
  const projectDirty = useAppStore((state) => state.projectDirty)
  const clipCount = useAppStore((state) => state.clips.length)
  const ffmpegStatus = useAppStore((state) => state.ffmpegStatus)
  const isRendering = useAppStore((state) => state.renderStatus === 'rendering')
  const editPlan = useAppStore((state) => state.editPlan)
  const editPlanOutdated = useAppStore((state) => state.editPlanOutdated)
  const showEditPlan = useAppStore((state) => state.showEditPlan)
  const { analyzeEditPlan, generatePreview, cancel } = useVideoRender()
  const { save, busy: projectBusy, message: projectMessage, error: projectError } = useProjectFiles()

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="icon-button" type="button" onClick={returnHome} title="Back to Home" aria-label="Back to Home">
            <ArrowLeft size={19} />
          </button>
          <BrandMark compact />
          <span className="header-divider" />
          <span className="workflow-step">2 Configure</span>
          <label className="project-name-field">
            <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            {projectDirty && <span title="Unsaved changes" />}
          </label>
        </div>
        <div className="editor-header-right">
          {(projectMessage || projectError) && (
            <span className={projectError ? 'project-feedback project-feedback-error' : 'project-feedback'}>
              {projectError ?? projectMessage}
            </span>
          )}
          <FfmpegNotice status={ffmpegStatus} />
          <button className="button button-secondary" type="button" onClick={() => void save()} disabled={projectBusy || isRendering}>
            <Save size={16} /> Save Project
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={clipCount === 0 || isRendering || !ffmpegStatus?.ready}
            onClick={() => void analyzeEditPlan(Boolean(editPlan))}
          >
            <Sparkles size={16} /> {editPlan ? 'Update Edit Plan' : 'Create Edit Plan'}
          </button>
          {editPlan && <button className="button button-secondary" type="button" onClick={showEditPlan}><ClipboardList size={16} /> Review Plan</button>}
          <button className="button button-secondary" type="button" onClick={() => setTranscriptOpen(true)}><FileText size={16} /> Transcript</button>
          <button className="button button-primary" type="button" disabled={!editPlan || editPlanOutdated || isRendering} onClick={() => void generatePreview()}><Play size={16} fill="currentColor" /> Generate Preview</button>
        </div>
      </header>

      <div className="editor-workspace">
        <MediaPanel />
        <PreviewPanel />
        <SettingsPanel />
      </div>
      <EditPlanPanel />
      <TranscriptPanel open={transcriptOpen} close={() => setTranscriptOpen(false)} />
      <RenderDialog onCancel={cancel} />
    </main>
  )
}
