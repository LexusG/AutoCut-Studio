import type { FfmpegStatus, ImportResult } from './media'
import type { RenderProgress, RenderRequest, RenderResult } from './render'

export interface AutoCutApi {
  getFfmpegStatus: () => Promise<FfmpegStatus>
  chooseVideoFiles: () => Promise<string[]>
  importVideoFiles: (paths: string[]) => Promise<ImportResult>
  chooseOutputPath: (suggestedName: string) => Promise<string | null>
  renderVideo: (request: RenderRequest) => Promise<RenderResult>
  cancelRender: (renderId: string) => Promise<boolean>
  onRenderProgress: (callback: (progress: RenderProgress) => void) => () => void
  getPathForFile: (file: File) => string
}

export const IPC_CHANNELS = {
  ffmpegStatus: 'system:ffmpeg-status',
  chooseVideos: 'files:choose-videos',
  importVideos: 'media:import-videos',
  chooseOutput: 'files:choose-output',
  renderVideo: 'video:render',
  cancelRender: 'video:cancel-render',
  renderProgress: 'video:render-progress'
} as const
