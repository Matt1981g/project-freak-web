import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
import type { ExerciseHistoryResult } from '../history/exerciseHistory'
import { build_exercise_progression } from './exerciseProgression'

const NOW = '2026-09-05T06:00:00.000Z'

function base_entity() {
  return {
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user' as const,
    source_id: null,
  }
}

function exercise(): Exercise {
  return {
    ...base_entity(),
    id: 'exercise-1',
    canonical_name: 'Curl',
    short_name: null,
    category: null,
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
  }
}

function session(
  id: string,
  date: string,
  status: CompletedSession['status'] = 'completed',
): CompletedSession {
  return {
    ...base_entity(),
    id,
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
    duration_seconds: 3600,
    notes: null,
  }
}

function session_exercise(id: string, session_id: string): SessionExercise {
  return {
    ...base_entity(),
    id,
    completed_session_id: session_id,
    programmed_session_exercise_id: null,
    exercise_id: 'exercise-1',
    exercise_name_snapshot: 'Curl',
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

function set(
  id: string,
  session_id: string,
  load: number,
  reps: number,
  options: Partial<TrainingSet> = {},
): TrainingSet {
  return {
    ...base_entity(),
    id,
    completed_session_id: session_id,
    session_exercise_id: `sx-${session_id}`,
    exercise_id: 'exercise-1',
    exercise_order_snapshot: 1,
    set_number: 1,
    set_role: 'work',
    structure_type: 'straight',
    load_kg: load,
    load_type: 'normal',
    rep_mode: 'total',
    reps_as_recorded: String(reps),
    primary_reps_completed: reps,
    left_reps_completed: null,
    right_reps_completed: null,
    completed_reps: reps,
    partial_reps: null,
    duration_seconds: null,
    failure_status: 'none',
    left_failure_status: null,
    right_failure_status: null,
    actual_rest_seconds: null,
    set_load_kg_reps: load * reps,
    set_load_method: 'kg_reps_full_reps_only_v1',
    notes: null,
    completed_at: NOW,
    source_record_key: null,
    ...options,
  }
}

function metrics(
  id: string,
  sx_id: string,
  form: number | null,
): ExerciseMetrics {
  return {
    ...base_entity(),
    id,
    session_exercise_id: sx_id,
    rpe: 9,
    pump: 8,
    form,
    where_felt_text: null,
    where_felt_tags: [],
    legacy_tension: null,
    legacy_mmc: null,
    notes: null,
  }
}

function history(rows: Array<{
  session: CompletedSession
  sets: TrainingSet[]
  form: number | null
}>): ExerciseHistoryResult {
  return {
    exercise: exercise(),
    resolved_exercise_ids: ['exercise-1'],
    entries: rows.map((row) => {
      const sx = session_exercise(`sx-${row.session.id}`, row.session.id)
      return {
        session: row.session,
        appearances: [
          {
            session_exercise: sx,
            sets: row.sets,
            metrics: metrics(
              `metrics-${row.session.id}`,
              sx.id,
              row.form,
            ),
          },
        ],
        completed_sets: row.sets.length,
        total_volume_kg: row.sets.reduce(
          (total, item) => total + (item.set_load_kg_reps ?? 0),
          0,
        ),
      }
    }),
  }
}

describe('exercise progression analysis', () => {
  it('excludes warmups and incomplete sessions while keeping historical completed work', () => {
    const first = session('first', '2026-09-01')
    const active = session('active', '2026-09-02', 'in_progress')

    const result = build_exercise_progression(
      history([
        {
          session: first,
          form: 9,
          sets: [
            set('warmup', first.id, 20, 10, { set_role: 'warmup' }),
            set('work', first.id, 40, 10, {
              source_kind: 'historical_import',
              completed_at: null,
            }),
            set('deleted', first.id, 100, 10, { deleted_at: NOW }),
          ],
        },
        {
          session: active,
          form: 9,
          sets: [set('active-work', active.id, 50, 10)],
        },
      ]),
    )

    expect(result.completed_sessions).toBe(1)
    expect(result.latest?.working_sets).toBe(1)
    expect(result.latest?.best_load_kg).toBe(40)
    expect(result.latest?.comparable_tonnage_kg).toBe(400)
  })

  it('marks more reps at the same load and valid Form as improved', () => {
    const first = session('first', '2026-09-01')
    const second = session('second', '2026-09-05')

    const result = build_exercise_progression(
      history([
        {
          session: first,
          form: 9,
          sets: [set('first-work', first.id, 40, 10)],
        },
        {
          session: second,
          form: 9,
          sets: [set('second-work', second.id, 40, 12)],
        },
      ]),
    )

    expect(result.rows[0].session_id).toBe('second')
    expect(result.rows[0].verdict).toBe('improved')
    expect(result.rows[0].best_reps_at_load).toBe(12)
  })

  it('does not call heavier load progress when reps fall or Form is missing', () => {
    const first = session('first', '2026-09-01')
    const second = session('second', '2026-09-05')
    const third = session('third', '2026-09-08')

    const result = build_exercise_progression(
      history([
        {
          session: first,
          form: 9,
          sets: [set('first-work', first.id, 40, 10)],
        },
        {
          session: second,
          form: 9,
          sets: [set('second-work', second.id, 45, 7)],
        },
        {
          session: third,
          form: null,
          sets: [set('third-work', third.id, 45, 10)],
        },
      ]),
    )

    expect(result.rows.find((row) => row.session_id === 'second')?.verdict).toBe(
      'not_comparable',
    )
    expect(result.rows[0].verdict).toBe('not_comparable')
  })
})
