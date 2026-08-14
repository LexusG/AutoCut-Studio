import type { ProjectSettings } from '../types'

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createRenderFingerprint(settings: ProjectSettings, sourcePaths: string[]): string {
  const renderState = {
    sourcePaths,
    output: settings.output,
    editing: settings.editing,
    audio: settings.audio.backgroundTrack
      ? {
          ...settings.audio,
          backgroundTrack: {
            path: settings.audio.backgroundTrack.path,
            duration: settings.audio.backgroundTrack.duration,
            missing: settings.audio.backgroundTrack.missing
          }
        }
      : settings.audio,
    personAnalysis: settings.personAnalysis
  }
  return `phase6-${fnv1a(JSON.stringify(renderState))}`
}
