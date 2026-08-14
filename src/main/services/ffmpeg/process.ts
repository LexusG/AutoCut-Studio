import { spawn } from 'node:child_process'

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024

export class ProcessExecutionError extends Error {
  constructor(
    message: string,
    readonly details: string
  ) {
    super(message)
    this.name = 'ProcessExecutionError'
  }
}

export interface ProcessOutput {
  stdout: string
  stderr: string
}

export interface ProcessOptions {
  signal?: AbortSignal
  onStdout?: (text: string) => void
}

export function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {}
): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let capturedBytes = 0

    const capture = (target: Buffer[], chunk: Buffer): void => {
      if (capturedBytes >= MAX_CAPTURE_BYTES) return
      const remaining = MAX_CAPTURE_BYTES - capturedBytes
      const captured = chunk.subarray(0, remaining)
      target.push(captured)
      capturedBytes += captured.byteLength
    }

    let forceKillTimer: NodeJS.Timeout | null = null
    const abort = (): void => {
      if (child.exitCode != null || child.killed) return
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode == null) child.kill('SIGKILL')
      }, 2_000)
    }

    if (options.signal?.aborted) abort()
    options.signal?.addEventListener('abort', abort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      capture(stdout, chunk)
      options.onStdout?.(chunk.toString('utf8'))
    })
    child.stderr.on('data', (chunk: Buffer) => capture(stderr, chunk))

    child.once('error', (error) => {
      reject(new ProcessExecutionError(`Could not start ${command}.`, error.message))
    })

    child.once('close', (code, signal) => {
      options.signal?.removeEventListener('abort', abort)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      const output = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      }

      if (code === 0) {
        resolve(output)
        return
      }

      const reason = signal ? `terminated by ${signal}` : `exited with code ${code ?? 'unknown'}`
      reject(
        new ProcessExecutionError(
          `${command} ${reason}.`,
          output.stderr.trim() || output.stdout.trim() || 'No process output was captured.'
        )
      )
    })
  })
}
