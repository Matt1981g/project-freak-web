import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'

/**
 * A set edit may create an exercise-start marker, primary set,
 * advanced components, audit entries and outbox mutations. All must either
 * commit or roll back together if the browser closes or the write fails.
 */
export function with_atomic_workout_set_save<T>(
  db: ProjectFreakDatabase,
  write: () => Promise<T>,
): Promise<T> {
  return db.transaction(
    'rw',
    [
      db.sets,
      db.set_components,
      db.session_exercises,
      db.audit_events,
      db.sync_outbox,
    ],
    write,
  )
}
