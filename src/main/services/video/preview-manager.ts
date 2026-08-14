import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RenderPlan } from '@shared/types'

export interface PreviewWorkspace {
  root: string
  normalized: string
  previewPath: string
  thumbnailPath: string
  planPath: string
  logPath: string
}

const safePart = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)

export async function createPreviewWorkspace(
  projectId: string,
  renderId: string,
  plan: RenderPlan
): Promise<PreviewWorkspace> {
  const projectRoot = join(tmpdir(), 'autocut-studio', safePart(projectId), 'renders')
  await mkdir(projectRoot, { recursive: true })
  const root = join(projectRoot, safePart(renderId))
  const normalized = join(root, 'normalized')
  await mkdir(normalized, { recursive: true })
  const workspace = {
    root,
    normalized,
    previewPath: join(root, 'preview.mp4'),
    thumbnailPath: join(root, 'thumbnail.jpg'),
    planPath: join(root, 'render-plan.json'),
    logPath: join(root, 'render.log')
  }
  await writeFile(workspace.planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  await writeFile(workspace.logPath, '', 'utf8')
  return workspace
}

export async function cleanPreviewIntermediates(workspace: PreviewWorkspace): Promise<void> {
  await rm(workspace.normalized, { recursive: true, force: true })
}

export async function cleanFailedPreview(workspace: PreviewWorkspace): Promise<void> {
  await rm(workspace.previewPath, { force: true })
  await rm(workspace.thumbnailPath, { force: true })
  await cleanPreviewIntermediates(workspace)
}

export async function cleanPromotedPreview(workspace: PreviewWorkspace): Promise<void> {
  await rm(workspace.root, { recursive: true, force: true })
}

export async function prunePreviewHistory(projectId: string, keep = 3): Promise<void> {
  const projectRoot = join(tmpdir(), 'autocut-studio', safePart(projectId), 'renders')
  let entries
  try {
    entries = await readdir(projectRoot, { withFileTypes: true })
  } catch {
    return
  }
  const directories = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => ({
      name: entry.name,
      modified: (await stat(join(projectRoot, entry.name))).mtimeMs
    }))
  )
  directories.sort((left, right) => right.modified - left.modified)
  await Promise.all(
    directories.slice(keep).map(({ name }) => rm(join(projectRoot, name), { recursive: true, force: true }))
  )
}
