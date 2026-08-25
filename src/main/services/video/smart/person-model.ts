import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PersonDetectionStatus } from '@shared/types'
import { resolveRuntimeAsset } from '../../runtime/path-resolver'

const EXPECTED_HASH = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'

let cachedStatus: PersonDetectionStatus | null = null

export async function getPersonDetectionStatus(): Promise<PersonDetectionStatus> {
  if (cachedStatus) return cachedStatus
  try {
    const resolved = await resolveRuntimeAsset('mediapipe-pose')
    if (!resolved) throw new Error('The MediaPipe pose model is missing from application resources.')
    const model = await readFile(resolved.path)
    const hash = createHash('sha256').update(model).digest('hex')
    if (hash !== EXPECTED_HASH) throw new Error('The packaged model checksum does not match its manifest.')
    cachedStatus = {
      state: 'ready',
      label: 'Ready - MediaPipe Pose Lite',
      provider: 'MediaPipe Pose Landmarker Lite',
      modelVersion: 'pose-landmarker-lite-2023-04-17',
      detail: null
    }
  } catch (error) {
    cachedStatus = {
      state: 'unavailable',
      label: 'Unavailable',
      provider: 'MediaPipe Pose Landmarker Lite',
      modelVersion: 'pose-landmarker-lite-2023-04-17',
      detail: error instanceof Error ? error.message : String(error)
    }
  }
  return cachedStatus
}
