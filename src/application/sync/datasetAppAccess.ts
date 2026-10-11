/**
 * One shared app lease per live PF tab. Destructive restoration temporarily
 * releases this tab's shared lease and acquires the exclusive maintenance
 * lease, refusing to proceed while any other PF tab is open.
 *
 * This deliberately does NOT block normal cloud sync while a workout is open;
 * cloud operations continue to use their separate operation lock.
 */
export const DATASET_APP_LOCK_PREFIX = 'project-freak:open-app'

export function dataset_app_lock_name(database_name: string): string {
  return `${DATASET_APP_LOCK_PREFIX}:${database_name}`
}

type AvailabilityListener = (available: boolean) => void

interface Lease {
  acquired: Promise<void>
  finished: Promise<void>
  release: () => void
  held: () => boolean
}

export class DatasetAppAccess {
  private readonly name: string
  private readonly locks: LockManager | null
  private readonly listeners = new Set<AvailabilityListener>()
  private lease: Lease | null = null
  private closing: Promise<void>[] = []
  private paused = false
  private available = false

  constructor(database_name: string, lock_manager?: LockManager | null) {
    this.name = dataset_app_lock_name(database_name)
    this.locks = lock_manager === undefined
      ? (typeof navigator === 'undefined' ? null : navigator.locks ?? null)
      : lock_manager
  }

  private emit(available: boolean) {
    this.available = available
    for (const listener of this.listeners) listener(available)
  }

  private open_lease(): Lease | null {
    if (!this.locks) {
      // Offline training is still available on older browsers; destructive
      // restore remains prohibited without a reliable cross-tab lock.
      this.emit(true)
      return null
    }

    const abort = new AbortController()
    let acquired = false
    let release_hold: () => void = () => {}
    let notify_acquired: () => void = () => {}
    const hold = new Promise<void>((resolve) => { release_hold = resolve })
    const ready = new Promise<void>((resolve) => { notify_acquired = resolve })

    const finished = this.locks.request(
      this.name,
      { mode: 'shared', signal: abort.signal },
      async (lock) => {
        if (!lock) throw new Error('The PF app access lease was denied.')
        acquired = true
        notify_acquired()
        if (!this.paused) this.emit(true)
        await hold
      },
    ).catch(() => {
      if (this.lease?.finished === finished) this.emit(false)
    }).finally(() => {
      notify_acquired()
      if (this.lease?.finished === finished) {
        this.lease = null
        this.emit(false)
      }
    })

    const lease: Lease = {
      acquired: ready,
      finished,
      held: () => acquired,
      release: () => {
        if (acquired) release_hold()
        else abort.abort()
      },
    }
    this.lease = lease
    return lease
  }

  /** Reacquire a lost lease when an iOS PWA resumes from suspension. */
  ensure_access() {
    if (this.listeners.size > 0 && !this.paused && !this.lease) {
      this.open_lease()
    }
  }

  subscribe(listener: AvailabilityListener): () => void {
    this.listeners.add(listener)
    listener(this.available)
    if (this.listeners.size === 1 && !this.lease && !this.paused) {
      this.open_lease()
    }

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.lease) {
        const current = this.lease
        this.lease = null
        current.release()
        this.closing.push(current.finished)
        this.emit(false)
      }
    }
  }

  async restore_exclusively<T>(task: () => Promise<T>): Promise<T> {
    if (!this.locks) {
      throw new Error(
        'Restore disabled: this browser cannot safely coordinate PF tabs. Keep your downloaded backup.',
      )
    }
    if (this.paused) throw new Error('PF is already in maintenance mode.')
    if (this.listeners.size === 0 || !this.lease?.held()) {
      throw new Error('PF app access is not ready. Reopen Backup and try again.')
    }

    this.paused = true
    this.emit(false)
    const old = this.lease
    this.lease = null
    old.release()
    try {
      await old.finished
      await Promise.all(this.closing.splice(0))
      return await this.locks.request(
        this.name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (!lock) {
            throw new Error(
              'Restore refused: another PROJECT FREAK tab is open. Close every other PF tab or window before restoring. No data was changed.',
            )
          }
          return task()
        },
      )
    } finally {
      this.paused = false
      if (this.listeners.size > 0) {
        const reopened = this.open_lease()
        await reopened?.acquired
      }
    }
  }
}

export const projectFreakAppAccess = new DatasetAppAccess('project-freak')
