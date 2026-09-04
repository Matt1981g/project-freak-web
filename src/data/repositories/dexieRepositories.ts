import type { Table } from 'dexie'
import type {
  CompletedSession,
  Device,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
  MutableEntity,
  ProgrammeBlock,
  ProgrammedSession,
  ProgrammedSessionExercise,
  ProgrammedSessionSet,
  ProgrammedSetComponent,
  SessionExercise,
  SetComponent,
  TemplateExercise,
  TemplateSet,
  TemplateSetComponent,
  TrainingSet,
  WorkoutTemplate,
} from '../../domain/models'
import type { ProjectFreakDatabase } from '../db/projectFreakDb'
import type {
  DeviceRepository,
  ExerciseRepository,
  ProgrammeImportEntities,
  ProgrammeRepository,
  ProgrammedSessionDetail,
  RepositoryBundle,
  SessionRepository,
} from './contracts'
import {
  create_audit_event,
  create_sync_outbox_entry,
} from './persistenceUtils'

type SyncableEntity =
  | Exercise
  | ExerciseAlias
  | ProgrammeBlock
  | WorkoutTemplate
  | TemplateExercise
  | TemplateSet
  | TemplateSetComponent
  | ProgrammedSession
  | ProgrammedSessionExercise
  | ProgrammedSessionSet
  | ProgrammedSetComponent
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

export class DexieDeviceRepository implements DeviceRepository {
  private readonly db: ProjectFreakDatabase

  constructor(db: ProjectFreakDatabase) {
    this.db = db
  }

  async ensure_local(platform: string): Promise<Device> {
    const now = new Date().toISOString()
    const existing = await this.db.devices.toCollection().first()

    if (existing) {
      const updated: Device = {
        ...existing,
        platform,
        last_seen_at: now,
      }
      await this.db.devices.put(updated)
      return updated
    }

    const device: Device = {
      id: crypto.randomUUID(),
      display_name: 'This device',
      platform,
      first_seen_at: now,
      last_seen_at: now,
    }
    await this.db.devices.add(device)
    return device
  }
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

  list_aliases(): Promise<ExerciseAlias[]> {
    return this.db.exercise_aliases.toArray()
  }

  put(exercise: Exercise): Promise<string> {
    return put_with_audit_and_outbox(
      this.db,
      this.db.exercises,
      'exercise',
      exercise,
    )
  }

  async merge_definitions(
    source_ids: string[],
    target_id: string,
    device_id: string,
    timestamp: string,
  ): Promise<ExerciseAlias[]> {
    const unique_source_ids = [...new Set(source_ids)].filter(
      (id) => id !== target_id,
    )

    return this.db.transaction(
      'rw',
      this.db.exercises,
      this.db.exercise_aliases,
      this.db.audit_events,
      this.db.sync_outbox,
      async () => {
        const target = await this.db.exercises.get(target_id)
        if (!target || target.deleted_at !== null) {
          throw new Error(`Target exercise ${target_id} was not found.`)
        }

        const created_aliases: ExerciseAlias[] = []

        for (const source_id of unique_source_ids) {
          const source = await this.db.exercises.get(source_id)
          if (!source || source.deleted_at !== null) {
            throw new Error(`Source exercise ${source_id} was not found.`)
          }

          const normalized_alias = source.canonical_name
            .trim()
            .toLocaleLowerCase('en-GB')

          const existing_alias = await this.db.exercise_aliases
            .where('[exercise_id+normalized_alias]')
            .equals([target_id, normalized_alias])
            .filter((alias) => alias.source_exercise_id === source_id)
            .first()

          if (existing_alias) {
            created_aliases.push(existing_alias)
            continue
          }

          const updated_source: Exercise = {
            ...source,
            archived_at: source.archived_at ?? timestamp,
            updated_at: timestamp,
            revision: source.revision + 1,
            device_id,
            source_kind: 'user',
            source_id: null,
          }

          const alias: ExerciseAlias = {
            id: crypto.randomUUID(),
            exercise_id: target_id,
            source_exercise_id: source.id,
            alias: source.canonical_name,
            normalized_alias,
            created_at: timestamp,
            updated_at: timestamp,
            deleted_at: null,
            revision: 1,
            device_id,
            source_kind: 'user',
            source_id: null,
          }

          await this.db.exercises.put(updated_source)
          await this.db.exercise_aliases.add(alias)

          await this.db.audit_events.bulkAdd([
            create_audit_event(
              'exercise',
              updated_source,
              source,
              'update',
            ),
            create_audit_event('exercise_alias', alias, null, 'create'),
          ])

          await this.db.sync_outbox.bulkAdd([
            create_sync_outbox_entry('exercise', updated_source),
            create_sync_outbox_entry('exercise_alias', alias),
          ])

          created_aliases.push(alias)
        }

        return created_aliases
      },
    )
  }
}

