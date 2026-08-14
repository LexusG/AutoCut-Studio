import type { FfmpegStatus, ImportResult } from './media'

export interface AutoCutApi {
  getFfmpegStatus: () => Promise<FfmpegStatus>
  chooseVideoFiles: () => Promise<string[]>
  importVideoFiles: (paths: string[]) => Promise<ImportResult>
  getPathForFile: (file: File) => string
}

export const IPC_CHANNELS = {
  ffmpegStatus: 'system:ffmpeg-status',
  chooseVideos: 'files:choose-videos',
  importVideos: 'media:import-videos'
} as const
