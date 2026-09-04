import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyncOutbox } from '../../domain/models'
import { ProjectFreakDatabase } from '../db/projectFreakDb'
import { DexieSyncRepository } from './dexieRepositories'

const TEST_DB_NAME = 'project-freak-sync-repository-test'
const NOW = '2026-09-04T21:00:00.000Z'

function outbox_fixture(
  id: string,
  created_at: string,
  synced_at: string | null = null,
): SyncOutbox {
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
    synced_at,
  }
}

describe('DexieSyncRepository', () => {
  let db: ProjectFreakDatabase
  let repository: DexieSyncRepository

  beforeEach(async () => {
    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()
    repository = new DexieSyncRepository(db)
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('lists only pending mutations oldest first and respects the batch limit', async () => {
    await db.sync_outbox.bulkAdd([
      outbox_fixture('later', '2026-09-04T20:02:00.000Z'),
      outbox_fixture('already-synced', '2026-09-04T19:00:00.000Z', NOW),
      outbox_fixture('first', '2026-09-04T20:00:00.000Z'),
      outbox_fixture('second', '2026-09-04T20:01:00.000Z'),
    ])

    const pending = await repository.list_pending(2)

    expect(pending.map((entry) => entry.id)).toEqual(['first', 'second'])
    await expect(repository.count_pending()).resolves.toBe(3)
  })

  it('increments attempt metadata without marking the mutation as synced', async () => {
    await db.sync_outbox.add(
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
    )

    await repository.mark_attempted(['outbox-1'], NOW)

    expect(await db.sync_outbox.get('outbox-1')).toMatchObject({
      attempt_count: 1,
      last_attempt_at: NOW,
      synced_at: null,
    })
  })

  it('marks only acknowledged records as synced', async () => {
    await db.sync_outbox.bulkAdd([
      outbox_fixture('outbox-1', '2026-09-04T20:00:00.000Z'),
      outbox_fixture('outbox-2', '2026-09-04T20:01:00.000Z'),
    ])

    await repository.mark_synced(['outbox-1'], NOW)

    expect((await db.sync_outbox.get('outbox-1'))?.synced_at).toBe(NOW)
    expect((await db.sync_outbox.get('outbox-2'))?.synced_at).toBeNull()
    await expect(repository.count_pending()).resolves.toBe(1)
  })

  it('persists provider sync state independently from training data', async () => {
    await repository.put_state({
      provider: 'test-cloud',
      remote_user_id: 'remote-user-1',
      pull_cursor: null,
      last_pull_at: null,
      last_push_at: NOW,
      status: 'idle',
      error: null,
    })

    await expect(repository.get_state('test-cloud')).resolves.toMatchObject({
      provider: 'test-cloud',
      remote_user_id: 'remote-user-1',
      last_push_at: NOW,
      status: 'idle',
    })
  })
})
