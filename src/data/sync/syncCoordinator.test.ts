import { describe, expect, it, vi } from 'vitest'
import type { SyncOutbox, SyncState } from '../../domain/models'
import type { SyncProvider, SyncRepository } from './contracts'
import { run_push_sync } from './syncCoordinator'

const NOW = '2026-09-04T21:00:00.000Z'

function outbox_fixture(id: string, created_at: string): SyncOutbox {
  return {
    id,
    entity_type: 'set',
    entity_id: `entity-${id}`,
    operation: 'upsert',
    revision: 1,
    payload_json: { id: `entity-${id}`, revision: 1 },
    created_at,
    attempt_count: 0,
    last_attempt_at: null,
    synced_at: null,
  }
}

class MemorySyncRepository implements SyncRepository {
  state = new Map<string, SyncState>()
  entries: SyncOutbox[]

  constructor(entries: SyncOutbox[]) {
    this.entries = entries
  }

  async get_state(provider: string) {
    return this.state.get(provider)
  }

  async put_state(state: SyncState) {
    this.state.set(state.provider, state)
    return state.provider
  }

  async list_pending(limit: number) {
    return this.entries
      .filter((entry) => entry.synced_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
  }

  async mark_attempted(ids: readonly string[], attempted_at: string) {
    const selected = new Set(ids)
    this.entries = this.entries.map((entry) =>
      selected.has(entry.id)
        ? {
            ...entry,
            attempt_count: entry.attempt_count + 1,
            last_attempt_at: attempted_at,
          }
        : entry,
    )
  }

  async mark_synced(ids: readonly string[], synced_at: string) {
    const selected = new Set(ids)
    this.entries = this.entries.map((entry) =>
      selected.has(entry.id) ? { ...entry, synced_at } : entry,
    )
  }

  async count_pending() {
    return this.entries.filter((entry) => entry.synced_at === null).length
  }
}

function provider_fixture(
  push_mutations: SyncProvider['push_mutations'],
): SyncProvider {
  return { id: 'test-cloud', push_mutations }
}

describe('run_push_sync', () => {
  it('stays idle when there is nothing to push', async () => {
    const repository = new MemorySyncRepository([])
    const push_mutations = vi.fn()
    const provider = provider_fixture(push_mutations)

    await expect(
      run_push_sync(repository, provider, { now_iso: NOW }),
    ).resolves.toEqual({
      provider: 'test-cloud',
      attempted: 0,
      acknowledged: 0,
      pending_after: 0,
      status: 'idle',
      error: null,
    })

    expect(push_mutations).not.toHaveBeenCalled()
  })

  it('marks an acknowledged batch as synced', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
      outbox_fixture('outbox-2', '2026-09-04T20:01:00.000Z'),
    ])
    const provider = provider_fixture(async (mutations) => ({
      acknowledged_outbox_ids: mutations.map((mutation) => mutation.outbox_id),
      remote_user_id: 'remote-user-1',
      error: null,
    }))

    const result = await run_push_sync(repository, provider, {
      now_iso: NOW,
      batch_size: 100,
    })

    expect(result).toEqual({
      provider: 'test-cloud',
      attempted: 2,
      acknowledged: 2,
      pending_after: 0,
      status: 'idle',
      error: null,
    })
    expect(repository.entries.every((entry) => entry.synced_at === NOW)).toBe(true)
    expect(repository.entries.every((entry) => entry.attempt_count === 1)).toBe(true)
    expect(repository.state.get('test-cloud')).toMatchObject({
      remote_user_id: 'remote-user-1',
      last_push_at: NOW,
      status: 'idle',
      error: null,
    })
  })

  it('keeps unacknowledged records pending after a partial response', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
      outbox_fixture('outbox-2', '2026-09-04T20:01:00.000Z'),
    ])
    const provider = provider_fixture(async () => ({
      acknowledged_outbox_ids: ['outbox-1'],
      remote_user_id: null,
      error: null,
    }))

    const result = await run_push_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.acknowledged).toBe(1)
    expect(result.pending_after).toBe(1)
    expect(repository.entries[0].synced_at).toBe(NOW)
    expect(repository.entries[1].synced_at).toBeNull()
  })

  it('records a failed attempt without losing the pending mutation', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
    ])
    const provider = provider_fixture(async () => {
      throw new Error('network unavailable')
    })

    const result = await run_push_sync(repository, provider, { now_iso: NOW })

    expect(result).toEqual({
      provider: 'test-cloud',
      attempted: 1,
      acknowledged: 0,
      pending_after: 1,
      status: 'error',
      error: 'network unavailable',
    })
    expect(repository.entries[0]).toMatchObject({
      attempt_count: 1,
      last_attempt_at: NOW,
      synced_at: null,
    })
  })

  it('rejects acknowledgements for records outside the attempted batch', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
    ])
    const provider = provider_fixture(async () => ({
      acknowledged_outbox_ids: ['not-in-batch'],
      remote_user_id: null,
      error: null,
    }))

    const result = await run_push_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.pending_after).toBe(1)
    expect(result.error).toContain('not in this batch')
  })
})
