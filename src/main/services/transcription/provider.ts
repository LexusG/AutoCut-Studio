import type { Transcript, TranscriptionSettings } from '@shared/types'

export interface ProviderInput {
  projectId: string
  sourceClipId: string
  sourcePath: string
  sourceDuration: number
  audioPath: string
  timestampOffset: number
  settings: TranscriptionSettings
  signal: AbortSignal
  onProgress?: (percent: number) => void
}

export interface TranscriptionProvider {
  readonly id: 'whisper.cpp'
  readonly version: string
  transcribe(input: ProviderInput): Promise<Transcript>
}
