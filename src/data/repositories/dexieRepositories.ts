import type { Table } from 'dexie'
import type {
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  MutableEntity,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type { ProjectFreakDatabase } from '../db/projectFreakDb'
import type {
  ExerciseRepository,
  RepositoryBundle,
  SessionRepository,
} from './contracts'
import {
  create_audit_event,
  create_sync_outbox_entry,
} from './persistenceUtils'

type SyncableEntity =
  | Exercise
  | CompletedSession
  | SessionExercise
  | TrainingSet
  | SetComponent
  | ExerciseMetrics

async function put_with_audit_and_outbox<T extends SyncableEntity>(
  db: ProjectFreakDatabase,
  table: Table<T, string>,
  entity_type: string,
  entity: T,
): Promise<string> {
  return db.transaction(
    'rw',
    table,
    db.audit_events,
    db.sync_outbox,
    async () => {
      const before = await table.get(entity.id)
      await table.put(entity)

      await db.audit_events.add(
        create_audit_event(
          entity_type,
          entity as MutableEntity,
          before ?? null,
          before ? 'update' : 'create',
        ),
      )

      await db.sync_outbox.add(
        create_sync_outbox_entry(entity_type, entity as MutableEntity),
      )

      return entity.id
    },
  )
}

export class DexieExerciseRepository implements ExerciseRepository {
  private readonly db: ProjectFreakDatabase

  constructor(db: ProjectFreakDatabase) {
    this.db = db
  }

  get_by_id(id: string): Promise<Exercise | undefined> {
    return this.db.exercises.get(id)
  }

  async list_all(): Promise<Exercise[]> {
    const exercises = await this.db.exercises.toArray()

    return exercises
      .filter((exercise) => exercise.deleted_at === null)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
  }

  async list_active(): Promise<Exercise[]> {
    const exercises = await this.list_all()
    return exercises.filter((exercise) => exercise.archived_at === null)
  }

  put(exercise: Exercise): Promise<string> {
    return put_with_audit_and_outbox(
      this.db,
      this.db.exercises,
      'exercise',
      exercise,
    )
  }
}

export class DexieSessionRepository implements SessionRepository {
  private readonly db: ProjectFreakDatabase

  constructor(db: ProjectFreakDatabase) {
    this.db = db
  }

  get_session(id: string): Promise<CompletedSession | undefined> {
    return this.db.completed_sessions.get(id)
  }

  async list_sessions_descending(): Promise<CompletedSession[]> {
    const sessions = await this.db.completed_sessions.toArray()

    return sessions
      .filter((session) => session.deleted_at === null)
      .sort((a, b) => {
        const by_date = b.session_date_local.localeCompare(a.session_date_local)
        if (by_date !== 0) {
          return by_date
        }

        return (b.started_at ?? '').localeCompare(a.started_at ?? '')
      })
  }

  put_session(session: CompletedSession): Promise<string> {
    return put_with_audit_and_outbox(
      this.db,
      this.db.completed_sessions,
      'completed_session',
      session,
    )
  }

  put_session_exercise(session_exercise: SessionExercise): Promise<string> {
    return put_with_audit_and_outbox(
      this.db,
      this.db.session_exercises,
      'session_exercise',
      session_exercise,
    )
  }

  put_set(set: TrainingSet): Promise<string> {
    return put_with_audit_and_outbox(this.db, this.db.sets, 'set', set)
  }

  async put_set_components(components: SetComponent[]): Promise<void> {
    for (const component of components) {
      await put_with_audit_and_outbox(
        this.db,
        this.db.set_components,
        'set_component',
        component,
      )
    }
  }

  put_exercise_metrics(metrics: ExerciseMetrics): Promise<string> {
    return put_with_audit_and_outbox(
      this.db,
      this.db.exercise_metrics,
      'exercise_metrics',
      metrics,
    )
  }
}

export function create_repositories(
  db: ProjectFreakDatabase,
): RepositoryBundle {
  return {
    exercises: new DexieExerciseRepository(db),
    sessions: new DexieSessionRepository(db),
  }
}
