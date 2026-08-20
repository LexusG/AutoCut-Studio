import type { AnalysisJobPriority } from '@shared/types'

interface ScheduledJob<T> {
  id: string
  priority: AnalysisJobPriority
  run: (signal: AbortSignal) => Promise<T>
  controller: AbortController
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const weight: Record<AnalysisJobPriority, number> = { interactive: 0, normal: 1, background: 2 }

export class AnalysisJobScheduler {
  private queue: ScheduledJob<unknown>[] = []
  private active: ScheduledJob<unknown> | null = null

  schedule<T>(id: string, priority: AnalysisJobPriority, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active?.id === id || this.queue.some((job) => job.id === id)) throw new Error('This analysis job already exists.')
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id, priority, run, controller: new AbortController(), resolve: resolve as (value: unknown) => void, reject })
      this.queue.sort((left, right) => weight[left.priority] - weight[right.priority])
      void this.next()
    })
  }

  cancel(id: string): boolean {
    if (this.active?.id === id) {
      this.active.controller.abort()
      return true
    }
    const index = this.queue.findIndex((job) => job.id === id)
    if (index < 0) return false
    const [job] = this.queue.splice(index, 1)
    job.controller.abort()
    job.reject(new Error('Semantic analysis cancelled.'))
    return true
  }

  private async next(): Promise<void> {
    if (this.active || !this.queue.length) return
    const job = this.queue.shift()!
    this.active = job
    try { job.resolve(await job.run(job.controller.signal)) } catch (error) { job.reject(error) }
    finally { this.active = null; void this.next() }
  }
}

export const analysisScheduler = new AnalysisJobScheduler()
