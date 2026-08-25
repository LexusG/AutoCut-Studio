import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AtomicWriteError, writeFileAtomic } from '../src/main/services/filesystem/atomic-write'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'autocut-atomic-test-'))
})

afterEach(async () => {
  // Restore permissions first, or the read-only case leaves an undeletable directory.
  await chmod(root, 0o700).catch(() => undefined)
  const entries = await readdir(root).catch(() => [])
  for (const entry of entries) await chmod(join(root, entry), 0o700).catch(() => undefined)
  await rm(root, { recursive: true, force: true })
})

describe('atomic project writes', () => {
  it('writes a new file and creates missing parent directories', async () => {
    const target = join(root, 'nested', 'deeper', 'project.json')
    await writeFileAtomic(target, '{"a":1}')
    expect(await readFile(target, 'utf8')).toBe('{"a":1}')
  })

  it('replaces existing contents without leaving a temporary file behind', async () => {
    const target = join(root, 'project.json')
    await writeFileAtomic(target, 'first')
    await writeFileAtomic(target, 'second')
    expect(await readFile(target, 'utf8')).toBe('second')
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('keeps the previous contents as a backup when asked', async () => {
    const target = join(root, 'project.json')
    await writeFileAtomic(target, 'original')
    await writeFileAtomic(target, 'updated', { backup: true })
    expect(await readFile(target, 'utf8')).toBe('updated')
    expect(await readFile(`${target}.bak`, 'utf8')).toBe('original')
  })

  it('reports a typed permission failure and leaves the existing file intact', async () => {
    const directory = join(root, 'locked')
    await mkdir(directory, { recursive: true })
    const target = join(directory, 'project.json')
    await writeFile(target, 'known-good', 'utf8')
    await chmod(directory, 0o500)

    let thrown: unknown
    try {
      await writeFileAtomic(target, 'replacement')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AtomicWriteError)
    expect((thrown as AtomicWriteError).code).toBe('permission')
    expect((thrown as AtomicWriteError).path).toBe(target)
    // The point of the exercise: a failed save must never destroy the last good file.
    expect(await readFile(target, 'utf8')).toBe('known-good')
  })

  it('cleans up its temporary file when a write fails', async () => {
    const directory = join(root, 'locked-empty')
    await mkdir(directory, { recursive: true })
    await chmod(directory, 0o500)
    await expect(writeFileAtomic(join(directory, 'project.json'), 'x')).rejects.toThrow(AtomicWriteError)
    await chmod(directory, 0o700)
    expect(await readdir(directory)).toEqual([])
  })

  it('serializes concurrent writes to the same path so neither is torn', async () => {
    const target = join(root, 'project.json')
    const payloads = Array.from({ length: 12 }, (_, index) => `payload-${index}`.repeat(400))
    await Promise.all(payloads.map((payload) => writeFileAtomic(target, payload)))
    const written = await readFile(target, 'utf8')
    expect(payloads).toContain(written)
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('never exposes a partially written file to a concurrent reader', async () => {
    const target = join(root, 'project.json')
    await writeFileAtomic(target, JSON.stringify({ version: 9, big: 'x'.repeat(200_000) }))
    const write = writeFileAtomic(target, JSON.stringify({ version: 9, big: 'y'.repeat(200_000) }))
    const reads = await Promise.all(
      Array.from({ length: 20 }, async () => JSON.parse(await readFile(target, 'utf8')) as { version: number })
    )
    await write
    for (const read of reads) expect(read.version).toBe(9)
  })
})
