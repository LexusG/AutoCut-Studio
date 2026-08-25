import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

interface SessionMarker {
  sessionId: string
  pid: number
  startedAt: string
  cleanShutdown: boolean
}

export function recoveryRoot(): string {
  return join(applicationStoragePaths().root, 'recovery')
}

function markerPath(): string {
  return join(recoveryRoot(), 'session.json')
}

let currentSessionId = ''

async function readMarker(): Promise<SessionMarker | null> {
  try {
    const parsed = JSON.parse(await readFile(markerPath(), 'utf8')) as Partial<SessionMarker>
    if (typeof parsed.sessionId !== 'string' || typeof parsed.cleanShutdown !== 'boolean') return null
    return parsed as SessionMarker
  } catch {
    return null
  }
}

/**
 * Claim this run and report whether the previous one shut down cleanly.
 *
 * A missing marker means this is a first run, not a crash. An unclean marker is only
 * a hint that recovery data is worth checking — on its own it never implies the
 * user's project is damaged.
 */
export async function beginSession(): Promise<{ previousSessionCleanlyClosed: boolean }> {
  const previous = await readMarker()
  currentSessionId = crypto.randomUUID()
  await writeFileAtomic(
    markerPath(),
    `${JSON.stringify({ sessionId: currentSessionId, pid: process.pid, startedAt: new Date().toISOString(), cleanShutdown: false }, null, 2)}\n`
  )
  return { previousSessionCleanlyClosed: previous === null || previous.cleanShutdown }
}

/** Mark this run as finished normally. Called on a graceful quit. */
export async function endSession(): Promise<void> {
  try {
    await writeFileAtomic(
      markerPath(),
      `${JSON.stringify({ sessionId: currentSessionId, pid: process.pid, startedAt: new Date().toISOString(), cleanShutdown: true }, null, 2)}\n`
    )
  } catch {
    // A failure to record a clean exit only costs an unnecessary recovery prompt.
  }
}

export async function clearSessionMarker(): Promise<void> {
  await rm(markerPath(), { force: true }).catch(() => undefined)
}

export function currentSession(): string {
  return currentSessionId
}
