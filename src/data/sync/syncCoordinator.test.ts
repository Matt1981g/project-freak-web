import { describe, expect, it, vi } from 'vitest'
import type {
  MutableEntity,
  SyncOutbox,
  SyncState,
} from '../../domain/models'
import type { SyncProvider, SyncRepository } from './contracts'
import { canonicalise_sync_json } from './canonicalSyncJson'
import {
  run_pull_sync,
  run_push_sync,
  run_sync_cycle,
} from './syncCoordinator'

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

function entity_fixture(id: string, revision = 1): MutableEntity {
  return {
    id,
    created_at: '2026-09-04T20:00:00.000Z',
    updated_at: '2026-09-04T20:00:00.000Z',
    deleted_at: null,
    revision,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
  }
}

class MemorySyncRepository implements SyncRepository {
  state = new Map<string, SyncState>()
  entries: SyncOutbox[]
  entities = new Map<string, MutableEntity>()
  applied: string[] = []

  constructor(entries: SyncOutbox[]) {
    this.entries = entries
  }

  private key(entity_type: string, entity_id: string) {
    return `${entity_type}:${entity_id}`
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

  async get_local_entity(entity_type: string, entity_id: string) {
    return this.entities.get(this.key(entity_type, entity_id))
  }

  async has_pending_entity_mutation(
    entity_type: string,
    entity_id: string,
  ) {
    return this.entries.some(
      (entry) =>
        entry.entity_type === entity_type &&
        entry.entity_id === entity_id &&
        entry.synced_at === null,
    )
  }

  async apply_remote_entity(
    entity_type: string,
    entity: MutableEntity,
  ) {
    this.entities.set(this.key(entity_type, entity.id), entity)
    this.applied.push(this.key(entity_type, entity.id))
  }

  async apply_remote_entity_checked(
    entity_type: string,
    entity: MutableEntity,
  ) {
    const local = await this.get_local_entity(entity_type, entity.id)
    if (local && local.revision > entity.revision) return 'stale' as const
    if (local && local.revision === entity.revision) {
      return canonicalise_sync_json(local) === canonicalise_sync_json(entity)
        ? 'verified_duplicate' as const
        : 'retained_conflict' as const
    }
    if (await this.has_pending_entity_mutation(entity_type, entity.id)) {
      return 'retained_conflict' as const
    }
    await this.apply_remote_entity(entity_type, entity)
    return 'applied' as const
  }

}

function provider_fixture(
  push_mutations: SyncProvider['push_mutations'],
  pull_changes: SyncProvider['pull_changes'] = async (cursor) => ({
    changes: [],
    next_cursor: cursor,
    remote_user_id: null,
    error: null,
  }),
): SyncProvider {
  return { id: 'test-cloud', push_mutations, pull_changes }
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
  })

  it('surfaces stale offline edits retained in server conflict evidence even after acknowledgement', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('stale-1', '2026-09-04T20:00:00.000Z'),
    ])
    const provider = provider_fixture(async () => ({
      acknowledged_outbox_ids: ['stale-1'],
      retained_conflict_outbox_ids: ['stale-1'],
      remote_user_id: 'remote-user-1',
      error: '1 stale offline edit(s) preserved for recovery in the cloud conflict audit.',
    }))

    const result = await run_push_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.acknowledged).toBe(1)
    expect(result.pending_after).toBe(0)
    expect(result.error).toContain('preserved for recovery')
    expect(repository.state.get('test-cloud')?.error).toContain('preserved for recovery')
    // ACK is recorded only after the server has confirmed durable retention.
    expect(repository.entries[0].synced_at).toBe(NOW)
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
  })

  it('records a failed attempt without losing the pending mutation', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
    ])
    const provider = provider_fixture(async () => {
      throw new Error('network unavailable')
    })

    const result = await run_push_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.pending_after).toBe(1)
    expect(repository.entries[0]).toMatchObject({
      attempt_count: 1,
      last_attempt_at: NOW,
      synced_at: null,
    })
  })
})

