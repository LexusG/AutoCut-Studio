import { getPreset } from '../constants/presets'
import type { ProjectSettings, ProjectValidationIssue } from '../types'
import { targetDurationInSeconds } from './project-settings'

const minimumSecondsPerClip = { slow: 5, normal: 3, fast: 1.5 } as const

export function validateProjectSettings(
  settings: ProjectSettings,
  clipCount: number,
  requireMedia = false
): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = []
  const add = (code: string, severity: ProjectValidationIssue['severity'], message: string): void => {
    issues.push({ code, severity, message })
  }

  if (!settings.name.trim()) add('project-name', 'error', 'Enter a project name.')
  if (!Number.isInteger(settings.output.width) || settings.output.width <= 0 || settings.output.width > 7680) {
    add('output-width', 'error', 'Output width must be between 1 and 7680 pixels.')
  }
  if (!Number.isInteger(settings.output.height) || settings.output.height <= 0 || settings.output.height > 7680) {
    add('output-height', 'error', 'Output height must be between 1 and 7680 pixels.')
  }
  if (!['auto', 24, 30, 60].includes(settings.output.frameRate)) {
    add('frame-rate', 'error', 'Choose Auto, 24, 30, or 60 FPS.')
  }
  if (settings.presetId !== 'custom' && !getPreset(settings.presetId)) {
    add('preset', 'error', 'The selected platform preset is unavailable.')
  }
  if (requireMedia && clipCount === 0) add('source-videos', 'error', 'Import at least one video clip.')

  const targetSeconds = targetDurationInSeconds(settings)
  if (settings.editing.targetDuration.mode === 'custom' && (!targetSeconds || targetSeconds <= 0)) {
    add('target-duration', 'error', 'Custom target duration must be greater than zero seconds.')
  }
  if (settings.editing.useEveryClip && targetSeconds && clipCount > 0) {
    const approximateMinimum = clipCount * minimumSecondsPerClip[settings.editing.pace]
    if (targetSeconds < approximateMinimum) {
      add(
        'target-every-clip',
        'warning',
        'Your target duration may be too short to include every imported clip.'
      )
    }
  }

  const audio = settings.audio
  if (audio.backgroundTrack?.missing) add('audio-missing', 'warning', 'Audio file missing.')
  if (audio.musicVolume < 0 || audio.musicVolume > 100) {
    add('music-volume', 'error', 'Background music volume must be between 0% and 100%.')
  }
  if (audio.originalAudioVolume < 0 || audio.originalAudioVolume > 100) {
    add('clip-volume', 'error', 'Original clip audio volume must be between 0% and 100%.')
  }
  if (audio.musicStartPosition < 0) {
    add('music-start', 'error', 'Music start position cannot be negative.')
  }
  if (audio.fadeIn.duration < 0 || audio.fadeOut.duration < 0) {
    add('music-fade', 'error', 'Music fade durations cannot be negative.')
  }
  if (!settings.outputFilename.trim() || !settings.outputFilename.toLowerCase().endsWith('.mp4')) {
    add('output-filename', 'error', 'Output filename must end with .mp4.')
  }
  return issues
}
