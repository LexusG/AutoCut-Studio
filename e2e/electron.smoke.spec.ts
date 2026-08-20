import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
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
    '-i', `aevalsrc=0.65*sin(2*PI*${frequency}*t)*lt(mod(t\\,0.5)\\,0.045):s=48000`,
    '-t', '4', '-c:a', 'pcm_s16le', '-y', path
  ])
}

async function createSpeechVideo(path: string, source: string, text: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', source,
    '-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`,
    '-map', '0:v:0', '-map', '1:a:0', '-af', 'apad=pad_dur=6,atrim=0:6',
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-y', path
  ])
}

async function createPersonSpeechVideo(path: string, portrait: boolean, text: string): Promise<void> {
  const image = join(process.cwd(), 'e2e', 'fixtures', 'two-people-studio.png')
  const size = portrait ? '270:480' : '480:270'
  const crop = portrait ? 'crop=270:480:195:0' : 'crop=480:270'
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-loop', '1', '-i', image,
    '-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`,
    '-map', '0:v:0', '-map', '1:a:0', '-vf', `scale=${size}:force_original_aspect_ratio=increase,${crop}`,
    '-af', 'apad=pad_dur=6,atrim=0:6', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', path
  ])
}

async function createPausedSpeechVideo(path: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30',
    '-f', 'lavfi', '-i', "flite=text='First phrase':voice=slt",
    '-f', 'lavfi', '-i', "flite=text='uh second phrase':voice=slt",
    '-filter_complex', '[1:a]apad=pad_dur=1.4,atrim=0:2.2[a1];[2:a]atrim=0:2.5[a2];[a1][a2]concat=n=2:v=0:a=1,apad=pad_dur=6,atrim=0:6[a]',
    '-map', '0:v:0', '-map', '[a]', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', path
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

test('completes the realistic Phase 6 content-aware and manual Edit Plan workflow', async () => {
  test.setTimeout(420_000)
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-phase6-smoke-'))
  const clips = [
    join(fixtureDirectory, 'people-landscape.mp4'),
    join(fixtureDirectory, 'people-portrait.mp4'),
    join(fixtureDirectory, 'speech-landscape.mp4'),
    join(fixtureDirectory, 'dark-landscape.mp4'),
    join(fixtureDirectory, 'portrait-pattern.mp4'),
    join(fixtureDirectory, 'speech-portrait.mp4'),
    join(fixtureDirectory, 'speech-square.mp4'),
    join(fixtureDirectory, 'motion-landscape.mp4')
  ]
  const musicOne = join(fixtureDirectory, 'music-one.wav')
  const musicTwo = join(fixtureDirectory, 'music-two.wav')
  const outputPath = join(fixtureDirectory, 'phase6-output.mp4')
  const projectPath = join(fixtureDirectory, 'phase6-smoke.autocut.json')
  const userDataPath = join(fixtureDirectory, 'user-data')

  await Promise.all([
    createPersonVideo(clips[0], false, 440),
    createPersonVideo(clips[1], true, 554),
    createSpeechVideo(clips[2], 'smptebars=size=480x270:rate=30', 'Yesterday I went to the store. Then I came home.'),
    createVideo(clips[3], 'color=c=0x111318:size=480x270:rate=30', false),
    createVideo(clips[4], 'rgbtestsrc=size=270x480:rate=24', false),
    createSpeechVideo(clips[5], 'testsrc2=size=270x480:rate=30', 'This is the second spoken clip. It has a useful pause.'),
    createSpeechVideo(clips[6], 'smptebars=size=360x360:rate=30', 'A third voice sample helps verify speech aware editing.'),
    createVideo(clips[7], 'testsrc2=size=480x270:rate=30', true, 880),
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
    await page.getByLabel('Project name').fill('Phase 6 Content Smoke')

    await electronApp.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
    }, clips)
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(8, { timeout: 30_000 })
    await expect(page.locator('.clip-card').nth(1)).toContainText('270x480')
    await expect(page.locator('.clip-card').nth(6)).toContainText('360x360')

    await page.getByRole('tab', { name: 'Instagram' }).click()
    await expect(page.locator('.preset-summary')).toContainText('Instagram Reel')
    await page.getByLabel('Output width').fill('360')
    await page.getByLabel('Output height').fill('640')
    await page.getByLabel('Fit mode').selectOption('crop')
    await page.getByLabel('Selection mode').selectOption('smart')
    await expect(page.getByLabel('Crop focus')).toHaveValue('smart-subject')
    await page.getByLabel('Analysis quality').selectOption('fast')
    await page.getByText('Advanced Smart Settings').click()
    await page.getByLabel('Prefer People').check()
    await page.getByLabel('Prefer Spoken Moments').check()
    await page.getByLabel('Content awareness').selectOption('balanced')
    await page.getByLabel('Speech cut protection').selectOption('normal')
    await page.getByLabel('Cut sync').selectOption('beat-assisted')
    await page.getByLabel('Editing pace').selectOption('fast')
    await expect(page.getByLabel('Use Every Clip')).toBeChecked()
    await page.getByLabel('Target duration').selectOption('custom')
    await page.getByLabel('Custom target duration').fill('16')
    await page.getByLabel('Transition preference').selectOption('crossfade')
    await page.getByLabel('Transition duration').selectOption('0.25')
    await page.getByLabel('Output quality').selectOption('draft')
    const outputFilename = page.getByLabel('Output filename')
    await outputFilename.click()
    await outputFilename.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await outputFilename.pressSequentially('Phase 6 Typed Output')
    await expect(outputFilename).toHaveValue('Phase 6 Typed Output')
    await outputFilename.press('Enter')
    await expect(outputFilename).toHaveValue('Phase 6 Typed Output.mp4')

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
      version: 7,
      settings: {
        output: { width: 360, height: 640 },
        editing: { selectionMode: 'smart', analysisQuality: 'fast' },
        personAnalysis: { provider: 'mediapipe-pose-lite' },
        audio: { normalizationMode: 'accurate', finalMixNormalizationMode: 'accurate' }
      }
    })
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.path)).toEqual([musicOne, musicTwo])
    expect(savedBeforeRender.settings.audio.soundtrack.tracks.map((track) => track.volume)).toEqual([60, 45])

    await page.getByRole('button', { name: 'Create Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 180_000 })
    const planItems = page.locator('.edit-plan-item')
    await expect(planItems).toHaveCount(8)
    await expect(page.getByText('Revision 1')).toBeVisible()

    await planItems.nth(0).getByRole('button', { name: 'Adjust' }).click()
    const startInput = planItems.nth(0).locator('.trim-time-fields input').nth(0)
    const originalStart = Number(await startInput.inputValue())
    await startInput.fill((originalStart + 0.1).toFixed(2))
    await planItems.nth(0).getByRole('button', { name: 'Apply Range' }).click()
    await planItems.nth(0).getByRole('button', { name: 'Lock', exact: true }).click()
    await planItems.nth(1).getByRole('button', { name: 'Lock', exact: true }).click()
    await planItems.nth(2).getByRole('button', { name: 'Try Another' }).click()
    const lockedRange = await planItems.nth(0).locator('.plan-copy span').textContent()
    await page.getByRole('button', { name: 'Regenerate Unlocked' }).click()
    await expect(page.getByText('Revision 6')).toBeVisible({ timeout: 180_000 })
    await expect(planItems.nth(0).locator('.plan-copy span')).toHaveText(lockedRange ?? '')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-six-edit-plan.png', fullPage: true })
    await page.getByLabel('Edit Plan', { exact: true }).getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await page.getByRole('button', { name: 'Back to Edit' }).first().click()
    await page.getByText('Advanced Smart Settings').click()
    await expect(page.locator('.model-status').filter({ hasText: 'Person Detection' })).toContainText('Active - MediaPipe Pose Lite')
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await expect(page.getByRole('heading', { name: 'Phase 6 Content Smoke' })).toBeVisible()
    await expect(page.locator('.final-preview-video')).toHaveAttribute('src', /^autocut-media:/)
    await expect(page.locator('.review-metadata')).toContainText('360 x 640')
    await expect(page.locator('.review-metadata')).toContainText('Smart')
    await expect(page.locator('.review-metadata')).toContainText('2 tracks')
    await expect(page.locator('.edit-plan-list > div')).toHaveCount(8)
    await expect(page.locator('.selection-reasons')).toHaveCount(8)
    await expect(page.locator('.preview-version')).toHaveCount(1)
    await expect(page.locator('.preview-version')).toContainText('V1')
    await page.getByRole('button', { name: 'Pin V1' }).click()
    const firstPreviewUrl = await page.locator('.final-preview-video').getAttribute('src')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-six-review.png', fullPage: true })

    await page.getByRole('button', { name: 'Regenerate' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 180_000 })
    await page.getByLabel('Edit Plan', { exact: true }).getByRole('button', { name: 'Generate Preview' }).click()
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
    expect(Number(probe.format.duration)).toBeGreaterThan(15.5)
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
        artifact: {
          outputPath: string
          logPath: string
          plan: {
            selectionSeed: number
            beatAnalysis: { beats: Array<{ timestamp: number }> } | null
            segments: Array<{
              locked: boolean
              selectionSource: string
              cropPlan: { track: { fallback: boolean } } | null
              selectedCandidate?: {
                personAnalysis?: { detected: boolean }
                speechAnalysis?: { speechRegions: Array<{ startTime: number; endTime: number }> }
              }
            }>
          }
        }
      }>
    }
    expect(savedAfterExport.previewHistory).toHaveLength(2)
    expect(savedAfterExport.previewHistory[0].approved).toBe(true)
    expect(savedAfterExport.previewHistory[1].pinned).toBe(true)
    expect(savedAfterExport.previewHistory[0].artifact.plan.segments).toHaveLength(8)
    expect(savedAfterExport.previewHistory[0].artifact.plan.selectionSeed).toBe(2)
    expect(savedAfterExport.previewHistory[0].artifact.plan.beatAnalysis?.beats.length).toBeGreaterThan(4)
    expect(savedAfterExport.previewHistory[0].artifact.outputPath).toBe('')
    expect(savedAfterExport.previewHistory[0].storage.state).toBe('available')
    const persistentPreviewRoot = join(userDataPath, 'storage', savedAfterExport.previewHistory[0].storage.relativePath)
    await access(join(persistentPreviewRoot, 'preview.mp4'))
    await access(join(persistentPreviewRoot, 'thumbnail.jpg'))
    await access(join(persistentPreviewRoot, 'metadata.json'))
    const renderLog = await readFile(join(persistentPreviewRoot, 'render.log'), 'utf8')
    expect(renderLog).toContain('"stage":"soundtrack-plan"')
    expect(renderLog).toContain('"stage":"accurate-loudness-measurement"')
    expect(renderLog).toContain('"stage":"mux-final-audio"')
    const peopleSelections = savedAfterExport.previewHistory[0].artifact.plan.segments.filter(
      (segment) => segment.selectedCandidate?.personAnalysis?.detected
    )
    expect(peopleSelections.length).toBeGreaterThanOrEqual(2)
    const finalSegments = savedAfterExport.previewHistory[0].artifact.plan.segments
    expect(finalSegments.filter((segment) => segment.locked)).toHaveLength(2)
    expect(finalSegments.some((segment) => segment.selectionSource === 'manual')).toBe(true)
    expect(finalSegments.filter((segment) => segment.selectedCandidate?.speechAnalysis?.speechRegions.length)).toHaveLength(6)
    expect(finalSegments.filter((segment) => segment.cropPlan && !segment.cropPlan.track.fallback).length).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await electronApp.close()
    electronApp = await electron.launch({
      args: ['.', `--user-data-dir=${userDataPath}`],
      env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    })
    page = await electronApp.firstWindow()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 6 Content Smoke' }).first().click()
    await expect(page.locator('.clip-card')).toHaveCount(8, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Review Preview' }).click()
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
    await page.screenshot({ path: '/tmp/autocut-studio-phase-six-compact.png', fullPage: true })
  } finally {
    if (electronApp) await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})

