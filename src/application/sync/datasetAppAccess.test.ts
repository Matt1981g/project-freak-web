import { describe, expect, it } from 'vitest'
import { DatasetAppAccess } from './datasetAppAccess'

function fake_shared_locks(): LockManager {
  const active = new Map<string, { readers: number; writer: boolean }>()

  const request = async <T>(
    name: string,
    options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean },
    callback: (lock: Lock | null) => Promise<T>,
  ): Promise<T> => {
    const state = active.get(name) ?? { readers: 0, writer: false }
    const mode = options.mode ?? 'exclusive'
    const occupied = state.writer || (mode === 'exclusive' && state.readers > 0)
    if (occupied) {
      if (options.ifAvailable) return callback(null)
      throw new Error('Test lock contention; a browser would queue the shared lease')
    }
    if (mode === 'shared') state.readers += 1
    else state.writer = true
    active.set(name, state)
    try {
      return await callback({ name, mode } as Lock)
    } finally {
      if (mode === 'shared') state.readers -= 1
      else state.writer = false
    }
  }
  return { request } as unknown as LockManager
}

describe('whole-app shared leases protect destructive restore', () => {
  it('rejects restore while another PF tab is open without running the destructive task', async () => {
    const locks = fake_shared_locks()
    const first = new DatasetAppAccess('project-freak', locks)
    const second = new DatasetAppAccess('project-freak', locks)
    const states: boolean[] = []
    const stop_first = first.subscribe((ready) => states.push(ready))
    const stop_second = second.subscribe(() => {})
    try {
      await Promise.resolve()
      expect(states.at(-1)).toBe(true)
      let did_restore = false
      await expect(first.restore_exclusively(async () => {
        did_restore = true
      })).rejects.toThrow('another PROJECT FREAK tab is open')
      expect(did_restore).toBe(false)
      expect(states.at(-1)).toBe(true)
      stop_second()
      await Promise.resolve()
      await first.restore_exclusively(async () => {
        did_restore = true
      })
      expect(did_restore).toBe(true)
      expect(states).toContain(false)
      expect(states.at(-1)).toBe(true)
    } finally {
      stop_first()
      stop_second()
    }
  })

  it('recovers normal app access after a failed restore and rejects a second maintenance attempt', async () => {
    const locks = fake_shared_locks()
    const first = new DatasetAppAccess('project-freak', locks)
    const states: boolean[] = []
    const unsubscribe = first.subscribe((ready) => states.push(ready))
    try {
      await Promise.resolve()
      await expect(first.restore_exclusively(async () => {
        await expect(first.restore_exclusively(async () => 'nested'))
          .rejects.toThrow('already in maintenance')
        throw new Error('Broken backup')
      })).rejects.toThrow('Broken backup')
      expect(states.at(-1)).toBe(true)
      await expect(first.restore_exclusively(async () => 'recovery works'))
        .resolves.toBe('recovery works')
    } finally {
      unsubscribe()
    }
  })

  it('keeps offline training available but disables restoration when Web Locks are unavailable', async () => {
    const access = new DatasetAppAccess('project-freak', null)
    const states: boolean[] = []
    const unsubscribe = access.subscribe((ready) => states.push(ready))
    try {
      expect(states.at(-1)).toBe(true)
      await expect(access.restore_exclusively(async () => {
        throw new Error('Unsafe restore executed')
      })).rejects.toThrow('Restore disabled')
    } finally {
      unsubscribe()
    }
  })
})
