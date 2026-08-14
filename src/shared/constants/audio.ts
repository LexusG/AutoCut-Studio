export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'] as const

export const AUDIO_FILE_FILTER = {
  name: 'Audio files',
  extensions: SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.slice(1))
}
