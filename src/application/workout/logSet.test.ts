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
  let saved_components: SetComponent[] = []
  let saved_exercise: SessionExercise | undefined
  const repository: SessionRepository = {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => undefined,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => [],
    list_sets_for_session_exercise: async () => [],
    list_sets_for_session: async () => [],
    get_exercise_metrics: async () => undefined,
    create_session_graph: async (session) => ({
      session_id: session.id,
      created: true,
    }),
    put_session: async (session) => session.id,
    put_session_exercise: async (exercise) => {
      saved_exercise = exercise
      return exercise.id
    },
    put_set: vi.fn(async (set) => {
      saved = set
      return set.id
    }),
    list_set_components: async () => saved_components,
    put_set_components: async (components: SetComponent[]) => {
      saved_components = components
    },
    put_exercise_metrics: async (metrics: ExerciseMetrics) => metrics.id,
  }

  return {
    repository,
    saved: () => saved,
    saved_components: () => saved_components,
    saved_exercise: () => saved_exercise,
  }
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

  it('updates the same draft record during repeated autosaves', async () => {
    const fixture = repository_fixture()

    const first = await save_training_set(
      {
        session_exercise: session_exercise(),
        programmed_set: null,
        existing_set: null,
        set_number: 1,
        load_kg: 42.5,
        completed_reps: null,
        failed_next_rep: false,
        complete: false,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: NOW,
        id_factory: () => 'autosave-set-1',
      },
    )

    const second = await save_training_set(
      {
        session_exercise: session_exercise(),
        programmed_set: null,
        existing_set: first,
        set_number: 1,
        load_kg: 45,
        completed_reps: 11,
        failed_next_rep: false,
        complete: false,
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: '2026-09-04T18:00:01.000Z',
      },
    )

    expect(second).toMatchObject({
      id: 'autosave-set-1',
      created_at: NOW,
      updated_at: '2026-09-04T18:00:01.000Z',
      revision: 2,
      load_kg: 45,
      completed_reps: 11,
      completed_at: null,
    })
  })

  it('stores structured drop components and includes full reps in tonnage', async () => {
    const fixture = repository_fixture()

    const saved = await save_training_set(
      {
        session_exercise: session_exercise(),
        programmed_set: {
          id: 'programmed-set-drop',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: 'device-1',
          source_kind: 'programme_import',
          source_id: 'programme-json:test',
          programmed_session_exercise_id: 'programmed-exercise-1',
          set_number: 4,
          set_role: 'work',
          structure_type: 'drop',
          target_rep_min: 10,
          target_rep_max: 15,
          target_duration_seconds: null,
          target_load_kg: 40,
          target_load_type: 'normal',
          failure_target: 'none',
          notes: null,
        },
        existing_set: null,
        set_number: 4,
        load_kg: 40,
        completed_reps: 10,
        failed_next_rep: false,
        complete: true,
        components: [
          {
            sequence: 1,
            component_type: 'drop',
            load_kg: 30,
            reps_completed_full: 8,
            reps_partial: null,
            duration_seconds: null,
            failed_next_rep: false,
            counts_toward_comparable_tonnage: true,
            notes: 'Drop 25%',
          },
        ],
      },
      fixture.repository,
      {
        device_id: 'device-1',
        now_iso: NOW,
        id_factory: (() => {
          const ids = ['set-drop', 'component-drop']
          return () => ids.shift() ?? 'extra-id'
        })(),
      },
    )

    expect(saved.set_load_kg_reps).toBe(640)
    expect(fixture.saved_components()).toHaveLength(1)
    expect(fixture.saved_components()[0]).toMatchObject({
      component_type: 'drop',
      load_kg: 30,
      reps_completed_full: 8,
      counts_toward_comparable_tonnage: true,
    })
    expect(fixture.saved_exercise()?.started_at).toBe(NOW)
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
