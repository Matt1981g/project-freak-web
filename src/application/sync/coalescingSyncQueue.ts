/**
 * Single-tab sync event coalescing.
 * A new workout saved during an in-flight RPC demands ONE follow-up cycle.
 * Additional simultaneous events merge into the same follow-up instead of
 * being discarded or spawning parallel cloud requests.
 */
export class CoalescingSyncQueue {
  private running: Promise<void> | null = null
  private follow_up: (() => Promise<void>) | null = null
  private disposed = false

  request(work: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.running) {
      this.follow_up = work
      return this.running
    }

    const operation = Promise.resolve().then(async () => {
      let next: (() => Promise<void>) | null = work
      while (next && !this.disposed) {
        try {
          await next()
        } catch {
          // Auto sync runs without interrupting a workout. Manual sync reports
          // its own errors; a queued follow-up must still get its opportunity.
        }
        next = this.follow_up
        this.follow_up = null
      }
    }).finally(() => {
      this.running = null
    })

    this.running = operation
    return operation
  }

  dispose(): void {
    this.disposed = true
    this.follow_up = null
  }
}
