import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import {
  load_weekly_training_analysis,
  monday_week_start,
} from './weeklyAnalysis'

const NOW = '2026-09-04T18:00:00.000Z'

function session(
  id: string,
  date: string,
  status: CompletedSession['status'] = 'completed',
): CompletedSession {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    programmed_session_id: null,
    programme_block_id: null,
    workout_template_id_snapshot: null,
    legacy_workout_id: null,
    session_name: id,
    session_date_local: date,
    timezone: 'Europe/London',
    status,
    started_at: NOW,
    completed_at: status === 'completed' ? NOW : null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: status === 'completed' ? 3600 : null,
    notes: null,
  }
}

function exercise(
  id: string,
  completed_session_id: string,
): SessionExercise {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id,
    programmed_session_exercise_id: null,
    exercise_id: `definition-${id}`,
    exercise_name_snapshot: id,
    planned_order: 1,
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
    started_at: NOW,
    completed_at: NOW,
    notes: null,
  }
}

function training_set(
  id: string,
  completed_session_id: string,
  options: Partial<TrainingSet> = {},
): TrainingSet {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id,
    session_exercise_id: `exercise-${completed_session_id}`,
    exercise_id: 'definition-1',
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
    source_record_key: null,
    ...options,
  }
}

function metrics(
  id: string,
  session_exercise_id: string,
  rpe: number | null,
  pump: number | null,
  form: number | null,
): ExerciseMetrics {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    session_exercise_id,
    rpe,
    pump,
    form,
    where_felt_text: null,
    where_felt_tags: [],
    legacy_tension: null,
    legacy_mmc: null,
    notes: null,
  }
}

function repository_fixture(): SessionRepository {
  const sessions = [
    session('week-two', '2026-09-07'),
    session('sunday', '2026-09-06'),
    session('monday', '2026-08-31'),
    session('active', '2026-09-04', 'in_progress'),
  ]

  const exercises: Record<string, SessionExercise[]> = {
    'week-two': [exercise('exercise-week-two', 'week-two')],
    sunday: [exercise('exercise-sunday', 'sunday')],
    monday: [exercise('exercise-monday', 'monday')],
    active: [exercise('exercise-active', 'active')],
  }

  const sets: Record<string, TrainingSet[]> = {
    'week-two': [
      training_set('week-two-work', 'week-two', {
        load_type: 'assistance',
        set_load_kg_reps: null,
      }),
    ],
    sunday: [
      training_set('sunday-work', 'sunday', {
        source_kind: 'historical_import',
        completed_at: null,
        load_kg: 30,
        primary_reps_completed: 12,
        completed_reps: 12,
        set_load_kg_reps: 360,
      }),
    ],
    monday: [
      training_set('monday-warmup', 'monday', {
        set_role: 'warmup',
        set_load_kg_reps: 200,
      }),
      training_set('monday-work-one', 'monday', {
        set_load_kg_reps: 400,
      }),
      training_set('monday-work-two', 'monday', {
        set_number: 2,
        primary_reps_completed: 8,
        completed_reps: 8,
        failure_status: 'attempted_next_rep_failed',
        set_load_kg_reps: 320,
      }),
      training_set('monday-deleted', 'monday', {
        deleted_at: NOW,
        set_load_kg_reps: 9999,
      }),
    ],
    active: [training_set('active-work', 'active')],
  }

  const metric_records: Record<string, ExerciseMetrics> = {
    'exercise-sunday': metrics(
      'metrics-sunday',
      'exercise-sunday',
      9,
      5,
      null,
    ),
    'exercise-monday': metrics(
      'metrics-monday',
      'exercise-monday',
      8,
      4,
      5,
    ),
    'exercise-week-two': metrics(
      'metrics-week-two',
      'exercise-week-two',
      null,
      null,
      null,
    ),
  }

  return {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => sessions,
    list_session_exercises: async (session_id) => exercises[session_id] ?? [],
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: async (session_id) => sets[session_id] ?? [],
    get_exercise_metrics: async (session_exercise_id) =>
      metric_records[session_exercise_id],
    create_session_graph: async (created_session) => ({
      session_id: created_session.id,
      created: true,
    }),
    put_session: async (created_session) => created_session.id,
    put_session_exercise: async (session_exercise) => session_exercise.id,
    put_set: async (set) => set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (record) => record.id,
  }
}

describe('weekly training analysis', () => {
  it('uses Monday-to-Sunday local week boundaries', () => {
    expect(monday_week_start('2026-08-31')).toBe('2026-08-31')
    expect(monday_week_start('2026-09-06')).toBe('2026-08-31')
    expect(monday_week_start('2026-09-07')).toBe('2026-09-07')
  })

  it('counts only completed working sets and preserves missing metric evidence', async () => {
    const weeks = await load_weekly_training_analysis(repository_fixture())

    expect(weeks).toHaveLength(2)

    expect(weeks[0]).toEqual({
      week_start_local: '2026-09-07',
      week_end_local: '2026-09-13',
      completed_sessions: 1,
      working_sets: 1,
      comparable_tonnage_kg: 0,
      failure_sets: 0,
      rpe: { value: null, samples: 0 },
      pump: { value: null, samples: 0 },
      form: { value: null, samples: 0 },
    })

    expect(weeks[1]).toEqual({
      week_start_local: '2026-08-31',
      week_end_local: '2026-09-06',
      completed_sessions: 2,
      working_sets: 3,
      comparable_tonnage_kg: 1080,
      failure_sets: 1,
      rpe: { value: 8.5, samples: 2 },
      pump: { value: 4.5, samples: 2 },
      form: { value: 5, samples: 1 },
    })
  })
})
