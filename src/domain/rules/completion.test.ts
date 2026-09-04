import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  SessionExercise,
  TrainingSet,
} from '../models'
import {
  is_session_exercise_completed,
  is_training_set_completed,
} from './completion'

const NOW = '2026-09-04T18:00:00.000Z'

function historical_set(): TrainingSet {
  return {
    id: 'set-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
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
    completed_at: null,
    source_record_key: 'historical:set:1',
  }
}

function historical_exercise(): SessionExercise {
  return {
    id: 'session-exercise-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'historical_import',
    source_id: 'batch-1',
    completed_session_id: 'session-1',
    programmed_session_exercise_id: null,
    exercise_id: 'exercise-1',
    exercise_name_snapshot: 'Historical Curl',
    planned_order: null,
    actual_order: 1,
    rotation_group_key: null,
    rotation_position: null,
    target_sets: null,
    target_rep_min: null,
    target_rep_max: null,
    rest_seconds: null,
    tempo: null,
    technique_cue: null,
    programme_notes: null,
    started_at: null,
    completed_at: null,
    notes: null,
  }
}

function historical_session(status: CompletedSession['status']): CompletedSession {
  return {
    id: 'session-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'historical_import',
    source_id: 'batch-1',
    programmed_session_id: null,
    programme_block_id: null,
    workout_template_id_snapshot: null,
    legacy_workout_id: 'W01',
    session_name: 'W01',
    session_date_local: '2026-08-21',
    timezone: null,
    status,
    started_at: null,
    completed_at: null,
    source_start_text: '05:00',
    source_finish_text: '06:15',
    duration_seconds: null,
    notes: null,
  }
}

describe('historical completion semantics', () => {
  it('treats an imported historical set as complete without inventing a timestamp', () => {
    const set = historical_set()

    expect(set.completed_at).toBeNull()
    expect(is_training_set_completed(set)).toBe(true)
  })

  it('does not treat an ordinary unfinished user set as complete', () => {
    expect(
      is_training_set_completed({
        ...historical_set(),
        source_kind: 'user',
        source_id: null,
      }),
    ).toBe(false)
  })

  it('treats a historical exercise as complete inside a completed historical session', () => {
    const exercise = historical_exercise()
    const session = historical_session('completed')

    expect(exercise.completed_at).toBeNull()
    expect(is_session_exercise_completed(exercise, session)).toBe(true)
  })

  it('does not close a historical exercise when its parent session is not completed', () => {
    expect(
      is_session_exercise_completed(
        historical_exercise(),
        historical_session('in_progress'),
      ),
    ).toBe(false)
  })
})
