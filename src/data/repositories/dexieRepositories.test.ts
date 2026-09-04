import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  Exercise,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
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

  it('consolidates a duplicate definition without rewriting the target or history keys', async () => {
    const target = exercise_fixture()
    const source: Exercise = {
      ...exercise_fixture(),
      id: '66666666-6666-4666-8666-666666666666',
      canonical_name: 'NAUTILUS BICEPS CURL',
    }

    await db.exercises.bulkAdd([target, source])

    const aliases = await repositories.exercises.merge_definitions(
      [source.id],
      target.id,
      DEVICE_ID,
      '2026-09-04T15:20:00.000Z',
    )

    expect(aliases).toHaveLength(1)
    expect(aliases[0].exercise_id).toBe(target.id)
    expect(aliases[0].source_exercise_id).toBe(source.id)
    expect(aliases[0].alias).toBe(source.canonical_name)

    expect((await db.exercises.get(target.id))?.canonical_name).toBe(
      target.canonical_name,
    )
    expect((await db.exercises.get(source.id))?.archived_at).toBe(
      '2026-09-04T15:20:00.000Z',
    )
    expect(await db.exercise_aliases.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(2)
    expect(await db.sync_outbox.count()).toBe(2)

    await repositories.exercises.merge_definitions(
      [source.id],
      target.id,
      DEVICE_ID,
      '2026-09-04T15:21:00.000Z',
    )

    expect(await db.exercise_aliases.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(2)
    expect(await db.sync_outbox.count()).toBe(2)
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

  it('creates a live workout graph atomically and reuses the programmed session', async () => {
    const session: CompletedSession = {
      ...session_fixture(),
      programmed_session_id: 'programmed-session-1',
    }
    const exercise: SessionExercise = {
      id: '77777777-7777-4777-8777-777777777777',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      revision: 1,
      device_id: DEVICE_ID,
      source_kind: 'user',
      source_id: null,
      completed_session_id: session.id,
      programmed_session_exercise_id: 'programmed-exercise-1',
      exercise_id: 'exercise-1',
      exercise_name_snapshot: 'Nautilus Bicep Curl',
      planned_order: 1,
      actual_order: 1,
      rotation_group_key: 'A',
      rotation_position: 1,
      target_sets: 4,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 90,
      tempo: '3-0-1-0',
      technique_cue: 'Keep upper arm fixed.',
      programme_notes: null,
      started_at: null,
      completed_at: null,
      notes: null,
    }

    await expect(
      repositories.sessions.create_session_graph(session, [exercise]),
    ).resolves.toEqual({ session_id: session.id, created: true })

    expect(await db.completed_sessions.count()).toBe(1)
    expect(await db.session_exercises.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(2)
    expect(await db.sync_outbox.count()).toBe(2)

    const duplicate_session: CompletedSession = {
      ...session,
      id: '88888888-8888-4888-8888-888888888888',
    }

    await expect(
      repositories.sessions.create_session_graph(duplicate_session, []),
    ).resolves.toEqual({ session_id: session.id, created: false })

    expect(await db.completed_sessions.count()).toBe(1)
    expect(await db.session_exercises.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(2)
    expect(await db.sync_outbox.count()).toBe(2)
  })

  it('preserves a completed attempt and allows a fresh repeat of the same programmed session', async () => {
    const completed: CompletedSession = {
      ...session_fixture(),
      id: '99999999-9999-4999-8999-999999999999',
      programmed_session_id: 'programmed-session-1',
      status: 'completed',
      completed_at: '2026-09-04T15:30:00.000Z',
      duration_seconds: 3600,
    }
    await db.completed_sessions.add(completed)

    const repeat: CompletedSession = {
      ...session_fixture(),
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      programmed_session_id: 'programmed-session-1',
      created_at: '2026-09-05T14:30:00.000Z',
      updated_at: '2026-09-05T14:30:00.000Z',
      started_at: '2026-09-05T14:30:00.000Z',
      session_date_local: '2026-09-05',
    }
    const repeat_exercise: SessionExercise = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      created_at: repeat.created_at,
      updated_at: repeat.updated_at,
      deleted_at: null,
      revision: 1,
      device_id: DEVICE_ID,
      source_kind: 'user',
      source_id: null,
      completed_session_id: repeat.id,
      programmed_session_exercise_id: 'programmed-exercise-1',
      exercise_id: 'exercise-1',
      exercise_name_snapshot: 'Nautilus Bicep Curl',
      planned_order: 1,
      actual_order: 1,
      rotation_group_key: 'A',
      rotation_position: 1,
      target_sets: 4,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 90,
      tempo: '3-0-1-0',
      technique_cue: null,
      programme_notes: null,
      started_at: null,
      completed_at: null,
      notes: null,
    }

    await expect(
      repositories.sessions.create_session_graph(repeat, [repeat_exercise]),
    ).resolves.toEqual({ session_id: repeat.id, created: true })

    expect(await db.completed_sessions.count()).toBe(2)
    expect((await db.completed_sessions.get(completed.id))?.status).toBe(
      'completed',
    )

    const current =
      await repositories.sessions.get_by_programmed_session_id(
        'programmed-session-1',
      )
    expect(current?.id).toBe(repeat.id)
    expect(current?.status).toBe('in_progress')

    const blocked_repeat: CompletedSession = {
      ...repeat,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }
    await expect(
      repositories.sessions.create_session_graph(blocked_repeat, []),
    ).resolves.toEqual({ session_id: repeat.id, created: false })

    expect(await db.completed_sessions.count()).toBe(2)
  })

  it('stores an explicit reason on an audited set correction', async () => {
    const set: TrainingSet = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      revision: 1,
      device_id: DEVICE_ID,
      source_kind: 'historical_import',
      source_id: 'batch-1',
      completed_session_id: 'session-1',
      session_exercise_id: 'session-exercise-1',
      exercise_id: 'exercise-1',
      exercise_order_snapshot: 1,
      set_number: 1,
      set_role: 'work',
      structure_type: 'straight',
      load_kg: 40,
      load_type: 'normal',
      rep_mode: 'total',
      reps_as_recorded: '10',
      primary_reps_completed: 10,
      left_reps_completed: null,
      right_reps_completed: null,
      completed_reps: 10,
      partial_reps: null,
      duration_seconds: null,
      failure_status: 'none',
      left_failure_status: null,
      right_failure_status: null,
      actual_rest_seconds: null,
      set_load_kg_reps: 400,
      set_load_method: 'kg_reps_full_reps_only_v1',
      notes: null,
      completed_at: NOW,
      source_record_key: 'source:set:1',
    }

    await repositories.sessions.put_set(set)

    const corrected: TrainingSet = {
      ...set,
      load_kg: 42.5,
      set_load_kg_reps: 425,
      revision: 2,
      updated_at: '2026-09-04T15:30:00.000Z',
    }
    await repositories.sessions.put_set(corrected, 'Entered wrong load')

    const audit = await db.audit_events
      .where('[entity_type+entity_id]')
      .equals(['set', set.id])
      .toArray()

    expect(audit).toHaveLength(2)
    expect(audit.find((event) => event.action === 'update')?.reason).toBe(
      'Entered wrong load',
    )
    expect((await db.sets.get(set.id))?.source_record_key).toBe(
      'source:set:1',
    )
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
