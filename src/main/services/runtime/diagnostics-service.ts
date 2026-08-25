import { homedir } from 'node:os'
import { readdir, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessingStorageSummary, RuntimeDiagnostics } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { architectureRuntimeRoot } from './path-resolver'
import { currentRuntimeEnvironment, validateRuntimeComponents } from './runtime-manager'

async function directoryBytes(path: string): Promise<number> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    let bytes = 0
    for (const entry of entries) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) bytes += await directoryBytes(child)
      else if (entry.isFile()) bytes += (await stat(child)).size
    }
    return bytes
  } catch {
    return 0
  }
}
export async function processingStorageSummary(): Promise<ProcessingStorageSummary> {
  const paths = applicationStoragePaths()
  const [models, previews, analysisCache, runtime] = await Promise.all([
    directoryBytes(paths.models),
    directoryBytes(paths.projects),
    directoryBytes(paths.analysisCache),
    directoryBytes(architectureRuntimeRoot())
  ])
  let availableBytes: number | null = null
  try {
    const info = await statfs(paths.root)
    availableBytes = Number(info.bavail) * Number(info.bsize)
  } catch {
    // Storage may not exist before first use.
  }
  return {
    models,
    previews,
    analysisCache,
    runtime,
    total: models + previews + analysisCache + runtime,
    storagePath: paths.root,
    availableBytes
  }
}

function privacyPath(path: string | null): string {
  if (!path) return 'not available'
  const home = homedir()
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

export async function runtimeDiagnostics(force = false): Promise<RuntimeDiagnostics> {
  const environment = currentRuntimeEnvironment()
  const [components, storage] = await Promise.all([
    validateRuntimeComponents(force),
    processingStorageSummary()
  ])
  const report = [
    'AutoCut Studio Diagnostics',
    `Generated: ${new Date().toISOString()}`,
    `Application: ${environment.applicationVersion}`,
    `Electron: ${environment.electronVersion}`,
    `Platform: ${environment.platform}`,
    `Architecture: ${environment.architecture}`,
    `Packaged: ${environment.packaged ? 'yes' : 'no'}`,
    '',
    ...components.flatMap((component) => [
      `${component.name}: ${component.status}`,
      `  Version: ${component.version ?? 'unknown'}`,
      `  Source: ${component.source}`,
      `  Architecture: ${component.architecture}`,
      `  Path: ${privacyPath(component.path)}`,
      ...(component.error ? [`  Error: ${component.error.replaceAll(homedir(), '~')}`] : [])
    ]),
    '',
    `Data storage: ${privacyPath(storage.storagePath)}`,
    `Model storage bytes: ${storage.models}`,
    `Preview/project storage bytes: ${storage.previews}`,
    `Analysis cache bytes: ${storage.analysisCache}`,
    `Packaged runtime bytes: ${storage.runtime}`,
    `Available disk bytes: ${storage.availableBytes ?? 'unknown'}`
  ].join('\n')
  return { generatedAt: new Date().toISOString(), environment, components, storage, report }
}
