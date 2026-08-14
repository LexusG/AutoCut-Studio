export interface OptionalMLSignal {
  available: boolean
  personPresence: number
  provider: string | null
}

export interface OptionalMLAnalyzer {
  analyzeFrame(sourcePath: string, timestamp: number, signal: AbortSignal): Promise<OptionalMLSignal>
}

export class UnavailableMLAnalyzer implements OptionalMLAnalyzer {
  async analyzeFrame(_sourcePath: string, _timestamp: number, _signal: AbortSignal): Promise<OptionalMLSignal> {
    return { available: false, personPresence: 0, provider: null }
  }
}
