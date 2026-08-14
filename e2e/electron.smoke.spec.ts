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
  const audioPath = join(fixtureDirectory, 'background-music.wav')
  const outputPath = join(fixtureDirectory, 'autocut-output.mp4')
  const projectPath = join(fixtureDirectory, 'phase-2-smoke.autocut.json')

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
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=523:sample_rate=48000',
    '-t',
    '4',
    '-c:a',
    'pcm_s16le',
    '-y',
    audioPath
  ])

  const launchEnvironment = { ...process.env }
  delete launchEnvironment.ELECTRON_RUN_AS_NODE

  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${join(fixtureDirectory, 'user-data')}`],
    env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })

  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByRole('heading', { name: 'AutoCut Studio' })).toBeVisible()
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible()
    await page.getByLabel('Project name').fill('Phase 2 Smoke')

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

    await page.getByRole('tab', { name: 'Instagram' }).click()
    await expect(page.locator('.preset-summary')).toContainText('Instagram Reel')
    await expect(page.locator('.preset-summary')).toContainText('1080 × 1920')
    await expect(page.locator('.preview-canvas')).toHaveAttribute('data-aspect-ratio', '9:16')
    await expect.poll(() => page.locator('.preview-canvas').evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.width / box.height
    })).toBeCloseTo(9 / 16, 1)

    await page.getByRole('tab', { name: 'YouTube' }).click()
    await expect(page.locator('.preset-summary')).toContainText('YouTube Standard')
    await expect(page.locator('.preview-canvas')).toHaveAttribute('data-aspect-ratio', '16:9')

    await page.getByRole('tab', { name: 'Instagram' }).click()
    await page.getByRole('option', { name: /Feed Square/ }).click()
    await expect(page.locator('.preview-canvas')).toHaveAttribute('data-aspect-ratio', '1:1')
    await page.getByLabel('Frame rate').selectOption('60')
    await expect(page.locator('.preset-section')).toContainText('Modified')
    await page.getByLabel('Editing pace').selectOption('fast')
    await expect(page.getByLabel('Use Every Clip')).toBeChecked()
    await page.getByLabel('Target duration').selectOption('custom')
    await page.getByLabel('Custom target duration').fill('47')
    await page.getByLabel('Fit mode').selectOption('fit')
    await page.getByLabel('Output quality').selectOption('high')

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedPath],
        bookmarks: []
      })
    }, audioPath)
    await page.getByRole('button', { name: 'Browse audio' }).click()
    await expect(page.locator('.audio-card')).toContainText('background-music.wav')
    await expect(page.locator('.audio-card')).toContainText('PCM_S16LE')
    const audioPreview = page.locator('.audio-card audio')
    const audioDuration = await audioPreview.evaluate(async (audio: HTMLAudioElement) => {
      if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
          audio.addEventListener('error', () => reject(new Error('Audio preview failed to load')), { once: true })
        })
      }
      return audio.duration
    })
    expect(audioDuration).toBeGreaterThan(3.9)
    await page.getByRole('slider').first().fill('35')

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, projectPath)
    await page.getByRole('button', { name: 'Save Project' }).click()
    await expect(page.locator('.project-feedback')).toContainText('Project saved')
    const persistedProject = JSON.parse(await (await import('node:fs/promises')).readFile(projectPath, 'utf8')) as {
      settings: {
        presetId: string
        presetModified: boolean
        output: { width: number; height: number; frameRate: number; fitMode: string; quality: string }
        editing: { pace: string; useEveryClip: boolean; targetDuration: { mode: string; seconds: number } }
        audio: { backgroundTrack: { path: string }; musicVolume: number }
      }
    }
    expect(persistedProject.settings).toMatchObject({
      presetId: 'instagram-feed-square',
      presetModified: true,
      output: { width: 1080, height: 1080, frameRate: 60, fitMode: 'fit', quality: 'high' },
      editing: { pace: 'fast', useEveryClip: true, targetDuration: { mode: 'custom', seconds: 47 } },
      audio: { backgroundTrack: { path: audioPath }, musicVolume: 35 }
    })

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 2 Smoke' }).first().click()
    await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible()
    await expect(page.locator('.clip-card')).toHaveCount(2)
    await expect(page.locator('.preset-section')).toContainText('Instagram Feed Square — Modified')
    await expect(page.getByLabel('Editing pace')).toHaveValue('fast')
    await expect(page.getByLabel('Custom target duration')).toHaveValue('47')
    await expect(page.locator('.audio-card')).toContainText('background-music.wav')
    await expect(page.getByRole('slider').first()).toHaveValue('35')

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
        expect.objectContaining({ codec_type: 'video', codec_name: 'h264', width: 1080, height: 1080 }),
        expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' })
      ])
    )

    await page.getByRole('button', { name: 'View Video' }).click()
    await expect(page.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('video')).toHaveAttribute('src', /^autocut-media:/)
    await page.getByRole('button', { name: 'Back to Home' }).click()
    await rm(audioPath, { force: true })
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 2 Smoke' }).first().click()
    await expect(page.getByText('Audio file missing', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Locate File' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove Audio' })).toBeVisible()
    await page.screenshot({ path: '/tmp/autocut-studio-phase-two.png', fullPage: true })
  } finally {
    await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
