import { constants } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type AtomicWriteFailure = 'permission' | 'no-space' | 'read-only' | 'unknown'

export class AtomicWriteError extends Error {
  constructor(
    message: string,
    readonly code: AtomicWriteFailure,
    readonly path: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AtomicWriteError'
  }
}

export interface AtomicWriteOptions {
  /** Copy the previous contents to `<path>.bak` before replacing it. */
  backup?: boolean
  mode?: number
}

function classify(error: unknown): AtomicWriteFailure {
  const code = (error as { code?: string } | null)?.code
  if (code === 'EACCES' || code === 'EPERM') return 'permission'
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'no-space'
  if (code === 'EROFS') return 'read-only'
  return 'unknown'
}

function describe(reason: AtomicWriteFailure, path: string): string {
  if (reason === 'permission') return `AutoCut Studio is not allowed to write ${path}.`
  if (reason === 'no-space') return `There is not enough free disk space to write ${path}.`
  if (reason === 'read-only') return `${path} is on a read-only location.`
  return `${path} could not be written.`
}

/**
 * fsync the directory holding `path` so the rename itself is durable.
 * Not every filesystem or platform permits this; a refusal is not a write failure.
 */
async function syncDirectory(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(dirname(path), constants.O_RDONLY)
    await handle.sync()
  } catch {
    // EPERM/EINVAL/EISDIR are expected on some filesystems; durability of the
    // file contents themselves is already guaranteed by the fsync below.
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

const inFlight = new Map<string, Promise<unknown>>()
let counter = 0

/** Serialize writes to one path so two callers can never interleave temp files. */
function queue<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(path) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(run)
  inFlight.set(path, next)
  void next.catch(() => undefined).finally(() => {
    if (inFlight.get(path) === next) inFlight.delete(path)
  })
  return next
}

async function writeOnce(path: string, contents: string, options: AtomicWriteOptions): Promise<void> {
  counter += 1
  const temporaryPath = join(dirname(path), `.${counter}-${process.pid}-${Date.now()}.tmp`)
  try {
    await mkdir(dirname(path), { recursive: true })
    if (options.backup) {
      const { copyFile } = await import('node:fs/promises')
      await copyFile(path, `${path}.bak`).catch(() => undefined)
    }
    const handle = await open(temporaryPath, 'w', options.mode ?? 0o600)
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, path)
    await syncDirectory(path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    const reason = classify(error)
    throw new AtomicWriteError(describe(reason, path), reason, path, error)
  }
}

/**
 * Write `contents` to `path` so that a crash, power loss, or full disk can never
 * leave a partially written file behind: the data is written and fsynced to a
 * temporary file first and only then renamed over the destination.
 */
export function writeFileAtomic(
  path: string,
  contents: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  return queue(path, () => writeOnce(path, contents, options))
}

/** Test seam: resolves once every queued write has settled. */
export async function flushPendingWrites(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.allSettled([...inFlight.values()])
  }
}
