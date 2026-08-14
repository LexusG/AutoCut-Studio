import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'

const allowedMediaPaths = new Set<string>()

export function allowMediaPath(filePath: string): void {
  allowedMediaPaths.add(filePath)
}

export function createMediaUrl(filePath: string): string {
  return `autocut-media://local/${encodeURIComponent(filePath)}`
}

export function registerMediaProtocol(): void {
  protocol.handle('autocut-media', (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname.slice(1))
      if (!allowedMediaPaths.has(filePath)) {
        return new Response('Media path is not authorized.', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Invalid media URL.', { status: 400 })
    }
  })
}
