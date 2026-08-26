import { ArrowLeft, ClipboardList, FileText, Play, Save, SaveAll, Settings, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AutosaveStatus } from '../components/AutosaveStatus'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { AssistantPanel } from '../components/AssistantPanel'
import { MediaPanel } from '../components/MediaPanel'
import { PreviewPanel } from '../components/PreviewPanel'
import { RenderDialog } from '../components/RenderDialog'
import { SettingsPanel } from '../components/SettingsPanel'
import { EditPlanPanel } from '../components/EditPlanPanel'
import { TranscriptPanel, type WorkspaceTab } from '../components/TranscriptPanel'
import { SystemPanel } from '../components/SystemPanel'
import { useAssistant } from '../hooks/use-assistant'
import { useVideoRender } from '../hooks/use-video-render'
import { useProjectFiles } from '../hooks/use-project-files'
import { flushAutosave } from '../hooks/use-autosave'
import { useAppStore } from '../stores/app-store'

export function EditorPage(): React.JSX.Element {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [transcriptTab, setTranscriptTab] = useState<WorkspaceTab>('transcript')
  const [systemOpen, setSystemOpen] = useState(false)
  // Null means "follow the project": setup controls lead while the assistant has
  // nothing to report, and the assistant takes over once analysis finds something.
  // An explicit click pins the choice.
  const [railChoice, setRailChoice] = useState<'assistant' | 'inspector' | null>(null)

  /** Opens the detailed workspace on the tab a suggestion points at. */
  const openWorkspace = (tab: WorkspaceTab): void => {
    setTranscriptTab(tab)
    setTranscriptOpen(true)
  }
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
  const { suggestions } = useAssistant()
  const rail = railChoice ?? (suggestions.length > 0 ? 'assistant' : 'inspector')
  const readOnly = useAppStore((state) => state.projectReadOnly)
  const { save, saveAs, busy: projectBusy, message: projectMessage, error: projectError } = useProjectFiles()

  /**
   * Leaving the editor must not strand a pending autosave. The flush is awaited, and
   * work that still has nowhere to be written is confirmed with the user rather than
   * quietly left behind.
   */
  const leaveEditor = async (): Promise<void> => {
    await flushAutosave()
    const { projectDirty, projectFilePath } = useAppStore.getState()
    if (projectDirty && !projectFilePath) {
      const proceed = window.confirm(
        'This project has never been saved to a file. Your changes are kept for recovery, but leaving now will not write them anywhere. Leave anyway?'
      )
      if (!proceed) return
    }
    returnHome()
  }

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="icon-button" type="button" onClick={() => void leaveEditor()} title="Back to Home" aria-label="Back to Home">
            <ArrowLeft size={19} />
          </button>
          <BrandMark compact />
          <span className="header-divider" />
          <span className="workflow-step">2 Configure</span>
          <label className="project-name-field">
            <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            {projectDirty && <span title="Unsaved changes" />}
          </label>
          <AutosaveStatus />
        </div>
        <div className="editor-header-right">
          {(projectMessage || projectError) && (
            <span className={projectError ? 'project-feedback project-feedback-error' : 'project-feedback'}>
              {projectError ?? projectMessage}
            </span>
          )}
          <FfmpegNotice status={ffmpegStatus} />
          {/*
            * Project chores are icon-only so the two decisions that move the project
            * forward - build an edit, then see it - keep the visual weight.
            */}
          <div className="header-group">
            <button className="icon-button" type="button" title="Save Project" aria-label="Save Project" onClick={() => void save()} disabled={projectBusy || isRendering || readOnly}>
              <Save size={18} />
            </button>
            <button className="icon-button" type="button" title="Save Project As" aria-label="Save Project As" onClick={() => void saveAs()} disabled={projectBusy || isRendering}>
              <SaveAll size={18} />
            </button>
            <button className="icon-button" type="button" title="Local AI and Processing" aria-label="Local AI and Processing" onClick={() => setSystemOpen(true)}><Settings size={18} /></button>
          </div>
          <span className="header-divider" />
          <button className="button button-secondary" type="button" aria-label="Transcript" onClick={() => openWorkspace('transcript')}><FileText size={16} /> Content</button>
          {editPlan && <button className="icon-button" type="button" title="Review Plan" aria-label="Review Plan" onClick={showEditPlan}><ClipboardList size={18} /></button>}
          <button
            className="button button-secondary"
            type="button"
            disabled={clipCount === 0 || isRendering || !ffmpegStatus?.ready}
            onClick={() => void analyzeEditPlan(Boolean(editPlan))}
          >
            <Sparkles size={16} /> {editPlan ? 'Update Edit Plan' : 'Create Edit Plan'}
          </button>
          <button className="button button-primary" type="button" disabled={!editPlan || editPlanOutdated || isRendering} onClick={() => void generatePreview()}><Play size={16} fill="currentColor" /> Generate Preview</button>
        </div>
      </header>

      <div className="editor-workspace">
        <MediaPanel />
        <PreviewPanel />
        <div className="editor-rail">
          <div className="rail-tabs" role="tablist" aria-label="Right panel">
            <button role="tab" type="button" aria-selected={rail === 'assistant'} className={rail === 'assistant' ? 'rail-tab rail-tab-active' : 'rail-tab'} onClick={() => setRailChoice('assistant')}>
              <Sparkles size={14} /> Assistant{suggestions.length > 0 && <span className="rail-tab-count">{suggestions.length}</span>}
            </button>
            <button role="tab" type="button" aria-selected={rail === 'inspector'} className={rail === 'inspector' ? 'rail-tab rail-tab-active' : 'rail-tab'} onClick={() => setRailChoice('inspector')}>
              <SlidersHorizontal size={14} /> Inspector
            </button>
          </div>
          <div className="rail-body">
            {rail === 'assistant' ? <AssistantPanel openWorkspace={openWorkspace} /> : <SettingsPanel />}
          </div>
        </div>
      </div>
      <EditPlanPanel />
      <TranscriptPanel open={transcriptOpen} close={() => setTranscriptOpen(false)} initialTab={transcriptTab} />
      <RenderDialog onCancel={cancel} />
      <SystemPanel open={systemOpen} close={() => setSystemOpen(false)} />
    </main>
  )
}
