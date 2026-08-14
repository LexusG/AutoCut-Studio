import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

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

async function createPersonVideo(path: string, portrait: boolean, frequency: number): Promise<void> {
  const image = join(process.cwd(), 'e2e', 'fixtures', 'two-people-studio.png')
  const size = portrait ? '270:480' : '480:270'
  const zoomSize = portrait ? '270x480' : '480x270'
  const crop = portrait ? 'crop=270:480:195:0' : 'crop=480:270'
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-i', image,
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000`,
    '-vf', `scale=${size}:force_original_aspect_ratio=increase,${crop},zoompan=z='min(zoom+0.0005,1.05)':d=180:s=${zoomSize}:fps=30`,
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', path
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

test('completes the realistic Phase 5 ML, audio, and persistent-preview workflow', async () => {
  test.setTimeout(420_000)
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-phase5-smoke-'))
  const clips = [
    join(fixtureDirectory, 'people-landscape.mp4'),
    join(fixtureDirectory, 'people-portrait.mp4'),
    join(fixtureDirectory, 'square-audio.mp4'),
    join(fixtureDirectory, 'dark-landscape.mp4'),
    join(fixtureDirectory, 'portrait-pattern.mp4')
  ]
  const musicOne = join(fixtureDirectory, 'music-one.wav')
  const musicTwo = join(fixtureDirectory, 'music-two.wav')
  const outputPath = join(fixtureDirectory, 'phase5-output.mp4')
  const projectPath = join(fixtureDirectory, 'phase5-smoke.autocut.json')
  const userDataPath = join(fixtureDirectory, 'user-data')

  await Promise.all([
    createPersonVideo(clips[0], false, 440),
    createPersonVideo(clips[1], true, 554),
    createVideo(clips[2], 'smptebars=size=360x360:rate=30', true, 660),
    createVideo(clips[3], 'color=c=0x111318:size=480x270:rate=30', false),
    createVideo(clips[4], 'rgbtestsrc=size=270x480:rate=24', false),
    createMusic(musicOne, 523),
    createMusic(musicTwo, 784)
  ])

  const launchEnvironment = { ...process.env }
  delete launchEnvironment.ELECTRON_RUN_AS_NODE
  let electronApp: ElectronApplication | null = await electron.launch({
    args: ['.', `--user-data-dir=${userDataPath}`],
    env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })

  try {
    let page = await electronApp.firstWindow()
    await expect(page.getByRole('heading', { name: 'AutoCut Studio' })).toBeVisible()
    await page.getByRole('button', { name: 'New Project' }).click()
    await page.getByLabel('Project name').fill('Phase 5 Smart Smoke')

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
    await page.getByText('Advanced Smart Settings').click()
    await page.getByLabel('Prefer People').check()
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
    await page.getByLabel('Final mix normalization').selectOption('accurate')
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
        personAnalysis: { provider: string; modelVersion: string }
        audio: { normalizationMode: string; finalMixNormalizationMode: string; soundtrack: { tracks: Array<{ path: string; volume: number }> } }
      }
    }
    expect(savedBeforeRender).toMatchObject({
      version: 4,
      settings: {
        output: { fitBackground: 'blurred', width: 360, height: 640 },
        editing: { selectionMode: 'smart', analysisQuality: 'fast' },
        personAnalysis: { provider: 'mediapipe-pose-lite' },
        audio: { normalizationMode: 'accurate', finalMixNormalizationMode: 'accurate' }
      }
    })
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.path)).toEqual([musicOne, musicTwo])
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.volume)).toEqual([60, 45])

    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await page.getByRole('button', { name: 'Back to Edit' }).first().click()
    await page.getByText('Advanced Smart Settings').click()
    await expect(page.locator('.model-status')).toContainText('Active - MediaPipe Pose Lite')
    await page.getByRole('button', { name: /Review/ }).click()
    await expect(page.getByRole('heading', { name: 'Phase 5 Smart Smoke' })).toBeVisible()
    await expect(page.locator('.final-preview-video')).toHaveAttribute('src', /^autocut-media:/)
    await expect(page.locator('.review-metadata')).toContainText('360 x 640')
    await expect(page.locator('.review-metadata')).toContainText('Smart')
    await expect(page.locator('.review-metadata')).toContainText('2 tracks')
    await expect(page.locator('.edit-plan-list > div')).toHaveCount(5)
    await expect(page.locator('.selection-reasons')).toHaveCount(5)
    await expect(page.locator('.preview-version')).toHaveCount(1)
    await expect(page.locator('.preview-version')).toContainText('V1')
    await page.getByRole('button', { name: 'Pin V1' }).click()
    const firstPreviewUrl = await page.locator('.final-preview-video').getAttribute('src')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-five-review.png', fullPage: true })

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
    const loudness = await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats', '-i', outputPath,
      '-af', 'loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json',
      '-f', 'null', '-'
    ])
    const loudnessBlock = [...loudness.stderr.matchAll(/\{[\s\S]*?"target_offset"[\s\S]*?\}/g)].at(-1)?.[0]
    expect(loudnessBlock).toBeTruthy()
    const measuredLoudness = JSON.parse(loudnessBlock!) as { input_i: string; input_tp: string }
    expect(Number(measuredLoudness.input_i)).toBeGreaterThan(-17)
    expect(Number(measuredLoudness.input_i)).toBeLessThan(-15)
    expect(Number(measuredLoudness.input_tp)).toBeLessThanOrEqual(-1)

    await page.getByRole('button', { name: 'Back to Project' }).click()
    await page.getByRole('button', { name: 'Save Project' }).click()
    await expect(page.locator('.project-feedback')).toContainText('Project saved')
    const savedAfterExport = JSON.parse(await readFile(projectPath, 'utf8')) as {
      previewHistory: Array<{
        approved: boolean
        pinned: boolean
        storage: { relativePath: string; state: string }
        artifact: { outputPath: string; logPath: string; plan: { selectionSeed: number; segments: Array<{ selectedCandidate?: { personAnalysis?: { detected: boolean } } }> } }
      }>
    }
    expect(savedAfterExport.previewHistory).toHaveLength(2)
    expect(savedAfterExport.previewHistory[0].approved).toBe(true)
    expect(savedAfterExport.previewHistory[1].pinned).toBe(true)
    expect(savedAfterExport.previewHistory[0].artifact.plan.segments).toHaveLength(5)
    expect(savedAfterExport.previewHistory[0].artifact.plan.selectionSeed).toBe(1)
    expect(savedAfterExport.previewHistory[0].artifact.outputPath).toBe('')
    expect(savedAfterExport.previewHistory[0].storage.state).toBe('available')
    const persistentPreviewRoot = join(userDataPath, 'storage', savedAfterExport.previewHistory[0].storage.relativePath)
    await access(join(persistentPreviewRoot, 'preview.mp4'))
    await access(join(persistentPreviewRoot, 'thumbnail.jpg'))
    await access(join(persistentPreviewRoot, 'metadata.json'))
    const renderLog = await readFile(join(persistentPreviewRoot, 'render.log'), 'utf8')
    expect(renderLog).toContain('"stage":"smart-selection"')
    expect(renderLog).toContain('"cache":"hit"')
    expect(renderLog).toContain('"stage":"soundtrack-plan"')
    expect(renderLog).toContain('"stage":"accurate-loudness-measurement"')
    expect(renderLog).toContain('"stage":"mux-final-audio"')
    const peopleSelections = savedAfterExport.previewHistory[0].artifact.plan.segments.filter(
      (segment) => segment.selectedCandidate?.personAnalysis?.detected
    )
    expect(peopleSelections.length).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await electronApp.close()
    electronApp = await electron.launch({
      args: ['.', `--user-data-dir=${userDataPath}`],
      env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    })
    page = await electronApp.firstWindow()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 5 Smart Smoke' }).first().click()
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
    await page.screenshot({ path: '/tmp/autocut-studio-phase-five-compact.png', fullPage: true })
  } finally {
    if (electronApp) await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
