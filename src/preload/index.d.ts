import type { AutoCutApi } from '@shared/types'

declare global {
  interface Window {
    autoCut: AutoCutApi
  }
}

export {}
