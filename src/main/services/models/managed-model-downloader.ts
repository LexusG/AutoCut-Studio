import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export async function downloadManagedModelFile(
  url: string,
  destination: string,
  approximateBytes: number,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}.`)
  const total = Number(response.headers.get('content-length')) || approximateBytes
  const temporary = `${destination}.download`
  await mkdir(dirname(destination), { recursive: true })
  await rm(temporary, { force: true })
  let received = 0
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.byteLength
    onProgress?.(received, total)
  })
  try {
    await pipeline(source, createWriteStream(temporary, { flags: 'wx' }))
    const size = (await stat(temporary)).size
    if (size < Math.min(approximateBytes * 0.5, 100)) throw new Error('The downloaded model file is incomplete.')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
