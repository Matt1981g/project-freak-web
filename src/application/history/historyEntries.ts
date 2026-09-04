import type { SessionRepository } from '../../data/repositories/contracts'
import { build_workout_summary } from '../workout/completeWorkout'

export async function list_history_entries(repository: SessionRepository) {
  const sessions = await repository.list_sessions_descending()

  return Promise.all(
    sessions.map(async (session) => {
      const [exercises, sets] = await Promise.all([
        repository.list_session_exercises(session.id),
        repository.list_sets_for_session(session.id),
      ])

      return {
        session,
        summary: build_workout_summary(session, exercises, sets),
      }
    }),
  )
}
