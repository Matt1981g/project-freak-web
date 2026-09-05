import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { inspect_data_integrity } from './dataIntegrity'

const DB = 'project-freak-integrity-test'

describe('data integrity diagnostics', () => {
  let db: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(DB)
    db = new ProjectFreakDatabase(DB)
    await db.open()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(DB)
  })

  it('reports a clean empty database', async () => {
    const result = await inspect_data_integrity(
      db,
      '2026-09-05T12:00:00.000Z',
    )
    expect(result.status).toBe('clean')
    expect(result.issues).toEqual([])
  })

  it('detects a dangling session exercise without mutating it', async () => {
    await db.session_exercises.add({
      id: 'se-1',
      created_at: '2026-09-05T12:00:00.000Z',
      updated_at: '2026-09-05T12:00:00.000Z',
      deleted_at: null,
      revision: 1,
      device_id: 'device-1',
      source_kind: 'user',
      source_id: null,
      completed_session_id: 'missing-session',
      programmed_session_exercise_id: null,
      exercise_id: 'exercise-1',
      exercise_name_snapshot: 'Test Exercise',
      planned_order: 1,
      actual_order: 1,
      rotation_group_key: null,
      rotation_position: null,
      target_sets: 1,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 60,
      tempo: null,
      technique_cue: null,
      programme_notes: null,
      started_at: null,
      completed_at: null,
      notes: null,
    })

    const result = await inspect_data_integrity(db)
    expect(result.status).toBe('error')
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'orphan_session_exercise' }),
      ]),
    )
    expect(await db.session_exercises.count()).toBe(1)
  })
})
