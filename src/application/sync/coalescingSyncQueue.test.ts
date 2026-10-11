import { describe, expect, it } from 'vitest'
import { CoalescingSyncQueue } from './coalescingSyncQueue'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release: () => release() }
}

describe('follow-up cloud sync demand', () => {
  it('repeats once after an active push finishes even when several workout events arrive', async () => {
    const queue = new CoalescingSyncQueue()
    const gate = deferred()
    const calls: string[] = []
    const first = queue.request(async () => {
      calls.push('started first')
      await gate.promise
      calls.push('ended first')
    })
    await Promise.resolve()
    const duplicate = queue.request(async () => { calls.push('old pending') })
    const latest = queue.request(async () => { calls.push('follow-up') })
    expect(duplicate).toBe(first)
    expect(latest).toBe(first)
    gate.release()
    await first
    expect(calls).toEqual(['started first', 'ended first', 'follow-up'])
  })

  it('runs an incoming event after an earlier failed attempt instead of losing it', async () => {
    const queue = new CoalescingSyncQueue()
    const gate = deferred()
    const calls: string[] = []
    const first = queue.request(async () => {
      calls.push('first')
      await gate.promise
      throw new Error('network failure')
    })
    await Promise.resolve()
    queue.request(async () => { calls.push('saved workout retry') })
    gate.release()
    await first
    expect(calls).toEqual(['first', 'saved workout retry'])
  })

  it('does not start pending sync work after the app has unmounted', async () => {
    const queue = new CoalescingSyncQueue()
    const gate = deferred()
    let calls = 0
    const first = queue.request(async () => { calls++; await gate.promise })
    await Promise.resolve()
    queue.request(async () => { calls++ })
    queue.dispose()
    gate.release()
    await first
    expect(calls).toBe(1)
    await queue.request(async () => { calls++ })
    expect(calls).toBe(1)
  })
})
