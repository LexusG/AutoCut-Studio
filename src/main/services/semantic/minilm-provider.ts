import { access } from 'node:fs/promises'
import type { SemanticEmbeddingProvider } from './provider'
import { markSemanticModelActive, semanticModelDirectory } from './model-manager'

interface TensorLike {
  data: Float32Array | number[]
  dims: number[]
}

type Extractor = (texts: string[], options: { pooling: 'mean'; normalize: true }) => Promise<TensorLike>

export class MiniLMEmbeddingProvider implements SemanticEmbeddingProvider {
  readonly provider = 'minilm-transformers-js' as const
  readonly model = 'Xenova/all-MiniLM-L6-v2' as const
  readonly modelVersion = 'main-q8'
  readonly dimensions = 384
  private extractor: Extractor | null = null
  private loading: Promise<Extractor> | null = null

  private async load(): Promise<Extractor> {
    if (this.extractor) return this.extractor
    if (this.loading) return this.loading
    this.loading = (async () => {
      await access(semanticModelDirectory())
      markSemanticModelActive(true)
      try {
        const transformers = await import('@huggingface/transformers')
        transformers.env.allowRemoteModels = false
        transformers.env.allowLocalModels = true
        const created = await transformers.pipeline('feature-extraction', semanticModelDirectory(), {
          dtype: 'q8',
          local_files_only: true
        })
        this.extractor = created as unknown as Extractor
        return this.extractor
      } catch (error) {
        markSemanticModelActive(false)
        throw error
      } finally {
        this.loading = null
      }
    })()
    return this.loading
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return []
    if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
    const extractor = await this.load()
    const tensor = await extractor(texts, { pooling: 'mean', normalize: true })
    if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
    const rows = tensor.dims[0] ?? texts.length
    const width = tensor.dims.at(-1) ?? this.dimensions
    const values = Array.from(tensor.data)
    if (rows !== texts.length || width !== this.dimensions) {
      throw new Error('The semantic model returned an unexpected embedding shape.')
    }
    return texts.map((_text, index) => values.slice(index * width, (index + 1) * width))
  }

  async unload(): Promise<void> {
    const disposable = this.extractor as unknown as { dispose?: () => Promise<void> | void } | null
    await disposable?.dispose?.()
    this.extractor = null
    markSemanticModelActive(false)
  }
}

let sharedProvider: MiniLMEmbeddingProvider | null = null

export function semanticProvider(): MiniLMEmbeddingProvider {
  sharedProvider ??= new MiniLMEmbeddingProvider()
  return sharedProvider
}

export async function unloadSemanticProvider(): Promise<void> {
  await sharedProvider?.unload()
  sharedProvider = null
}
