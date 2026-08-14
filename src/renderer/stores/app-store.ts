import { create } from 'zustand'
import { getPresetsForPlatform } from '@shared/constants/presets'
import type {
  AudioTrack,
  DurationConstraintIssue,
  EditingSettings,
  FfmpegStatus,
  ImportFailure,
  MediaClip,
  PlatformId,
  PreviewQuality,
  ProjectAudioSettings,
  ProjectFile,
  ProjectSettings,
  RecentProject,
  RenderArtifact,
  RenderProgress,
  SavedProject,
  TargetDurationSettings,
  VideoOutputSettings
} from '@shared/types'
import {
  applyPlatformPreset,
  createDefaultProjectSettings,
  updateOutputFilename,
  updateOutputSettings,
  updateProjectName
} from '@shared/utils/project-settings'

type Screen = 'home' | 'editor' | 'review'
export type RenderStatus = 'idle' | 'rendering' | 'complete' | 'error' | 'cancelled' | 'constraint'
export type RenderOperation = 'preview' | 'export'

interface AppState {
  screen: Screen
  projectSettings: ProjectSettings
  projectId: string
  projectCreatedAt: string
  projectFilePath: string | null
  projectDirty: boolean
  clips: MediaClip[]
  selectedClipId: string | null
  ffmpegStatus: FfmpegStatus | null
  isImporting: boolean
  importFailures: ImportFailure[]
  recentProjects: RecentProject[]
  renderStatus: RenderStatus
  renderOperation: RenderOperation | null
  renderProgress: RenderProgress | null
  previewResult: RenderArtifact | null
  exportResult: RenderArtifact | null
  previewOutdated: boolean
  previewGeneration: number
  durationIssue: DurationConstraintIssue | null
  renderError: string | null
  activeRenderId: string | null
  startProject: () => void
  loadProject: (project: ProjectFile, filePath: string, clips: MediaClip[], failures: ImportFailure[]) => void
  returnHome: () => void
  backToEdit: () => void
  showReview: () => void
  setFfmpegStatus: (status: FfmpegStatus | null) => void
  setImporting: (isImporting: boolean) => void
  addClips: (clips: MediaClip[]) => void
  removeClip: (id: string) => void
  selectClip: (id: string) => void
  moveClip: (sourceId: string, targetId: string) => void
  setImportFailures: (failures: ImportFailure[]) => void
  clearImportFailures: () => void
  setProjectName: (name: string) => void
  selectPlatform: (platform: PlatformId) => void
  selectPreset: (presetId: string) => void
  updateOutput: (patch: Partial<VideoOutputSettings>) => void
  updateEditing: <Key extends keyof EditingSettings>(key: Key, value: EditingSettings[Key]) => void
  updateTargetDuration: (target: TargetDurationSettings) => void
  updateAudio: <Key extends keyof ProjectAudioSettings>(key: Key, value: ProjectAudioSettings[Key]) => void
  setBackgroundTrack: (track: AudioTrack | null) => void
  setOutputFilename: (filename: string) => void
  setPreviewQuality: (quality: PreviewQuality) => void
  markProjectSaved: (saved: SavedProject) => void
  setRecentProjects: (projects: RecentProject[]) => void
  beginRender: (renderId: string, operation: RenderOperation, generation?: number) => void
  setRenderProgress: (progress: RenderProgress) => void
  completePreview: (result: RenderArtifact) => void
  completeExport: (result: RenderArtifact) => void
  showDurationIssue: (issue: DurationConstraintIssue) => void
  useMinimumDuration: () => void
  failRender: (message: string) => void
  markRenderCancelled: () => void
  dismissRenderDialog: () => void
}

function freshProjectIdentity(): { projectId: string; projectCreatedAt: string } {
  return { projectId: crypto.randomUUID(), projectCreatedAt: new Date().toISOString() }
}

