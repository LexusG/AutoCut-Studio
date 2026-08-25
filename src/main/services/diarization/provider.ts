import type { DiarizationSegment, SpeakerCountSetting } from '@shared/types'

export interface SpeakerDiarizationProviderRequest {
  audioPath: string
  sourceClipId: string
  speakerCount: SpeakerCountSetting
  segmentationModelPath: string
  embeddingModelPath: string
  signal: AbortSignal
}
export interface SpeakerDiarizationProvider {
  readonly id: 'sherpa-onnx'
  readonly version: string
  diarize(request: SpeakerDiarizationProviderRequest): Promise<DiarizationSegment[]>
  release(): Promise<void>
}
