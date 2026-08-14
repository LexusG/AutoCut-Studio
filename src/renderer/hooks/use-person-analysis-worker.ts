import { useEffect } from 'react'
import type { PersonAnalysisResponse } from '@shared/types'
import { useAppStore } from '../stores/app-store'

export function usePersonAnalysisWorker(): void {
  const setPersonDetectionStatus = useAppStore((state) => state.setPersonDetectionStatus)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/person-analysis.worker.ts', import.meta.url), {
      type: 'module',
      name: 'autocut-person-analysis'
    })
    worker.onmessage = (event: MessageEvent<PersonAnalysisResponse>) => {
      setPersonDetectionStatus(event.data.result ? {
        state: 'active',
        label: 'Active - MediaPipe Pose Lite',
        provider: 'MediaPipe Pose Landmarker Lite',
        modelVersion: event.data.result.modelVersion,
        detail: null
      } : {
        state: 'unavailable',
        label: 'Unavailable',
        provider: 'MediaPipe Pose Landmarker Lite',
        modelVersion: 'pose-landmarker-lite-2023-04-17',
        detail: event.data.error
      })
      window.autoCut.submitPersonAnalysisResponse(event.data)
    }
    worker.onerror = (event) => {
      setPersonDetectionStatus({
        state: 'unavailable',
        label: 'Unavailable',
        provider: 'MediaPipe Pose Landmarker Lite',
        modelVersion: 'pose-landmarker-lite-2023-04-17',
        detail: event.message
      })
    }
    const removeRequest = window.autoCut.onPersonAnalysisRequest((request) => {
      worker.postMessage({ type: 'analyze', request })
    })
    const removeCancel = window.autoCut.onPersonAnalysisCancel((requestId) => {
      worker.postMessage({ type: 'cancel', requestId })
    })
    return () => {
      removeRequest()
      removeCancel()
      worker.terminate()
    }
  }, [setPersonDetectionStatus])
}
