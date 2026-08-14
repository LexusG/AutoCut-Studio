import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  PersonAnalysisConfiguration,
  PersonAnalysisFrame,
  PersonAnalysisResponse,
  PersonAnalysisSummary
} from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

export interface PersonPresenceProvider {
  analyzeFrames(
    frames: PersonAnalysisFrame[],
    configuration: PersonAnalysisConfiguration,
    signal: AbortSignal
  ): Promise<PersonAnalysisSummary>
}

interface PendingAnalysis {
  senderId: number
  resolve: (result: PersonAnalysisSummary) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingAnalysis>()

export function resolvePersonAnalysisResponse(senderId: number, response: PersonAnalysisResponse): void {
  const request = pending.get(response.requestId)
  if (!request || request.senderId !== senderId) return
  clearTimeout(request.timeout)
  pending.delete(response.requestId)
  if (response.result) request.resolve(response.result)
  else request.reject(new Error(response.error ?? 'Person analysis did not return a result.'))
}

export class MediaPipePoseLiteProvider implements PersonPresenceProvider {
  constructor(private readonly sender: WebContents) {}

  analyzeFrames(
    frames: PersonAnalysisFrame[],
    configuration: PersonAnalysisConfiguration,
    signal: AbortSignal
  ): Promise<PersonAnalysisSummary> {
    if (!configuration.enabled || frames.length === 0) {
      return Promise.resolve(emptyResult(frames.length, configuration, configuration.enabled ? [] : ['Person detection is disabled.']))
    }
    if (this.sender.isDestroyed()) return Promise.reject(new Error('Person analysis worker is unavailable.'))
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        const request = pending.get(requestId)
        if (request) clearTimeout(request.timeout)
        pending.delete(requestId)
        signal.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        cleanup()
        if (!this.sender.isDestroyed()) this.sender.send(IPC_CHANNELS.personAnalysisCancel, requestId)
        reject(new Error('Render cancelled.'))
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Person analysis timed out.'))
      }, 120_000)
      pending.set(requestId, {
        senderId: this.sender.id,
        resolve: (result) => { cleanup(); resolve(result) },
        reject: (error) => { cleanup(); reject(error) },
        timeout
      })
      signal.addEventListener('abort', onAbort, { once: true })
      this.sender.send(IPC_CHANNELS.personAnalysisRequest, { requestId, frames, configuration })
    })
  }
}

function emptyResult(
  sampledFrames: number,
  configuration: PersonAnalysisConfiguration,
  warnings: string[]
): PersonAnalysisSummary {
  return {
    detected: false,
    confidence: 0,
    sampledFrames,
    framesContainingPerson: 0,
    presenceRatio: 0,
    averageConfidence: 0,
    maximumConfidence: 0,
    landmarkQuality: null,
    provider: configuration.provider,
    modelVersion: configuration.modelVersion,
    analyzerVersion: configuration.analyzerVersion,
    warnings
  }
}

export class UnavailablePersonPresenceProvider implements PersonPresenceProvider {
  analyzeFrames(
    frames: PersonAnalysisFrame[],
    configuration: PersonAnalysisConfiguration
  ): Promise<PersonAnalysisSummary> {
    return Promise.resolve(emptyResult(frames.length, configuration, ['Person detection provider is unavailable.']))
  }
}