const initialIdentity = freshProjectIdentity()

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  projectSettings: createDefaultProjectSettings(),
  ...initialIdentity,
  projectFilePath: null,
  projectDirty: false,
  clips: [],
  selectedClipId: null,
  ffmpegStatus: null,
  isImporting: false,
  importFailures: [],
  recentProjects: [],
  renderStatus: 'idle',
  renderOperation: null,
  renderProgress: null,
  previewResult: null,
  exportResult: null,
  previewOutdated: false,
  previewGeneration: 0,
  durationIssue: null,
  renderError: null,
  activeRenderId: null,
  startProject: () => set({
    screen: 'editor',
    projectSettings: createDefaultProjectSettings(),
    ...freshProjectIdentity(),
    projectFilePath: null,
    projectDirty: false,
    clips: [],
    selectedClipId: null,
    importFailures: [],
    renderStatus: 'idle',
    renderOperation: null,
    renderProgress: null,
    previewResult: null,
    exportResult: null,
    previewOutdated: false,
    previewGeneration: 0,
    durationIssue: null,
    renderError: null,
    activeRenderId: null
  }),
  loadProject: (project, projectFilePath, clips, importFailures) => set({
    screen: 'editor',
    projectSettings: project.settings,
    projectId: project.id,
    projectCreatedAt: project.createdAt,
    projectFilePath,
    projectDirty: false,
    clips,
    selectedClipId: clips[0]?.id ?? null,
    importFailures,
    renderStatus: 'idle',
    renderOperation: null,
    renderProgress: null,
    previewResult: null,
    exportResult: null,
    previewOutdated: false,
    previewGeneration: 0,
    durationIssue: null,
    renderError: null,
    activeRenderId: null
  }),
  returnHome: () => set({ screen: 'home' }),
  backToEdit: () => set({ screen: 'editor' }),
  showReview: () => set((state) => state.previewResult ? { screen: 'review' } : state),
  setFfmpegStatus: (ffmpegStatus) => set({ ffmpegStatus }),
  setImporting: (isImporting) => set({ isImporting }),
  addClips: (incomingClips) => set((state) => {
    const existingPaths = new Set(state.clips.map((clip) => clip.path))
    const newClips = incomingClips.filter((clip) => !existingPaths.has(clip.path))
    const clips = [...state.clips, ...newClips]
    return {
      clips,
      projectDirty: newClips.length > 0 || state.projectDirty,
      selectedClipId: state.selectedClipId ?? newClips[0]?.id ?? null,
      previewOutdated: state.previewResult ? newClips.length > 0 || state.previewOutdated : false,
      exportResult: newClips.length > 0 ? null : state.exportResult
    }
  }),
  removeClip: (id) => set((state) => {
    const clips = state.clips.filter((clip) => clip.id !== id)
    const changed = clips.length !== state.clips.length
    return {
      clips,
      projectDirty: changed || state.projectDirty,
      selectedClipId: state.selectedClipId === id ? (clips[0]?.id ?? null) : state.selectedClipId,
      previewOutdated: state.previewResult ? changed || state.previewOutdated : false,
      exportResult: changed ? null : state.exportResult
    }
  }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
  moveClip: (sourceId, targetId) => set((state) => {
    const sourceIndex = state.clips.findIndex((clip) => clip.id === sourceId)
    const targetIndex = state.clips.findIndex((clip) => clip.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state
    const clips = [...state.clips]
    const [movedClip] = clips.splice(sourceIndex, 1)
    clips.splice(targetIndex, 0, movedClip)
    return {
      clips,
      projectDirty: true,
      previewOutdated: Boolean(state.previewResult),
      exportResult: null
    }
  }),
  setImportFailures: (importFailures) => set({ importFailures }),
  clearImportFailures: () => set({ importFailures: [] }),
  setProjectName: (name) => set((state) => ({
    projectSettings: updateProjectName(state.projectSettings, name),
    projectDirty: true
  })),
  selectPlatform: (platform) => set((state) => {
    const presetId = platform === 'custom' ? 'custom' : getPresetsForPlatform(platform)[0]?.id
    if (!presetId) return state
    return {
      projectSettings: applyPlatformPreset(state.projectSettings, presetId),
      projectDirty: true,
      previewOutdated: Boolean(state.previewResult),
      exportResult: null
    }
  }),
  selectPreset: (presetId) => set((state) => ({
    projectSettings: applyPlatformPreset(state.projectSettings, presetId),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  updateOutput: (patch) => set((state) => ({
    projectSettings: updateOutputSettings(state.projectSettings, patch),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  updateEditing: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  updateTargetDuration: (targetDuration) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, targetDuration }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  updateAudio: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      audio: { ...state.projectSettings.audio, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  setBackgroundTrack: (backgroundTrack) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      audio: { ...state.projectSettings.audio, backgroundTrack }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  setOutputFilename: (filename) => set((state) => ({
    projectSettings: updateOutputFilename(state.projectSettings, filename),
    projectDirty: true
  })),
  setPreviewQuality: (previewQuality) => set((state) => ({
    projectSettings: { ...state.projectSettings, previewQuality },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    exportResult: null
  })),
  markProjectSaved: (saved) => set({
    projectFilePath: saved.filePath,
    projectId: saved.project.id,
    projectCreatedAt: saved.project.createdAt,
    projectSettings: saved.project.settings,
    projectDirty: false
  }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),
  beginRender: (activeRenderId, renderOperation, generation) => set({
    activeRenderId,
    renderOperation,
    renderStatus: 'rendering',
    renderProgress: null,
    renderError: null,
    durationIssue: null,
    ...(generation == null ? {} : { previewGeneration: generation })
  }),
  setRenderProgress: (renderProgress) => set((state) =>
    state.activeRenderId === renderProgress.renderId ? { renderProgress } : state
  ),
  completePreview: (previewResult) => set({
    screen: 'review',
    previewResult,
    exportResult: null,
    previewOutdated: false,
    renderStatus: 'complete',
    renderOperation: null,
    activeRenderId: null,
    renderError: null
  }),
  completeExport: (exportResult) => set({
    exportResult,
    renderStatus: 'complete',
    renderOperation: null,
    activeRenderId: null,
    renderError: null
  }),
  showDurationIssue: (durationIssue) => set({
    durationIssue,
    renderStatus: 'constraint',
    renderOperation: null,
    activeRenderId: null
  }),
  useMinimumDuration: () => set((state) => {
    if (!state.durationIssue) return state
    return {
      projectSettings: {
        ...state.projectSettings,
        editing: {
          ...state.projectSettings.editing,
          targetDuration: { mode: 'custom', seconds: state.durationIssue.minimumDuration }
        }
      },
      projectDirty: true,
      durationIssue: null,
      renderStatus: 'idle',
      previewOutdated: Boolean(state.previewResult),
      exportResult: null
    }
  }),
  failRender: (renderError) => set({
    renderError,
    renderStatus: 'error',
    activeRenderId: null
  }),
  markRenderCancelled: () => set({
    renderStatus: 'cancelled',
    activeRenderId: null,
    renderError: null
  }),
  dismissRenderDialog: () => set((state) => ({
    renderStatus: state.renderStatus === 'rendering' ? 'rendering' : 'idle',
    renderOperation: state.renderStatus === 'rendering' ? state.renderOperation : null,
    durationIssue: state.renderStatus === 'constraint' ? null : state.durationIssue
  }))
}))
