export interface ToolStatus {
  available: boolean
  path: string | null
  version: string | null
}

export interface FfmpegStatus {
  ffmpeg: ToolStatus
  ffprobe: ToolStatus
  ready: boolean
}

export interface VideoStreamMetadata {
  codec: string
  width: number
  height: number
  frameRate: number
  rotation: number
  bitrate: number | null
}

export interface MediaClip {
  id: string
  path: string
  mediaUrl: string
  thumbnailPath: string
  thumbnailUrl: string
  filename: string
  duration: number
  size: number
  video: VideoStreamMetadata
  hasAudio: boolean
}

export interface ImportFailure {
  path: string
  filename: string
  message: string
  details?: string
}

export interface ImportResult {
  clips: MediaClip[]
  failures: ImportFailure[]
}
