import { describe, expect, it, vi } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import {
  can_safely_correct_set,
  correct_completed_set,
} from './correctCompletedSet'

const NOW = '2026-09-04T18:00:00.000Z'

function set_fixture(overrides: Partial<TrainingSet> = {}): TrainingSet {
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
    actual_rest_seconds: 90,
    set_load_kg_reps: 400,
    set_load_method: 'kg_reps_full_reps_only_v1',
    notes: 'Original note',
    completed_at: NOW,
    source_record_key: 'project-freak-historical:xlsx:v1:1:1:1',
    ...overrides,
  }
}

function repository_fixture() {
  let saved: TrainingSet | undefined
  let reason: string | null | undefined

  const repository: SessionRepository = {
    get_session: async (): Promise<CompletedSession | undefined> => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => [],
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: async () => [],
    get_exercise_metrics: async (): Promise<ExerciseMetrics | undefined> =>
      undefined,
    create_session_graph: async (session) => ({
      session_id: session.id,
      created: true,
    }),
    put_session: async (session) => session.id,
    put_session_exercise: async (exercise) => exercise.id,
    put_set: vi.fn(async (set, audit_reason) => {
      saved = set
      reason = audit_reason
      return set.id
    }),
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics) => metrics.id,
  }

  return {
    repository,
    saved: () => saved,
    reason: () => reason,
  }
}

describe('correct_completed_set', () => {
  it('corrects a simple completed set while preserving provenance', async () => {
    const fixture = repository_fixture()
    const original = set_fixture()

    const corrected = await correct_completed_set(
      {
        set: original,
        load_kg: 42.5,
        completed_reps: 11,
        failed_next_rep: true,
      },
      fixture.repository,
      {
        device_id: 'device-2',
        now_iso: '2026-09-04T19:00:00.000Z',
      },
    )

    expect(corrected).toMatchObject({
      id: original.id,
      created_at: original.created_at,
      completed_at: original.completed_at,
      source_kind: 'historical_import',
      source_id: 'batch-1',
      source_record_key: original.source_record_key,
      load_kg: 42.5,
      completed_reps: 11,
      primary_reps_completed: 11,
      reps_as_recorded: '11F',
      failure_status: 'attempted_next_rep_failed',
      set_load_kg_reps: 467.5,
      revision: 2,
      device_id: 'device-2',
      notes: 'Original note',
    })
    expect(fixture.reason()).toBe('User corrected completed set')
  })

  it('allows failure to be removed and recalculates comparable volume', async () => {
    const fixture = repository_fixture()

    const corrected = await correct_completed_set(
      {
        set: set_fixture({
          failure_status: 'attempted_next_rep_failed',
          reps_as_recorded: '10F',
        }),
        load_kg: 40,
        completed_reps: 12,
        failed_next_rep: false,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: '2026-09-04T19:00:00.000Z',
      },
    )

    expect(corrected.failure_status).toBe('none')
    expect(corrected.reps_as_recorded).toBe('12')
    expect(corrected.set_load_kg_reps).toBe(480)
  })

  it('blocks advanced sets from the simple history editor', async () => {
    const fixture = repository_fixture()
    const advanced = set_fixture({ structure_type: 'drop' })

    expect(can_safely_correct_set(advanced)).toBe(false)
    await expect(
      correct_completed_set(
        {
          set: advanced,
          load_kg: 40,
          completed_reps: 10,
          failed_next_rep: false,
        },
        fixture.repository,
        {
          device_id: 'device-1',
          now_iso: NOW,
        },
      ),
    ).rejects.toThrow('advanced structure or rep mode')
  })

})
