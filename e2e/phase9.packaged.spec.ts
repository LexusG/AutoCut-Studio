import { access, mkdir, mkdtemp, readFile, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

const execFileAsync = promisify(execFile)
const media = (process.env.AUTOCUT_PHASE9_MEDIA ?? '').split(':').filter(Boolean)

async function expectPreview(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: /^(Preview ready|Preview generation failed)$/ })
  await expect(heading).toBeVisible({ timeout: 600_000 })
  if ((await heading.textContent()) === 'Preview generation failed') {
    await page.getByText('Show Technical Details').click()
    throw new Error(await page.locator('.render-error-details pre').textContent() ?? 'Preview generation failed.')
  }
}

test('packaged Phase 9 speaker and transcript workflow', async () => {
  test.skip(media.length < 5, 'Set AUTOCUT_PHASE9_MEDIA to five colon-separated local clips.')
  test.setTimeout(1_200_000)
  const executable = process.env.AUTOCUT_PACKAGED_EXECUTABLE
  const modelRoot = process.env.AUTOCUT_MODEL_ROOT
  const ffmpeg = process.env.AUTOCUT_PACKAGED_FFMPEG
  if (!executable || !modelRoot || !ffmpeg) throw new Error('Packaged smoke environment is incomplete.')
  const directory = await mkdtemp(join(tmpdir(), 'autocut-phase9-packaged-'))
  const userData = join(directory, 'user-data')
  const soundtrack = join(directory, 'soundtrack.wav')
  const projectPath = join(directory, 'phase9.autocut.json')
  const exportPath = join(directory, 'phase9-export.mp4')
  await mkdir(join(userData, 'storage'), { recursive: true })
  await symlink(modelRoot, join(userData, 'storage', 'models'), 'dir')
  await execFileAsync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=20', soundtrack])
  const environment: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  environment.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'; environment.http_proxy = 'http://127.0.0.1:9'; environment.https_proxy = 'http://127.0.0.1:9'
  delete environment.ELECTRON_RUN_AS_NODE
  let app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${userData}`], env: environment })
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'New Project' }).click()
    await page.getByLabel('Project name').fill('Phase 9 Packaged Offline')
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] }) }, media.slice(0, 5))
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(5, { timeout: 60_000 })
    await page.getByLabel('Output width').fill('360'); await page.getByLabel('Output height').fill('640')
    await page.getByLabel('Selection mode').selectOption('smart'); await page.getByLabel('Analysis quality').selectOption('fast')
    await page.getByLabel('Output quality').selectOption('draft'); await page.getByLabel('Preview quality').selectOption('fast')
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path], bookmarks: [] }) }, soundtrack)
    await page.getByRole('button', { name: 'Browse audio' }).click()
    await page.getByRole('button', { name: 'Create Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 300_000 })
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()

    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    await page.getByRole('button', { name: 'Start Queue' }).click()
    await expect(page.locator('.queue-overall')).toContainText('Finished', { timeout: 600_000 })
    await page.getByRole('button', { name: 'Speakers', exact: true }).click()
    await page.locator('.speaker-controls select').first().selectOption('2')
    await page.getByRole('button', { name: 'Detect Speakers' }).click()
    await expect(page.getByRole('button', { name: 'Detect Speakers' })).toBeEnabled({ timeout: 600_000 })
    await expect(page.locator('.speaker-row').first()).toBeVisible()
    await page.locator('.speaker-row input').first().fill('Alex')
    await page.getByLabel('Show Speaker Names in Captions').check()

    await page.getByRole('button', { name: 'Review', exact: true }).click()
    const accept = page.getByRole('button', { name: /Accept/ }).first()
    if (await accept.count()) await accept.click()
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    await page.locator('.caption-template-card').filter({ hasText: 'Interview' }).locator('.caption-template-preview').click()
    await page.getByRole('button', { name: 'Generate Captions' }).click()
    await expect(page.locator('.caption-ready')).toBeVisible()

    await page.getByRole('button', { name: 'Semantic', exact: true }).click()
    await page.getByRole('button', { name: 'Analyze Semantics' }).click()
    await expect(page.locator('.semantic-status-panel')).toContainText('Ready', { timeout: 180_000 })
    await page.getByRole('button', { name: 'Collections', exact: true }).click()
    await page.locator('.semantic-collection-search input').first().fill('the')
    await page.getByRole('button', { name: 'Find Related' }).click()
    await expect(page.locator('.semantic-collection-search .semantic-results article').first()).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await page.getByRole('button', { name: 'Update Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 300_000 })
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()
    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    await page.locator('.caption-template-card').filter({ hasText: 'Interview' }).locator('.caption-template-preview').click()
    await page.getByRole('button', { name: 'Generate Captions' }).click()
    await expect(page.locator('.caption-ready')).toBeVisible()
    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, projectPath)
    await page.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await stat(projectPath)).size, { timeout: 30_000 }).toBeGreaterThan(1_000)
    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreview(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, exportPath)
    await page.getByRole('button', { name: 'Approve & Export' }).click()
    await expect(page.getByRole('heading', { name: 'Export complete', exact: true })).toBeVisible({ timeout: 600_000 })
    await page.getByRole('button', { name: 'View Export Summary' }).click()
    await page.getByRole('button', { name: 'Back to Edit' }).first().click()
    await page.getByRole('button', { name: 'Save Project', exact: true }).click()
    const saved = JSON.parse(await readFile(projectPath, 'utf8')) as { version: number; speakerLabels: unknown[]; confidenceReviews: unknown[] }
    expect(saved.version).toBe(8); expect(saved.speakerLabels.length).toBeGreaterThan(0); expect((await stat(exportPath)).size).toBeGreaterThan(20_000)

    await page.getByRole('button', { name: 'Back to Home' }).click(); await app.close()
    app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${userData}`], env: environment })
    page = await app.firstWindow(); await page.locator('.recent-project-open').filter({ hasText: 'Phase 9 Packaged Offline' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(5); await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Speakers', exact: true }).click(); await expect(page.locator('.speaker-row input').first()).toHaveValue('Alex')
    await access(exportPath)
  } finally { await app.close() }
})
