import { join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, net, protocol } from 'electron'

function resourcesRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources')
}

export function registerAppAssetProtocol(): void {
  protocol.handle('autocut-asset', (request) => {
    const url = new URL(request.url)
    const relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
    const root = resolve(resourcesRoot())
    const filePath = resolve(root, relativePath)
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      return new Response('Invalid asset path.', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

