import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  TranscriptionLanguage,
  TranscriptionModelInfo,
  TranscriptionQuality,
  TranscriptionStatus
} from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'

const MODEL_SPECS = {
  tiny: { bytes: 75_000_000, purpose: 'Fast multilingual transcription' },
  'tiny.en': { bytes: 75_000_000, purpose: 'Fast English transcription' },
  base: { bytes: 142_000_000, purpose: 'Balanced multilingual transcription' },
  'base.en': { bytes: 142_000_000, purpose: 'Balanced English transcription' },
  small: { bytes: 466_000_000, purpose: 'Accurate multilingual transcription' },
  'small.en': { bytes: 466_000_000, purpose: 'Accurate English transcription' }
} as const

const activeModels = new Set<string>()
const downloadProgress = new Map<string, number>()

export function modelName(quality: TranscriptionQuality, language: TranscriptionLanguage): string {
  const base = quality === 'fast' ? 'tiny' : quality === 'accurate' ? 'small' : 'base'
  return language === 'english' ? `${base}.en` : base
}

export function whisperModelsDirectory(): string {
  return join(applicationStoragePaths().models, 'whisper')
}

export function whisperModelPath(name: string): string {
  return join(whisperModelsDirectory(), name, `ggml-${name}.bin`)
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export async function findWhisperExecutable(): Promise<string | null> {
  const candidates = [
    process.env.AUTOCUT_WHISPER_CPP,
    app.isPackaged ? join(process.resourcesPath, 'resources', 'whisper.cpp', 'whisper-cli') : null,
    join(app.getAppPath(), 'resources', 'whisper.cpp', 'whisper-cli'),
    '/usr/local/bin/whisper-cli',
    '/usr/bin/whisper-cli'
  ].filter((value): value is string => Boolean(value))
  for (const path of candidates) if (await exists(path)) return path
  return null
}

async function infoFor(name: keyof typeof MODEL_SPECS): Promise<TranscriptionModelInfo> {
  const path = whisperModelPath(name)
  const quality: TranscriptionQuality = name.startsWith('tiny') ? 'fast' : name.startsWith('small') ? 'accurate' : 'balanced'
  return {
    quality,
    language: name.endsWith('.en') ? 'english' : 'multilingual',
    model: name,
    filename: `ggml-${name}.bin`,
    approximateBytes: MODEL_SPECS[name].bytes,
    purpose: MODEL_SPECS[name].purpose,
    state: downloadProgress.has(name) ? 'loading' : await exists(path) ? 'ready' : 'not-installed',
    path,
    downloadProgress: downloadProgress.get(name) ?? null,
    active: activeModels.has(name)
  }
}

export async function getTranscriptionStatus(): Promise<TranscriptionStatus> {
  const executablePath = await findWhisperExecutable()
  const models = await Promise.all((Object.keys(MODEL_SPECS) as Array<keyof typeof MODEL_SPECS>).map(infoFor))
  return {
    provider: 'whisper.cpp',
    providerState: executablePath ? 'ready' : 'unavailable',
    executablePath,
    modelsDirectory: whisperModelsDirectory(),
    models
  }
}

export async function installTranscriptionModel(
  name: string,
  onProgress?: (percent: number) => void
): Promise<TranscriptionModelInfo> {
  if (!(name in MODEL_SPECS)) throw new Error('That transcription model is not supported.')
  if (downloadProgress.has(name)) throw new Error('That model is already downloading.')
  const destination = whisperModelPath(name)
  if (await exists(destination)) return infoFor(name as keyof typeof MODEL_SPECS)
  const temporary = `${destination}.download`
  await mkdir(dirname(destination), { recursive: true })
  downloadProgress.set(name, 0)
  try {
    const response = await fetch(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin?download=true`)
    if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}.`)
    const total = Number(response.headers.get('content-length')) || MODEL_SPECS[name as keyof typeof MODEL_SPECS].bytes
    let received = 0
    const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
    source.on('data', (chunk: Buffer) => {
      received += chunk.byteLength
      const percent = Math.min(99.9, received / total * 100)
      downloadProgress.set(name, percent)
      onProgress?.(percent)
    })
    await pipeline(source, createWriteStream(temporary, { flags: 'wx' }))
    const downloaded = await stat(temporary)
    if (downloaded.size < 1_000_000) throw new Error('The downloaded model file is incomplete.')
    await rename(temporary, destination)
    onProgress?.(100)
    return infoFor(name as keyof typeof MODEL_SPECS)
  } finally {
    downloadProgress.delete(name)
    await rm(temporary, { force: true })
  }
}

export async function removeTranscriptionModel(name: string): Promise<void> {
  if (!(name in MODEL_SPECS)) throw new Error('That transcription model is not supported.')
  if (activeModels.has(name)) throw new Error('This model is currently being used for transcription.')
  await rm(dirname(whisperModelPath(name)), { recursive: true, force: true })
}

export function markModelActive(name: string, active: boolean): void {
  if (active) activeModels.add(name)
  else activeModels.delete(name)
}