test('completes the Phase 7 local transcript caption and text editing workflow', async () => {
  test.setTimeout(600_000)
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'autocut-phase7-smoke-'))
  const clips = [
    join(fixtureDirectory, 'people-speech-landscape.mp4'),
    join(fixtureDirectory, 'people-speech-portrait.mp4'),
    join(fixtureDirectory, 'paused-speech.mp4'),
    join(fixtureDirectory, 'silent-portrait.mp4'),
    join(fixtureDirectory, 'music-square.mp4')
  ]
  const music = join(fixtureDirectory, 'beat.wav')
  const outputPath = join(fixtureDirectory, 'phase7-captioned.mp4')
  const subtitlePath = join(fixtureDirectory, 'phase7-captioned.srt')
  const projectPath = join(fixtureDirectory, 'phase7-smoke.autocut.json')
  const userDataPath = join(fixtureDirectory, 'user-data')
  const sourceModel = '/home/hell/.config/autocut-studio/storage/models/whisper/base.en/ggml-base.en.bin'
  const managedModelDirectory = join(userDataPath, 'storage', 'models', 'whisper', 'base.en')

  await Promise.all([
    createPersonSpeechVideo(clips[0], false, 'Welcome to Auto Cut Studio. Today we create readable captions.'),
    createPersonSpeechVideo(clips[1], true, 'This second spoken clip shows people in a portrait video.'),
    createPausedSpeechVideo(clips[2]),
    createVideo(clips[3], 'testsrc2=size=270x480:rate=30', false),
    createVideo(clips[4], 'rgbtestsrc=size=360x360:rate=30', true, 660),
    createMusic(music, 620)
  ])
  await mkdir(managedModelDirectory, { recursive: true })
  await symlink(sourceModel, join(managedModelDirectory, 'ggml-base.en.bin'))

  const launchEnvironment = { ...process.env }
  delete launchEnvironment.ELECTRON_RUN_AS_NODE
  let electronApp: ElectronApplication | null = await electron.launch({
    args: ['.', `--user-data-dir=${userDataPath}`],
    env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })

  try {
    let page = await electronApp.firstWindow()
    await page.getByRole('button', { name: 'New Project' }).click()
    await page.getByLabel('Project name').fill('Phase 7 Caption Smoke')
    await electronApp.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
    }, clips)
    await page.getByRole('button', { name: 'Browse files' }).click()
    await expect(page.locator('.clip-card')).toHaveCount(5, { timeout: 30_000 })
    await page.getByRole('tab', { name: 'Instagram' }).click()
    await page.getByLabel('Output width').fill('360')
    await page.getByLabel('Output height').fill('640')
    await page.getByLabel('Selection mode').selectOption('smart')
    await page.getByLabel('Analysis quality').selectOption('fast')
    await page.getByText('Advanced Smart Settings').click()
    await page.getByLabel('Prefer People').check()
    await page.getByLabel('Prefer Spoken Moments').check()
    await page.getByLabel('Speech cut protection').selectOption('normal')
    await page.getByLabel('Cut sync').selectOption('beat-assisted')
    await page.getByLabel('Editing pace').selectOption('fast')
    await page.getByLabel('Output quality').selectOption('draft')

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath], bookmarks: [] })
    }, music)
    await page.getByRole('button', { name: 'Browse audio' }).click()
    await page.getByRole('button', { name: 'Create Edit Plan' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Plan', exact: true })).toBeVisible({ timeout: 180_000 })
    await expect(page.locator('.edit-plan-item')).toHaveCount(5)
    await page.getByRole('button', { name: 'Close Edit Plan' }).click()

    await page.getByRole('button', { name: 'Transcript' }).click()
    await expect(page.getByRole('heading', { name: 'Transcript', exact: true })).toBeVisible()
    const transcriptionModel = page.locator('.transcription-controls .model-status')
    await expect(transcriptionModel).toContainText('Balanced - base.en')
    await expect(transcriptionModel).toContainText('Ready')
    await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
    await expect(page.locator('.transcript-document')).toHaveCount(5, { timeout: 180_000 })
    await expect(page.getByText('No speech detected').first()).toBeVisible()
    await expect(page.locator('.transcript-word').first()).toBeVisible()

    const firstWord = page.locator('.transcript-document').first().locator('.transcript-word').first()
    await firstWord.click()
    await page.getByRole('button', { name: 'Correct Word' }).click()
    const correction = page.locator('.transcript-word-input').first()
    await correction.fill('AutoCut')
    await correction.press('Enter')
    await expect(page.locator('.transcript-document').first()).toContainText('AutoCut')
    await page.getByRole('button', { name: 'Review Fillers' }).nth(2).click()

    const editableWords = page.locator('.transcript-document').first().locator('.transcript-word')
    await editableWords.nth(3).click()
    await editableWords.nth(4).click({ modifiers: ['Shift'] })
    await page.getByRole('button', { name: 'Remove From Edit' }).click()
    await expect(page.getByText('Removed Ranges')).toBeVisible()
    await expect(page.locator('.pause-list button').first()).toBeVisible()
    await page.locator('.pause-list button').first().click()

    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    await page.getByText('Caption Configuration').waitFor()
    const captionSelects = page.locator('.caption-controls select')
    await captionSelects.nth(0).selectOption('dynamic')
    await captionSelects.nth(1).selectOption('burned-in-and-file')
    await captionSelects.nth(2).selectOption('highlight')
    await captionSelects.nth(6).selectOption('instagram-reel')
    await page.getByLabel('Safe Area Overlay').check()
    await page.getByRole('button', { name: 'Generate Captions' }).click()
    await expect(page.locator('.caption-inspector-item').first()).toBeVisible()
    await expect(page.locator('.caption-ready')).toContainText('Preview ready')
    await expect(page.locator('.safe-area-overlay')).toBeVisible()
    await page.screenshot({ path: '/tmp/autocut-studio-phase-seven-captions.png', fullPage: true })

    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, subtitlePath)
    await page.getByRole('button', { name: 'SRT' }).click()
    await access(subtitlePath)
    expect(await readFile(subtitlePath, 'utf8')).toMatch(/^WEBVTT|^1\n/)

    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await page.getByRole('button', { name: 'Back to Edit' }).first().click()
    await page.getByRole('button', { name: 'Transcript' }).click()
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    const captionText = page.locator('.caption-inspector-item').first().getByLabel('Caption text')
    await captionText.fill('AUTOCUT STUDIO captions ready')
    await page.getByRole('button', { name: 'Close Transcript' }).click()
    await page.getByRole('button', { name: 'Generate Preview' }).click()
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Review Preview' }).click()
    await expect(page.locator('.preview-version')).toHaveCount(2)

    await electronApp.evaluate(({ dialog }, paths) => {
      dialog.showSaveDialog = async (options) => ({
        canceled: false,
        filePath: 'filters' in options && options.filters?.[0]?.extensions?.includes('srt') ? paths.subtitle : paths.video
      })
    }, { video: outputPath, subtitle: subtitlePath })
    await page.getByRole('button', { name: 'Approve & Export' }).click()
    await expect(page.getByRole('heading', { name: 'Export complete' })).toBeVisible({ timeout: 180_000 })
    await page.getByRole('button', { name: 'View Export Summary' }).click()
    expect((await stat(outputPath)).size).toBeGreaterThan(20_000)
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', outputPath
    ])
    const probe = JSON.parse(stdout) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } }
    expect(probe.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', width: 360, height: 640 }),
      expect.objectContaining({ codec_type: 'audio' })
    ]))
    expect(Number(probe.format.duration)).toBeGreaterThan(5)

    await page.getByRole('button', { name: 'Back to Project' }).click()
    await electronApp.evaluate(({ dialog }, selectedPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: selectedPath })
    }, projectPath)
    await page.getByRole('button', { name: 'Save Project' }).click()
    const saved = JSON.parse(await readFile(projectPath, 'utf8')) as {
      version: number
      transcriptReferences: unknown[]
      transcriptCorrections: unknown[]
      textEdits: unknown[]
      editPlan: { captionTrack: { chunks: Array<{ text: string }> }; captionMode: string; transcriptEditRevision: number }
    }
    expect(saved.version).toBe(7)
    expect(saved.transcriptReferences).toHaveLength(5)
    expect(saved.transcriptCorrections).not.toHaveLength(0)
    expect(saved.textEdits.length).toBeGreaterThanOrEqual(1)
    expect(saved.editPlan.captionMode).toBe('dynamic')
    expect(saved.editPlan.captionTrack.chunks[0].text).toBe('AUTOCUT STUDIO captions ready')
    await page.screenshot({ path: '/tmp/autocut-studio-phase-seven-editor.png', fullPage: true })

    await page.getByRole('button', { name: 'Back to Home' }).click()
    await electronApp.close()
    electronApp = await electron.launch({
      args: ['.', `--user-data-dir=${userDataPath}`],
      env: { ...launchEnvironment, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    })
    page = await electronApp.firstWindow()
    await page.locator('.recent-project-open').filter({ hasText: 'Phase 7 Caption Smoke' }).first().click()
    await expect(page.locator('.clip-card')).toHaveCount(5, { timeout: 30_000 })
    await page.getByRole('button', { name: 'Transcript' }).click()
    await expect(page.locator('.transcript-document')).toHaveCount(5)
    await expect(page.locator('.transcript-document').first()).toContainText('AutoCut')
  } finally {
    if (electronApp) await electronApp.close()
    await rm(fixtureDirectory, { recursive: true, force: true })
  }
})
