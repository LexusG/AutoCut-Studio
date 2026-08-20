export interface SemanticEmbeddingProvider {
  readonly provider: 'minilm-transformers-js'
  readonly model: 'Xenova/all-MiniLM-L6-v2'
  readonly modelVersion: string
  readonly dimensions: number
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>
  unload(): Promise<void>
}

export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length !== right.length || left.length === 0) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator > 0 ? Math.max(-1, Math.min(1, dot / denominator)) : 0
}
