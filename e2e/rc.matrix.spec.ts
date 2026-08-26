import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const execFileAsync = promisify(execFile)
const executable = process.env.AUTOCUT_RC_EXECUTABLE ?? ''
const matrixDir = process.env.AUTOCUT_RC_MATRIX ?? ''
const packagedFfprobe = process.env.AUTOCUT_RC_FFPROBE ?? ''

async function probeSize(path: string): Promise<{ width: number; height: number; hasAudio: boolean }> {
  const { stdout } = await execFileAsync(packagedFfprobe, [
    '-v', 'error', '-print_format', 'json', '-show_streams', path
  ])
  const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }> }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === 'audio') ?? false
  }
}

function environment(): Record<string, string> {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  env.http_proxy = 'http://127.0.0.1:9'
  env.https_proxy = 'http://127.0.0.1:9'
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${userData}`], env: environment() })
  return { app, page: await app.firstWindow() }
}

test.describe('release candidate matrices', () => {
  test.skip(!executable || !matrixDir || !packagedFfprobe, 'Set AUTOCUT_RC_* for the packaged matrix run.')

  test('imports every supported container and rejects a corrupt file without crashing', async () => {
    test.setTimeout(900_000)
    const directory = await mkdtemp(join(tmpdir(), 'autocut-rc-matrix-'))
    const { app, page } = await launch(join(directory, 'user-data'))

    // Deliberately includes a corrupt file: the application must report it, keep the
    // readable clips, and stay alive.
    const supported = [
      'h264.mp4', 'hevc.mp4', 'movie.mov', 'movie.mkv', 'movie.webm', 'movie.m4v',
      'portrait.mp4', 'fps24.mp4', 'fps60.mp4', 'noaudio.mp4', 'odd.mp4', 'rotated.mp4', 'veryshort.mp4'
    ].map((name) => join(matrixDir, name))
    const corrupt = join(matrixDir, 'corrupt.mp4')

    try {
      await page.getByRole('button', { name: 'New Project' }).click()
      await app.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
      }, [...supported, corrupt])
      await page.getByRole('button', { name: 'Browse files' }).click()

      await expect(page.locator('.clip-card')).toHaveCount(supported.length, { timeout: 300_000 })
      console.log(`[RC] imported ${supported.length} of ${supported.length + 1} files; corrupt file excluded`)

      // The failure must be surfaced, not silently swallowed.
      await expect(page.locator('.import-errors')).toBeVisible({ timeout: 30_000 })
      const failureText = await page.locator('.import-errors').textContent()
      console.log(`[RC] import failure surfaced: ${failureText?.replace(/\s+/g, ' ').trim().slice(0, 160)}`)

      // Still responsive after the failure.
      await expect(page.getByRole('button', { name: 'Create Edit Plan' })).toBeEnabled({ timeout: 30_000 })
      console.log('[RC] application remained usable after a corrupt import')
    } finally {
      await app.close().catch(() => undefined)
    }
  })

  const presets: Array<{ platform: string; option: RegExp; width: number; height: number }> = [
    { platform: 'Instagram', option: /Feed Portrait/, width: 1080, height: 1350 },
    { platform: 'Instagram', option: /Feed Square/, width: 1080, height: 1080 },
    { platform: 'YouTube', option: /Standard/, width: 1920, height: 1080 }
  ]

  for (const preset of presets) {
    test(`exports ${preset.platform} ${preset.width}x${preset.height} at the exact preset resolution`, async () => {
      test.setTimeout(900_000)
      const directory = await mkdtemp(join(tmpdir(), 'autocut-rc-preset-'))
      const exportPath = join(directory, 'preset-export.mp4')
      const { app, page } = await launch(join(directory, 'user-data'))

      try {
        await page.getByRole('button', { name: 'New Project' }).click()
        await app.evaluate(({ dialog }, paths) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths, bookmarks: [] })
        }, [join(matrixDir, 'h264.mp4'), join(matrixDir, 'fps24.mp4')])
        await page.getByRole('button', { name: 'Browse files' }).click()
        await expect(page.locator('.clip-card')).toHaveCount(2, { timeout: 120_000 })

        await page.getByRole('tab', { name: preset.platform }).click()
        await page.getByRole('option', { name: preset.option }).click()

        await page.getByRole('button', { name: 'Create Edit Plan' }).click()
        const planPanel = page.getByLabel('Edit Plan', { exact: true })
        await expect(planPanel).toBeVisible({ timeout: 600_000 })
        const generate = planPanel.getByRole('button', { name: 'Generate Preview' })
        await expect(generate).toBeEnabled({ timeout: 600_000 })
        await generate.click()
        await expect(page.getByRole('heading', { name: 'Preview ready' })).toBeVisible({ timeout: 600_000 })
        await page.getByRole('button', { name: 'Review Preview' }).click()

        await app.evaluate(({ dialog }, path) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
        }, exportPath)
        await page.getByRole('button', { name: 'Approve & Export' }).click()
        await expect(page.getByRole('heading', { name: 'Export complete' })).toBeVisible({ timeout: 900_000 })

        const exported = await probeSize(exportPath)
        expect(exported.width).toBe(preset.width)
        expect(exported.height).toBe(preset.height)
        const bytes = (await stat(exportPath)).size
        expect(bytes).toBeGreaterThan(10_000)
        console.log(`[RC] ${preset.platform} export verified ${exported.width}x${exported.height} audio=${exported.hasAudio} ${bytes} bytes`)
      } finally {
        await app.close().catch(() => undefined)
      }
    })
  }
})
