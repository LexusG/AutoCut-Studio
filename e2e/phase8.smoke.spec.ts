import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const execFileAsync = promisify(execFile)

async function speechVideo(path: string, text: string, person = false, portrait = false): Promise<void> {
  const videoInput = person ? join(process.cwd(), 'e2e', 'fixtures', 'two-people-studio.png') : null
  const args = person
    ? ['-hide_banner', '-loglevel', 'error', '-loop', '1', '-i', videoInput!, '-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`]
    : ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', portrait ? 'testsrc2=size=270x480:rate=30' : 'testsrc2=size=480x270:rate=30', '-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`]
  if (person) {
    const size = portrait ? '270:480' : '480:270'
    const crop = portrait ? 'crop=270:480:195:0' : 'crop=480:270'
    args.push('-map', '0:v:0', '-map', '1:a:0', '-vf', `scale=${size}:force_original_aspect_ratio=increase,${crop}`)
  }
  args.push('-af', 'apad=pad_dur=10,atrim=0:10', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', path)
  await execFileAsync('ffmpeg', args)
}

async function silentVideo(path: string, portrait: boolean): Promise<void> {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', portrait ? 'rgbtestsrc=size=270x480:rate=30' : 'smptebars=size=480x270:rate=30', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', '-y', path])
}

async function music(path: string): Promise<void> {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=520:sample_rate=48000', '-t', '12', '-c:a', 'pcm_s16le', '-y', path])
}

async function expectPreviewReady(page: Page): Promise<void> {
  const result = page.getByRole('heading', { name: /^(Preview ready|Preview generation failed)$/ })
  await expect(result).toBeVisible({ timeout: 240_000 })
  if ((await result.textContent()) === 'Preview generation failed') throw new Error('Phase 8 preview generation failed.')
}

test('completes local semantic highlights and multi-format repurposing', async () => {
  test.setTimeout(1_200_000)
  const directory = await mkdtemp(join(tmpdir(), 'autocut-phase8-smoke-'))
  const clips = Array.from({ length: 8 }, (_value, index) => join(directory, `phase8-${index + 1}.mp4`))
  const soundtrack = join(directory, 'phase8-music.wav')
  const projectPath = join(directory, 'phase8-project.autocut.json')
  const chapterPath = join(directory, 'phase8-chapters.txt')
  const exports = [join(directory, 'phase8-instagram-reel.mp4'), join(directory, 'phase8-youtube-short.mp4')]
  const userData = join(directory, 'user-data')
  const whisperSource = '/home/hell/.config/autocut-studio/storage/models/whisper/base.en/ggml-base.en.bin'
  const semanticSource = '/home/hell/.config/autocut-studio/storage/models/semantic/all-MiniLM-L6-v2'

  await Promise.all([
    speechVideo(clips[0], 'First we measure the steel frame for the construction project.', true),
    speechVideo(clips[1], 'Next we cut the metal pieces and prepare every joint.'),
    speechVideo(clips[2], 'Now we weld the steel frame together with strong clean seams.', true, true),
    speechVideo(clips[3], 'The installation step attaches the wooden top to the frame.'),
    speechVideo(clips[4], 'We test the finished table and show the final result.', true),
    speechVideo(clips[5], 'For dinner we cook vegetables and serve fresh bread.'),
    silentVideo(clips[6], false),
    silentVideo(clips[7], true),
    music(soundtrack)
  ])
  await mkdir(join(userData, 'storage', 'models', 'whisper', 'base.en'), { recursive: true })
  await symlink(whisperSource, join(userData, 'storage', 'models', 'whisper', 'base.en', 'ggml-base.en.bin'))
  await mkdir(join(userData, 'storage', 'models', 'semantic'), { recursive: true })
  await symlink(semanticSource, join(userData, 'storage', 'models', 'semantic', 'all-MiniLM-L6-v2'), 'dir')

  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  environment.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  delete environment.ELECTRON_RUN_AS_NODE
  let app: ElectronApplication | null = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: environment })
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'New Project' }).click()
    await page.getByLabel('Project name').fill('Phase 8 Semantic Smoke')
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] }) }, clips)
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(8, { timeout: 30_000 })
    await page.getByLabel('Output width').fill('240')
    await page.getByLabel('Output height').fill('426')
    await page.getByLabel('Selection mode').selectOption('smart')
    await page.getByLabel('Analysis quality').selectOption('fast')
    await page.getByText('Advanced Smart Settings').click()
    await page.getByLabel('Prefer People').check()
    await page.getByLabel('Prefer Spoken Moments').check()
    await page.getByLabel('Editing pace').selectOption('fast')
    await page.getByLabel('Target duration').selectOption('custom')
    await page.getByLabel('Custom target duration').fill('30')
    await page.getByLabel('Output quality').selectOption('draft')
    await page.getByLabel('Preview quality').selectOption('full')
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path], bookmarks: [] }) }, soundtrack)
    await page.getByRole('button', { name: 'Browse audio' }).click()

    await page.getByRole('button', { name: 'Create Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 240_000 })
    await expect(page.locator('.edit-plan-item')).toHaveCount(8)
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()

    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
    await expect(page.locator('.transcript-document')).toHaveCount(8, { timeout: 360_000 })
    await expect(page.locator('.transcript-word').first()).toBeVisible()
    await page.getByRole('button', { name: 'Semantic', exact: true }).click()
    await expect(page.locator('.semantic-controls .model-status')).toContainText('Installed and offline ready')
    await page.getByLabel('Edit Goal', { exact: true }).fill('Focus on the construction process and finished result.')
    await page.getByLabel('Edit Goal Strength', { exact: true }).selectOption('strong')
    await page.getByRole('button', { name: 'Analyze Semantics' }).click()
    await expect(page.locator('.semantic-status-panel')).toContainText('Ready', { timeout: 120_000 })
    await expect(page.locator('.semantic-status-panel')).toContainText('MiniLM')

    await page.locator('.semantic-search input').fill('the')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.semantic-results article').first()).toContainText(/the/i)
    await page.getByRole('button', { name: 'Semantic', exact: true }).last().click()
    await page.locator('.semantic-search input').fill('building project')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.semantic-results article').first()).toBeVisible()
    expect(await page.locator('.semantic-results article').count()).toBeGreaterThanOrEqual(5)
    await page.locator('.semantic-results article').first().getByRole('button', { name: 'Prioritize' }).click()
    await page.locator('.semantic-results article').last().getByRole('button', { name: 'Avoid' }).click()

    await page.getByRole('button', { name: 'Topics', exact: true }).click()
    await expect(page.locator('.topic-card').first()).toBeVisible({ timeout: 30_000 })
    expect(await page.locator('.topic-card').count()).toBeGreaterThanOrEqual(2)
    await page.locator('.topic-card').first().getByPlaceholder('Topic 1').fill('Construction')
    await page.locator('.topic-card').first().locator('select').selectOption('important')
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, chapterPath)
    await page.getByRole('button', { name: 'Chapters' }).click()
    expect(await readFile(chapterPath, 'utf8')).toContain('Construction')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-eight-topics.png', fullPage: true })

    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await page.getByRole('button', { name: 'Update Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 240_000 })
    await expect(page.locator('.plan-signals').filter({ hasText: 'Goal' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()
    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    await page.locator('.caption-controls select').nth(0).selectOption('dynamic')
    await page.locator('.caption-controls select').nth(1).selectOption('burned-in')
    await page.getByRole('button', { name: 'Generate Captions' }).click()
    await expect(page.locator('.caption-ready')).toBeVisible()
    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await expect(page.locator('.final-preview-video')).toHaveAttribute('src', /^autocut-media:/)
    await page.getByRole('button', { name: 'Back to Edit' }).first().click()

    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Highlights', exact: true }).click()
    await page.getByRole('button', { name: 'Find Highlights' }).click()
    await expect(page.locator('.highlight-card').first()).toBeVisible({ timeout: 120_000 })
    expect(await page.locator('.highlight-card').count()).toBeGreaterThanOrEqual(5)
    await expect(page.locator('.highlight-card').first()).toContainText(/Strong visual quality|Prioritized transcript range|Strong match to selected topic|Complete spoken moment/)
    await page.getByRole('button', { name: 'Create Highlight Reel' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()
    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Highlights', exact: true }).click()
    const selectedHighlights = page.locator('.highlight-card input[type="checkbox"]:checked')
    while (await selectedHighlights.count()) await selectedHighlights.first().uncheck()

    await page.getByRole('button', { name: 'Versions', exact: true }).click()
    await page.getByRole('button', { name: 'Generate Versions' }).click()
    await expect(page.locator('.variant-card')).toHaveCount(3)
    await expect(page.locator('.variant-card').nth(0)).toContainText('Instagram Reel')
    await expect(page.locator('.variant-card').nth(1)).toContainText('YouTube Short')
    await expect(page.locator('.variant-card').nth(2)).toContainText('LinkedIn Portrait')
    await page.getByRole('button', { name: 'Generate Previews' }).click()
    for (const card of await page.locator('.variant-card').all()) await expect(card).toContainText(/Preview\s*complete/i, { timeout: 600_000 })
    await page.screenshot({ path: '/tmp/autocut-studio-phase-eight-versions.png', fullPage: true })
    await page.locator('.variant-card').nth(0).getByRole('button', { name: 'Approve' }).click()
    await page.locator('.variant-card').nth(1).getByRole('button', { name: 'Approve' }).click()

    await app.evaluate(({ dialog }, paths) => {
      let index = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths[Math.min(index++, paths.length - 1)] })
    }, exports)
    await page.getByRole('button', { name: 'Export Approved' }).click()
    await expect(page.locator('.variant-card').nth(0)).toContainText(/Export\s*complete/i, { timeout: 300_000 })
    await expect(page.locator('.variant-card').nth(1)).toContainText(/Export\s*complete/i, { timeout: 300_000 })

    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, projectPath)
    await page.getByRole('button', { name: 'Save Project' }).click()
    const saved = JSON.parse(await readFile(projectPath, 'utf8')) as {
      version: number
      semanticAnalysis: { chunkCount: number; topicCount: number }
      semanticHints: unknown[]
      highlightCandidates: unknown[]
      outputVariants: Array<{ approval: string; renderPlan: { variantId: string }; previewHistory: unknown[] }>
    }
    expect(saved.version).toBe(7)
    expect(saved.semanticAnalysis.chunkCount).toBeGreaterThanOrEqual(6)
    expect(saved.semanticHints).toHaveLength(2)
    expect(saved.highlightCandidates.length).toBeGreaterThanOrEqual(6)
    expect(saved.outputVariants).toHaveLength(3)
    expect(saved.outputVariants.map((variant) => variant.renderPlan.variantId)).toHaveLength(3)
    expect(saved.outputVariants.filter((variant) => variant.approval === 'approved')).toHaveLength(2)
    expect(saved.outputVariants.every((variant) => variant.previewHistory.length === 1)).toBe(true)

    for (const path of exports) {
      expect((await stat(path)).size).toBeGreaterThan(20_000)
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
      const probe = JSON.parse(stdout) as { format: { duration: string }; streams: Array<{ codec_type: string; width?: number; height?: number }> }
      expect(Number(probe.format.duration)).toBeGreaterThan(40)
      expect(probe.streams).toEqual(expect.arrayContaining([expect.objectContaining({ codec_type: 'video', width: 1080, height: 1920 })]))
    }

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await app.close(); app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: environment })
    page = await app.firstWindow()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 8 Semantic Smoke' }).first().click()
    await expect(page.locator('.clip-card')).toHaveCount(8, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Versions', exact: true }).click()
    await expect(page.locator('.variant-card')).toHaveCount(3)
    await expect(page.locator('.variant-preview-thumb')).toHaveCount(3)
    expect(await page.locator('.variant-card').filter({ hasText: /Approval\s*approved/i }).count()).toBe(2)
    await Promise.all([...clips, soundtrack, ...exports].map((path) => access(path)))
  } finally {
    if (app) await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
