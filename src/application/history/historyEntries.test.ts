import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import { list_history_entries } from './historyEntries'

const NOW = '2026-09-04T18:00:00.000Z'

function session(id: string, date: string): CompletedSession {
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
    status: 'completed',
    started_at: NOW,
    completed_at: NOW,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: 3600,
    notes: null,
  }
}

function set_for(session_id: string, id: string, volume: number): TrainingSet {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id: session_id,
    session_exercise_id: `${session_id}-exercise`,
    exercise_id: 'exercise-1',
    exercise_order_snapshot: 1,
    set_number: 1,
    set_role: 'work',
    structure_type: 'straight',
    load_kg: 50,
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
    set_load_kg_reps: volume,
    set_load_method: 'kg_reps_full_reps_only_v1',
    notes: null,
    completed_at: NOW,
    source_record_key: null,
  }
}

function repository_fixture(): SessionRepository {
  const newer = session('newer-session', '2026-09-04')
  const older = session('older-session', '2026-09-01')

  return {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [newer, older],
    list_session_exercises: async (session_id) => [
      {
        id: `${session_id}-exercise`,
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        revision: 1,
        device_id: 'device-1',
        source_kind: 'user',
        source_id: null,
        completed_session_id: session_id,
        programmed_session_exercise_id: null,
        exercise_id: 'exercise-1',
        exercise_name_snapshot: 'Exercise',
        planned_order: null,
        actual_order: 1,
        rotation_group_key: null,
        rotation_position: null,
        target_sets: 1,
        target_rep_min: null,
        target_rep_max: null,
        rest_seconds: null,
        tempo: null,
        technique_cue: null,
        programme_notes: null,
        started_at: null,
        completed_at: NOW,
        notes: null,
      } satisfies SessionExercise,
    ],
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: async (session_id) => [
      set_for(session_id, `${session_id}-set`, session_id === newer.id ? 500 : 400),
    ],
    get_exercise_metrics: async (): Promise<ExerciseMetrics | undefined> =>
      undefined,
    create_session_graph: async (created_session) => ({
      session_id: created_session.id,
      created: true,
    }),
    put_session: async (created_session) => created_session.id,
    put_session_exercise: async (exercise) => exercise.id,
    put_set: async (set) => set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics) => metrics.id,
  }
}

describe('list_history_entries', () => {
  it('keeps repository newest-first order and calculates each session summary', async () => {
    const entries = await list_history_entries(repository_fixture())

    expect(entries.map((entry) => entry.session.id)).toEqual([
      'newer-session',
      'older-session',
    ])
    expect(entries[0].summary).toMatchObject({
      total_volume_kg: 500,
      completed_sets: 1,
      exercise_count: 1,
    })
    expect(entries[1].summary.total_volume_kg).toBe(400)
  })
})
