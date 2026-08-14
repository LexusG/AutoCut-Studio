import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { PreviewStorageStats, PreviewVersion, RenderArtifact } from '@shared/types'
import { allowMediaPath, createMediaUrl } from '../filesystem/media-access'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { runProcess } from '../ffmpeg/process'

export const DEFAULT_PREVIEW_RETENTION = 10

interface PreviewMetadata {
  schemaVersion: 1
  previewId: string
  projectId: string
  createdAt: string
  fileSize: number
  duration: number
  width: number
  height: number
  frameRate: number
  selectionMode: string
  selectionSeed: number
  targetDuration: number | null
  preset: string
  pace: string
  settingsFingerprint: string
  sourceNormalizationMode: string
  finalMixNormalizationMode: string
  personProvider: string
  personModelVersion: string
  soundtrackTracks: number
  approved: boolean
  pinned: boolean
  storageState: 'available'
}

const safePart = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)

function previewRoot(projectId: string, previewId: string): string {
  return join(applicationStoragePaths().projects, safePart(projectId), 'previews', safePart(previewId))
}

function assertManagedPath(path: string): void {
  const root = resolve(applicationStoragePaths().projects)
  const candidate = resolve(path)
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new Error('Refusing to modify a path outside managed preview storage.')
  }
}

function relativeStoragePath(projectId: string, previewId: string): string {
  return relative(applicationStoragePaths().root, previewRoot(projectId, previewId))
}

function metadataFor(
  projectId: string,
  previewId: string,
  artifact: RenderArtifact,
  details?: Pick<PreviewVersion, 'createdAt' | 'presetName' | 'pace' | 'approved' | 'pinned'>
): PreviewMetadata {
  return {
    schemaVersion: 1,
    previewId,
    projectId,
    createdAt: details?.createdAt ?? new Date().toISOString(),
    fileSize: artifact.fileSize,
    duration: artifact.duration,
    width: artifact.width,
    height: artifact.height,
    frameRate: artifact.frameRate,
    selectionMode: artifact.plan.selectionMode,
    selectionSeed: artifact.plan.selectionSeed,
    targetDuration: artifact.plan.requestedDuration,
    preset: details?.presetName ?? 'Pending history record',
    pace: details?.pace ?? artifact.plan.pace,
    settingsFingerprint: artifact.plan.settingsFingerprint,
    sourceNormalizationMode: artifact.plan.audio.normalizationMode,
    finalMixNormalizationMode: artifact.plan.audio.finalMixNormalizationMode,
    personProvider: artifact.plan.personAnalysis.provider,
    personModelVersion: artifact.plan.personAnalysis.modelVersion,
    soundtrackTracks: artifact.plan.audio.soundtrackTracks.filter((track) => track.enabled).length,
    approved: details?.approved ?? false,
    pinned: details?.pinned ?? false,
    storageState: 'available'
  }
}

export async function promotePreview(
  projectId: string,
  previewId: string,
  artifact: RenderArtifact
): Promise<RenderArtifact> {
  const finalDirectory = previewRoot(projectId, previewId)
  const parent = dirname(finalDirectory)
  const staging = join(parent, `.staging-${safePart(previewId)}-${process.pid}-${Date.now()}`)
  assertManagedPath(staging)
  await mkdir(parent, { recursive: true })
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    await copyFile(artifact.outputPath, join(staging, 'preview.mp4'))
    if (artifact.thumbnailPath) await copyFile(artifact.thumbnailPath, join(staging, 'thumbnail.jpg'))
    if (artifact.logPath) await copyFile(artifact.logPath, join(staging, 'render.log'))
    await writeFile(
      join(staging, 'metadata.json'),
      `${JSON.stringify(metadataFor(projectId, previewId, artifact), null, 2)}\n`,
      'utf8'
    )
    await stat(join(staging, 'preview.mp4'))
    await rm(finalDirectory, { recursive: true, force: true })
    await rename(staging, finalDirectory)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
  return resolveArtifact(projectId, previewId, artifact)
}

export function resolveArtifact(projectId: string, previewId: string, artifact: RenderArtifact): RenderArtifact {
  const root = previewRoot(projectId, previewId)
  const outputPath = join(root, 'preview.mp4')
  const thumbnailPath = join(root, 'thumbnail.jpg')
  const logPath = join(root, 'render.log')
  allowMediaPath(outputPath)
  allowMediaPath(thumbnailPath)
  return {
    ...artifact,
    outputPath,
    outputUrl: createMediaUrl(outputPath),
    thumbnailPath,
    thumbnailUrl: createMediaUrl(thumbnailPath),
    logPath
  }
}

