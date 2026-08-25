import { join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { applicationResourcesRoot } from '../runtime/path-resolver'

export function registerAppAssetProtocol(): void {
  protocol.handle('autocut-asset', (request) => {
    const url = new URL(request.url)
    const relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
    const root = resolve(applicationResourcesRoot())
    const filePath = resolve(root, relativePath)
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      return new Response('Invalid asset path.', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
