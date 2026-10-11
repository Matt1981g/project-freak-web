import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { load_local_conflict_diagnostics } from './conflictDiagnostics'

const NAME = 'pf-conflict-diagnostics-test'

describe('read-only local recovery evidence', () => {
  let db: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(NAME)
    db = new ProjectFreakDatabase(NAME)
    await db.open()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(NAME)
  })

  it('summarises local retained snapshots without exposing workout contents or changing the audit', async () => {
    const conflict = {
      id: 'conflict-1',
      entity_type: 'set',
      entity_id: 'set-sensitive-id',
      action: 'sync_conflict' as const,
      before_json: { load_kg: 60 },
      after_json: { load_kg: 65, private_note: 'do not display' },
      reason: 'Equal revision with divergent content',
      device_id: 'phone',
      created_at: '2026-10-11T11:00:00Z',
    }
    await db.audit_events.bulkAdd([
      conflict,
      {
        ...conflict,
        id: 'update-1',
        action: 'update',
        created_at: '2026-10-11T11:30:00Z',
      },
    ])
    const result = await load_local_conflict_diagnostics(db)
    expect(result).toEqual({
      retained_total: 1,
      recent: [{
        entity_type: 'set',
        entity_id: 'set-sensitive-id',
        recorded_at: '2026-10-11T11:00:00Z',
        reason: 'Equal revision with divergent content',
      }],
    })
    expect(JSON.stringify(result)).not.toContain('private_note')
    expect(await db.audit_events.count()).toBe(2)
  })

  it('handles empty historical stores', async () => {
    expect(await load_local_conflict_diagnostics(db)).toEqual({
      retained_total: 0,
      recent: [],
    })
  })
})
