import Dexie from 'dexie'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import type { SyncOutbox } from '../../domain/models'
import { DexieSyncRepository } from '../../data/repositories/dexieRepositories'
import { quarantine_feedback_reconciliation_outbox } from './quarantineReconciliationOutbox'

const DB = 'pf-old-duplicates-quarantine-test'
const NOW = '2026-10-11T16:30:00Z'
function outbox(id: string, entity_type: string, operation: 'delete' | 'upsert',
  parent: string, revision: number): SyncOutbox {
  const entity_id = id.replace('out-', 'row-')
  return {
    id, entity_id, entity_type, operation, revision,
    created_at: NOW, attempt_count: 0, last_attempt_at: null, synced_at: null,
    payload_json: {
      id: entity_id, revision, created_at: NOW, updated_at: NOW,
      deleted_at: operation === 'delete' ? NOW : null,
      device_id: 'old-device', source_kind: 'user', source_id: null,
      [entity_type === 'readiness_entry' ? 'completed_session_id' : 'session_exercise_id']: parent,
    },
  }
}

describe('forensic outbox isolation and sync continuity', () => {
  let db: ProjectFreakDatabase
  let repo: DexieSyncRepository

  beforeEach(async () => {
    await Dexie.delete(DB)
    db = new ProjectFreakDatabase(DB)
    await db.open()
    repo = new DexieSyncRepository(db)
  })
  afterEach(async () => { db.close(); await Dexie.delete(DB) })

  it('durably quarantines old tombstones AND companion updates without deleting original outbox data', async () => {
    const rows = [
      outbox('out-r1', 'readiness_entry', 'delete', 'session-1', 102),
      outbox('out-r2', 'readiness_entry', 'delete', 'session-1', 91),
      outbox('out-m1', 'exercise_metrics', 'upsert', 'exercise-1', 70),
      outbox('out-m2', 'exercise_metrics', 'delete', 'exercise-1', 73),
      outbox('out-other', 'exercise_metrics', 'upsert', 'exercise-2', 2),
      outbox('out-set', 'set', 'upsert', 'set-1', 1),
    ]
    await db.sync_outbox.bulkAdd(rows)

    expect(await quarantine_feedback_reconciliation_outbox(db, NOW)).toBe(4)
    expect(await quarantine_feedback_reconciliation_outbox(db, NOW)).toBe(0)

    const quarantined = (await db.sync_outbox.toArray()).filter(x => x.quarantined_at)
    expect(quarantined.map(x => x.id).sort()).toEqual(['out-m1', 'out-m2', 'out-r1', 'out-r2'])
    expect(await db.sync_outbox.count()).toBe(6)
    expect((await db.audit_events.toArray()).filter(x => x.action === 'sync_conflict')).toHaveLength(4)
    const evidence = (await db.audit_events.toArray())[0]
    expect(evidence.before_json).toMatchObject({ id: expect.stringMatching(/^out-/) })
    expect(evidence.reason).toContain('never acknowledged or uploaded')
    expect(await repo.count_pending()).toBe(2)
    expect((await repo.list_pending(20)).map(x => x.id).sort()).toEqual(['out-other', 'out-set'])
    expect(await repo.has_pending_entity_mutation('readiness_entry', 'row-r1')).toBe(false)
  })

  it('holds unrelated, legitimate feedback edits and all ordinary workout sets intact', async () => {
    await db.sync_outbox.bulkAdd([
      outbox('out-legit', 'readiness_entry', 'upsert', 'session-real', 4),
      outbox('out-set', 'set', 'upsert', 'set-1', 2),
    ])
    expect(await quarantine_feedback_reconciliation_outbox(db, NOW)).toBe(0)
    expect(await repo.count_pending()).toBe(2)
    expect(await db.audit_events.count()).toBe(0)
  })

  it('fails atomically on malformed historical outbox, preserving sync evidence', async () => {
    const good = outbox('out-good', 'readiness_entry', 'delete', 'session-bad', 5)
    await db.sync_outbox.add(good)
    await db.sync_outbox.add({ ...outbox('out-invalid', 'readiness_entry', 'upsert', 'session-bad', 6),
      payload_json: { wrong: 'no entity id', completed_session_id: 'session-bad' } })
    await expect(quarantine_feedback_reconciliation_outbox(db, NOW)).rejects.toThrow(
      'Unsafe reconciliation outbox payload',
    )
    expect((await db.sync_outbox.toArray()).every(x => x.quarantined_at == null)).toBe(true)
    expect(await db.audit_events.count()).toBe(0)
  })
})
