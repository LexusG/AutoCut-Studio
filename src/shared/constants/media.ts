export const APP_NAME = 'AutoCut Studio'

export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.avi',
  '.m4v'
] as const

export const VIDEO_FILE_FILTER = {
  name: 'Video files',
  extensions: SUPPORTED_VIDEO_EXTENSIONS.map((extension) => extension.slice(1))
}
