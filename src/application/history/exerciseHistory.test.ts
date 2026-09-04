import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type {
  ExerciseRepository,
  SessionRepository,
} from '../../data/repositories/contracts'
import { load_exercise_history } from './exerciseHistory'

const NOW = '2026-09-04T18:00:00.000Z'

function exercise(id: string, name: string, archived = false): Exercise {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    canonical_name: name,
    short_name: null,
    category: 'biceps',
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: archived ? NOW : null,
    notes: null,
  }
}

function alias(
  id: string,
  source_exercise_id: string,
  exercise_id: string,
): ExerciseAlias {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    exercise_id,
    source_exercise_id,
    alias: source_exercise_id,
    normalized_alias: source_exercise_id,
  }
}

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

function appearance(
  id: string,
  session_id: string,
  exercise_id: string,
  name: string,
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
    exercise_id,
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
    completed_at: NOW,
    notes: null,
  }
}

function set(
  id: string,
  session_id: string,
  session_exercise_id: string,
  exercise_id: string,
  load: number,
  reps: number,
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
    session_exercise_id,
    exercise_id,
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
  }
}

describe('load_exercise_history', () => {
  it('resolves merged aliases transitively without rewriting historical IDs', async () => {
    const definitions = [
      exercise('old-a', 'NAUTILUS BICEP CURL', true),
      exercise('old-b', 'Nautilus Biceps Curl', true),
      exercise('canonical', 'Nautilus Bicep Curl'),
    ]
    const aliases = [
      alias('alias-1', 'old-a', 'old-b'),
      alias('alias-2', 'old-b', 'canonical'),
    ]

    const exercise_repository: ExerciseRepository = {
      get_by_id: async (id) => definitions.find((item) => item.id === id),
      list_all: async () => definitions,
      list_active: async () => definitions.filter((item) => !item.archived_at),
      list_aliases: async () => aliases,
      put: async (item) => item.id,
      merge_definitions: async () => [],
    }

    const newest = session('newest', '2026-09-04')
    const older = session('older', '2026-08-01')
    const newest_appearance = appearance(
      'se-new',
      newest.id,
      'canonical',
      'Nautilus Bicep Curl',
    )
    const old_appearance = appearance(
      'se-old',
      older.id,
      'old-a',
      'NAUTILUS BICEP CURL',
    )
    const sets_by_appearance = new Map([
      ['se-new', [set('set-new', newest.id, 'se-new', 'canonical', 45, 10)]],
      ['se-old', [set('set-old', older.id, 'se-old', 'old-a', 40, 10)]],
    ])

    const session_repository: SessionRepository = {
      get_session: async () => undefined,
      get_by_programmed_session_id: async () => undefined,
      list_sessions_descending: async () => [newest, older],
      list_session_exercises: async (session_id) =>
        session_id === newest.id ? [newest_appearance] : [old_appearance],
      list_sets_for_session_exercise: async (id) =>
        sets_by_appearance.get(id) ?? [],
      list_sets_for_session: async () => [],
      get_exercise_metrics: async (): Promise<ExerciseMetrics | undefined> =>
        undefined,
      create_session_graph: async (created) => ({
        session_id: created.id,
        created: true,
      }),
      put_session: async (created) => created.id,
      put_session_exercise: async (created) => created.id,
      put_set: async (created) => created.id,
      put_set_components: async (_components: SetComponent[]) => undefined,
      put_exercise_metrics: async (created) => created.id,
    }

    const result = await load_exercise_history(
      'old-a',
      exercise_repository,
      session_repository,
    )

    expect(result?.exercise.id).toBe('canonical')
    expect(new Set(result?.resolved_exercise_ids)).toEqual(
      new Set(['canonical', 'old-b', 'old-a']),
    )
    expect(result?.entries.map((entry) => entry.session.id)).toEqual([
      'newest',
      'older',
    ])
    expect(result?.entries[0]).toMatchObject({
      completed_sets: 1,
      total_volume_kg: 450,
    })
    expect(result?.entries[1].appearances[0].session_exercise).toMatchObject({
      exercise_id: 'old-a',
      exercise_name_snapshot: 'NAUTILUS BICEP CURL',
    })
  })

  it('returns no entry for sessions that did not contain the resolved exercise family', async () => {
    const definition = exercise('canonical', 'Lat Pulldown')
    const exercise_repository: ExerciseRepository = {
      get_by_id: async () => definition,
      list_all: async () => [definition],
      list_active: async () => [definition],
      list_aliases: async () => [],
      put: async (item) => item.id,
      merge_definitions: async () => [],
    }
    const unrelated = session('unrelated', '2026-09-04')

    const session_repository: SessionRepository = {
      get_session: async () => undefined,
      get_by_programmed_session_id: async () => undefined,
      list_sessions_descending: async () => [unrelated],
      list_session_exercises: async () => [],
      list_sets_for_session_exercise: async () => [],
      list_sets_for_session: async () => [],
      get_exercise_metrics: async () => undefined,
      create_session_graph: async (created) => ({
        session_id: created.id,
        created: true,
      }),
      put_session: async (created) => created.id,
      put_session_exercise: async (created) => created.id,
      put_set: async (created) => created.id,
      put_set_components: async () => undefined,
      put_exercise_metrics: async (created) => created.id,
    }

    const result = await load_exercise_history(
      'canonical',
      exercise_repository,
      session_repository,
    )

    expect(result?.entries).toEqual([])
  })
})
