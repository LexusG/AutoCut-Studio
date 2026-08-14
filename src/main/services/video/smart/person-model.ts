import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { PersonDetectionStatus } from '@shared/types'

const EXPECTED_HASH = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'

function modelPath(): string {
  const resources = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(resources, 'models', 'person', 'mediapipe-pose-lite', 'pose_landmarker_lite.task')
}

let cachedStatus: PersonDetectionStatus | null = null

export async function getPersonDetectionStatus(): Promise<PersonDetectionStatus> {
  if (cachedStatus) return cachedStatus
  try {
    const model = await readFile(modelPath())
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
