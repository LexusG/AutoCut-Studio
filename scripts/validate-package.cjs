const { open, readdir, stat } = require('node:fs/promises')
const { join } = require('node:path')

const MACHINES = { 62: 'x64', 183: 'arm64', 3: 'ia32', 40: 'arm' }

async function elfArchitecture(path) {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(20)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead < 20 || header.subarray(0, 4).toString('hex') !== '7f454c46') return null
    return MACHINES[header[5] === 1 ? header.readUInt16LE(18) : header.readUInt16BE(18)] ?? 'unknown'
  } finally { await handle.close() }
}

async function files(root) {
  const result = []
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name)
      if (entry.isDirectory()) result.push(...await files(path))
      else if (entry.isFile()) result.push(path)
    }
  } catch { /* Optional unpacked directory. */ }
  return result
}

module.exports = async function validatePackage(context) {
  if (context.electronPlatformName !== 'linux') return
  const expected = context.arch === 3 ? 'arm64' : 'x64'
  const resourceRoot = join(context.appOutDir, 'resources')
  const candidates = (await files(resourceRoot)).filter((path) => path.endsWith('.node') || path.endsWith('.so') || path.includes('.so.') || /runtime\/linux-[^/]+\/(ffmpeg|ffprobe|whisper-cli)$/.test(path))
  const mismatches = []
  for (const path of candidates) {
    const architecture = await elfArchitecture(path)
    if (architecture && architecture !== expected) mismatches.push(`${path}: ${architecture}`)
  }
  if (mismatches.length) throw new Error(`Native package architecture mismatch; expected ${expected}:\n${mismatches.join('\n')}`)
  const manifest = join(resourceRoot, 'resources', 'runtime', `linux-${expected}`, 'runtime-manifest.json')
  await stat(manifest)
  console.log(`  • validated native package architecture  arch=${expected} files=${candidates.length}`)
}
