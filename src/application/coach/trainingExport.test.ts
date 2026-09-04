import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  ReadinessEntry,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { RepositoryBundle } from '../../data/repositories/contracts'
import {
  build_last_7_days_training_export,
  build_training_export,
  TRAINING_EXPORT_FORMAT,
} from './trainingExport'

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
    programmed_session_id: 'programmed-1',
    programme_block_id: 'block-1',
    workout_template_id_snapshot: 'template-1',
    legacy_workout_id: null,
    session_name: 'Friday — Back + Biceps',
    session_date_local: date,
    timezone: 'Europe/London',
    status: 'completed',
    started_at: NOW,
    completed_at: NOW,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: 5400,
    notes: null,
  }
}

const exercise_definition: Exercise = {
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

const session_exercise: SessionExercise = {
  id: 'session-exercise-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  completed_session_id: 'session-current',
  programmed_session_exercise_id: 'programmed-exercise-1',
  exercise_id: 'exercise-1',
  exercise_name_snapshot: 'Nautilus Bicep Curl',
  planned_order: 2,
  actual_order: 2,
  rotation_group_key: 'A',
  rotation_position: 1,
  target_sets: 1,
  target_rep_min: 8,
  target_rep_max: 12,
  rest_seconds: 90,
  tempo: '3-1-1',
  technique_cue: 'Keep shoulder still',
  programme_notes: null,
  started_at: NOW,
  completed_at: NOW,
  notes: null,
}

const training_set: TrainingSet = {
  id: 'set-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  completed_session_id: 'session-current',
  session_exercise_id: 'session-exercise-1',
  exercise_id: 'exercise-1',
  exercise_order_snapshot: 2,
  set_number: 1,
  set_role: 'work',
  structure_type: 'rest_pause',
  load_kg: 45,
  load_type: 'normal',
  rep_mode: 'total',
  reps_as_recorded: '10+3',
  primary_reps_completed: 10,
  left_reps_completed: null,
  right_reps_completed: null,
  completed_reps: 13,
  partial_reps: null,
  duration_seconds: null,
  failure_status: 'none',
  left_failure_status: null,
  right_failure_status: null,
  actual_rest_seconds: 92,
  set_load_kg_reps: 585,
  set_load_method: 'primary + rest-pause',
  notes: null,
  completed_at: NOW,
  source_record_key: null,
}

const component: SetComponent = {
  id: 'component-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  set_id: 'set-1',
  sequence: 1,
  component_type: 'rest_pause',
  load_kg: 45,
  load_type: 'normal',
  reps_completed_full: 3,
  reps_partial: null,
  duration_seconds: null,
  failure_status: 'none',
  counts_toward_comparable_tonnage: true,
  notes: null,
}

const metrics: ExerciseMetrics = {
  id: 'metrics-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  session_exercise_id: 'session-exercise-1',
  rpe: 9,
  pump: 9,
  form: 10,
  where_felt_text: 'Biceps belly',
  where_felt_tags: ['biceps'],
  legacy_tension: null,
  legacy_mmc: null,
  notes: null,
}

const readiness: ReadinessEntry = {
  id: 'readiness-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  completed_session_id: 'session-current',
  bodyweight_kg: 108,
  sleep_duration_minutes: 420,
  sleep_score: 82,
  energy_pre: 8,
  motivation_pre: 9,
  soreness_score: 2,
  soreness_notes: null,
  joint_issue_present: false,
  joint_issue_notes: null,
  pre_workout_nutrition: 'carbs',
  intra_workout_nutrition: null,
  intra_hydration_ml: 1000,
  post_workout_intake: 'whey',
  session_fatigue: 7,
  breathlessness: 4,
  energy_stability: 8,
  notes: null,
}

function repositories(): RepositoryBundle {
  const current = session('session-current', '2026-09-04')
  const old = session('session-old', '2026-08-20')

  return {
    devices: {
      ensure_local: async () => {
        throw new Error('not used')
      },
    },
    settings: {
      get: async () => undefined,
      put: async () => 'setting',
    },
    exercises: {
      get_by_id: async () => exercise_definition,
      list_all: async () => [exercise_definition],
      list_active: async () => [exercise_definition],
      list_aliases: async () => [
        {
          id: 'alias-1',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: 'device-1',
          source_kind: 'user',
          source_id: null,
          exercise_id: 'exercise-1',
          source_exercise_id: 'old-exercise-1',
          alias: 'NAUTILUS BICEP CURL',
          normalized_alias: 'nautilus bicep curl',
        },
      ],
      put: async () => 'exercise-1',
      merge_definitions: async () => [],
    },
    programme: {
      list_blocks: async () => [],
      list_templates_for_block: async () => [],
      list_programmed_sessions_for_block: async () => [],
      get_programmed_session_detail: async () => ({
        session: {
          id: 'programmed-1',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: 'device-1',
          source_kind: 'programme_import',
          source_id: null,
          programme_block_id: 'block-1',
          workout_template_id: 'template-1',
          scheduled_date_local: '2026-09-04',
          name_snapshot: 'Friday — Back + Biceps',
          status: 'completed',
          notes: null,
        },
        exercises: [
          {
            exercise: {
              id: 'programmed-exercise-1',
              created_at: NOW,
              updated_at: NOW,
              deleted_at: null,
              revision: 1,
              device_id: 'device-1',
              source_kind: 'programme_import',
              source_id: null,
              programmed_session_id: 'programmed-1',
              exercise_id: 'exercise-1',
              exercise_name_snapshot: 'Nautilus Bicep Curl',
              planned_order: 2,
              rotation_group_key: 'A',
              rotation_position: 1,
              target_sets: 1,
              target_rep_min: 8,
              target_rep_max: 12,
              rest_seconds: 90,
              tempo: '3-1-1',
              technique_cue: 'Keep shoulder still',
              notes: null,
            },
            sets: [
              {
                set: {
                  id: 'programmed-set-1',
                  created_at: NOW,
                  updated_at: NOW,
                  deleted_at: null,
                  revision: 1,
                  device_id: 'device-1',
                  source_kind: 'programme_import',
                  source_id: null,
                  programmed_session_exercise_id: 'programmed-exercise-1',
                  set_number: 1,
                  set_role: 'work',
                  structure_type: 'rest_pause',
                  target_rep_min: 8,
                  target_rep_max: 12,
                  target_duration_seconds: null,
                  target_load_kg: 45,
                  target_load_type: 'normal',
                  failure_target: 'allowed',
                  notes: null,
                },
                components: [],
              },
            ],
          },
        ],
      }),
      get_latest_template_version: async () => 1,
      commit_import: async () => 'committed',
    },
    readiness: {
      get_by_session_id: async (id) =>
        id === current.id ? readiness : undefined,
      put: async () => 'readiness-1',
    },
    sessions: {
      get_session: async () => current,
      get_by_programmed_session_id: async () => current,
      list_sessions_descending: async () => [current, old],
      list_session_exercises: async (id) =>
        id === current.id ? [session_exercise] : [],
      list_sets_for_session_exercise: async () => [training_set],
      list_sets_for_session: async () => [training_set],
      list_set_components: async () => [component],
      get_exercise_metrics: async () => metrics,
      create_session_graph: async () => ({
        session_id: current.id,
        created: true,
      }),
      put_session: async () => current.id,
      put_session_exercise: async () => session_exercise.id,
      put_set: async () => training_set.id,
      put_set_components: async () => undefined,
      put_exercise_metrics: async () => metrics.id,
    },
    sync: {
      get_state: async () => undefined,
      put_state: async (state) => state.provider,
      list_pending: async () => [],
      mark_attempted: async () => undefined,
      mark_synced: async () => undefined,
      count_pending: async () => 0,
    },
  }
}

describe('build_training_export scopes', () => {
  it('includes in-progress work in Today scope but not older sessions', async () => {
    const repo = repositories()
    const current = (await repo.sessions.get_session('session-current'))!
    const active = {
      ...current,
      status: 'in_progress' as const,
      completed_at: null,
    }
    const older = session('older-today-test', '2026-09-03')

    repo.sessions.list_sessions_descending = async () => [active, older]
    repo.sessions.list_session_exercises = async (id) =>
      id === active.id ? [session_exercise] : []

    const payload = await build_training_export(
      repo,
      {
        now_iso: NOW,
        to_date_local: '2026-09-04',
        db_schema_version: 1,
      },
      { type: 'today' },
    )

    expect(payload.scope).toMatchObject({
      type: 'today',
      from_date: '2026-09-04',
      to_date: '2026-09-04',
    })
    expect(payload.sessions.map((item) => item.id)).toEqual([active.id])
    expect(payload.sessions[0].status).toBe('in_progress')
  })

  it('resolves merged aliases for Exercise scope', async () => {
    const repo = repositories()

    const payload = await build_training_export(
      repo,
      {
        now_iso: NOW,
        to_date_local: '2026-09-04',
        db_schema_version: 1,
      },
      { type: 'exercise', exercise_id: 'exercise-1' },
    )

    expect(payload.scope.type).toBe('exercise')
    expect(payload.scope.exercise_ids).toEqual(
      expect.arrayContaining(['exercise-1', 'old-exercise-1']),
    )
    expect(payload.sessions).toHaveLength(1)
    expect(payload.sessions[0].exercises).toHaveLength(1)
    expect(payload.sessions[0].exercises[0].exercise_id).toBe('exercise-1')
  })

  it('limits Mesocycle scope to the selected programme block', async () => {
    const repo = repositories()
    const current = (await repo.sessions.get_session('session-current'))!
    const other = {
      ...session('other-block', '2026-09-03'),
      programme_block_id: 'block-2',
    }

    repo.sessions.list_sessions_descending = async () => [current, other]
    repo.programme.list_blocks = async () => [
      {
        id: 'block-1',
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        revision: 1,
        device_id: 'device-1',
        source_kind: 'programme_import',
        source_id: null,
        name: 'Week 1',
        block_type: 'mesocycle',
        start_date_local: '2026-09-01',
        end_date_local: '2026-09-07',
        status: 'active',
        goal: null,
        notes: null,
      },
    ]

    const payload = await build_training_export(
      repo,
      {
        now_iso: NOW,
        to_date_local: '2026-09-04',
        db_schema_version: 1,
      },
      { type: 'programme_block', programme_block_id: 'block-1' },
    )

    expect(payload.scope).toMatchObject({
      type: 'programme_block',
      programme_block_id: 'block-1',
      from_date: '2026-09-01',
      to_date: '2026-09-07',
    })
    expect(payload.sessions.map((item) => item.id)).toEqual([current.id])
  })

  it('exports all completed included sessions in Full DB scope', async () => {
    const repo = repositories()

    const payload = await build_training_export(
      repo,
      {
        now_iso: NOW,
        to_date_local: '2026-09-04',
        db_schema_version: 1,
      },
      { type: 'full' },
    )

    expect(payload.scope).toMatchObject({
      type: 'full',
      from_date: null,
      to_date: null,
    })
    expect(payload.sessions).toHaveLength(2)
    expect(payload.sessions.every((item) => item.status === 'completed')).toBe(
      true,
    )
  })
})

describe('build_last_7_days_training_export', () => {
  it('excludes in-progress and explicitly Coach-excluded sessions', async () => {
    const repo = repositories()
    const included = session('included', '2026-09-04')
    const excluded = session('excluded', '2026-09-03')
    const active = {
      ...session('active', '2026-09-04'),
      status: 'in_progress' as const,
      completed_at: null,
    }

    repo.sessions.list_sessions_descending = async () => [
      included,
      excluded,
      active,
    ]
    repo.sessions.list_session_exercises = async (id) =>
      id === included.id ? [session_exercise] : []
    repo.readiness.get_by_session_id = async () => undefined
    repo.settings.get = async (key) =>
      key === 'coach-excluded-sessions-v1'
        ? {
            key,
            scope: 'global',
            value_json: {
              schema_version: '1.0.0',
              session_ids: [excluded.id],
            },
            updated_at: NOW,
            device_id: null,
          }
        : undefined

    const payload = await build_last_7_days_training_export(repo, {
      now_iso: NOW,
      to_date_local: '2026-09-04',
      db_schema_version: 1,
    })

    expect(payload.sessions.map((item) => item.id)).toEqual([included.id])
  })

  it('exports the coaching evidence needed to prescribe the next week', async () => {
    const payload = await build_last_7_days_training_export(repositories(), {
      now_iso: NOW,
      to_date_local: '2026-09-04',
      db_schema_version: 1,
    })

    expect(payload.format).toBe(TRAINING_EXPORT_FORMAT)
    expect(payload.scope).toMatchObject({
      type: 'last_7_days',
      from_date: '2026-08-29',
      to_date: '2026-09-04',
    })
    expect(payload.sessions).toHaveLength(1)
    expect(payload.sessions[0].readiness).toMatchObject({
      bodyweight_kg: 108,
      session_fatigue: 7,
    })
    expect(payload.sessions[0].exercises[0]).toMatchObject({
      exercise_id: 'exercise-1',
      metrics: {
        rpe: 9,
        pump: 9,
        form: 10,
        where_felt_text: 'Biceps belly',
      },
    })
    expect(payload.sessions[0].exercises[0].target).toMatchObject({
      target_rep_min: 8,
      target_rep_max: 12,
      sets: [
        expect.objectContaining({
          set_number: 1,
          target_load_kg: 45,
          target_rep_min: 8,
          target_rep_max: 12,
        }),
      ],
    })
    expect(payload.sessions[0].exercises[0].sets[0]).toMatchObject({
      load_kg: 45,
      completed_reps: 13,
      set_load_kg_reps: 585,
      components: [
        expect.objectContaining({
          component_type: 'rest_pause',
          reps_completed_full: 3,
        }),
      ],
    })
    expect(payload.coach_context.exercise_catalogue[0]).toMatchObject({
      id: 'exercise-1',
      canonical_name: 'Nautilus Bicep Curl',
    })
    expect(payload.coach_context.exercise_aliases[0]).toMatchObject({
      source_exercise_id: 'old-exercise-1',
      exercise_id: 'exercise-1',
    })
    expect(payload.coach_context.training_priorities.current).toHaveLength(12)
  })
})
