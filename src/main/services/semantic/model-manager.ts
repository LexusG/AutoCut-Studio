import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SemanticModelStatus } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { downloadManagedModelFile } from '../models/managed-model-downloader'

const MODEL = 'Xenova/all-MiniLM-L6-v2' as const
const MODEL_VERSION = 'main-q8'
const APPROXIMATE_BYTES = 24_000_000
const FILES = [
  'config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.txt',
  'onnx/model_quantized.onnx'
] as const

let progress: number | null = null
let active = false

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export function semanticModelDirectory(): string {
  return join(applicationStoragePaths().models, 'semantic', 'all-MiniLM-L6-v2')
}

async function installed(): Promise<boolean> {
  return (await Promise.all(FILES.map((file) => exists(join(semanticModelDirectory(), file))))).every(Boolean)
}

export async function getSemanticModelStatus(): Promise<SemanticModelStatus> {
  return {
    state: progress != null ? 'loading' : await installed() ? 'ready' : 'not-installed',
    provider: 'minilm-transformers-js',
    model: MODEL,
    modelVersion: MODEL_VERSION,
    approximateBytes: APPROXIMATE_BYTES,
    path: semanticModelDirectory(),
    downloadProgress: progress,
    active,
    detail: 'English sentence embeddings; CPU inference through ONNX Runtime.'
  }
}

export async function installSemanticModel(onProgress?: (percent: number) => void): Promise<SemanticModelStatus> {
  if (progress != null) throw new Error('The semantic model is already downloading.')
  if (await installed()) return getSemanticModelStatus()
  progress = 0
  try {
    for (let index = 0; index < FILES.length; index += 1) {
      const file = FILES[index]
      const destination = join(semanticModelDirectory(), file)
      if (await exists(destination)) continue
      await downloadManagedModelFile(
        `https://huggingface.co/${MODEL}/resolve/main/${file}?download=true`,
        destination,
        file.endsWith('.onnx') ? 22_972_370 : 750_000,
        (received, total) => {
        progress = ((index + Math.min(1, received / total)) / FILES.length) * 100
        onProgress?.(progress)
        }
      )
    }
    progress = 100
    onProgress?.(100)
    progress = null
    return getSemanticModelStatus()
  } finally {
    progress = null
  }
}

export async function removeSemanticModel(): Promise<void> {
  if (active) throw new Error('The semantic model is currently in use.')
  await rm(semanticModelDirectory(), { recursive: true, force: true })
}

export function markSemanticModelActive(value: boolean): void {
  active = value
}
