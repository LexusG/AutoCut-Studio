import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test } from '@playwright/test'

const execFileAsync = promisify(execFile)

test('imports mixed clips and generates a finished local video', async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-smoke-'))
  const landscapePath = join(fixtureDirectory, 'landscape-with-audio.mp4')
  const portraitPath = join(fixtureDirectory, 'portrait-silent.mp4')
  const outputPath = join(fixtureDirectory, 'autocut-output.mp4')

  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=30',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    landscapePath
  ])
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=360x640:rate=24',
    '-t',
    '1.5',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-y',
    portraitPath
  ])

  const launchEnvironment = { ...process.env }
  delete launchEnvironment.ELECTRON_RUN_AS_NODE

  const electronApp = await electron.launch({
    args: ['.'],
    env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })

  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByRole('heading', { name: 'AutoCut Studio' })).toBeVisible()
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible()

    await electronApp.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: paths,
        bookmarks: []
      })
    }, [landscapePath, portraitPath])

    await page.getByRole('button', { name: 'Browse files' }).click()
    const clipCards = page.locator('.clip-card')
    await expect(clipCards).toHaveCount(2)
    await expect(clipCards.first()).toContainText('landscape-with-audio.mp4')
    await expect(clipCards.first()).toContainText('640x360')
    await expect(clipCards.nth(1)).toContainText('portrait-silent.mp4')
    await expect(clipCards.nth(1)).toContainText('360x640')
    await expect(clipCards.first().locator('img')).toHaveAttribute('src', /^autocut-media:/)

    const preview = page.locator('video')
    await expect(preview).toHaveAttribute('src', /^autocut-media:/)
    await expect(page.locator('.preview-inspector')).toContainText('Available')

    const duration = await preview.evaluate(async (video: HTMLVideoElement) => {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true })
          video.addEventListener('error', () => reject(new Error('Preview failed to load')), {
            once: true
          })
        })
      }
      return video.duration
    })
    expect(duration).toBeGreaterThan(1.5)

    await page.getByLabel('Resolution').selectOption('720p')
    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, outputPath)
    await page.getByRole('button', { name: 'Generate Video' }).click()
    await expect(page.getByRole('heading', { name: 'Video ready' })).toBeVisible({ timeout: 30_000 })
    expect((await stat(outputPath)).size).toBeGreaterThan(10_000)

    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      outputPath
    ])
    const probe = JSON.parse(stdout) as {
      format: { duration: string }
      streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>
    }
    expect(Number(probe.format.duration)).toBeGreaterThan(3.2)
    expect(probe.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }),
        expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' })
      ])
    )

    await page.getByRole('button', { name: 'View Video' }).click()
    await expect(page.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('video')).toHaveAttribute('src', /^autocut-media:/)
    await page.screenshot({ path: '/tmp/autocut-studio-render-complete.png', fullPage: true })
  } finally {
    await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
