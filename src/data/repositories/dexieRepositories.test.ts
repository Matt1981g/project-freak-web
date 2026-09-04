import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CompletedSession, Exercise } from '../../domain/models'
import { ProjectFreakDatabase } from '../db/projectFreakDb'
import { create_repositories } from './dexieRepositories'

const TEST_DB_NAME = 'project-freak-repository-test'

const NOW = '2026-09-04T14:30:00.000Z'
const DEVICE_ID = '11111111-1111-4111-8111-111111111111'

function exercise_fixture(): Exercise {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    canonical_name: 'Nautilus Biceps Curl',
    short_name: null,
    category: 'biceps',
    equipment: 'Nautilus',
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
  }
}

function session_fixture(): CompletedSession {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    programmed_session_id: null,
    programme_block_id: null,
    workout_template_id_snapshot: null,
    legacy_workout_id: null,
    session_name: 'Arms',
    session_date_local: '2026-09-04',
    timezone: 'Europe/London',
    status: 'in_progress',
    started_at: NOW,
    completed_at: null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: null,
    notes: null,
  }
}

describe('Dexie repositories', () => {
  let db: ProjectFreakDatabase
  let repositories: ReturnType<typeof create_repositories>

  beforeEach(async () => {
    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()
    repositories = create_repositories(db)
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('reuses one stable local device identity', async () => {
    const first = await repositories.devices.ensure_local('test-platform')
    const second = await repositories.devices.ensure_local('test-platform-2')

    expect(second.id).toBe(first.id)
    expect(second.platform).toBe('test-platform-2')
    expect(await db.devices.count()).toBe(1)
  })

  it('persists an exercise with audit and sync records in the same mutation', async () => {
    const exercise = exercise_fixture()

    await repositories.exercises.put(exercise)

    expect(await db.exercises.get(exercise.id)).toEqual(exercise)

    const audit = await db.audit_events.toArray()
    expect(audit).toHaveLength(1)
    expect(audit[0].entity_type).toBe('exercise')
    expect(audit[0].action).toBe('create')

    const outbox = await db.sync_outbox.toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0].entity_type).toBe('exercise')
    expect(outbox[0].operation).toBe('upsert')
    expect(outbox[0].revision).toBe(1)
  })

  it('lists active and archived exercises without deleting either definition', async () => {
    const active = exercise_fixture()
    const archived: Exercise = {
      ...exercise_fixture(),
      id: '55555555-5555-4555-8555-555555555555',
      canonical_name: 'LAT PULLDOWN',
      archived_at: '2026-09-04T15:00:00.000Z',
    }

    await repositories.exercises.put(active)
    await repositories.exercises.put(archived)

    expect((await repositories.exercises.list_active()).map((exercise) => exercise.id)).toEqual([
      active.id,
    ])
    expect((await repositories.exercises.list_all()).map((exercise) => exercise.id).sort()).toEqual([
      active.id,
      archived.id,
    ].sort())
  })

  it('records an update rather than rewriting the original audit history', async () => {
    const exercise = exercise_fixture()
    await repositories.exercises.put(exercise)

    const updated: Exercise = {
      ...exercise,
      canonical_name: 'Nautilus Bicep Curl',
      revision: 2,
      updated_at: '2026-09-04T14:31:00.000Z',
    }

    await repositories.exercises.put(updated)

    const audit = await db.audit_events.toArray()
    expect(audit).toHaveLength(2)
    expect(audit.map((event) => event.action).sort()).toEqual([
      'create',
      'update',
    ])

    const update_event = audit.find((event) => event.action === 'update')
    expect(update_event?.before_json).not.toBeNull()

    expect(await db.sync_outbox.count()).toBe(2)
  })

  it('lists completed sessions newest first', async () => {
    const newer = session_fixture()
    const older: CompletedSession = {
      ...session_fixture(),
      id: '44444444-4444-4444-8444-444444444444',
      session_date_local: '2026-09-01',
    }

    await repositories.sessions.put_session(older)
    await repositories.sessions.put_session(newer)

    const sessions = await repositories.sessions.list_sessions_descending()

    expect(sessions.map((session) => session.id)).toEqual([
      newer.id,
      older.id,
    ])
  })
})
