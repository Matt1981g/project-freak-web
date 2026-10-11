import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  SessionExercise,
  TrainingSet,
  SyncOutbox,
} from '../../domain/models'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { inspect_data_integrity } from '../diagnostics/dataIntegrity'
import {
  build_full_backup,
  preview_backup_json,
  restore_validated_backup,
  verify_database_against_backup,
} from './databaseBackup'

const SOURCE_NAME = 'pf-recovery-source-fixture'
const RECOVERY_NAME = 'pf-recovery-fresh-profile-fixture'
const NOW = '2026-10-11T08:00:00.000Z'

const base = {
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'phone-fixture',
  source_kind: 'user' as const,
  source_id: null,
}

const completed: CompletedSession = {
  ...base,
  id: 'session-recovery-1',
  programmed_session_id: null,
  programme_block_id: null,
  workout_template_id_snapshot: null,
  legacy_workout_id: null,
  session_name: 'Synthetic recovery session',
  session_date_local: '2026-10-11',
  timezone: 'Europe/London',
  status: 'completed',
  started_at: NOW,
  completed_at: NOW,
  source_start_text: null,
  source_finish_text: null,
  duration_seconds: 3600,
  notes: 'Restore acceptance fixture; not personal data.',
}

const exercise: SessionExercise = {
  ...base,
  id: 'session-exercise-recovery-1',
  completed_session_id: completed.id,
  programmed_session_exercise_id: null,
  exercise_id: 'exercise-recovery-1',
  exercise_name_snapshot: 'Curl (historical name preserved)',
  planned_order: 1,
  actual_order: 1,
  rotation_group_key: null,
  rotation_position: null,
  target_sets: 1,
  target_rep_min: 8,
  target_rep_max: 12,
  rest_seconds: 90,
  tempo: null,
  technique_cue: null,
  programme_notes: null,
  started_at: NOW,
  completed_at: NOW,
  notes: null,
}

const set: TrainingSet = {
  ...base,
  id: 'set-recovery-1',
  completed_session_id: completed.id,
  session_exercise_id: exercise.id,
  exercise_id: exercise.exercise_id,
  exercise_order_snapshot: 1,
  set_number: 1,
  set_role: 'work',
  structure_type: 'straight',
  load_kg: 40,
  load_type: 'normal',
  rep_mode: 'total',
  reps_as_recorded: '12',
  primary_reps_completed: 12,
  left_reps_completed: null,
  right_reps_completed: null,
  completed_reps: 12,
  partial_reps: null,
  duration_seconds: null,
  failure_status: 'none',
  left_failure_status: null,
  right_failure_status: null,
  actual_rest_seconds: 90,
  set_load_kg_reps: 480,
  set_load_method: 'load x reps',
  rpe: 8,
  notes: null,
  completed_at: NOW,
  source_record_key: null,
}

const pending: SyncOutbox = {
  id: 'outbox-recovery-1',
  entity_type: 'set',
  entity_id: set.id,
  operation: 'upsert',
  revision: 1,
  payload_json: { ...set },
  created_at: NOW,
  attempt_count: 0,
  last_attempt_at: null,
  synced_at: null,
}

describe('isolated-profile recovery acceptance (synthetic records only)', () => {
  let source: ProjectFreakDatabase
  let recovered: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(SOURCE_NAME)
    await Dexie.delete(RECOVERY_NAME)
    source = new ProjectFreakDatabase(SOURCE_NAME)
    recovered = new ProjectFreakDatabase(RECOVERY_NAME)
    await source.open()
    await recovered.open()

    await source.completed_sessions.add(completed)
    await source.session_exercises.add(exercise)
    await source.sets.add(set)
    await source.sync_outbox.add(pending)
    await source.settings.put({
      key: 'recovery-source-marker',
      scope: 'global',
      value_json: { keeper: true },
      updated_at: NOW,
      device_id: null,
    })
    await recovered.settings.put({
      key: 'separate-profile-original',
      scope: 'global',
      value_json: { original: true },
      updated_at: NOW,
      device_id: null,
    })
  })

  afterEach(async () => {
    source.close()
    recovered.close()
    await Dexie.delete(SOURCE_NAME)
    await Dexie.delete(RECOVERY_NAME)
  })

  it('restores a checksum-verified complete session into a different database without touching the original', async () => {
    const backup = await build_full_backup(source, {
      now_iso: NOW,
      source_device_id: 'phone-fixture',
    })

    // This path mirrors a downloaded JSON backup opened in a fresh browser profile.
    const preview = await preview_backup_json(JSON.stringify(backup))
    expect(preview.valid).toBe(true)
    expect(preview.table_counts.completed_sessions).toBe(1)
    expect(preview.table_counts.sets).toBe(1)

    const result = await restore_validated_backup(recovered, preview, {
      now_iso: NOW,
      source_device_id: 'isolated-browser-fixture',
    })

    expect(result.restored).toBe(true)
    expect(result.safety_backup.database.tables.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'separate-profile-original' }),
      ]),
    )

    const restored_counts = await verify_database_against_backup(
      recovered,
      preview.backup,
    )
    expect(restored_counts.completed_sessions).toBe(1)
    expect(restored_counts.session_exercises).toBe(1)
    expect(restored_counts.sets).toBe(1)
    expect(restored_counts.sync_outbox).toBe(1)
    expect(await inspect_data_integrity(recovered)).toMatchObject({
      status: 'clean',
      error_count: 0,
    })

    // Validate user-important values, including absent synthetic historical
    // enjoyment, manually recorded load, and the unsynced mutation.
    expect(await recovered.completed_sessions.get(completed.id)).toEqual(completed)
    expect(await recovered.session_exercises.get(exercise.id)).toEqual(exercise)
    expect(await recovered.sets.get(set.id)).toMatchObject({
      load_kg: 40,
      completed_reps: 12,
      rpe: 8,
    })
    expect(await recovered.sync_outbox.get(pending.id)).toMatchObject({
      synced_at: null,
      payload_json: expect.objectContaining({ id: set.id }),
    })

    // A recovery test must never modify the original IndexedDB profile.
    expect(await source.completed_sessions.get(completed.id)).toEqual(completed)
    expect(await source.sync_outbox.get(pending.id)).toEqual(pending)
    expect(await source.settings.get('separate-profile-original')).toBeUndefined()
    expect(await recovered.settings.get('recovery-source-marker')).toBeDefined()
  })

  it('rejects a compromised backup without erasing the separate recovery profile', async () => {
    const backup = await build_full_backup(source, {
      now_iso: NOW,
      source_device_id: 'phone-fixture',
    })
    backup.database.tables.sets[0] = {
      ...backup.database.tables.sets[0],
      completed_session_id: 'missing-parent-session',
    }

    const preview = await preview_backup_json(JSON.stringify(backup)).catch(
      () => null,
    )
    expect(preview).toBeNull()
    expect(await recovered.settings.get('separate-profile-original')).toBeDefined()
    expect(await source.sets.get(set.id)).toEqual(set)
  })
})