export async function resolvePreviewVersion(
  projectId: string,
  version: PreviewVersion
): Promise<PreviewVersion> {
  const destination = previewRoot(projectId, version.id)
  const outputPath = join(destination, 'preview.mp4')
  try {
    await stat(outputPath)
  } catch {
    if (version.storage.state === 'migrating' && version.artifact.outputPath) {
      try {
        const promoted = await promotePreview(projectId, version.id, version.artifact)
        return {
          ...version,
          artifact: promoted,
          thumbnailPath: promoted.thumbnailPath,
          thumbnailUrl: promoted.thumbnailUrl,
          storage: {
            key: version.id,
            relativePath: relativeStoragePath(projectId, version.id),
            state: 'available'
          }
        }
      } catch {
        // Legacy temp media may already have been removed by the operating system.
      }
    }
    return {
      ...version,
      outdated: true,
      thumbnailPath: '',
      thumbnailUrl: '',
      artifact: { ...version.artifact, outputPath: '', outputUrl: '', thumbnailPath: '', thumbnailUrl: '' },
      storage: { ...version.storage, state: 'missing' }
    }
  }
  const artifact = resolveArtifact(projectId, version.id, version.artifact)
  let thumbnailAvailable = true
  try {
    await stat(artifact.thumbnailPath)
  } catch {
    thumbnailAvailable = false
  }
  return {
    ...version,
    artifact: {
      ...artifact,
      thumbnailPath: thumbnailAvailable ? artifact.thumbnailPath : '',
      thumbnailUrl: thumbnailAvailable ? artifact.thumbnailUrl : ''
    },
    thumbnailPath: thumbnailAvailable ? artifact.thumbnailPath : '',
    thumbnailUrl: thumbnailAvailable ? artifact.thumbnailUrl : '',
    storage: {
      key: version.id,
      relativePath: relativeStoragePath(projectId, version.id),
      state: 'available'
    }
  }
}

export async function regeneratePreviewThumbnail(
  ffmpegPath: string,
  projectId: string,
  version: PreviewVersion
): Promise<PreviewVersion> {
  if (version.storage.state !== 'available' || version.thumbnailPath) return version
  const root = previewRoot(projectId, version.id)
  const outputPath = join(root, 'preview.mp4')
  const thumbnailPath = join(root, 'thumbnail.jpg')
  await runProcess(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-ss', Math.min(version.artifact.duration / 2, Math.max(0, version.artifact.duration - 0.1)).toFixed(3),
    '-i', outputPath,
    '-frames:v', '1',
    '-vf', 'scale=320:-2',
    '-q:v', '3',
    '-y', thumbnailPath
  ])
  allowMediaPath(thumbnailPath)
  const thumbnailUrl = createMediaUrl(thumbnailPath)
  return {
    ...version,
    thumbnailPath,
    thumbnailUrl,
    artifact: { ...version.artifact, thumbnailPath, thumbnailUrl }
  }
}

export async function updatePreviewMetadata(projectId: string, version: PreviewVersion): Promise<void> {
  if (version.storage.state !== 'available') return
  const path = join(previewRoot(projectId, version.id), 'metadata.json')
  assertManagedPath(path)
  await writeFile(path, `${JSON.stringify(metadataFor(projectId, version.id, version.artifact, version), null, 2)}\n`, 'utf8')
}

export async function deleteManagedPreview(projectId: string, previewId: string): Promise<void> {
  const root = previewRoot(projectId, previewId)
  assertManagedPath(root)
  await rm(root, { recursive: true, force: true })
}

async function directoryUsage(path: string): Promise<{ bytes: number; count: number }> {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return { bytes: 0, count: 0 }
  }
  let bytes = 0
  let count = 0
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) {
      const nested = await directoryUsage(entryPath)
      bytes += nested.bytes
      count += nested.count
      if (entryPath.endsWith(`${sep}previews${sep}${entry.name}`)) count += 1
    } else {
      bytes += (await stat(entryPath)).size
    }
  }
  return { bytes, count }
}

export async function getPreviewStorageStats(): Promise<PreviewStorageStats> {
  const paths = applicationStoragePaths()
  const usage = await directoryUsage(paths.projects)
  return {
    bytes: usage.bytes,
    previewCount: usage.count,
    location: paths.projects,
    retentionLimit: DEFAULT_PREVIEW_RETENTION
  }
}

export async function pruneManagedPreviews(
  projectId: string,
  versions: PreviewVersion[],
  protectedIds: string[],
  keep = DEFAULT_PREVIEW_RETENTION
): Promise<string[]> {
  const protectedSet = new Set(protectedIds)
  const available = versions.filter((version) => version.storage.state === 'available')
  const removable = [...available]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .filter((version) => !version.pinned && !version.approved && !protectedSet.has(version.id))
  const removed: string[] = []
  while (available.length - removed.length > keep && removable.length > 0) {
    const version = removable.shift()!
    await deleteManagedPreview(projectId, version.id)
    removed.push(version.id)
  }
  return removed
}

export async function readPreviewMetadata(projectId: string, previewId: string): Promise<unknown> {
  return JSON.parse(await readFile(join(previewRoot(projectId, previewId), 'metadata.json'), 'utf8')) as unknown
}
