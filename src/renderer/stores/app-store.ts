import { create } from 'zustand'
import {
  DEFAULT_RENDER_SETTINGS,
  type FfmpegStatus,
  type ImportFailure,
  type MediaClip,
  type RenderProgress,
  type RenderResult,
  type RenderSettings
} from '@shared/types'

type Screen = 'home' | 'editor'
export type RenderStatus = 'idle' | 'rendering' | 'complete' | 'error' | 'cancelled'
export type PreviewMode = 'source' | 'output'

interface AppState {
  screen: Screen
  projectName: string
  clips: MediaClip[]
  selectedClipId: string | null
  ffmpegStatus: FfmpegStatus | null
  isImporting: boolean
  importFailures: ImportFailure[]
  renderSettings: RenderSettings
  renderStatus: RenderStatus
  renderProgress: RenderProgress | null
  renderResult: RenderResult | null
  renderError: string | null
  activeRenderId: string | null
  previewMode: PreviewMode
  startProject: () => void
  returnHome: () => void
  setFfmpegStatus: (status: FfmpegStatus | null) => void
  setImporting: (isImporting: boolean) => void
  addClips: (clips: MediaClip[]) => void
  removeClip: (id: string) => void
  selectClip: (id: string) => void
  moveClip: (sourceId: string, targetId: string) => void
  setImportFailures: (failures: ImportFailure[]) => void
  clearImportFailures: () => void
  updateRenderSetting: <Key extends keyof RenderSettings>(
    key: Key,
    value: RenderSettings[Key]
  ) => void
  beginRender: (renderId: string) => void
  setRenderProgress: (progress: RenderProgress) => void
  completeRender: (result: RenderResult) => void
  failRender: (message: string) => void
  markRenderCancelled: () => void
  dismissRenderDialog: () => void
  setPreviewMode: (mode: PreviewMode) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  projectName: 'Untitled project',
  clips: [],
  selectedClipId: null,
  ffmpegStatus: null,
  isImporting: false,
  importFailures: [],
  renderSettings: DEFAULT_RENDER_SETTINGS,
  renderStatus: 'idle',
  renderProgress: null,
  renderResult: null,
  renderError: null,
  activeRenderId: null,
  previewMode: 'source',
  startProject: () =>
    set({
      screen: 'editor',
      projectName: 'Untitled project',
      clips: [],
      selectedClipId: null,
      importFailures: [],
      renderSettings: DEFAULT_RENDER_SETTINGS,
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
        selectedClipId: state.selectedClipId ?? newClips[0]?.id ?? null
      }
    }),
  removeClip: (id) =>
    set((state) => {
      const clips = state.clips.filter((clip) => clip.id !== id)
      return {
        clips,
        selectedClipId:
          state.selectedClipId === id ? (clips[0]?.id ?? null) : state.selectedClipId
      }
    }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
  moveClip: (sourceId, targetId) =>
    set((state) => {
      const sourceIndex = state.clips.findIndex((clip) => clip.id === sourceId)
      const targetIndex = state.clips.findIndex((clip) => clip.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state
      const clips = [...state.clips]
      const [movedClip] = clips.splice(sourceIndex, 1)
      clips.splice(targetIndex, 0, movedClip)
      return { clips }
    }),
  setImportFailures: (importFailures) => set({ importFailures }),
  clearImportFailures: () => set({ importFailures: [] }),
  updateRenderSetting: (key, value) =>
    set((state) => ({ renderSettings: { ...state.renderSettings, [key]: value } })),
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
