import { describe, expect, it, vi } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import { load_workout_history } from './workoutHistory'

const NOW = '2026-09-04T18:00:00.000Z'

function session(
  id: string,
  date: string,
  status: CompletedSession['status'],
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

function repository_fixture(): SessionRepository {
  const sessions = [
    session('newer', '2026-09-04', 'in_progress'),
    session('older', '2026-09-03', 'completed'),
  ]

  const exercise: SessionExercise = {
    id: 'exercise-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'older',
    programmed_session_exercise_id: null,
    exercise_id: 'definition-1',
    exercise_name_snapshot: 'Nautilus Bicep Curl',
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
    id: 'set-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'older',
    session_exercise_id: 'exercise-1',
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
  }

  return {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: vi.fn(async () => sessions),
    list_session_exercises: vi.fn(async (session_id) =>
      session_id === 'older' ? [exercise] : [],
    ),
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: vi.fn(async (session_id) =>
      session_id === 'older' ? [set] : [],
    ),
    get_exercise_metrics: async (): Promise<ExerciseMetrics | undefined> =>
      undefined,
    create_session_graph: async (created_session) => ({
      session_id: created_session.id,
      created: true,
    }),
    put_session: async (created_session) => created_session.id,
    put_session_exercise: async (session_exercise) => session_exercise.id,
    put_set: async (training_set) => training_set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics) => metrics.id,
  }
}

describe('load_workout_history', () => {
  it('returns repository order with computed summaries', async () => {
    const entries = await load_workout_history(repository_fixture())

    expect(entries.map((entry) => entry.session.id)).toEqual([
      'newer',
      'older',
    ])
    expect(entries[0].summary).toMatchObject({
      total_volume_kg: 0,
      completed_sets: 0,
      exercise_count: 0,
      duration_seconds: null,
    })
    expect(entries[1].summary).toMatchObject({
      total_volume_kg: 400,
      completed_sets: 1,
      exercise_count: 1,
      duration_seconds: 3600,
    })
  })
})
