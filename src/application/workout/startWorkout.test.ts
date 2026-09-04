import { describe, expect, it, vi } from 'vitest'
import type {
  CompletedSession,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type {
  ProgrammedSessionDetail,
  SessionRepository,
} from '../../data/repositories/contracts'
import { start_programmed_workout } from './startWorkout'

const NOW = '2026-09-04T17:30:00.000Z'
const DEVICE_ID = 'device-1'

function programmed_detail(): ProgrammedSessionDetail {
  return {
    session: {
      id: 'programmed-session-1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      revision: 1,
      device_id: DEVICE_ID,
      source_kind: 'programme_import',
      source_id: 'programme-json:test',
      programme_block_id: 'block-1',
      workout_template_id: 'template-1',
      scheduled_date_local: '2026-09-07',
      name_snapshot: 'Monday — Arms + Delts',
      status: 'planned',
      notes: 'Pair A1/A2.',
    },
    exercises: [
      {
        exercise: {
          id: 'programmed-exercise-1',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: DEVICE_ID,
          source_kind: 'programme_import',
          source_id: 'programme-json:test',
          programmed_session_id: 'programmed-session-1',
          exercise_id: 'exercise-1',
          exercise_name_snapshot: 'Nautilus Bicep Curl',
          planned_order: 1,
          rotation_group_key: 'A',
          rotation_position: 1,
          target_sets: 4,
          target_rep_min: 8,
          target_rep_max: 12,
          rest_seconds: 90,
          tempo: '3-0-1-0',
          technique_cue: 'Keep upper arm fixed.',
          notes: 'Biceps priority.',
        },
        sets: [],
      },
      {
        exercise: {
          id: 'programmed-exercise-2',
          created_at: NOW,
          updated_at: NOW,
          deleted_at: null,
          revision: 1,
          device_id: DEVICE_ID,
          source_kind: 'programme_import',
          source_id: 'programme-json:test',
          programmed_session_id: 'programmed-session-1',
          exercise_id: 'exercise-2',
          exercise_name_snapshot: 'Triceps Pressdown',
          planned_order: 2,
          rotation_group_key: 'A',
          rotation_position: 2,
          target_sets: 4,
          target_rep_min: 8,
          target_rep_max: 12,
          rest_seconds: 90,
          tempo: '2-0-1-1',
          technique_cue: 'Pin elbows.',
          notes: null,
        },
        sets: [],
      },
    ],
  }
}

function repository_fixture(existing?: CompletedSession) {
  let graph:
    | { session: CompletedSession; exercises: SessionExercise[] }
    | undefined

  const repository: SessionRepository = {
    get_session: async () => undefined,
    get_by_programmed_session_id: async () => existing,
    list_sessions_descending: async () => [],
    list_session_exercises: async () => [],
    list_sets_for_session_exercise: async () => [],
    create_session_graph: vi.fn(async (session, exercises) => {
      graph = { session, exercises }
      return { session_id: session.id, created: true }
    }),
    put_session: async (session) => session.id,
    put_session_exercise: async (exercise) => exercise.id,
    put_set: async (set: TrainingSet) => set.id,
    put_set_components: async (_components: SetComponent[]) => undefined,
    put_exercise_metrics: async (metrics: ExerciseMetrics) => metrics.id,
  }

  return { repository, get_graph: () => graph }
}

describe('start_programmed_workout', () => {
  it('creates one actual workout graph from the programmed snapshot', async () => {
    const fixture = repository_fixture()
    const ids = ['session-1', 'session-exercise-1', 'session-exercise-2']
    let id_index = 0

    const result = await start_programmed_workout(
      programmed_detail(),
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: NOW,
        local_date: '2026-09-04',
        timezone: 'Europe/London',
        id_factory: () => ids[id_index++],
      },
    )

    expect(result).toEqual({ session_id: 'session-1', created: true })

    const graph = fixture.get_graph()
    expect(graph?.session.programmed_session_id).toBe('programmed-session-1')
    expect(graph?.session.session_date_local).toBe('2026-09-04')
    expect(graph?.session.status).toBe('in_progress')
    expect(graph?.exercises).toHaveLength(2)
    expect(graph?.exercises[0]).toMatchObject({
      programmed_session_exercise_id: 'programmed-exercise-1',
      exercise_name_snapshot: 'Nautilus Bicep Curl',
      actual_order: 1,
      rotation_group_key: 'A',
      rotation_position: 1,
      target_sets: 4,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 90,
      tempo: '3-0-1-0',
      programme_notes: 'Biceps priority.',
    })
  })

  it('reopens an existing actual workout instead of duplicating it', async () => {
    const existing: CompletedSession = {
      id: 'existing-session',
      created_at: NOW,
      updated_at: NOW,
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
      status: 'in_progress',
      started_at: NOW,
      completed_at: null,
      source_start_text: null,
      source_finish_text: null,
      duration_seconds: null,
      notes: null,
    }
    const fixture = repository_fixture(existing)

    const result = await start_programmed_workout(
      programmed_detail(),
      fixture.repository,
      {
        device_id: DEVICE_ID,
        now_iso: NOW,
        local_date: '2026-09-04',
        timezone: 'Europe/London',
      },
    )

    expect(result).toEqual({ session_id: 'existing-session', created: false })
    expect(fixture.get_graph()).toBeUndefined()
  })
})