describe('run_pull_sync', () => {
  it('applies a new remote entity and advances the cursor', async () => {
    const repository = new MemorySyncRepository([])
    const remote = entity_fixture('remote-1', 1)
    const provider = provider_fixture(
      async () => ({
        acknowledged_outbox_ids: [],
        remote_user_id: null,
        error: null,
      }),
      async () => ({
        changes: [
          {
            remote_change_id: 'change-1',
            entity_type: 'exercise',
            entity_id: remote.id,
            operation: 'upsert',
            revision: remote.revision,
            payload_json: remote as never,
            updated_at: remote.updated_at,
          },
        ],
        next_cursor: 'cursor-1',
        remote_user_id: 'remote-user-1',
        error: null,
      }),
    )

    const result = await run_pull_sync(repository, provider, { now_iso: NOW })

    expect(result).toMatchObject({
      received: 1,
      applied: 1,
      skipped: 0,
      conflicts: 0,
      cursor: 'cursor-1',
      status: 'idle',
    })
    expect(repository.applied).toEqual(['exercise:remote-1'])
  })

  it('skips an identical remote revision as an idempotent duplicate', async () => {
    const repository = new MemorySyncRepository([])
    const local = entity_fixture('entity-1', 2)
    repository.entities.set('exercise:entity-1', local)

    const provider = provider_fixture(
      async () => ({
        acknowledged_outbox_ids: [],
        remote_user_id: null,
        error: null,
      }),
      async () => ({
        changes: [
          {
            remote_change_id: 'change-1',
            entity_type: 'exercise',
            entity_id: local.id,
            operation: 'upsert',
            revision: local.revision,
            payload_json: local as never,
            updated_at: local.updated_at,
          },
        ],
        next_cursor: 'cursor-2',
        remote_user_id: null,
        error: null,
      }),
    )

    const result = await run_pull_sync(repository, provider, { now_iso: NOW })

    expect(result.skipped).toBe(1)
    expect(result.conflicts).toBe(0)
    expect(repository.applied).toHaveLength(0)
  })

  it('preserves local data when equal revisions have different content', async () => {
    const repository = new MemorySyncRepository([])
    const local = entity_fixture('entity-1', 2)
    repository.entities.set('exercise:entity-1', local)
    const remote = {
      ...local,
      updated_at: '2026-09-04T20:05:00.000Z',
    }

    const provider = provider_fixture(
      async () => ({
        acknowledged_outbox_ids: [],
        remote_user_id: null,
        error: null,
      }),
      async () => ({
        changes: [
          {
            remote_change_id: 'change-1',
            entity_type: 'exercise',
            entity_id: remote.id,
            operation: 'upsert',
            revision: remote.revision,
            payload_json: remote as never,
            updated_at: remote.updated_at,
          },
        ],
        next_cursor: 'cursor-conflict',
        remote_user_id: null,
        error: null,
      }),
    )

    const result = await run_pull_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.conflicts).toBe(1)
    expect(result.cursor).toBe('cursor-conflict')
    expect(repository.entities.get('exercise:entity-1')).toEqual(local)
  })

  it('does not starve at an older cloud event before a matching latest revision', async () => {
    const repository = new MemorySyncRepository([])
    const latest = entity_fixture('old-history', 3)
    repository.entities.set('exercise:old-history', latest)
    const first = entity_fixture('old-history', 1)
    const new_exercise = entity_fixture('new-later', 1)
    const provider = provider_fixture(
      async () => ({ acknowledged_outbox_ids: [], remote_user_id: null, error: null }),
      async () => ({
        changes: [
          { remote_change_id: 'evt-1', entity_type: 'exercise',
            entity_id: first.id, operation: 'upsert', revision: first.revision,
            payload_json: first as never, updated_at: first.updated_at },
          { remote_change_id: 'evt-2', entity_type: 'exercise',
            entity_id: latest.id, operation: 'upsert', revision: latest.revision,
            payload_json: latest as never, updated_at: latest.updated_at },
          { remote_change_id: 'evt-3', entity_type: 'exercise',
            entity_id: new_exercise.id, operation: 'upsert', revision: new_exercise.revision,
            payload_json: new_exercise as never, updated_at: new_exercise.updated_at },
        ],
        next_cursor: 'evt-3',
        remote_user_id: 'signed-in-user',
        error: null,
      }),
    )
    const result = await run_pull_sync(repository, provider, { now_iso: NOW })
    expect(result).toMatchObject({
      status: 'error', conflicts: 1, applied: 1, skipped: 1,
      cursor: 'evt-3',
    })
    expect(result.error).toContain('quarantined')
    expect(repository.entities.get('exercise:old-history')).toEqual(latest)
    expect(repository.entities.get('exercise:new-later')).toEqual(new_exercise)
    expect(repository.state.get('test-cloud')?.pull_cursor).toBe('evt-3')
  })

  it('does not overwrite a newer remote revision while local work is pending', async () => {
    const pending = outbox_fixture('outbox-1', '2026-09-04T20:01:00.000Z')
    pending.entity_type = 'exercise'
    pending.entity_id = 'entity-1'

    const repository = new MemorySyncRepository([pending])
    const local = entity_fixture('entity-1', 2)
    repository.entities.set('exercise:entity-1', local)
    const remote = {
      ...local,
      revision: 3,
      updated_at: '2026-09-04T20:05:00.000Z',
    }

    const provider = provider_fixture(
      async () => ({
        acknowledged_outbox_ids: [],
        remote_user_id: null,
        error: null,
      }),
      async () => ({
        changes: [
          {
            remote_change_id: 'change-1',
            entity_type: 'exercise',
            entity_id: remote.id,
            operation: 'upsert',
            revision: remote.revision,
            payload_json: remote as never,
            updated_at: remote.updated_at,
          },
        ],
        next_cursor: 'cursor-conflict',
        remote_user_id: null,
        error: null,
      }),
    )

    const result = await run_pull_sync(repository, provider, { now_iso: NOW })

    expect(result.status).toBe('error')
    expect(result.conflicts).toBe(1)
    expect(repository.applied).toHaveLength(0)
  })
})

describe('run_sync_cycle', () => {
  it('pushes local mutations before pulling remote changes', async () => {
    const repository = new MemorySyncRepository([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
    ])
    const calls: string[] = []
    const provider = provider_fixture(
      async (mutations) => {
        calls.push('push')
        return {
          acknowledged_outbox_ids: mutations.map((mutation) => mutation.outbox_id),
          remote_user_id: null,
          error: null,
        }
      },
      async () => {
        calls.push('pull')
        return {
          changes: [],
          next_cursor: 'cursor-1',
          remote_user_id: null,
          error: null,
        }
      },
    )

    const result = await run_sync_cycle(repository, provider, { now_iso: NOW })

    expect(calls).toEqual(['push', 'pull'])
    expect(result.push.status).toBe('idle')
    expect(result.pull?.status).toBe('idle')
  })
})
