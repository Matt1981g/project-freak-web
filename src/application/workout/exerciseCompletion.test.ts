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
  complete_live_exercise,
  save_exercise_scores,
} from './exerciseCompletion'

const NOW = '2026-09-04T18:30:00.000Z'
const DEVICE_ID = 'device-1'

function exercise_fixture(): SessionExercise {
  return {
    id: 'session-exercise-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'session-1',
    programmed_session_exercise_id: 'programmed-exercise-1',
    exercise_id: 'exercise-1',
    exercise_name_snapshot: 'Nautilus Bicep Curl',
    planned_order: 1,
    actual_order: 1,
    rotation_group_key: 'A',
    rotation_position: 1,
    target_sets: 2,
    target_rep_min: 8,
    target_rep_max: 12,
    rest_seconds: 90,
    tempo: '3-0-1-0',
    technique_cue: null,
    programme_notes: null,
    started_at: null,
    completed_at: null,
    notes: null,
  }
}

function set_fixture(number: number, completed = true): TrainingSet {
  return {
    id: `set-${number}`,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'session-1',
    session_exercise_id: 'session-exercise-1',
    exercise_id: 'exercise-1',
    exercise_order_snapshot: 1,
    set_number: number,
    set_role: 'work',
    structure_type: 'straight',
    load_kg: 45,
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
    set_load_kg_reps: completed ? 450 : null,
    set_load_method: completed ? 'kg_reps_full_reps_only_v1' : null,
    notes: null,
    completed_at: completed ? NOW : null,
    source_record_key: null,
  }
}

function repository_fixture(options?: {
  metrics?: ExerciseMetrics
  sets?: TrainingSet[]
}) {
  let saved_metrics: ExerciseMetrics | undefined
  let saved_exercise: SessionExercise | undefined

  const repository: SessionRepository = {
    get_session: async (_id: string): Promise<CompletedSession | undefined> =>
      undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => [],
    list_sets_for_session_exercise: async () => options?.sets ?? [],
    list_sets_for_session: async () => [],
    get_exercise_metrics: async () => options?.metrics,
    create_session_graph: async (session) => ({
      session_id: session.id,
      created: true,
    }),
    put_session: async (session) => session.id,
    put_session_exercise: vi.fn(async (exercise) => {
      saved_exercise = exercise
      return exercise.id
    }),
    put_set: async (set) => set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: vi.fn(async (metrics) => {
      saved_metrics = metrics
      return metrics.id
    }),
  }

  return {
    repository,
    saved_metrics: () => saved_metrics,
    saved_exercise: () => saved_exercise,
  }
}

describe('exercise completion', () => {
  it('stores only scores the athlete actually supplied', async () => {
    const fixture = repository_fixture()

    const metrics = await save_exercise_scores(
      'session-exercise-1',
      { rpe: 8, pump: null, form: 9 },
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: NOW,
        id_factory: () => 'metrics-1',
      },
    )

    expect(metrics).toMatchObject({
      id: 'metrics-1',
      rpe: 8,
      pump: null,
      form: 9,
      revision: 1,
    })
    expect(fixture.saved_metrics()).toEqual(metrics)
  })

  it('does not manufacture a midpoint score when every slider is untouched', async () => {
    const fixture = repository_fixture()

    await expect(
      save_exercise_scores(
        'session-exercise-1',
        { rpe: null, pump: null, form: null },
        fixture.repository,
        {
          device_id: DEVICE_ID,
          now_iso: NOW,
        },
      ),
    ).resolves.toBeNull()

    expect(fixture.saved_metrics()).toBeUndefined()
  })

  it('rejects exercise completion until all programmed sets are complete', async () => {
    const fixture = repository_fixture({
      sets: [set_fixture(1, true), set_fixture(2, false)],
    })

    await expect(
      complete_live_exercise(exercise_fixture(), fixture.repository, {
        device_id: DEVICE_ID,
        now_iso: NOW,
      }),
    ).rejects.toThrow('Complete all 2 programmed sets')

    expect(fixture.saved_exercise()).toBeUndefined()
  })

  it('marks the exercise complete after all programmed sets are done', async () => {
    const fixture = repository_fixture({
      sets: [set_fixture(1), set_fixture(2)],
    })

    const completed = await complete_live_exercise(
      exercise_fixture(),
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: NOW,
      },
    )

    expect(completed.completed_at).toBe(NOW)
    expect(completed.revision).toBe(2)
    expect(fixture.saved_exercise()).toEqual(completed)
  })
})
