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
  private active = new Map<string, ScheduledJob<unknown>>()
  private concurrency = 1

  setConcurrency(value: number): void {
    this.concurrency = Math.max(1, Math.min(2, Math.floor(value)))
    void this.next()
  }

  schedule<T>(id: string, priority: AnalysisJobPriority, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active.has(id) || this.queue.some((job) => job.id === id)) throw new Error('This analysis job already exists.')
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id, priority, run, controller: new AbortController(), resolve: resolve as (value: unknown) => void, reject })
      this.queue.sort((left, right) => weight[left.priority] - weight[right.priority])
      void this.next()
    })
  }

  cancel(id: string): boolean {
    const active = this.active.get(id)
    if (active) {
      active.controller.abort()
      return true
    }
    const index = this.queue.findIndex((job) => job.id === id)
    if (index < 0) return false
    const [job] = this.queue.splice(index, 1)
    job.controller.abort()
    job.reject(new Error('Analysis job cancelled.'))
    return true
  }

  private next(): void {
    while (this.active.size < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!
      this.active.set(job.id, job)
      void this.execute(job)
    }
  }

  private async execute(job: ScheduledJob<unknown>): Promise<void> {
    try { job.resolve(await job.run(job.controller.signal)) } catch (error) { job.reject(error) }
    finally { this.active.delete(job.id); this.next() }
  }
}

export const analysisScheduler = new AnalysisJobScheduler()
