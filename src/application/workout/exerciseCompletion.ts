import type {
  ExerciseMetrics,
  SessionExercise,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'

export interface ExerciseScoreInput {
  rpe: number | null
  pump: number | null
  form: number | null
}

export interface ExerciseCompletionContext {
  device_id: string
  now_iso: string
  id_factory?: () => string
}

function validate_score(value: number | null, label: string): void {
  if (value === null) return
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`${label} must be a whole number from 1 to 10.`)
  }
}

export async function save_exercise_scores(
  session_exercise_id: string,
  scores: ExerciseScoreInput,
  repository: SessionRepository,
  context: ExerciseCompletionContext,
): Promise<ExerciseMetrics | null> {
  validate_score(scores.rpe, 'RPE')
  validate_score(scores.pump, 'Pump')
  validate_score(scores.form, 'Form')

  const existing = await repository.get_exercise_metrics(session_exercise_id)
  const has_any_score =
    scores.rpe !== null || scores.pump !== null || scores.form !== null

  if (!existing && !has_any_score) {
    return null
  }

  const metrics: ExerciseMetrics = {
    id: existing?.id ?? (context.id_factory ?? (() => crypto.randomUUID()))(),
    created_at: existing?.created_at ?? context.now_iso,
    updated_at: context.now_iso,
    deleted_at: null,
    revision: existing ? existing.revision + 1 : 1,
    device_id: context.device_id,
    source_kind: 'user',
    source_id: null,
    session_exercise_id,
    rpe: scores.rpe,
    pump: scores.pump,
    form: scores.form,
    where_felt_text: existing?.where_felt_text ?? null,
    where_felt_tags: existing?.where_felt_tags ?? [],
    legacy_tension: existing?.legacy_tension ?? null,
    legacy_mmc: existing?.legacy_mmc ?? null,
    notes: existing?.notes ?? null,
  }

  await repository.put_exercise_metrics(metrics)
  return metrics
}

export async function complete_live_exercise(
  exercise: SessionExercise,
  repository: SessionRepository,
  context: ExerciseCompletionContext,
): Promise<SessionExercise> {
  if (exercise.completed_at !== null) {
    return exercise
  }

  const sets = await repository.list_sets_for_session_exercise(exercise.id)
  const completed_sets = sets.filter((set) => set.completed_at !== null)

  if (
    exercise.target_sets !== null &&
    completed_sets.length < exercise.target_sets
  ) {
    throw new Error(
      `Complete all ${exercise.target_sets} programmed sets before completing the exercise.`,
    )
  }

  const completed: SessionExercise = {
    ...exercise,
    started_at: exercise.started_at ?? completed_sets[0]?.completed_at ?? context.now_iso,
    completed_at: context.now_iso,
    updated_at: context.now_iso,
    revision: exercise.revision + 1,
    device_id: context.device_id,
  }

  await repository.put_session_exercise(completed)
  return completed
}