export class DexieProgrammeRepository implements ProgrammeRepository {
  private readonly db: ProjectFreakDatabase

  constructor(db: ProjectFreakDatabase) {
    this.db = db
  }

  async list_blocks(): Promise<ProgrammeBlock[]> {
    const blocks = await this.db.programme_blocks.toArray()
    return blocks
      .filter((block) => block.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  async list_templates_for_block(
    programme_block_id: string,
  ): Promise<WorkoutTemplate[]> {
    const templates = await this.db.workout_templates
      .where('programme_block_id')
      .equals(programme_block_id)
      .toArray()

    return templates
      .filter((template) => template.deleted_at === null)
      .sort((a, b) => {
        const by_name = a.name.localeCompare(b.name)
        if (by_name !== 0) return by_name
        return b.version_number - a.version_number
      })
  }

  async list_programmed_sessions_for_block(
    programme_block_id: string,
  ): Promise<ProgrammedSession[]> {
    const sessions = await this.db.programmed_sessions
      .where('programme_block_id')
      .equals(programme_block_id)
      .toArray()

    return sessions
      .filter((session) => session.deleted_at === null)
      .sort((a, b) => {
        const left = a.scheduled_date_local ?? '9999-12-31'
        const right = b.scheduled_date_local ?? '9999-12-31'
        return left.localeCompare(right)
      })
  }

  async get_programmed_session_detail(
    programmed_session_id: string,
  ): Promise<ProgrammedSessionDetail | undefined> {
    const session = await this.db.programmed_sessions.get(programmed_session_id)
    if (!session || session.deleted_at !== null) {
      return undefined
    }

    const exercises = (
      await this.db.programmed_session_exercises
        .where('programmed_session_id')
        .equals(programmed_session_id)
        .toArray()
    )
      .filter((exercise) => exercise.deleted_at === null)
      .sort((a, b) => a.planned_order - b.planned_order)

    return {
      session,
      exercises: await Promise.all(
        exercises.map(async (exercise) => {
          const sets = (
            await this.db.programmed_session_sets
              .where('programmed_session_exercise_id')
              .equals(exercise.id)
              .toArray()
          )
            .filter((set) => set.deleted_at === null)
            .sort((a, b) => a.set_number - b.set_number)

          return {
            exercise,
            sets: await Promise.all(
              sets.map(async (set) => ({
                set,
                components: (
                  await this.db.programmed_set_components
                    .where('programmed_session_set_id')
                    .equals(set.id)
                    .toArray()
                )
                  .filter((component) => component.deleted_at === null)
                  .sort((a, b) => a.sequence - b.sequence),
              })),
            ),
          }
        }),
      ),
    }
  }

  async get_latest_template_version(
    template_family_id: string,
  ): Promise<number> {
    const templates = await this.db.workout_templates
      .where('template_family_id')
      .equals(template_family_id)
      .toArray()

    return templates.reduce(
      (latest, template) => Math.max(latest, template.version_number),
      0,
    )
  }

  async commit_import(
    entities: ProgrammeImportEntities,
  ): Promise<'committed' | 'duplicate_noop'> {
    const duplicate = await this.db.programme_blocks
      .filter(
        (block) =>
          block.deleted_at === null &&
          block.source_kind === 'programme_import' &&
          block.source_id === entities.block.source_id,
      )
      .first()

    if (duplicate) {
      return 'duplicate_noop'
    }

    const syncable: Array<[string, SyncableEntity]> = [
      ['programme_block', entities.block],
      ...entities.templates.map(
        (entity) => ['workout_template', entity] as [string, SyncableEntity],
      ),
      ...entities.template_exercises.map(
        (entity) => ['template_exercise', entity] as [string, SyncableEntity],
      ),
      ...entities.template_sets.map(
        (entity) => ['template_set', entity] as [string, SyncableEntity],
      ),
      ...entities.template_set_components.map(
        (entity) =>
          ['template_set_component', entity] as [string, SyncableEntity],
      ),
      ...entities.programmed_sessions.map(
        (entity) => ['programmed_session', entity] as [string, SyncableEntity],
      ),
      ...entities.programmed_session_exercises.map(
        (entity) =>
          ['programmed_session_exercise', entity] as [string, SyncableEntity],
      ),
      ...entities.programmed_session_sets.map(
        (entity) =>
          ['programmed_session_set', entity] as [string, SyncableEntity],
      ),
      ...entities.programmed_set_components.map(
        (entity) =>
          ['programmed_set_component', entity] as [string, SyncableEntity],
      ),
    ]

    return this.db.transaction(
      'rw',
      [
        this.db.programme_blocks,
        this.db.workout_templates,
        this.db.template_exercises,
        this.db.template_sets,
        this.db.template_set_components,
        this.db.programmed_sessions,
        this.db.programmed_session_exercises,
        this.db.programmed_session_sets,
        this.db.programmed_set_components,
        this.db.audit_events,
        this.db.sync_outbox,
      ],
      async (): Promise<'committed'> => {
        await this.db.programme_blocks.add(entities.block)
        await this.db.workout_templates.bulkAdd(entities.templates)
        await this.db.template_exercises.bulkAdd(entities.template_exercises)
        await this.db.template_sets.bulkAdd(entities.template_sets)
        if (entities.template_set_components.length > 0) {
          await this.db.template_set_components.bulkAdd(
            entities.template_set_components,
          )
        }

        await this.db.programmed_sessions.bulkAdd(
          entities.programmed_sessions,
        )
        await this.db.programmed_session_exercises.bulkAdd(
          entities.programmed_session_exercises,
        )
        await this.db.programmed_session_sets.bulkAdd(
          entities.programmed_session_sets,
        )
        if (entities.programmed_set_components.length > 0) {
          await this.db.programmed_set_components.bulkAdd(
            entities.programmed_set_components,
          )
        }

        await this.db.audit_events.bulkAdd(
          syncable.map(([entity_type, entity]) =>
            create_audit_event(entity_type, entity, null, 'create'),
          ),
        )
        await this.db.sync_outbox.bulkAdd(
          syncable.map(([entity_type, entity]) =>
            create_sync_outbox_entry(entity_type, entity),
          ),
        )

        return 'committed'
      },
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

  async get_by_programmed_session_id(
    programmed_session_id: string,
  ): Promise<CompletedSession | undefined> {
    return this.db.completed_sessions
      .where('programmed_session_id')
      .equals(programmed_session_id)
      .filter((session) => session.deleted_at === null)
      .first()
  }

  async list_session_exercises(
    completed_session_id: string,
  ): Promise<SessionExercise[]> {
    const exercises = await this.db.session_exercises
      .where('completed_session_id')
      .equals(completed_session_id)
      .toArray()

    return exercises
      .filter((exercise) => exercise.deleted_at === null)
      .sort((a, b) => a.actual_order - b.actual_order)
  }

  async list_sets_for_session_exercise(
    session_exercise_id: string,
  ): Promise<TrainingSet[]> {
    const sets = await this.db.sets
      .where('session_exercise_id')
      .equals(session_exercise_id)
      .toArray()

    return sets
      .filter((set) => set.deleted_at === null)
      .sort((a, b) => a.set_number - b.set_number)
  }

  async create_session_graph(
    session: CompletedSession,
    exercises: SessionExercise[],
  ): Promise<{ session_id: string; created: boolean }> {
    return this.db.transaction(
      'rw',
      [
        this.db.completed_sessions,
        this.db.session_exercises,
        this.db.audit_events,
        this.db.sync_outbox,
      ],
      async () => {
        if (session.programmed_session_id) {
          const existing = await this.db.completed_sessions
            .where('programmed_session_id')
            .equals(session.programmed_session_id)
            .filter((candidate) => candidate.deleted_at === null)
            .first()

          if (existing) {
            return { session_id: existing.id, created: false }
          }
        }

        await this.db.completed_sessions.add(session)
        if (exercises.length > 0) {
          await this.db.session_exercises.bulkAdd(exercises)
        }

        const syncable: Array<[string, MutableEntity]> = [
          ['completed_session', session],
          ...exercises.map(
            (exercise) =>
              ['session_exercise', exercise] as [string, MutableEntity],
          ),
        ]

        await this.db.audit_events.bulkAdd(
          syncable.map(([entity_type, entity]) =>
            create_audit_event(entity_type, entity, null, 'create'),
          ),
        )
        await this.db.sync_outbox.bulkAdd(
          syncable.map(([entity_type, entity]) =>
            create_sync_outbox_entry(entity_type, entity),
          ),
        )

        return { session_id: session.id, created: true }
      },
    )
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
    devices: new DexieDeviceRepository(db),
    exercises: new DexieExerciseRepository(db),
    programme: new DexieProgrammeRepository(db),
    sessions: new DexieSessionRepository(db),
  }
}
