import type {
  CompletedSession,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import {
  is_session_exercise_completed,
  is_training_set_completed,
} from '../../domain/rules/completion'

export interface WorkoutSummary {
  total_volume_kg: number
  completed_sets: number
  exercise_count: number
  duration_seconds: number | null
}

export interface CompleteWorkoutContext {
  device_id: string
  now_iso: string
}

function duration_seconds(
  started_at: string | null,
  completed_at: string,
): number | null {
  if (!started_at) return null

  const started = Date.parse(started_at)
  const completed = Date.parse(completed_at)
  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return null
  }

  return Math.max(0, Math.round((completed - started) / 1000))
}

export function build_workout_summary(
  session: CompletedSession,
  exercises: SessionExercise[],
  sets: TrainingSet[],
): WorkoutSummary {
  const completed_sets = sets.filter(is_training_set_completed)

  return {
    total_volume_kg: completed_sets.reduce(
      (total, set) => total + (set.set_load_kg_reps ?? 0),
      0,
    ),
    completed_sets: completed_sets.length,
    exercise_count: exercises.length,
    duration_seconds: session.duration_seconds,
  }
}

export async function complete_workout_session(
  session: CompletedSession,
  repository: SessionRepository,
  context: CompleteWorkoutContext,
): Promise<{ session: CompletedSession; summary: WorkoutSummary }> {
  const exercises = await repository.list_session_exercises(session.id)

  if (exercises.length === 0) {
    throw new Error('A workout with no exercises cannot be completed.')
  }

  const incomplete = exercises.filter(
    (exercise) => !is_session_exercise_completed(exercise, session),
  )
  if (incomplete.length > 0) {
    throw new Error(
      `Complete all exercises before finishing the workout. ${incomplete.length} remaining.`,
    )
  }

  const sets = await repository.list_sets_for_session(session.id)

  if (session.status === 'completed') {
    return {
      session,
      summary: build_workout_summary(session, exercises, sets),
    }
  }

  const completed: CompletedSession = {
    ...session,
    status: 'completed',
    completed_at: context.now_iso,
    duration_seconds: duration_seconds(session.started_at, context.now_iso),
    updated_at: context.now_iso,
    revision: session.revision + 1,
    device_id: context.device_id,
  }

  await repository.put_session(completed)

  return {
    session: completed,
    summary: build_workout_summary(completed, exercises, sets),
  }
}
