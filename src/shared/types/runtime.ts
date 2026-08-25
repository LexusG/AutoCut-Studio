export type RuntimeComponentId =
  | 'ffmpeg'
  | 'ffprobe'
  | 'whisper-cpp'
  | 'mediapipe-pose'
  | 'minilm'
  | 'sherpa-onnx-diarization'
  | 'vad'
  | 'beat-analysis'

export type RuntimeComponentType = 'executable' | 'native-module' | 'model' | 'builtin'
export type RuntimeComponentStatus = 'ready' | 'not-installed' | 'unavailable' | 'invalid-architecture' | 'damaged'
export type RuntimeComponentSource = 'bundled' | 'managed' | 'system' | 'custom' | 'builtin'
export type ProcessingResourceMode = 'low-memory' | 'balanced' | 'maximum-performance'

export interface RuntimeEnvironment {
  platform: string
  architecture: string
  packaged: boolean
  runtimeKey: string
  applicationVersion: string
  electronVersion: string
}

export interface RuntimeComponent {
  id: RuntimeComponentId
  name: string
  type: RuntimeComponentType
  version: string | null
  architecture: string
  platform: string
  path: string | null
  status: RuntimeComponentStatus
  source: RuntimeComponentSource
  required: boolean
  capabilities: string[]
  lastValidation: string
  error: string | null
  bytes: number
}

export interface ProcessingStorageSummary {
  models: number
  previews: number
  analysisCache: number
  runtime: number
  total: number
  storagePath: string
  availableBytes: number | null
}

export interface RuntimeDiagnostics {
  generatedAt: string
  environment: RuntimeEnvironment
  components: RuntimeComponent[]
  storage: ProcessingStorageSummary
  report: string
}

export interface RuntimeRepairResult {
  componentId: RuntimeComponentId
  repaired: boolean
  message: string
  component: RuntimeComponent
}
