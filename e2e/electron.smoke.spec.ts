import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

const execFileAsync = promisify(execFile)

async function createVideo(
  path: string,
  source: string,
  withAudio: boolean,
  frequency = 440
): Promise<void> {
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', source]
  if (withAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000`)
  args.push(
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    ...(withAudio ? ['-c:a', 'aac', '-shortest'] : ['-an']),
    '-y', path
  )
  await execFileAsync('ffmpeg', args)
}

async function createMusic(path: string, frequency: number): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', `sine=frequency=${frequency}:sample_rate=48000`,
    '-t', '4', '-c:a', 'pcm_s16le', '-y', path
  ])
}

async function expectPreviewReady(page: Page): Promise<void> {
  const result = page.getByRole('heading', { name: /^(Preview ready|Preview generation failed)$/ })
  await expect(result).toBeVisible({ timeout: 120_000 })
  if ((await result.textContent()) === 'Preview generation failed') {
    await page.getByText('Show Technical Details').click()
    throw new Error(await page.locator('.render-error-details pre').textContent() ?? 'Preview generation failed')
  }
}

test('completes the realistic Phase 4 Smart editing workflow', async () => {
  test.setTimeout(240_000)
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-phase4-smoke-'))
  const clips = [
    join(fixtureDirectory, 'landscape-audio.mp4'),
    join(fixtureDirectory, 'portrait-silent.mp4'),
    join(fixtureDirectory, 'square-audio.mp4'),
    join(fixtureDirectory, 'dark-landscape.mp4'),
    join(fixtureDirectory, 'portrait-pattern.mp4')
  ]
  const musicOne = join(fixtureDirectory, 'music-one.wav')
  const musicTwo = join(fixtureDirectory, 'music-two.wav')
  const outputPath = join(fixtureDirectory, 'phase4-output.mp4')
  const projectPath = join(fixtureDirectory, 'phase4-smoke.autocut.json')

  await Promise.all([
    createVideo(clips[0], 'testsrc=size=480x270:rate=30', true, 440),
    createVideo(clips[1], 'testsrc2=size=270x480:rate=24', false),
    createVideo(clips[2], 'smptebars=size=360x360:rate=30', true, 660),
    createVideo(clips[3], 'color=c=0x111318:size=480x270:rate=30', false),
    createVideo(clips[4], 'rgbtestsrc=size=270x480:rate=24', false),
    createMusic(musicOne, 523),
    createMusic(musicTwo, 784)
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
    await page.getByLabel('Project name').fill('Phase 4 Smart Smoke')

    await electronApp.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
    }, clips)
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(5)
    await expect(page.locator('.clip-card').nth(1)).toContainText('270x480')
    await expect(page.locator('.clip-card').nth(2)).toContainText('360x360')

    await page.getByRole('tab', { name: 'Instagram' }).click()
    await expect(page.locator('.preset-summary')).toContainText('Instagram Reel')
    await page.getByLabel('Output width').fill('360')
    await page.getByLabel('Output height').fill('640')
    await page.getByLabel('Fit mode').selectOption('fit')
    await expect(page.getByLabel('Fit background')).toHaveValue('blurred')
    await page.getByLabel('Blur strength').selectOption('medium')
    await page.getByLabel('Selection mode').selectOption('smart')
    await page.getByLabel('Analysis quality').selectOption('fast')
    await page.getByLabel('Editing pace').selectOption('fast')
    await expect(page.getByLabel('Use Every Clip')).toBeChecked()
    await page.getByLabel('Target duration').selectOption('custom')
    await page.getByLabel('Custom target duration').fill('10')
    await page.getByLabel('Transition preference').selectOption('crossfade')
    await page.getByLabel('Transition duration').selectOption('0.25')
    await page.getByLabel('Output quality').selectOption('draft')

    for (const musicPath of [musicOne, musicTwo]) {
      await electronApp.evaluate(({ dialog }, selectedPath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath], bookmarks: [] })
      }, musicPath)
      await page.getByRole('button', { name: 'Browse audio' }).click()
    }
    const soundtrackTracks = page.locator('.soundtrack-track')
    await expect(soundtrackTracks).toHaveCount(2)
    await expect(soundtrackTracks.nth(0)).toContainText('music-one.wav')
    await expect(soundtrackTracks.nth(1)).toContainText('music-two.wav')
    await soundtrackTracks.nth(0).getByRole('slider').fill('60')
    await soundtrackTracks.nth(1).getByRole('slider').fill('45')
    await soundtrackTracks.nth(1).getByRole('spinbutton').fill('0.5')
    await page.getByLabel('Audio normalization').selectOption('accurate')
    await page.getByLabel('Normalize Final Mix').check()
    await expect(page.getByLabel('Loop Soundtrack')).toBeChecked()
    await expect(page.getByLabel('Lower Music During Clip Audio')).toBeChecked()

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, projectPath)
    await page.getByRole('button', { name: 'Save Project' }).click()
    await expect(page.locator('.project-feedback')).toContainText('Project saved')
    const savedBeforeRender = JSON.parse(await readFile(projectPath, 'utf8')) as {
      version: number
      settings: {
        output: { fitBackground: string; width: number; height: number }
        editing: { selectionMode: string; analysisQuality: string }
        audio: { normalizationMode: string; soundtrack: { tracks: Array<{ path: string; volume: number }> } }
      }
    }
    expect(savedBeforeRender).toMatchObject({
      version: 3,
      settings: {
        output: { fitBackground: 'blurred', width: 360, height: 640 },
        editing: { selectionMode: 'smart', analysisQuality: 'fast' },
        audio: { normalizationMode: 'accurate' }
      }
    })
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.path)).toEqual([musicOne, musicTwo])
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.volume)).toEqual([60, 45])

    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await expect(page.getByRole('heading', { name: 'Phase 4 Smart Smoke' })).toBeVisible()
    await expect(page.locator('.final-preview-video')).toHaveAttribute('src', /^autocut-media:/)
    await expect(page.locator('.review-metadata')).toContainText('360 x 640')
    await expect(page.locator('.review-metadata')).toContainText('Smart')
    await expect(page.locator('.review-metadata')).toContainText('2 tracks')
    await expect(page.locator('.edit-plan-list > div')).toHaveCount(5)
    await expect(page.locator('.selection-reasons')).toHaveCount(5)
    await expect(page.locator('.preview-version')).toHaveCount(1)
    await expect(page.locator('.preview-version')).toContainText('V1')
    const firstPreviewUrl = await page.locator('.final-preview-video').getAttribute('src')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-four-review.png', fullPage: true })

    await page.getByRole('button', { name: 'Regenerate' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await expect(page.locator('.preview-version')).toHaveCount(2)
    await expect(page.locator('.preview-history')).toContainText('V2')
    await expect(page.locator('.preview-history')).toContainText('V1')
    expect(await page.locator('.final-preview-video').getAttribute('src')).not.toBe(firstPreviewUrl)

    await page.getByRole('button', { name: /V1.*Settings Changed/ }).click()
    await expect(page.getByText('Settings Changed', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: /V2.*Current Preview/ }).click()
    await expect(page.getByRole('button', { name: 'Approve & Export' })).toBeEnabled()

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, outputPath)
    await page.getByRole('button', { name: 'Approve & Export' }).click()
    await expect(page.getByRole('heading', { name: 'Export complete' })).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: 'View Export Summary' }).click()
    await expect(page.locator('.export-summary')).toContainText('360 x 640')
    expect((await stat(outputPath)).size).toBeGreaterThan(20_000)

    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', outputPath
    ])
    const probe = JSON.parse(stdout) as {
      format: { duration: string }
      streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>
    }
    expect(Number(probe.format.duration)).toBeGreaterThan(9.5)
    expect(probe.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', codec_name: 'h264', width: 360, height: 640 }),
      expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' })
    ]))

    await page.getByRole('button', { name: 'Back to Project' }).click()
    await page.getByRole('button', { name: 'Save Project' }).click()
    await expect(page.locator('.project-feedback')).toContainText('Project saved')
    const savedAfterExport = JSON.parse(await readFile(projectPath, 'utf8')) as {
      previewHistory: Array<{ approved: boolean; artifact: { logPath: string; plan: { selectionSeed: number; segments: unknown[] } } }>
    }
    expect(savedAfterExport.previewHistory).toHaveLength(2)
    expect(savedAfterExport.previewHistory[0].approved).toBe(true)
    expect(savedAfterExport.previewHistory[0].artifact.plan.segments).toHaveLength(5)
    expect(savedAfterExport.previewHistory[0].artifact.plan.selectionSeed).toBe(1)
    const renderLog = await readFile(savedAfterExport.previewHistory[0].artifact.logPath, 'utf8')
    expect(renderLog).toContain('"stage":"smart-selection"')
    expect(renderLog).toContain('"cache":"hit"')
    expect(renderLog).toContain('"stage":"soundtrack-plan"')
    expect(renderLog).toContain('"stage":"accurate-loudness-measurement"')

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 4 Smart Smoke' }).first().click()
    await expect(page.locator('.clip-card')).toHaveCount(5)
    await page.getByRole('button', { name: /Review/ }).click()
    await expect(page.locator('.preview-version')).toHaveCount(2)
    await expect(page.locator('.preview-history')).toContainText('Approved Export')
    await page.getByRole('button', { name: 'Delete V1' }).click()
    await expect(page.locator('.preview-version')).toHaveCount(1)
    await Promise.all(clips.map((path) => access(path)))
    await access(musicOne)
    await access(musicTwo)
    await access(outputPath)
    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByRole('button', { name: 'Approve & Export' })).toBeVisible()
    await page.screenshot({ path: '/tmp/autocut-studio-phase-four-compact.png', fullPage: true })
  } finally {
    await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
