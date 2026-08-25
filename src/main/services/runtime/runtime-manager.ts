import { constants } from 'node:fs'
import { access, chmod, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { RuntimeComponent, RuntimeComponentId } from '@shared/types'
import { getSemanticModelStatus } from '../semantic/model-manager'
import { getDiarizationModelStatus } from '../diarization/model-manager'
import { getTranscriptionStatus } from '../transcription/model-manager'
import { getPersonDetectionStatus } from '../video/smart/person-model'
import { runProcess } from '../ffmpeg/process'
import { validateExecutableArchitecture } from './architecture'
import { resolveRuntimeAsset, resolveRuntimeExecutable, runtimeEnvironment } from './path-resolver'

const require = createRequire(import.meta.url)
let cached: { at: number; components: RuntimeComponent[] } | null = null

async function fileBytes(path: string | null): Promise<number> {
  if (!path) return 0
  try { return (await stat(path)).size } catch { return 0 }
}

async function executableComponent(
  id: 'ffmpeg' | 'ffprobe' | 'whisper-cpp',
  name: string,
  required: boolean,
  capabilities: string[]
): Promise<RuntimeComponent> {
  const checkedAt = new Date().toISOString()
  const candidate = await resolveRuntimeExecutable(id)
  if (!candidate) return {
    id, name, type: 'executable', version: null, architecture: process.arch, platform: process.platform,
    path: null, status: 'unavailable', source: 'bundled', required, capabilities, lastValidation: checkedAt,
    error: `${name} runtime is unavailable. Open Local AI & Processing to verify or repair it.`, bytes: 0
  }
  const mismatch = await validateExecutableArchitecture(candidate.path)
  if (mismatch) return {
    id, name, type: 'executable', version: null, architecture: process.arch, platform: process.platform,
    path: candidate.path, status: 'invalid-architecture', source: candidate.source, required, capabilities,
    lastValidation: checkedAt, error: mismatch, bytes: await fileBytes(candidate.path)
  }
  try {
    const args = id === 'whisper-cpp' ? ['--help'] : ['-version']
    const result = await runProcess(candidate.path, args)
    const version = `${result.stdout}\n${result.stderr}`.split('\n').find((line) => line.trim())?.trim() ?? null
    return {
      id, name, type: 'executable', version, architecture: process.arch, platform: process.platform,
      path: candidate.path, status: 'ready', source: candidate.source, required, capabilities,
      lastValidation: checkedAt, error: null, bytes: await fileBytes(candidate.path)
    }
  } catch (error) {
    return {
      id, name, type: 'executable', version: null, architecture: process.arch, platform: process.platform,
      path: candidate.path, status: 'damaged', source: candidate.source, required, capabilities,
      lastValidation: checkedAt, error: error instanceof Error ? error.message : String(error), bytes: await fileBytes(candidate.path)
    }
  }
}

async function sherpaComponent(): Promise<RuntimeComponent> {
  const checkedAt = new Date().toISOString()
  try {
    const packagePath = require.resolve(`sherpa-onnx-${process.platform}-${process.arch}/sherpa-onnx.node`)
    await access(packagePath, constants.R_OK)
    const addon = require('sherpa-onnx-node') as { OfflineSpeakerDiarization?: unknown }
    if (typeof addon.OfflineSpeakerDiarization !== 'function') throw new Error('The diarization API is missing from the native addon.')
    const models = await getDiarizationModelStatus()
    return {
      id: 'sherpa-onnx-diarization', name: 'Speaker Diarization', type: 'native-module', version: '1.13.6',
      architecture: process.arch, platform: process.platform, path: packagePath, status: models.state === 'ready' ? 'ready' : 'not-installed', source: 'bundled',
      required: false, capabilities: ['speaker-diarization', 'speaker-embedding', 'clustering'],
      lastValidation: checkedAt, error: models.state === 'ready' ? null : 'Native runtime is ready; speaker models are not installed.', bytes: await fileBytes(packagePath)
    }
  } catch (error) {
    return {
      id: 'sherpa-onnx-diarization', name: 'Speaker Diarization', type: 'native-module', version: '1.13.6',
      architecture: process.arch, platform: process.platform, path: null, status: 'unavailable', source: 'bundled',
      required: false, capabilities: ['speaker-diarization'], lastValidation: checkedAt,
      error: error instanceof Error ? error.message : String(error), bytes: 0
    }
  }
}

function builtin(id: RuntimeComponentId, name: string, capabilities: string[]): RuntimeComponent {
  return {
    id, name, type: 'builtin', version: 'phase9', architecture: 'independent', platform: 'independent',
    path: null, status: 'ready', source: 'builtin', required: false, capabilities,
    lastValidation: new Date().toISOString(), error: null, bytes: 0
  }
}

export async function validateRuntimeComponents(force = false): Promise<RuntimeComponent[]> {
  if (!force && cached && Date.now() - cached.at < 15_000) return cached.components
  const [ffmpeg, ffprobe, whisper, transcription, person, semantic, sherpa] = await Promise.all([
    executableComponent('ffmpeg', 'FFmpeg', true, ['decode', 'render', 'audio-preparation']),
    executableComponent('ffprobe', 'FFprobe', true, ['media-inspection', 'output-verification']),
    executableComponent('whisper-cpp', 'Whisper Transcription', false, ['transcription', 'word-timestamps']),
    getTranscriptionStatus(), getPersonDetectionStatus(), getSemanticModelStatus(), sherpaComponent()
  ])
  const installedWhisperModels = transcription.models.filter((model) => model.state === 'ready').map((model) => model.model)
  whisper.version = `${whisper.version ?? 'whisper.cpp'} · ${installedWhisperModels.length ? `${installedWhisperModels.join(', ')} installed` : 'no model installed'}`
  const components: RuntimeComponent[] = [
    ffmpeg, ffprobe, whisper,
    {
      id: 'mediapipe-pose', name: 'Person Detection', type: 'model', version: person.modelVersion,
      architecture: 'independent', platform: 'independent', path: (await resolveRuntimeAsset('mediapipe-pose'))?.path ?? null,
      status: person.state === 'unavailable' ? 'damaged' : 'ready', source: 'bundled', required: false,
      capabilities: ['person-presence', 'subject-crop'], lastValidation: new Date().toISOString(), error: person.detail,
      bytes: await fileBytes((await resolveRuntimeAsset('mediapipe-pose'))?.path ?? null)
    },
    {
      id: 'minilm', name: 'Semantic Search', type: 'model', version: semantic.modelVersion,
      architecture: 'independent', platform: 'independent', path: semantic.path,
      status: semantic.state === 'ready' ? 'ready' : semantic.state === 'not-installed' ? 'not-installed' : 'unavailable',
      source: 'managed', required: false, capabilities: ['embeddings', 'semantic-search', 'topics', 'highlights'],
      lastValidation: new Date().toISOString(), error: semantic.state === 'ready' ? null : semantic.detail,
      bytes: semantic.state === 'ready' ? semantic.approximateBytes : 0
    },
    sherpa,
    builtin('vad', 'Speech Activity Detection', ['speech-boundaries', 'skip-no-speech']),
    builtin('beat-analysis', 'Beat Analysis', ['beat-detection', 'beat-assisted-cuts'])
  ]
  cached = { at: Date.now(), components }
  return components
}

export async function repairRuntimeComponent(id: RuntimeComponentId): Promise<RuntimeComponent> {
  if (!['ffmpeg', 'ffprobe', 'whisper-cpp'].includes(id)) {
    cached = null
    return (await validateRuntimeComponents(true)).find((component) => component.id === id)!
  }
  const component = (await validateRuntimeComponents(true)).find((item) => item.id === id)!
  if (component.path && component.source === 'bundled') {
    await chmod(component.path, 0o755)
  }
  cached = null
  return (await validateRuntimeComponents(true)).find((item) => item.id === id)!
}

export function currentRuntimeEnvironment() { return runtimeEnvironment() }
