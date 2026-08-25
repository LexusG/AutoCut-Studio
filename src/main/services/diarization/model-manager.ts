import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { DiarizationModelStatus } from '@shared/types'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { downloadManagedModelFile } from '../models/managed-model-downloader'

const SEGMENTATION = {
  filename: 'segmentation.int8.onnx',
  bytes: 1_540_514,
  sha256: '10a438c2e0d90ed5f5da545cec2244d887315f6dbbbf1d3d564d00745b01952e',
  url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/340b52f1f5cd12d45a30fa284691417eaad2ff92/model.int8.onnx?download=true'
}
const EMBEDDING = {
  filename: 'embedding.onnx',
  bytes: 39_593_761,
  sha256: '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'
}

let progress: number | null = null
let active = false

export function diarizationModelDirectory(): string {
  return join(applicationStoragePaths().models, 'speaker-diarization', 'sherpa-onnx-pyannote-3')
}

export function diarizationModelPaths(): { segmentation: string; embedding: string } {
  return {
    segmentation: join(diarizationModelDirectory(), SEGMENTATION.filename),
    embedding: join(diarizationModelDirectory(), EMBEDDING.filename)
  }
}

async function hash(path: string): Promise<string | null> {
  try {
    const digest = createHash('sha256')
    await pipeline(createReadStream(path), digest)
    return digest.digest('hex')
  } catch { return null }
}

async function installed(): Promise<boolean> {
  const paths = diarizationModelPaths()
  try {
    const [segmentation, embedding] = await Promise.all([stat(paths.segmentation), stat(paths.embedding)])
    return segmentation.size === SEGMENTATION.bytes && embedding.size === EMBEDDING.bytes
  } catch { return false }
}

export async function getDiarizationModelStatus(): Promise<DiarizationModelStatus> {
  const ready = await installed()
  return {
    state: progress != null ? 'loading' : ready ? 'ready' : 'not-installed',
    provider: 'sherpa-onnx', providerVersion: '1.13.6',
    segmentationModel: 'pyannote-segmentation-3.0-int8',
    embeddingModel: '3D-Speaker ERes2Net Base 16k',
    modelVersion: 'pyannote3-eres2net-v1', approximateBytes: SEGMENTATION.bytes + EMBEDDING.bytes,
    path: diarizationModelDirectory(), downloadProgress: progress, active,
    detail: ready ? 'Local anonymous speaker clustering; no identity recognition.' : 'Speaker models are not installed.'
  }
}

export async function installDiarizationModels(onProgress?: (percent: number) => void): Promise<DiarizationModelStatus> {
  if (progress != null) throw new Error('Speaker models are already downloading.')
  if (await installed()) return getDiarizationModelStatus()
  progress = 0
  try {
    const models = [SEGMENTATION, EMBEDDING]
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index]
      const destination = join(diarizationModelDirectory(), model.filename)
      if ((await hash(destination)) === model.sha256) continue
      await rm(destination, { force: true })
      await downloadManagedModelFile(model.url, destination, model.bytes, (received, total) => {
        progress = (index + Math.min(1, received / total)) / models.length * 100
        onProgress?.(progress)
      }, { sha256: model.sha256, resume: true })
    }
    progress = null
    onProgress?.(100)
    return getDiarizationModelStatus()
  } finally { progress = null }
}

export async function removeDiarizationModels(): Promise<void> {
  if (active) throw new Error('Speaker models are currently in use.')
  await rm(diarizationModelDirectory(), { recursive: true, force: true })
}

export function markDiarizationModelsActive(value: boolean): void { active = value }

export async function diarizationModelsReadable(): Promise<boolean> {
  const paths = diarizationModelPaths()
  try { await Promise.all([access(paths.segmentation), access(paths.embedding)]); return true } catch { return false }
}
