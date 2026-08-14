import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test } from '@playwright/test'

const execFileAsync = promisify(execFile)

test('imports and previews a local video through secure IPC', async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-smoke-'))
  const fixturePath = join(fixtureDirectory, 'phase-one-fixture.mp4')

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
    fixturePath
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

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedPath],
        bookmarks: []
      })
    }, fixturePath)

    await page.getByRole('button', { name: 'Browse files' }).click()
    const clipCard = page.locator('.clip-card')
    await expect(clipCard).toContainText('phase-one-fixture.mp4')
    await expect(clipCard).toContainText('640x360')
    await expect(clipCard.locator('img')).toHaveAttribute('src', /^autocut-media:/)

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
    await page.screenshot({ path: '/tmp/autocut-studio-phase-one.png', fullPage: true })
  } finally {
    await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
