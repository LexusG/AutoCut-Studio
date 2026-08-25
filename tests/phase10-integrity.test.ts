import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() }
}))

import { validateProject } from '../src/main/services/projects/project-integrity-service'
import type { ProjectFile } from '../src/shared/types'
import { createDefaultProjectSettings, createProjectFile } from '../src/shared/utils/project-settings'

let root = ''
let clipPath = ''

async function managed(relativePath: string, contents = '{}'): Promise<void> {
  const path = join(electronState.userData, 'storage', relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

function project(): ProjectFile {
  const settings = createDefaultProjectSettings()
  return createProjectFile(settings, [clipPath], { id: 'integrity-project', createdAt: '2026-01-01T00:00:00.000Z' })
}

const codes = (report: { issues: Array<{ code: string }> }): string[] => report.issues.map((issue) => issue.code)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-integrity-test-'))
  electronState.userData = join(root, 'user-data')
  clipPath = join(root, 'clip-a.mp4')
  await writeFile(clipPath, 'video', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('project integrity validation', () => {
  it('passes a healthy project', async () => {
    const report = await validateProject(project())
    expect(report.ok).toBe(true)
    expect(codes(report)).not.toContain('source-missing')
    expect(report.projectId).toBe('integrity-project')
  })

  it('reports missing source media as an error', async () => {
    const subject = project()
    subject.sourcePaths = [join(root, 'gone.mp4')]
    subject.sourceMedia = [{ path: subject.sourcePaths[0], clipId: null, relativePath: null, fingerprint: null }]
    const report = await validateProject(subject)
    expect(codes(report)).toContain('source-missing')
    expect(report.ok).toBe(false)
  })

  it('notes sources that carry no fingerprint yet', async () => {
    const report = await validateProject(project())
    const issue = report.issues.find((item) => item.code === 'source-not-fingerprinted')
    expect(issue?.severity).toBe('info')
    // Informational only — an unfingerprinted project is still perfectly usable.
    expect(report.ok).toBe(true)
  })

  it('reports a source list that has drifted out of step', async () => {
    const subject = project()
    subject.sourceMedia = []
    expect(codes(await validateProject(subject))).toContain('source-media-out-of-step')
  })

  it('reports a missing transcript but not one that is present', async () => {
    const subject = project()
    subject.transcriptReferences = [
      { sourceClipId: 'clip-a', relativePath: 'projects/integrity-project/transcripts/clip-a.json' }
    ] as ProjectFile['transcriptReferences']
    expect(codes(await validateProject(subject))).toContain('transcript-missing')

    await managed('projects/integrity-project/transcripts/clip-a.json')
    expect(codes(await validateProject(subject))).not.toContain('transcript-missing')
  })

  it('offers a rebuild when the semantic cache is gone', async () => {
    const subject = project()
    subject.semanticAnalysis = {
      relativePath: 'projects/integrity-project/semantic/analysis.json'
    } as ProjectFile['semanticAnalysis']
    const issue = (await validateProject(subject)).issues.find((item) => item.code === 'semantic-cache-missing')
    expect(issue?.repair).toBe('rebuild-semantic-cache')
  })

  it('offers to regenerate a recorded proxy whose file is gone', async () => {
    const subject = project()
    subject.proxyRecords = [
      {
        clipId: 'clip-a',
        relativePath: 'projects/integrity-project/proxies/clip-a.mp4',
        width: 1280,
        height: 720,
        durationMs: 8000,
        sourceDurationMs: 8000,
        frameRate: 30,
        state: 'ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null
      }
    ]
    const issue = (await validateProject(subject)).issues.find((item) => item.code === 'proxy-missing')
    expect(issue?.repair).toBe('regenerate-proxy')
    expect(issue?.severity).toBe('info')
  })

  it('flags an output variant holding another project’s plan', async () => {
    const subject = project()
    subject.outputVariants = [
      { id: 'v1', name: 'Reel', renderPlan: { projectId: 'someone-else' }, previewHistory: [] }
    ] as unknown as ProjectFile['outputVariants']
    expect(codes(await validateProject(subject))).toContain('variant-plan-mismatch')
  })

  it('never modifies the project it inspects', async () => {
    const subject = project()
    subject.sourcePaths = [join(root, 'gone.mp4')]
    const before = JSON.stringify(subject)
    await validateProject(subject)
    expect(JSON.stringify(subject)).toBe(before)
  })
})
