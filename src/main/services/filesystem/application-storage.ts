import { join } from 'node:path'
import { app } from 'electron'

export interface ApplicationStoragePaths {
  root: string
  projects: string
  analysisCache: string
  logs: string
  models: string
  processing: string
}

export function applicationStoragePaths(): ApplicationStoragePaths {
  const root = join(app.getPath('userData'), 'storage')
  return {
    root,
    projects: join(root, 'projects'),
    analysisCache: join(root, 'analysis-cache'),
    logs: join(root, 'logs'),
    models: join(root, 'models'),
    processing: join(root, 'processing')
  }
}
