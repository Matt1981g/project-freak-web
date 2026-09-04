import type {
  CompletedSession,
  SessionExercise,
  TrainingSet,
} from '../models'

export function is_training_set_completed(set: TrainingSet): boolean {
  return set.completed_at !== null || set.source_kind === 'historical_import'
}

export function is_session_exercise_completed(
  exercise: SessionExercise,
  session?: CompletedSession,
): boolean {
  if (exercise.completed_at !== null) return true

  return (
    exercise.source_kind === 'historical_import' &&
    (session === undefined || session.status === 'completed')
  )
}
