import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { app } from 'electron'
import type { RuntimeComponentId, RuntimeComponentSource, RuntimeEnvironment } from '@shared/types'

export interface RuntimeCandidate {
  path: string
  source: RuntimeComponentSource
}
function executableFromPath(name: string): RuntimeCandidate[] {
  return (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    .map((directory) => ({ path: join(directory, name), source: 'system' as const }))
}

export function runtimeEnvironment(): RuntimeEnvironment {
  return {
    platform: process.platform,
    architecture: process.arch,
    packaged: app.isPackaged,
    runtimeKey: `${process.platform}-${process.arch}`,
    applicationVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown'
  }
}

export function applicationResourcesRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
}

export function architectureRuntimeRoot(): string {
  return join(applicationResourcesRoot(), 'runtime', `${process.platform}-${process.arch}`)
}

export function runtimeCandidates(id: RuntimeComponentId): RuntimeCandidate[] {
  const root = architectureRuntimeRoot()
  const appPath = app.getAppPath()
  if (id === 'ffmpeg') return [
    ...(process.env.AUTOCUT_FFMPEG ? [{ path: process.env.AUTOCUT_FFMPEG, source: 'custom' as const }] : []),
    { path: join(root, 'ffmpeg', 'ffmpeg'), source: 'bundled' },
    ...(!app.isPackaged ? [{ path: join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg'), source: 'bundled' as const }] : []),
    ...executableFromPath('ffmpeg')
  ]
  if (id === 'ffprobe') return [
    ...(process.env.AUTOCUT_FFPROBE ? [{ path: process.env.AUTOCUT_FFPROBE, source: 'custom' as const }] : []),
    { path: join(root, 'ffprobe', 'ffprobe'), source: 'bundled' },
    ...(!app.isPackaged ? [{ path: join(appPath, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, 'ffprobe'), source: 'bundled' as const }] : []),
    ...executableFromPath('ffprobe')
  ]
  if (id === 'whisper-cpp') return [
    ...(process.env.AUTOCUT_WHISPER_CPP ? [{ path: process.env.AUTOCUT_WHISPER_CPP, source: 'custom' as const }] : []),
    { path: join(root, 'whisper', 'whisper-cli'), source: 'bundled' },
    ...(!app.isPackaged ? [{ path: join(applicationResourcesRoot(), 'whisper.cpp', 'whisper-cli'), source: 'bundled' as const }] : []),
    ...executableFromPath('whisper-cli')
  ]
  if (id === 'mediapipe-pose') return [{
    path: join(applicationResourcesRoot(), 'models', 'person', 'mediapipe-pose-lite', 'pose_landmarker_lite.task'),
    source: 'bundled'
  }]
  return []
}

export async function resolveRuntimeExecutable(id: 'ffmpeg' | 'ffprobe' | 'whisper-cpp'): Promise<RuntimeCandidate | null> {
  for (const candidate of runtimeCandidates(id)) {
    try {
      await access(candidate.path, constants.X_OK)
      return candidate
    } catch {
      // Try the next trusted candidate.
    }
  }
  return null
}

export async function resolveRuntimeAsset(id: 'mediapipe-pose'): Promise<RuntimeCandidate | null> {
  for (const candidate of runtimeCandidates(id)) {
    try {
      await access(candidate.path, constants.R_OK)
      return candidate
    } catch {
      // Try the next trusted candidate.
    }
  }
  return null
}
