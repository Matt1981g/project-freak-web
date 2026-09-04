import { describe, expect, it, vi } from 'vitest'
import type {
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import { save_training_set } from './logSet'

const NOW = '2026-09-04T18:00:00.000Z'

function session_exercise(): SessionExercise {
  return {
    id: 'session-exercise-1',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
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
    target_sets: 4,
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

function repository_fixture() {
  let saved: TrainingSet | undefined
  const repository: SessionRepository = {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => [],
    list_sets_for_session_exercise: async () => [],
    get_exercise_metrics: async () => undefined,
    create_session_graph: async (session) => ({
      session_id: session.id,
      created: true,
    }),
    put_session: async (session) => session.id,
    put_session_exercise: async (exercise) => exercise.id,
    put_set: vi.fn(async (set) => {
      saved = set
      return set.id
    }),
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics: ExerciseMetrics) => metrics.id,
  }

  return { repository, saved: () => saved }
}

describe('save_training_set', () => {
  it('stores completed reps and failure independently from set structure', async () => {
    const fixture = repository_fixture()

    const saved = await save_training_set(
      {
        session_exercise: session_exercise(),
        programmed_set: {
          id: 'programmed-set-1',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: 'device-1',
          source_kind: 'programme_import',
          source_id: 'programme-json:test',
          programmed_session_exercise_id: 'programmed-exercise-1',
          set_number: 1,
          set_role: 'work',
          structure_type: 'straight',
          target_rep_min: 8,
          target_rep_max: 12,
          target_duration_seconds: null,
          target_load_kg: null,
          target_load_type: 'normal',
          failure_target: 'target',
          notes: null,
        },
        existing_set: null,
        set_number: 1,
        load_kg: 45,
        completed_reps: 13,
        failed_next_rep: true,
        complete: true,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: NOW,
        id_factory: () => 'set-1',
      },
    )

    expect(saved).toMatchObject({
      id: 'set-1',
      structure_type: 'straight',
      completed_reps: 13,
      reps_as_recorded: '13F',
      failure_status: 'attempted_next_rep_failed',
      set_load_kg_reps: 585,
      completed_at: NOW,
    })
  })

  it('saves an incomplete draft without adding comparable tonnage', async () => {
    const fixture = repository_fixture()

    const saved = await save_training_set(
      {
        session_exercise: session_exercise(),
        programmed_set: null,
        existing_set: null,
        set_number: 2,
        load_kg: 40,
        completed_reps: 10,
        failed_next_rep: false,
        complete: false,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: NOW,
        id_factory: () => 'set-2',
      },
    )

    expect(saved.completed_at).toBeNull()
    expect(saved.set_load_kg_reps).toBeNull()
    expect(saved.reps_as_recorded).toBe('10')
  })

  it('rejects completion without completed reps', async () => {
    const fixture = repository_fixture()

    await expect(
      save_training_set(
        {
          session_exercise: session_exercise(),
          programmed_set: null,
          existing_set: null,
          set_number: 1,
          load_kg: 40,
          completed_reps: null,
          failed_next_rep: false,
          complete: true,
        },
        fixture.repository,
        {
          device_id: 'device-1',
          now_iso: NOW,
        },
      ),
    ).rejects.toThrow('Enter completed reps')
  })
})
