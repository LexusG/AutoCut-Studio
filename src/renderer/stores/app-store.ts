import { create } from 'zustand'
import { getPresetsForPlatform } from '@shared/constants/presets'
import type {
  AudioTrack,
  EditingSettings,
  FfmpegStatus,
  ImportFailure,
  MediaClip,
  PlatformId,
  ProjectAudioSettings,
  ProjectFile,
  ProjectSettings,
  RecentProject,
  RenderProgress,
  RenderResult,
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

type Screen = 'home' | 'editor'
export type RenderStatus = 'idle' | 'rendering' | 'complete' | 'error' | 'cancelled'
export type PreviewMode = 'source' | 'output'

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
  renderProgress: RenderProgress | null
  renderResult: RenderResult | null
  renderError: string | null
  activeRenderId: string | null
  previewMode: PreviewMode
  startProject: () => void
  loadProject: (project: ProjectFile, filePath: string, clips: MediaClip[], failures: ImportFailure[]) => void
  returnHome: () => void
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
  updateAudio: <Key extends keyof ProjectAudioSettings>(
    key: Key,
    value: ProjectAudioSettings[Key]
  ) => void
  setBackgroundTrack: (track: AudioTrack | null) => void
  setOutputFilename: (filename: string) => void
  markProjectSaved: (saved: SavedProject) => void
  setRecentProjects: (projects: RecentProject[]) => void
  beginRender: (renderId: string) => void
  setRenderProgress: (progress: RenderProgress) => void
  completeRender: (result: RenderResult) => void
  failRender: (message: string) => void
  markRenderCancelled: () => void
  dismissRenderDialog: () => void
  setPreviewMode: (mode: PreviewMode) => void
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
  renderProgress: null,
  renderResult: null,
  renderError: null,
  activeRenderId: null,
  previewMode: 'source',
  startProject: () =>
    set({
      screen: 'editor',
      projectSettings: createDefaultProjectSettings(),
      ...freshProjectIdentity(),
      projectFilePath: null,
      projectDirty: false,
      clips: [],
      selectedClipId: null,
      importFailures: [],
      renderStatus: 'idle',
      renderProgress: null,
      renderResult: null,
      renderError: null,
      activeRenderId: null,
      previewMode: 'source'
    }),
  loadProject: (project, projectFilePath, clips, importFailures) =>
    set({
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
      renderProgress: null,
      renderResult: null,
      renderError: null,
      activeRenderId: null,
      previewMode: 'source'
    }),
  returnHome: () => set({ screen: 'home' }),
  setFfmpegStatus: (ffmpegStatus) => set({ ffmpegStatus }),
  setImporting: (isImporting) => set({ isImporting }),
  addClips: (incomingClips) =>
    set((state) => {
      const existingPaths = new Set(state.clips.map((clip) => clip.path))
      const newClips = incomingClips.filter((clip) => !existingPaths.has(clip.path))
      const clips = [...state.clips, ...newClips]
      return {
        clips,
        projectDirty: newClips.length > 0 || state.projectDirty,
        selectedClipId: state.selectedClipId ?? newClips[0]?.id ?? null
      }
    }),
  removeClip: (id) =>
    set((state) => {
      const clips = state.clips.filter((clip) => clip.id !== id)
      return {
        clips,
        projectDirty: clips.length !== state.clips.length || state.projectDirty,
        selectedClipId:
          state.selectedClipId === id ? (clips[0]?.id ?? null) : state.selectedClipId
      }
    }),
  selectClip: (selectedClipId) => set({ selectedClipId, previewMode: 'source' }),
  moveClip: (sourceId, targetId) =>
    set((state) => {
      const sourceIndex = state.clips.findIndex((clip) => clip.id === sourceId)
      const targetIndex = state.clips.findIndex((clip) => clip.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state
      const clips = [...state.clips]
      const [movedClip] = clips.splice(sourceIndex, 1)
      clips.splice(targetIndex, 0, movedClip)
      return { clips, projectDirty: true }
    }),
  setImportFailures: (importFailures) => set({ importFailures }),
  clearImportFailures: () => set({ importFailures: [] }),
  setProjectName: (name) =>
    set((state) => ({
      projectSettings: updateProjectName(state.projectSettings, name),
      projectDirty: true
    })),
  selectPlatform: (platform) =>
    set((state) => {
      const presetId = platform === 'custom' ? 'custom' : getPresetsForPlatform(platform)[0]?.id
      if (!presetId) return state
      return { projectSettings: applyPlatformPreset(state.projectSettings, presetId), projectDirty: true }
    }),
  selectPreset: (presetId) =>
    set((state) => ({
      projectSettings: applyPlatformPreset(state.projectSettings, presetId),
      projectDirty: true
    })),
  updateOutput: (patch) =>
    set((state) => ({
      projectSettings: updateOutputSettings(state.projectSettings, patch),
      projectDirty: true
    })),
  updateEditing: (key, value) =>
    set((state) => ({
      projectSettings: {
        ...state.projectSettings,
        editing: { ...state.projectSettings.editing, [key]: value }
      },
      projectDirty: true
    })),
  updateTargetDuration: (targetDuration) =>
    set((state) => ({
      projectSettings: {
        ...state.projectSettings,
        editing: { ...state.projectSettings.editing, targetDuration }
      },
      projectDirty: true
    })),
  updateAudio: (key, value) =>
    set((state) => ({
      projectSettings: {
        ...state.projectSettings,
        audio: { ...state.projectSettings.audio, [key]: value }
      },
      projectDirty: true
    })),
  setBackgroundTrack: (backgroundTrack) =>
    set((state) => ({
      projectSettings: {
        ...state.projectSettings,
        audio: { ...state.projectSettings.audio, backgroundTrack }
      },
      projectDirty: true
    })),
  setOutputFilename: (filename) =>
    set((state) => ({
      projectSettings: updateOutputFilename(state.projectSettings, filename),
      projectDirty: true
    })),
  markProjectSaved: (saved) =>
    set({
      projectFilePath: saved.filePath,
      projectId: saved.project.id,
      projectCreatedAt: saved.project.createdAt,
      projectSettings: saved.project.settings,
      projectDirty: false
    }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),
  beginRender: (activeRenderId) =>
    set({
      activeRenderId,
      renderStatus: 'rendering',
      renderProgress: null,
      renderResult: null,
      renderError: null
    }),
  setRenderProgress: (renderProgress) =>
    set((state) =>
      state.activeRenderId === renderProgress.renderId ? { renderProgress } : state
    ),
  completeRender: (renderResult) =>
    set({
      renderResult,
      renderStatus: 'complete',
      activeRenderId: null,
      renderError: null,
      previewMode: 'output'
    }),
  failRender: (renderError) =>
    set({ renderError, renderStatus: 'error', activeRenderId: null }),
  markRenderCancelled: () =>
    set({ renderStatus: 'cancelled', activeRenderId: null, renderError: null }),
  dismissRenderDialog: () =>
    set((state) => ({ renderStatus: state.renderStatus === 'rendering' ? 'rendering' : 'idle' })),
  setPreviewMode: (previewMode) => set({ previewMode })
}))
