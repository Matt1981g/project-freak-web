import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
import type { ExerciseHistoryResult } from '../history/exerciseHistory'
import { select_previous_comparable } from './previousComparable'

const NOW = '2026-09-04T06:00:00.000Z'

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
    duration_seconds: null,
    notes: null,
  }
}

function appearance(
  id: string,
  session_id: string,
  name = 'Nautilus Bicep Curl',
): SessionExercise {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'historical_import',
    source_id: 'batch-1',
    completed_session_id: session_id,
    programmed_session_exercise_id: null,
    exercise_id: 'exercise-1',
    exercise_name_snapshot: name,
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

function set(
  id: string,
  session_id: string,
  set_number: number,
  load_kg: number,
  completed_reps: number,
  overrides: Partial<TrainingSet> = {},
): TrainingSet {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'historical_import',
    source_id: 'batch-1',
    completed_session_id: session_id,
    session_exercise_id: `appearance-${session_id}`,
    exercise_id: 'exercise-1',
    exercise_order_snapshot: 1,
    set_number,
    set_role: 'work',
    structure_type: 'straight',
    load_kg,
    load_type: 'normal',
    rep_mode: 'total',
    reps_as_recorded: String(completed_reps),
    primary_reps_completed: completed_reps,
    left_reps_completed: null,
    right_reps_completed: null,
    completed_reps,
    partial_reps: null,
    duration_seconds: null,
    failure_status: 'none',
    left_failure_status: null,
    right_failure_status: null,
    actual_rest_seconds: null,
    set_load_kg_reps: load_kg * completed_reps,
    set_load_method: 'kg_reps_full_reps_only_v1',
    notes: null,
    completed_at: null,
    source_record_key: `historical:${id}`,
    ...overrides,
  }
}

function history(entries: ExerciseHistoryResult['entries']): ExerciseHistoryResult {
  const exercise: Exercise = {
    id: 'exercise-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    canonical_name: 'Nautilus Bicep Curl',
    short_name: null,
    category: 'biceps',
    equipment: 'Nautilus',
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
  }

  return {
    exercise,
    resolved_exercise_ids: ['exercise-1'],
    entries,
  }
}

describe('select_previous_comparable', () => {
  it('selects the newest prior completed comparable performance', () => {
    const current = session('current', '2026-09-04', 'in_progress')
    const previous = session('previous', '2026-09-01')
    const older = session('older', '2026-08-25')
    const metrics: ExerciseMetrics = {
      id: 'metrics-1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      revision: 1,
      device_id: 'device-1',
      source_kind: 'historical_import',
      source_id: 'batch-1',
      session_exercise_id: 'appearance-previous',
      rpe: 9,
      pump: 8,
      form: 10,
      where_felt_text: null,
      where_felt_tags: [],
      legacy_tension: null,
      legacy_mmc: null,
      notes: null,
    }

    const result = select_previous_comparable(
      history([
        {
          session: current,
          appearances: [
            {
              session_exercise: appearance('appearance-current', current.id),
              sets: [set('current-set', current.id, 1, 50, 8)],
              metrics: undefined,
            },
          ],
          completed_sets: 1,
          total_volume_kg: 400,
        },
        {
          session: previous,
          appearances: [
            {
              session_exercise: appearance(
                'appearance-previous',
                previous.id,
                'NAUTILUS BICEP CURL',
              ),
              sets: [
                set('prev-1', previous.id, 1, 45, 10),
                set('prev-2', previous.id, 2, 45, 9, {
                  failure_status: 'attempted_next_rep_failed',
                  reps_as_recorded: '9F',
                }),
              ],
              metrics,
            },
          ],
          completed_sets: 2,
          total_volume_kg: 855,
        },
        {
          session: older,
          appearances: [
            {
              session_exercise: appearance('appearance-older', older.id),
              sets: [set('old-1', older.id, 1, 40, 12)],
              metrics: undefined,
            },
          ],
          completed_sets: 1,
          total_volume_kg: 480,
        },
      ]),
      current.id,
      current.session_date_local,
    )

    expect(result).toMatchObject({
      session_id: 'previous',
      session_date_local: '2026-09-01',
      source_exercise_name: 'NAUTILUS BICEP CURL',
      total_volume_kg: 855,
      sets: [
        { set_number: 1, load_kg: 45, completed_reps: 10 },
        {
          set_number: 2,
          load_kg: 45,
          completed_reps: 9,
          failure_status: 'attempted_next_rep_failed',
        },
      ],
    })
    expect(result?.metrics?.form).toBe(10)
  })

  it('skips future, in-progress and non-comparable set structures', () => {
    const current = session('current', '2026-09-04', 'in_progress')
    const future = session('future', '2026-09-05')
    const in_progress = session('unfinished', '2026-09-03', 'in_progress')
    const usable = session('usable', '2026-09-01')

    const result = select_previous_comparable(
      history([
        {
          session: future,
          appearances: [
            {
              session_exercise: appearance('future-a', future.id),
              sets: [set('future-set', future.id, 1, 60, 8)],
              metrics: undefined,
            },
          ],
          completed_sets: 1,
          total_volume_kg: 480,
        },
        {
          session: in_progress,
          appearances: [
            {
              session_exercise: appearance('unfinished-a', in_progress.id),
              sets: [set('unfinished-set', in_progress.id, 1, 55, 8)],
              metrics: undefined,
            },
          ],
          completed_sets: 1,
          total_volume_kg: 440,
        },
        {
          session: usable,
          appearances: [
            {
              session_exercise: appearance('usable-a', usable.id),
              sets: [
                set('drop', usable.id, 1, 50, 8, {
                  structure_type: 'drop',
                }),
                set('normal', usable.id, 2, 47.5, 10),
              ],
              metrics: undefined,
            },
          ],
          completed_sets: 2,
          total_volume_kg: 875,
        },
      ]),
      current.id,
      current.session_date_local,
    )

    expect(result?.session_id).toBe('usable')
    expect(result?.sets).toHaveLength(1)
    expect(result?.sets[0]).toMatchObject({
      set_number: 2,
      load_kg: 47.5,
      completed_reps: 10,
    })
  })
})
