export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:5'
export type OutputResolution = '720p' | '1080p'
export type OutputFrameRate = 'auto' | 24 | 30 | 60
export type EditingMode = 'original-order' | 'automatic' | 'random'
export type EditingPace = 'slow' | 'normal' | 'fast'
export type FitMode = 'crop' | 'fit'
export type RenderQuality = 'draft' | 'balanced' | 'high'

export interface RenderSettings {
  aspectRatio: AspectRatio
  resolution: OutputResolution
  frameRate: OutputFrameRate
  editingMode: EditingMode
  pace: EditingPace
  fitMode: FitMode
  quality: RenderQuality
  useEveryClip: boolean
}

export interface RenderRequest {
  renderId: string
  sourcePaths: string[]
  outputPath: string
  settings: RenderSettings
}

export type RenderStage =
  | 'Analyzing clips'
  | 'Preparing clips'
  | 'Combining video'
  | 'Finalizing'
  | 'Complete'

export interface RenderProgress {
  renderId: string
  stage: RenderStage
  currentClip: string | null
  currentClipIndex: number | null
  totalClips: number
  percent: number
  elapsedSeconds: number
}

export interface RenderResult {
  outputPath: string
  outputUrl: string
  duration: number
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  aspectRatio: 'original',
  resolution: '1080p',
  frameRate: 30,
  editingMode: 'original-order',
  pace: 'normal',
  fitMode: 'crop',
  quality: 'balanced',
  useEveryClip: true
}
