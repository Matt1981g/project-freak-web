import { create_uuid } from '../../domain/ids/uuid'
import type {
  CompletedSession,
  SessionExercise,
} from '../../domain/models'
import type {
  ProgrammedSessionDetail,
  SessionRepository,
} from '../../data/repositories/contracts'

export interface StartWorkoutContext {
  device_id: string
  now_iso: string
  local_date: string
  timezone: string | null
  id_factory?: () => string
}

export interface StartWorkoutResult {
  session_id: string
  created: boolean
}

export async function start_programmed_workout(
  detail: ProgrammedSessionDetail,
  repository: SessionRepository,
  context: StartWorkoutContext,
): Promise<StartWorkoutResult> {
  const existing = await repository.get_by_programmed_session_id(
    detail.session.id,
  )
  if (existing && existing.status !== 'completed') {
    return { session_id: existing.id, created: false }
  }

  const make_id = context.id_factory ?? (() => create_uuid())
  const session_id = make_id()

  const session: CompletedSession = {
    id: session_id,
    created_at: context.now_iso,
    updated_at: context.now_iso,
    deleted_at: null,
    revision: 1,
    device_id: context.device_id,
    source_kind: 'user',
    source_id: null,
    programmed_session_id: detail.session.id,
    programme_block_id: detail.session.programme_block_id,
    workout_template_id_snapshot: detail.session.workout_template_id,
    legacy_workout_id: null,
    session_name: detail.session.name_snapshot,
    session_date_local: context.local_date,
    timezone: context.timezone,
    status: 'in_progress',
    started_at: context.now_iso,
    completed_at: null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: null,
    notes: null,
  }

  const exercises: SessionExercise[] = detail.exercises.map(({ exercise }) => ({
    id: make_id(),
    created_at: context.now_iso,
    updated_at: context.now_iso,
    deleted_at: null,
    revision: 1,
    device_id: context.device_id,
    source_kind: 'user',
    source_id: null,
    completed_session_id: session_id,
    programmed_session_exercise_id: exercise.id,
    exercise_id: exercise.exercise_id,
    exercise_name_snapshot: exercise.exercise_name_snapshot,
    planned_order: exercise.planned_order,
    actual_order: exercise.planned_order,
    rotation_group_key: exercise.rotation_group_key,
    rotation_position: exercise.rotation_position,
    target_sets: exercise.target_sets,
    target_rep_min: exercise.target_rep_min,
    target_rep_max: exercise.target_rep_max,
    rest_seconds: exercise.rest_seconds,
    tempo: exercise.tempo,
    technique_cue: exercise.technique_cue,
    programme_notes: exercise.notes,
    started_at: null,
    completed_at: null,
    notes: null,
  }))

  return repository.create_session_graph(session, exercises)
}
