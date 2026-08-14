import { create } from 'zustand'
import { getPresetsForPlatform } from '@shared/constants/presets'
import type {
  AudioTrack,
  DurationConstraintIssue,
  EditingSettings,
  FfmpegStatus,
  ImportFailure,
  MediaClip,
  PersonDetectionStatus,
  PlatformId,
  PreviewQuality,
  PreviewVersion,
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
  getPresetDisplayName,
  targetDurationInSeconds,
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
  personDetectionStatus: PersonDetectionStatus | null
  isImporting: boolean
  importFailures: ImportFailure[]
  recentProjects: RecentProject[]
  renderStatus: RenderStatus
  renderOperation: RenderOperation | null
  renderProgress: RenderProgress | null
  previewResult: RenderArtifact | null
  previewHistory: PreviewVersion[]
  selectedPreviewId: string | null
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
  setPersonDetectionStatus: (status: PersonDetectionStatus | null) => void
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
  selectPreviewVersion: (id: string) => void
  removePreviewVersion: (id: string) => void
  togglePreviewPinned: (id: string) => void
  restorePreviewSettings: (id: string) => void
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
const outdatedHistory = (history: PreviewVersion[]): PreviewVersion[] =>
  history.map((version) => ({ ...version, outdated: true }))

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  projectSettings: createDefaultProjectSettings(),
  ...initialIdentity,
  projectFilePath: null,
  projectDirty: false,
  clips: [],
  selectedClipId: null,
  ffmpegStatus: null,
  personDetectionStatus: null,
  isImporting: false,
  importFailures: [],
  recentProjects: [],
  renderStatus: 'idle',
  renderOperation: null,
  renderProgress: null,
  previewResult: null,
  previewHistory: [],
  selectedPreviewId: null,
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
    previewHistory: [],
    selectedPreviewId: null,
    exportResult: null,
    previewOutdated: false,
    previewGeneration: 0,
    durationIssue: null,
    renderError: null,
    activeRenderId: null
  }),
  loadProject: (project, projectFilePath, clips, importFailures) => {
    const latest = [...project.previewHistory]
      .filter((version) => Boolean(version.artifact.outputUrl))
      .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
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
    renderOperation: null,
    renderProgress: null,
    previewResult: latest?.artifact ?? null,
    previewHistory: project.previewHistory,
    selectedPreviewId: latest?.id ?? null,
    exportResult: null,
    previewOutdated: latest ? latest.outdated : false,
    previewGeneration: Math.max(0, ...project.previewHistory.map((version) => version.versionNumber)),
    durationIssue: null,
    renderError: null,
    activeRenderId: null
    })
  },
  returnHome: () => set({ screen: 'home' }),
  backToEdit: () => set({ screen: 'editor' }),
  showReview: () => set((state) => state.previewResult ? { screen: 'review' } : state),
  setFfmpegStatus: (ffmpegStatus) => set({ ffmpegStatus }),
  setPersonDetectionStatus: (personDetectionStatus) => set({ personDetectionStatus }),
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
      previewHistory: newClips.length > 0 ? outdatedHistory(state.previewHistory) : state.previewHistory,
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
      previewHistory: changed ? outdatedHistory(state.previewHistory) : state.previewHistory,
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
      previewHistory: outdatedHistory(state.previewHistory),
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
      previewHistory: outdatedHistory(state.previewHistory),
      exportResult: null
    }
  }),
  selectPreset: (presetId) => set((state) => ({
    projectSettings: applyPlatformPreset(state.projectSettings, presetId),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  updateOutput: (patch) => set((state) => ({
    projectSettings: updateOutputSettings(state.projectSettings, patch),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  updateEditing: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  updateTargetDuration: (targetDuration) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, targetDuration }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  updateAudio: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      audio: { ...state.projectSettings.audio, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  setBackgroundTrack: (backgroundTrack) => set((state) => ({
    projectSettings: backgroundTrack
      ? {
          ...state.projectSettings,
          audio: {
            ...state.projectSettings.audio,
            backgroundTrack: state.projectSettings.audio.backgroundTrack ?? backgroundTrack,
            soundtrack: {
              ...state.projectSettings.audio.soundtrack,
              tracks: state.projectSettings.audio.soundtrack.tracks.some((track) => track.path === backgroundTrack.path)
                ? state.projectSettings.audio.soundtrack.tracks
                : [...state.projectSettings.audio.soundtrack.tracks, {
                    ...backgroundTrack,
                    enabled: true,
                    volume: 100,
                    startPosition: 0,
                    fadeIn: { enabled: false, duration: 1 },
                    fadeOut: { enabled: false, duration: 1 }
                  }]
            }
          }
        }
      : {
          ...state.projectSettings,
          audio: {
            ...state.projectSettings.audio,
            backgroundTrack: null,
            soundtrack: { ...state.projectSettings.audio.soundtrack, tracks: [] }
          }
        },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
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
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null
  })),
  markProjectSaved: (saved) => set({
    projectFilePath: saved.filePath,
    projectId: saved.project.id,
    projectCreatedAt: saved.project.createdAt,
    projectSettings: saved.project.settings,
    previewHistory: saved.project.previewHistory,
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
  completePreview: (incoming) => set((state) => {
    const versionNumber = Math.max(0, ...state.previewHistory.map((version) => version.versionNumber)) + 1
    const previewResult = {
      ...incoming,
      plan: { ...incoming.plan, previewVersion: versionNumber }
    }
    const record: PreviewVersion = {
      id: previewResult.plan.id,
      versionNumber,
      createdAt: new Date().toISOString(),
      artifact: previewResult,
      thumbnailPath: previewResult.thumbnailPath,
      thumbnailUrl: previewResult.thumbnailUrl,
      approved: false,
      outdated: false,
      pinned: false,
      storage: {
        key: previewResult.plan.id,
        relativePath: `projects/${state.projectId}/previews/${previewResult.plan.id}`,
        state: 'available'
      },
      presetName: getPresetDisplayName(state.projectSettings),
      pace: state.projectSettings.editing.pace,
      selectionMode: state.projectSettings.editing.selectionMode,
      targetDuration: targetDurationInSeconds(state.projectSettings),
      settingsSnapshot: structuredClone(state.projectSettings)
    }
    return {
      screen: 'review',
      previewResult,
      previewHistory: [record, ...outdatedHistory(state.previewHistory)],
      selectedPreviewId: record.id,
      exportResult: null,
      previewOutdated: false,
      renderStatus: 'complete',
      renderOperation: null,
      activeRenderId: null,
      renderError: null,
      projectDirty: true
    }
  }),
  completeExport: (exportResult) => set((state) => ({
    exportResult,
    previewHistory: state.previewHistory.map((version) =>
      version.id === state.selectedPreviewId ? { ...version, approved: true } : version
    ),
    renderStatus: 'complete',
    renderOperation: null,
    activeRenderId: null,
    renderError: null,
    projectDirty: true
  })),
  selectPreviewVersion: (id) => set((state) => {
    const version = state.previewHistory.find((item) => item.id === id)
    if (!version || !version.artifact.outputUrl) return state
    return {
      selectedPreviewId: id,
      previewResult: version.artifact,
      previewOutdated: version.outdated,
      exportResult: null
    }
  }),
  removePreviewVersion: (id) => set((state) => {
    const previewHistory = state.previewHistory.filter((version) => version.id !== id)
    const next = previewHistory[0] ?? null
    return {
      previewHistory,
      selectedPreviewId: state.selectedPreviewId === id ? next?.id ?? null : state.selectedPreviewId,
      previewResult: state.selectedPreviewId === id ? next?.artifact ?? null : state.previewResult,
      previewOutdated: state.selectedPreviewId === id ? next?.outdated ?? false : state.previewOutdated,
      projectDirty: true
    }
  }),
  togglePreviewPinned: (id) => set((state) => ({
    previewHistory: state.previewHistory.map((version) =>
      version.id === id ? { ...version, pinned: !version.pinned } : version
    ),
    projectDirty: true
  })),
  restorePreviewSettings: (id) => set((state) => {
    const version = state.previewHistory.find((item) => item.id === id)
    if (!version) return state
    return {
      projectSettings: structuredClone(version.settingsSnapshot),
      projectDirty: true,
      previewOutdated: false,
      previewResult: version.artifact,
      selectedPreviewId: id,
      previewHistory: state.previewHistory.map((item) => ({ ...item, outdated: item.id !== id })),
      exportResult: null
    }
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
