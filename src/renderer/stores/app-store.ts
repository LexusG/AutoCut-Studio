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
  RenderPlan,
  RenderProgress,
  SavedProject,
  TargetDurationSettings,
  VideoOutputSettings,
  CaptionSettings,
  CaptionTrack,
  Transcript,
  TranscriptCorrection,
  TranscriptReference,
  TranscriptTextEdit,
  TranscriptionProgress,
  TranscriptionResult,
  TranscriptionStatus,
  TranscriptionSettings
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
export type RenderOperation = 'analysis' | 'preview' | 'export'

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
  editPlan: RenderPlan | null
  editPlanOutdated: boolean
  editPlanOpen: boolean
  previewGeneration: number
  durationIssue: DurationConstraintIssue | null
  renderError: string | null
  activeRenderId: string | null
  transcripts: Transcript[]
  transcriptReferences: TranscriptReference[]
  transcriptCorrections: TranscriptCorrection[]
  textEdits: TranscriptTextEdit[]
  transcriptEditRevision: number
  transcriptionStatus: TranscriptionStatus | null
  transcriptionProgress: TranscriptionProgress | null
  activeTranscriptionJobId: string | null
  transcriptionError: string | null
  setEditPlan: (plan: RenderPlan) => void
  updateEditPlan: (updater: (plan: RenderPlan) => RenderPlan) => void
  showEditPlan: () => void
  hideEditPlan: () => void
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
  setTranscriptionStatus: (status: TranscriptionStatus | null) => void
  beginTranscription: (jobId: string) => void
  setTranscriptionProgress: (progress: TranscriptionProgress) => void
  completeTranscription: (result: TranscriptionResult) => void
  failTranscription: (message: string) => void
  setTranscripts: (transcripts: Transcript[]) => void
  replaceTranscript: (transcript: Transcript) => void
  correctTranscriptWord: (transcriptId: string, wordId: string, text: string) => void
  updateCaptionSettings: (settings: CaptionSettings) => void
  updateTranscriptionSettings: (settings: TranscriptionSettings) => void
  setCaptionTrack: (track: CaptionTrack | null) => void
  addTextEdit: (edit: TranscriptTextEdit) => void
  restoreTextEdit: (id: string) => void
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
  editPlan: null,
  editPlanOutdated: false,
  editPlanOpen: false,
  previewGeneration: 0,
  durationIssue: null,
  renderError: null,
  activeRenderId: null,
  transcripts: [],
  transcriptReferences: [],
  transcriptCorrections: [],
  textEdits: [],
  transcriptEditRevision: 0,
  transcriptionStatus: null,
  transcriptionProgress: null,
  activeTranscriptionJobId: null,
  transcriptionError: null,
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
    editPlan: null,
    editPlanOutdated: false,
    editPlanOpen: false,
    previewGeneration: 0,
    durationIssue: null,
    renderError: null,
    activeRenderId: null,
    transcripts: [],
    transcriptReferences: [],
    transcriptCorrections: [],
    textEdits: [],
    transcriptEditRevision: 0,
    transcriptionProgress: null,
    activeTranscriptionJobId: null,
    transcriptionError: null
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
    editPlan: project.editPlan,
    editPlanOutdated: false,
    editPlanOpen: false,
    previewGeneration: Math.max(0, ...project.previewHistory.map((version) => version.versionNumber)),
    durationIssue: null,
    renderError: null,
    activeRenderId: null,
    transcripts: [],
    transcriptReferences: project.transcriptReferences,
    transcriptCorrections: project.transcriptCorrections,
    textEdits: project.textEdits,
    transcriptEditRevision: project.transcriptEditRevision,
    transcriptionProgress: null,
    activeTranscriptionJobId: null,
    transcriptionError: null
    })
  },
  setEditPlan: (editPlan) => set((state) => ({
    editPlan,
    editPlanOutdated: false,
    editPlanOpen: true,
    renderStatus: 'idle',
    renderOperation: null,
    activeRenderId: null,
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
    exportResult: null
  })),
  updateEditPlan: (updater) => set((state) => {
    if (!state.editPlan) return state
    return {
      editPlan: updater(state.editPlan),
      editPlanOutdated: false,
      projectDirty: true,
      previewOutdated: Boolean(state.previewResult),
      previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
      exportResult: null
    }
  }),
  showEditPlan: () => set((state) => state.editPlan ? { editPlanOpen: true } : state),
  hideEditPlan: () => set({ editPlanOpen: false }),
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
      exportResult: newClips.length > 0 ? null : state.exportResult,
      editPlanOutdated: newClips.length > 0 ? Boolean(state.editPlan) : state.editPlanOutdated
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
      exportResult: changed ? null : state.exportResult,
      editPlanOutdated: changed ? Boolean(state.editPlan) : state.editPlanOutdated
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
      exportResult: null,
      editPlanOutdated: Boolean(state.editPlan)
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
      exportResult: null,
      editPlanOutdated: Boolean(state.editPlan)
    }
  }),
  selectPreset: (presetId) => set((state) => ({
    projectSettings: applyPlatformPreset(state.projectSettings, presetId),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
  })),
  updateOutput: (patch) => set((state) => ({
    projectSettings: updateOutputSettings(state.projectSettings, patch),
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
  })),
  updateEditing: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
  })),
  updateTargetDuration: (targetDuration) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      editing: { ...state.projectSettings.editing, targetDuration }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
  })),
  updateAudio: (key, value) => set((state) => ({
    projectSettings: {
      ...state.projectSettings,
      audio: { ...state.projectSettings.audio, [key]: value }
    },
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: outdatedHistory(state.previewHistory),
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
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
    exportResult: null,
    editPlanOutdated: Boolean(state.editPlan)
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
    editPlan: saved.project.editPlan,
    transcriptReferences: saved.project.transcriptReferences,
    transcriptCorrections: saved.project.transcriptCorrections,
    textEdits: saved.project.textEdits,
    transcriptEditRevision: saved.project.transcriptEditRevision,
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
      editPlan: previewResult.plan,
      editPlanOutdated: false,
      editPlanOpen: false,
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
      editPlan: structuredClone(version.artifact.plan),
      editPlanOutdated: false,
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
      editPlanOutdated: Boolean(state.editPlan),
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
  })),
  setTranscriptionStatus: (transcriptionStatus) => set({ transcriptionStatus }),
  beginTranscription: (activeTranscriptionJobId) => set({
    activeTranscriptionJobId, transcriptionProgress: null, transcriptionError: null
  }),
  setTranscriptionProgress: (transcriptionProgress) => set((state) =>
    state.activeTranscriptionJobId === transcriptionProgress.jobId ? { transcriptionProgress } : state
  ),
  completeTranscription: (result) => set((state) => {
    const sourceIds = new Set(result.transcripts.map((transcript) => transcript.sourceClipId))
    return {
      transcripts: [...state.transcripts.filter((transcript) => !sourceIds.has(transcript.sourceClipId)), ...result.transcripts],
      transcriptReferences: [
        ...state.transcriptReferences.filter((reference) => !sourceIds.has(reference.sourceClipId)),
        ...result.references
      ],
      activeTranscriptionJobId: null,
      transcriptionProgress: null,
      transcriptionError: null,
      projectDirty: true
    }
  }),
  failTranscription: (transcriptionError) => set({
    transcriptionError, activeTranscriptionJobId: null, transcriptionProgress: null
  }),
  setTranscripts: (transcripts) => set({ transcripts }),
  replaceTranscript: (transcript) => set((state) => ({
    transcripts: state.transcripts.map((item) => item.id === transcript.id ? transcript : item),
    transcriptReferences: state.transcriptReferences.map((reference) =>
      reference.transcriptId === transcript.id ? { ...reference, revision: transcript.revision } : reference
    ),
    transcriptEditRevision: state.transcriptEditRevision + 1,
    projectDirty: true,
    previewOutdated: Boolean(state.previewResult),
    previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
    editPlan: state.editPlan ? { ...state.editPlan, captionTrack: null, transcriptEditRevision: state.transcriptEditRevision + 1 } : null
  })),
  correctTranscriptWord: (transcriptId, wordId, text) => set((state) => {
    const corrected = text.trim()
    const transcript = state.transcripts.find((item) => item.id === transcriptId)
    const original = transcript?.words.find((word) => word.id === wordId)
    if (!transcript || !original || !corrected || corrected === original.text) return state
    const mapWord = (word: Transcript['words'][number]): Transcript['words'][number] =>
      word.id === wordId ? { ...word, text: corrected } : word
    const words = transcript.words.map(mapWord)
    const segments = transcript.segments.map((segment) => {
      const segmentWords = segment.words.map(mapWord)
      return { ...segment, words: segmentWords, text: segmentWords.map((word) => word.text).join(' ').replace(/\s+([,.!?;:])/g, '$1') }
    })
    const updated: Transcript = {
      ...transcript, words, segments,
      fullText: segments.map((segment) => segment.text).join(' '),
      revision: transcript.revision + 1, updatedAt: new Date().toISOString()
    }
    const correction: TranscriptCorrection = {
      transcriptId, wordId, originalText: original.originalText, correctedText: corrected
    }
    return {
      transcripts: state.transcripts.map((item) => item.id === transcriptId ? updated : item),
      transcriptReferences: state.transcriptReferences.map((reference) =>
        reference.transcriptId === transcriptId ? { ...reference, revision: updated.revision } : reference
      ),
      transcriptCorrections: [...state.transcriptCorrections.filter((item) => !(item.transcriptId === transcriptId && item.wordId === wordId)), correction],
      transcriptEditRevision: state.transcriptEditRevision + 1,
      projectDirty: true, previewOutdated: Boolean(state.previewResult),
      previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
      editPlan: state.editPlan ? { ...state.editPlan, captionTrack: null, transcriptEditRevision: state.transcriptEditRevision + 1 } : null
    }
  }),
  updateCaptionSettings: (captions) => set((state) => ({
    projectSettings: { ...state.projectSettings, captions },
    editPlan: state.editPlan ? {
      ...state.editPlan, captionMode: captions.mode, subtitleOutput: captions.subtitleOutput,
      captionStyle: structuredClone(captions.style), captionSafeArea: captions.safeAreaPreset,
      captionHighlightSpokenWord: captions.highlightSpokenWord, captionHighlightBehavior: captions.highlightBehavior,
      captionAnimation: captions.animation,
      captionTrack: null, revision: state.editPlan.revision + 1
    } : null,
    projectDirty: true, previewOutdated: Boolean(state.previewResult),
    previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
    exportResult: null
  })),
  updateTranscriptionSettings: (transcription) => set((state) => ({
    projectSettings: { ...state.projectSettings, transcription },
    projectDirty: true
  })),
  setCaptionTrack: (captionTrack) => set((state) => ({
    editPlan: state.editPlan ? {
      ...state.editPlan, captionTrack, captionMode: state.projectSettings.captions.mode,
      subtitleOutput: state.projectSettings.captions.subtitleOutput,
      captionStyle: structuredClone(state.projectSettings.captions.style),
      captionSafeArea: state.projectSettings.captions.safeAreaPreset,
      captionHighlightSpokenWord: state.projectSettings.captions.highlightSpokenWord,
      captionHighlightBehavior: state.projectSettings.captions.highlightBehavior,
      captionAnimation: state.projectSettings.captions.animation,
      transcriptVersion: Math.max(0, ...state.transcripts.map((transcript) => transcript.revision)),
      transcriptEditRevision: state.transcriptEditRevision,
      revision: state.editPlan.revision + 1
    } : null,
    projectDirty: true, previewOutdated: Boolean(state.previewResult),
    previewHistory: state.previewResult ? outdatedHistory(state.previewHistory) : state.previewHistory,
    exportResult: null
  })),
  addTextEdit: (edit) => set((state) => ({
    textEdits: [...state.textEdits, edit], transcriptEditRevision: state.transcriptEditRevision + 1,
    projectDirty: true
  })),
  restoreTextEdit: (id) => set((state) => ({
    textEdits: state.textEdits.map((edit) => edit.id === id ? { ...edit, restored: true } : edit),
    transcriptEditRevision: state.transcriptEditRevision + 1, projectDirty: true
  }))
}))
