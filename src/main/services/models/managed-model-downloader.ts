import { createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export async function downloadManagedModelFile(
  url: string,
  destination: string,
  approximateBytes: number,
  onProgress?: (received: number, total: number) => void,
  options: { sha256?: string; resume?: boolean } = {}
): Promise<void> {
  const temporary = `${destination}.download`
  await mkdir(dirname(destination), { recursive: true })
  let existing = 0
  if (options.resume !== false) {
    try { existing = (await stat(temporary)).size } catch { existing = 0 }
  } else {
    await rm(temporary, { force: true })
  }
  let response = await fetch(url, existing ? { headers: { Range: `bytes=${existing}-` } } : undefined)
  if (existing && response.status !== 206) {
    await rm(temporary, { force: true })
    existing = 0
    response = await fetch(url)
  }
  if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}.`)
  const total = existing + (Number(response.headers.get('content-length')) || Math.max(0, approximateBytes - existing))
  let received = existing
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.byteLength
    onProgress?.(received, total)
  })
  try {
    await pipeline(source, createWriteStream(temporary, { flags: existing ? 'a' : 'wx' }))
    const size = (await stat(temporary)).size
    if (size < Math.min(approximateBytes * 0.5, 100)) throw new Error('The downloaded model file is incomplete.')
    if (options.sha256) {
      const hash = createHash('sha256')
      await pipeline(createReadStream(temporary), hash)
      const actual = hash.digest('hex')
      if (actual !== options.sha256) throw new Error('The downloaded model checksum does not match the trusted manifest.')
    }
    await rename(temporary, destination)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!options.resume || message.includes('checksum') || message.includes('incomplete')) await rm(temporary, { force: true })
    throw error
  }
}
