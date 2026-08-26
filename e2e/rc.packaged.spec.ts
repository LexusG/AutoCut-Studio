import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

const execFileAsync = promisify(execFile)

const executable = process.env.AUTOCUT_RC_EXECUTABLE ?? ''
const packagedFfmpeg = process.env.AUTOCUT_RC_FFMPEG ?? ''
const packagedFfprobe = process.env.AUTOCUT_RC_FFPROBE ?? ''

interface ProbeResult {
  width: number
  height: number
  duration: number
  frameRate: number
  hasAudio: boolean
  size: number
}

/** Verify an export with the packaged FFprobe, not a system one. */
async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(packagedFfprobe, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path
  ])
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }>
    format?: { duration?: string }
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  if (!video?.width || !video.height) throw new Error('Export has no readable video stream.')
  const [numerator, denominator] = (video.avg_frame_rate ?? '0/1').split('/').map(Number)
  return {
    width: video.width,
    height: video.height,
    duration: Number(parsed.format?.duration ?? 0),
    frameRate: denominator ? numerator / denominator : 0,
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
    size: (await stat(path)).size
  }
}

async function expectPreview(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: /^(Preview ready|Preview generation failed)$/ })
  await expect(heading).toBeVisible({ timeout: 600_000 })
  if ((await heading.textContent()) === 'Preview generation failed') {
    await page.getByText('Show Technical Details').click()
    throw new Error(await page.locator('.render-error-details pre').textContent() ?? 'Preview generation failed.')
  }
}

test('packaged release candidate completes the real workflow offline', async () => {
  test.skip(!executable || !packagedFfmpeg || !packagedFfprobe, 'Set AUTOCUT_RC_* to the extracted package.')
  test.setTimeout(1_200_000)

  const directory = await mkdtemp(join(tmpdir(), 'autocut-rc-'))
  const userData = join(directory, 'user-data')
  const projectPath = join(directory, 'rc.autocut.json')
  const exportPath = join(directory, 'rc-export.mp4')

  // Clips are produced by the PACKAGED ffmpeg, which proves the bundled binary is
  // usable before the application is even launched.
  const clips: string[] = []
  const sources = [
    'testsrc2=size=1280x720:rate=30',
    'smptebars=size=1280x720:rate=30',
    'testsrc=size=1280x720:rate=30'
  ]
  for (let index = 0; index < sources.length; index += 1) {
    const clip = join(directory, `clip-${index}.mp4`)
    await execFileAsync(packagedFfmpeg, [
      '-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', sources[index],
      '-f', 'lavfi', '-i', `sine=frequency=${220 + index * 110}`,
      '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', clip
    ])
    clips.push(clip)
  }

  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  environment.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  // Point networking at a closed port so any accidental network dependency fails loudly
  // rather than silently succeeding on the developer's connection.
  environment.http_proxy = 'http://127.0.0.1:9'
  environment.https_proxy = 'http://127.0.0.1:9'
  delete environment.ELECTRON_RUN_AS_NODE

  let app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`],
    env: environment
  })

  try {
    let page = await app.firstWindow()

    await expect(page.getByRole('heading', { name: 'AutoCut Studio' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'New Project' }).click()
    await page.getByLabel('Project name').fill('RC Validation')

    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
    }, clips)
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(clips.length, { timeout: 120_000 })

    // Instagram Reel: the most common target, and the one that exercises 9:16 reframing.
    await page.getByRole('tab', { name: 'Instagram' }).click()
    await page.getByRole('option', { name: /Reel/ }).click()

    // Save before planning: Save Project lives on the editor screen, and the preview
    // flow ends on the review screen.
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, projectPath)
    await page.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect(page.getByText('Project saved')).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: 'Create Edit Plan' }).click()

    // Creating a plan auto-opens the Edit Plan overlay for review, so the user's next
    // click is the panel's own Generate Preview. Scope to it: the same accessible name
    // also exists in the editor header, which is a real ambiguity in the UI.
    const planPanel = page.getByLabel('Edit Plan', { exact: true })
    await expect(planPanel).toBeVisible({ timeout: 600_000 })
    const generate = planPanel.getByRole('button', { name: 'Generate Preview' })
    await expect(generate).toBeEnabled({ timeout: 600_000 })
    console.log(`[RC] edit plan created with ${await page.locator('.edit-plan-item').count()} segments`)

    await generate.click()
    await expectPreview(page)

    // The completion dialog is modal; dismissing it lands on the review screen.
    await page.getByRole('button', { name: 'Review Preview' }).click()

    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, exportPath)
    await page.getByRole('button', { name: 'Approve & Export' }).click()
    await expect(page.getByRole('heading', { name: 'Export complete' })).toBeVisible({ timeout: 900_000 })

    const exported = await probe(exportPath)
    expect(exported.width).toBe(1080)
    expect(exported.height).toBe(1920)
    expect(exported.hasAudio).toBe(true)
    expect(exported.duration).toBeGreaterThan(1)
    expect(exported.size).toBeGreaterThan(10_000)
    console.log(`[RC] export verified ${exported.width}x${exported.height} ${exported.duration.toFixed(2)}s ${exported.frameRate.toFixed(2)}fps ${exported.size} bytes`)

    // Restart and reopen the project: proves persistence survives a real process exit.
    await app.close()
    app = await electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${userData}`],
      env: environment
    })
    page = await app.firstWindow()
    await page.locator('.recent-project-open').filter({ hasText: 'RC Validation' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(clips.length, { timeout: 120_000 })
    console.log('[RC] project reopened after restart with all clips intact')
  } finally {
    await app.close().catch(() => undefined)
  }
})
