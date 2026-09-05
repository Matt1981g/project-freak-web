import { describe, expect, it, vi } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import {
  build_workout_summary,
  complete_workout_session,
  historical_source_duration_seconds,
} from './completeWorkout'

const START = '2026-09-04T17:00:00.000Z'
const FINISH = '2026-09-04T18:15:30.000Z'
const DEVICE_ID = 'device-1'

function session_fixture(status: CompletedSession['status'] = 'in_progress'): CompletedSession {
  return {
    id: 'session-1',
    created_at: START,
    updated_at: START,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    programmed_session_id: 'programmed-session-1',
    programme_block_id: 'block-1',
    workout_template_id_snapshot: 'template-1',
    legacy_workout_id: null,
    session_name: 'Monday — Arms + Delts',
    session_date_local: '2026-09-04',
    timezone: 'Europe/London',
    status,
    started_at: START,
    completed_at: status === 'completed' ? FINISH : null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: status === 'completed' ? 4530 : null,
    notes: null,
  }
}

function exercise_fixture(id: string, complete = true): SessionExercise {
  return {
    id,
    created_at: START,
    updated_at: START,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'session-1',
    programmed_session_exercise_id: `programmed-${id}`,
    exercise_id: `exercise-${id}`,
    exercise_name_snapshot: id,
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
    started_at: START,
    completed_at: complete ? FINISH : null,
    notes: null,
  }
}

function set_fixture(id: string, volume: number | null): TrainingSet {
  return {
    id,
    created_at: START,
    updated_at: START,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'session-1',
    session_exercise_id: 'exercise-a',
    exercise_id: 'definition-a',
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
    set_load_method: volume === null ? null : 'kg_reps_full_reps_only_v1',
    notes: null,
    completed_at: FINISH,
    source_record_key: null,
  }
}

function repository_fixture(options: {
  exercises: SessionExercise[]
  sets: TrainingSet[]
}) {
  let saved_session: CompletedSession | undefined
  const saved_exercises: SessionExercise[] = []

  const repository: SessionRepository = {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => options.exercises,
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: async () => options.sets,
    get_exercise_metrics: async () => undefined,
    create_session_graph: async (session) => ({
      session_id: session.id,
      created: true,
    }),
    put_session: vi.fn(async (session) => {
      saved_session = session
      return session.id
    }),
    put_session_exercise: async (exercise) => {
      saved_exercises.push(exercise)
      return exercise.id
    },
    put_set: async (set) => set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics: ExerciseMetrics) => metrics.id,
  }

  return {
    repository,
    saved_session: () => saved_session,
    saved_exercises: () => saved_exercises,
  }
}

describe('complete workout', () => {
  it('sums only stored comparable completed-set volume', () => {
    const summary = build_workout_summary(
      session_fixture('completed'),
      [exercise_fixture('a'), exercise_fixture('b')],
      [set_fixture('set-1', 500), set_fixture('set-2', 720), set_fixture('set-3', null)],
    )

    expect(summary).toEqual({
      total_volume_kg: 1220,
      completed_sets: 3,
      exercise_count: 2,
      duration_seconds: 4530,
    })
  })

  it('counts imported historical sets as completed without inventing completion timestamps', () => {
    const historical_session: CompletedSession = {
      ...session_fixture('completed'),
      source_kind: 'historical_import',
      source_id: 'batch-1',
      programmed_session_id: null,
      legacy_workout_id: 'W41',
      session_name: 'W41',
      completed_at: null,
      started_at: null,
      duration_seconds: null,
    }
    const historical_exercise: SessionExercise = {
      ...exercise_fixture('a', false),
      source_kind: 'historical_import',
      source_id: 'batch-1',
      completed_at: null,
    }
    const historical_set: TrainingSet = {
      ...set_fixture('historical-set', 500),
      source_kind: 'historical_import',
      source_id: 'batch-1',
      completed_at: null,
      source_record_key: 'project-freak-historical:xlsx:v1:W41:1:1',
    }

    const summary = build_workout_summary(
      historical_session,
      [historical_exercise],
      [historical_set],
    )

    expect(historical_set.completed_at).toBeNull()
    expect(summary).toEqual({
      total_volume_kg: 500,
      completed_sets: 1,
      exercise_count: 1,
      duration_seconds: null,
    })
  })

  it('derives duration from imported historical start and finish clock text', () => {
    expect(historical_source_duration_seconds('08:15', '10:15')).toBe(7200)
    expect(historical_source_duration_seconds('23:50', '00:20')).toBe(1800)
    expect(historical_source_duration_seconds('08:40', null)).toBeNull()

    const historical_session: CompletedSession = {
      ...session_fixture('completed'),
      source_kind: 'historical_import',
      source_id: 'batch-1',
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      source_start_text: '08:15',
      source_finish_text: '10:15',
    }

    const summary = build_workout_summary(
      historical_session,
      [exercise_fixture('a')],
      [set_fixture('set-1', 500)],
    )

    expect(summary.duration_seconds).toBe(7200)
  })

  it('rejects workout completion while an exercise remains incomplete', async () => {
    const fixture = repository_fixture({
      exercises: [exercise_fixture('a'), exercise_fixture('b', false)],
      sets: [],
    })

    await expect(
      complete_workout_session(session_fixture(), fixture.repository, {
        device_id: DEVICE_ID,
        now_iso: FINISH,
      }),
    ).rejects.toThrow('1 remaining')

    expect(fixture.saved_session()).toBeUndefined()
  })

  it('records actual exercise order from first-start timestamps when finishing', async () => {
    const first_planned = {
      ...exercise_fixture('a'),
      planned_order: 1,
      actual_order: 1,
      started_at: '2026-09-04T17:20:00.000Z',
    }
    const second_planned = {
      ...exercise_fixture('b'),
      planned_order: 2,
      actual_order: 2,
      started_at: '2026-09-04T17:05:00.000Z',
    }
    const fixture = repository_fixture({
      exercises: [first_planned, second_planned],
      sets: [set_fixture('set-1', 500)],
    })

    await complete_workout_session(
      session_fixture(),
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: FINISH,
      },
    )

    expect(
      fixture.saved_exercises().map((exercise) => ({
        id: exercise.id,
        actual_order: exercise.actual_order,
      })),
    ).toEqual([
      { id: 'b', actual_order: 1 },
      { id: 'a', actual_order: 2 },
    ])
  })

  it('marks the workout completed with duration and total volume', async () => {
    const fixture = repository_fixture({
      exercises: [exercise_fixture('a'), exercise_fixture('b')],
      sets: [set_fixture('set-1', 500), set_fixture('set-2', 720)],
    })

    const result = await complete_workout_session(
      session_fixture(),
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: FINISH,
      },
    )

    expect(result.session).toMatchObject({
      status: 'completed',
      completed_at: FINISH,
      duration_seconds: 4530,
      revision: 2,
    })
    expect(result.summary.total_volume_kg).toBe(1220)
    expect(fixture.saved_session()).toEqual(result.session)
  })
})
