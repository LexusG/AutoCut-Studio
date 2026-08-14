/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { PERSON_ANALYSIS_POLICY } from '@shared/constants/person-analysis'
import type { PersonAnalysisRequest, PersonAnalysisResponse, PersonAnalysisSummary } from '@shared/types'
import { aggregatePersonPresence } from '@shared/utils/person-analysis'

type WorkerMessage =
  | { type: 'analyze'; request: PersonAnalysisRequest }
  | { type: 'cancel'; requestId: string }

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope
const cancelled = new Set<string>()
let landmarkerPromise: Promise<PoseLandmarker> | null = null

function getLandmarker(): Promise<PoseLandmarker> {
  landmarkerPromise ??= loadWasmModule().then((wasmBinaryPath) => PoseLandmarker.createFromOptions({
      wasmLoaderPath: '',
      wasmBinaryPath
    }, {
      baseOptions: {
        modelAssetPath: 'autocut-asset://local/models/person/mediapipe-pose-lite/pose_landmarker_lite.task',
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      numPoses: 2,
      minPoseDetectionConfidence: PERSON_ANALYSIS_POLICY.detectionThreshold,
      minPosePresenceConfidence: PERSON_ANALYSIS_POLICY.detectionThreshold,
      minTrackingConfidence: PERSON_ANALYSIS_POLICY.detectionThreshold,
      outputSegmentationMasks: false
    }))
  return landmarkerPromise
}

async function loadWasmModule(): Promise<string> {
  const simd = await FilesetResolver.isSimdSupported()
  const stem = simd ? 'vision_wasm_module_internal' : 'vision_wasm_nosimd_internal'
  const response = await fetch(
    `autocut-asset://local/mediapipe/wasm/${stem}.js`
  )
  if (!response.ok) throw new Error(`Could not load the local MediaPipe runtime (${response.status}).`)
  const source = `${await response.text()}\n${simd ? '' : 'globalThis.ModuleFactory = ModuleFactory;'}\n`
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try {
    await import(/* @vite-ignore */ moduleUrl)
  } finally {
    URL.revokeObjectURL(moduleUrl)
  }
  return `autocut-asset://local/mediapipe/wasm/${stem}.wasm`
}

function landmarkConfidence(landmarks: NormalizedLandmark[]): number {
  if (landmarks.length === 0) return 0
  const visible = landmarks.map((landmark) => landmark.visibility).filter(Number.isFinite)
  return visible.length > 0 ? visible.reduce((sum, value) => sum + value, 0) / visible.length : 0
}

async function analyze(request: PersonAnalysisRequest): Promise<PersonAnalysisSummary> {
  const landmarker = await getLandmarker()
  const confidences: number[] = []
  const focusPoints: NonNullable<PersonAnalysisSummary['focusPoints']> = []
  for (const frame of request.frames) {
    if (cancelled.has(request.requestId)) throw new Error('Person analysis cancelled.')
    const response = await fetch(frame.dataUrl)
    const bitmap = await createImageBitmap(await response.blob())
    try {
      const result = landmarker.detect(bitmap)
      const confidence = Math.max(0, ...result.landmarks.map(landmarkConfidence))
      confidences.push(confidence)
      const visible = result.landmarks.flat().filter((landmark) => (landmark.visibility ?? 0) >= 0.45)
      if (visible.length > 0) {
        const xs = visible.map((landmark) => landmark.x)
        const ys = visible.map((landmark) => landmark.y)
        const left = Math.max(0, Math.min(...xs))
        const right = Math.min(1, Math.max(...xs))
        const top = Math.max(0, Math.min(...ys))
        const bottom = Math.min(1, Math.max(...ys))
        focusPoints.push({
          timestamp: frame.timestamp,
          x: (left + right) / 2,
          y: (top + bottom) / 2,
          confidence,
          subjectWidth: right - left,
          subjectHeight: bottom - top
        })
      }
    } finally {
      bitmap.close()
    }
  }
  return { ...aggregatePersonPresence(confidences, request.configuration), focusPoints }
}

context.onmessage = (event: MessageEvent<WorkerMessage>): void => {
  if (event.data.type === 'cancel') {
    cancelled.add(event.data.requestId)
    return
  }
  const { request } = event.data
  void analyze(request)
    .then((result) => {
      if (cancelled.has(request.requestId)) return
      const response: PersonAnalysisResponse = { requestId: request.requestId, result, error: null }
      context.postMessage(response)
    })
    .catch((error) => {
      if (cancelled.has(request.requestId)) return
      const response: PersonAnalysisResponse = {
        requestId: request.requestId,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      }
      context.postMessage(response)
    })
    .finally(() => cancelled.delete(request.requestId))
}
