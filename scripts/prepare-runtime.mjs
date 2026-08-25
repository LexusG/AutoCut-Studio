import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const arch = process.argv[2] ?? process.arch
if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported Linux package architecture: ${arch}`)

const root = resolve('.runtime-stage', `linux-${arch}`)
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })

async function digest(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function executable(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination)
  await chmod(destination, 0o755)
  return { file: destination.slice(root.length + 1), bytes: (await stat(destination)).size, sha256: await digest(destination) }
}

const files = []
if (arch === 'x64') {
  files.push(await executable(require('ffmpeg-static'), join(root, 'ffmpeg', 'ffmpeg')))
  files.push(await executable(require('ffprobe-static').path, join(root, 'ffprobe', 'ffprobe')))
  await cp(resolve('resources', 'whisper.cpp'), join(root, 'whisper'), { recursive: true })
  await chmod(join(root, 'whisper', 'whisper-cli'), 0o755)
  files.push({
    file: join('whisper', 'whisper-cli'),
    bytes: (await stat(join(root, 'whisper', 'whisper-cli'))).size,
    sha256: await digest(join(root, 'whisper', 'whisper-cli'))
  })
} else {
  const sourceRoot = process.env.AUTOCUT_ARM64_RUNTIME_DIR
  if (!sourceRoot) {
    throw new Error('Set AUTOCUT_ARM64_RUNTIME_DIR to a validated linux-arm64 runtime bundle before packaging ARM64.')
  }
  for (const relative of ['ffmpeg/ffmpeg', 'ffprobe/ffprobe', 'whisper/whisper-cli']) {
    files.push(await executable(join(sourceRoot, relative), join(root, relative)))
  }
  await cp(join(sourceRoot, 'whisper'), join(root, 'whisper'), { recursive: true, force: true })
}

await writeFile(join(root, 'runtime-manifest.json'), JSON.stringify({
  version: 1,
  platform: 'linux',
  architecture: arch,
  generatedAt: new Date().toISOString(),
  files
}, null, 2))

console.log(`Prepared ${basename(root)} with ${files.length} validated executables.`)
