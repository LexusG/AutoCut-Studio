import { open } from 'node:fs/promises'

const ELF_MACHINE: Partial<Record<NodeJS.Architecture, number>> = {
  x64: 62,
  arm64: 183,
  ia32: 3,
  arm: 40
}
export async function executableArchitecture(path: string): Promise<NodeJS.Architecture | 'unknown' | 'not-elf'> {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(20)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead < 20 || header.subarray(0, 4).toString('hex') !== '7f454c46') return 'not-elf'
    const littleEndian = header[5] === 1
    const machine = littleEndian ? header.readUInt16LE(18) : header.readUInt16BE(18)
    return (Object.entries(ELF_MACHINE).find(([, value]) => value === machine)?.[0] as NodeJS.Architecture | undefined) ?? 'unknown'
  } finally {
    await handle.close()
  }
}

export async function validateExecutableArchitecture(path: string, expected = process.arch): Promise<string | null> {
  if (process.platform !== 'linux') return null
  const actual = await executableArchitecture(path)
  if (actual === 'not-elf' || actual === 'unknown') return null
  return actual === expected ? null : `Architecture mismatch: application is ${expected}, executable is ${actual}.`
}
