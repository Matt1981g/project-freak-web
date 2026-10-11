import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  Exercise,
  ExerciseMetrics,
  ReadinessEntry,
  SyncOutbox,
} from '../../domain/models'
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

  it('applies a remote entity with audit but without creating an echo outbox mutation', async () => {
    const remote: Exercise = {
      id: 'exercise-remote-1',
      created_at: '2026-09-04T20:00:00.000Z',
      updated_at: NOW,
      deleted_at: null,
      revision: 3,
      device_id: 'remote-device',
      source_kind: 'user',
      source_id: null,
      canonical_name: 'Remote Lat Pulldown',
      short_name: null,
      category: 'lats',
      equipment: 'Cable',
      default_load_type: 'normal',
      rep_mode_default: 'total',
      archived_at: null,
      notes: null,
    }

    await repository.apply_remote_entity('exercise', remote, NOW)

    await expect(
      repository.get_local_entity('exercise', remote.id),
    ).resolves.toEqual(remote)
    expect(await db.sync_outbox.count()).toBe(0)

    const audit = await db.audit_events.toArray()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      entity_type: 'exercise',
      entity_id: remote.id,
      action: 'sync_apply',
      reason: 'Remote sync applied',
      created_at: NOW,
    })
  })

  it('quarantines duplicate exercise metrics IDs without deleting or rewriting local scores', async () => {
    const local: ExerciseMetrics = {
      id: 'metrics-b',
      created_at: '2026-09-30T05:59:54.142Z',
      updated_at: '2026-09-30T05:59:57.573Z',
      deleted_at: null,
      revision: 3,
      device_id: 'device-morning',
      source_kind: 'user',
      source_id: null,
      session_exercise_id: 'session-exercise-1',
      rpe: 1,
      pump: 1,
      form: 1,
      where_felt_text: null,
      where_felt_tags: [],
      legacy_tension: null,
      legacy_mmc: null,
      notes: null,
    }
    const remote: ExerciseMetrics = {
      ...local,
      id: 'metrics-a',
      created_at: '2026-09-30T18:13:08.232Z',
      updated_at: '2026-09-30T18:13:10.696Z',
      device_id: 'device-evening',
    }

    await db.exercise_metrics.add(local)
    await expect(
      repository.apply_remote_entity_checked('exercise_metrics', remote, NOW),
    ).resolves.toBe('retained_conflict')

    expect(await db.exercise_metrics.toArray()).toEqual([local])
    expect(await db.sync_outbox.count()).toBe(0)
    const evidence = await db.audit_events.toArray()
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      action: 'sync_conflict',
      before_json: expect.objectContaining({ id: 'metrics-b', rpe: 1 }),
      after_json: expect.objectContaining({ id: 'metrics-a' }),
    })
    await expect(
      repository.apply_remote_entity('exercise_metrics', remote, NOW),
    ).rejects.toThrow('One-to-one ID collision')
    expect(await db.exercise_metrics.toArray()).toEqual([local])
  })

  it('quarantines duplicate readiness IDs without deleting or rewriting local recovery', async () => {
    const local: ReadinessEntry = {
      id: 'readiness-a',
      created_at: '2026-09-30T06:00:07.416Z',
      updated_at: '2026-09-30T06:01:15.797Z',
      deleted_at: null,
      revision: 37,
      device_id: 'device-morning',
      source_kind: 'user',
      source_id: null,
      completed_session_id: 'session-1',
      bodyweight_kg: null,
      sleep_duration_minutes: null,
      sleep_score: null,
      energy_pre: null,
      motivation_pre: null,
      soreness_score: null,
      soreness_notes: null,
      muscle_recovery: [],
      joint_issue_present: null,
      joint_issue_notes: null,
      pre_workout_nutrition: null,
      intra_workout_nutrition: null,
      intra_hydration_ml: null,
      post_workout_intake: 'older note',
      session_quality: 8,
      session_fatigue: 5,
      breathlessness: 5,
      energy_stability: 8,
      coach_note: 'older coach note',
      notes: null,
    }
    const remote: ReadinessEntry = {
      ...local,
      id: 'readiness-b',
      created_at: '2026-09-30T18:13:20.303Z',
      updated_at: '2026-09-30T18:14:17.950Z',
      revision: 21,
      device_id: 'device-evening',
      post_workout_intake: null,
      session_quality: 7,
      session_fatigue: 8,
      coach_note: 'newer coach note',
    }

    await db.readiness_entries.add(local)
    await expect(
      repository.apply_remote_entity_checked('readiness_entry', remote, NOW),
    ).resolves.toBe('retained_conflict')

    expect(await db.readiness_entries.toArray()).toEqual([local])
    expect(await db.sync_outbox.count()).toBe(0)
    const evidence = await db.audit_events.toArray()
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      action: 'sync_conflict',
      before_json: expect.objectContaining({ id: 'readiness-a', session_quality: 8 }),
      after_json: expect.objectContaining({ id: 'readiness-b', session_quality: 7 }),
    })
  })

  it('quarantines remote deletes of active exercise feedback, preserving recorded scores', async () => {
    const active: ExerciseMetrics = {
      id: 'metrics-same', created_at: NOW, updated_at: NOW,
      deleted_at: null, revision: 2, device_id: 'pc', source_kind: 'user',
      source_id: null, session_exercise_id: 'session-exercise-feedback',
      rpe: 9, pump: 8, form: 10, where_felt_text: null,
      where_felt_tags: [], legacy_tension: null, legacy_mmc: null, notes: null,
    }
    await db.exercise_metrics.add(active)
    const remote = {
      ...active,
      deleted_at: '2026-10-11T12:23:44Z',
      updated_at: '2026-10-11T12:23:44Z',
      revision: 100,
      device_id: 'phone',
    }
    expect(await repository.apply_remote_entity_checked('exercise_metrics', remote, NOW))
      .toBe('retained_conflict')
    expect(await db.exercise_metrics.get(active.id)).toEqual(active)
    expect(await db.sync_outbox.count()).toBe(0)
    expect((await db.audit_events.toArray())[0]).toMatchObject({
      action: 'sync_conflict',
      after_json: expect.objectContaining({ deleted_at: remote.deleted_at }),
    })
  })

  it('does not materialise remote one-to-one tombstones when there is no local row', async () => {
    const tombstone: ExerciseMetrics = {
      id: 'metrics-orphan', created_at: NOW, updated_at: NOW,
      deleted_at: NOW, revision: 50, device_id: 'other', source_kind: 'user',
      source_id: null, session_exercise_id: 'session-exercise-one-to-one',
      rpe: 8, pump: 7, form: 9, where_felt_text: null,
      where_felt_tags: [], legacy_tension: null, legacy_mmc: null, notes: null,
    }
    expect(await repository.apply_remote_entity_checked('exercise_metrics', tombstone, NOW))
      .toBe('retained_conflict')
    expect(await db.exercise_metrics.count()).toBe(0)
    expect((await db.audit_events.toArray())[0].action).toBe('sync_conflict')
  })

  it('detects pending local mutations for the same entity', async () => {
    const pending = outbox_fixture(
      'outbox-entity',
      '2026-09-04T20:00:00.000Z',
    )
    pending.entity_type = 'exercise'
    pending.entity_id = 'exercise-1'
    await db.sync_outbox.add(pending)

    await expect(
      repository.has_pending_entity_mutation('exercise', 'exercise-1'),
    ).resolves.toBe(true)
    await expect(
      repository.has_pending_entity_mutation('exercise', 'exercise-2'),
    ).resolves.toBe(false)
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
