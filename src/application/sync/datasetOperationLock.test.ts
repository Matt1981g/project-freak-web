import { describe, expect, it } from 'vitest'
import {
  DatasetOperationUnavailableError,
  dataset_operation_lock_name,
  with_dataset_operation_lock,
} from './datasetOperationLock'

// Faithful, in-memory model of navigator.locks.request with ifAvailable:
// a lock remains held across awaited work and independent tabs cannot enter.
function fake_web_locks(): LockManager {
  const held = new Set<string>()
  const request = async <T>(
    name: string,
    options: { ifAvailable: true; mode: 'exclusive' },
    callback: (lock: Lock | null) => Promise<T>,
  ): Promise<T> => {
    if (!options.ifAvailable || options.mode !== 'exclusive') {
      throw new Error('Expected a non-queuing exclusive Web Lock')
    }
    if (held.has(name)) return callback(null)
    held.add(name)
    try {
      return await callback({ name, mode: 'exclusive' } as Lock)
    } finally {
      held.delete(name)
    }
  }
  return { request } as unknown as LockManager
}

function deferred() {
  let release: () => void = () => { throw new Error('Not started') }
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release: () => release() }
}

describe('origin-wide PF data operation coordination', () => {
  it('gives cloud sync exclusive access until its whole asynchronous operation finishes', async () => {
    const locks = fake_web_locks()
    const finish = deferred()
    const events: string[] = []

    const first = with_dataset_operation_lock(
      'project-freak',
      'cloud sync',
      async () => {
        events.push('sync started')
        await finish.promise
        events.push('sync finished')
      },
      locks,
    )

    await expect(with_dataset_operation_lock(
      'project-freak',
      'restore',
      async () => { events.push('restore incorrectly started') },
      locks,
    )).rejects.toBeInstanceOf(DatasetOperationUnavailableError)

    await expect(with_dataset_operation_lock(
      'project-freak',
      'sign out',
      async () => { events.push('sign out incorrectly started') },
      locks,
    )).rejects.toThrow('another PF tab')

    expect(events).toEqual(['sync started'])
    finish.release()
    await first

    await with_dataset_operation_lock(
      'project-freak',
      'restore',
      async () => { events.push('restore after sync') },
      locks,
    )

    expect(events).toEqual([
      'sync started',
      'sync finished',
      'restore after sync',
    ])
  })

  it('does not leak locks after rejected or failed operations', async () => {
    const locks = fake_web_locks()
    await expect(with_dataset_operation_lock(
      'project-freak', 'restore', async () => { throw new Error('bad archive') }, locks,
    )).rejects.toThrow('bad archive')

    await expect(with_dataset_operation_lock(
      'project-freak', 'cloud sync', async () => 'next task succeeded', locks,
    )).resolves.toBe('next task succeeded')
  })

  it('uses one lock for every operation on the same dataset, but separates distinct databases', async () => {
    const locks = fake_web_locks()
    expect(dataset_operation_lock_name('project-freak')).toContain('project-freak')
    const finish = deferred()
    const started = with_dataset_operation_lock(
      'project-freak',
      'cloud sync',
      () => finish.promise,
      locks,
    )
    await expect(with_dataset_operation_lock(
      'project-freak',
      'link cloud account',
      async () => 'not executed',
      locks,
    )).rejects.toThrow('another PF tab')

    await expect(with_dataset_operation_lock(
      'isolated-recovery-test',
      'restore',
      async () => 'separate database',
      locks,
    )).resolves.toBe('separate database')

    finish.release()
    await started
  })

  it('fails closed without Web Locks, never executing destructive or network work', async () => {
    let was_called = false
    await expect(with_dataset_operation_lock(
      'project-freak', 'restore', async () => {
        was_called = true
      }, null,
    )).rejects.toThrow('does not support cross-tab Web Locks')
    await expect(with_dataset_operation_lock(
      'project-freak', 'cloud sync', async () => {
        was_called = true
      }, null,
    )).rejects.toThrow('does not support cross-tab Web Locks')
    expect(was_called).toBe(false)
  })
})
