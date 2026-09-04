import Dexie, { type Table } from 'dexie'
import type {
  AuditEvent,
  CoachingNote,
  CompletedSession,
  Device,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
  ExerciseMuscle,
  ImportBatch,
  ImportIssue,
  ImportRecord,
  MigrationHistory,
  Muscle,
  ProgrammeBlock,
  ProgrammedSession,
  ProgrammedSessionExercise,
  ProgrammedSessionSet,
  ProgrammedSetComponent,
  ReadinessEntry,
  SchemaMeta,
  SessionExercise,
  SetComponent,
  Setting,
  SyncOutbox,
  SyncState,
  TemplateExercise,
  TemplateSet,
  TemplateSetComponent,
  TrainingSet,
  WorkoutTemplate,
} from '../../domain/models'
import {
  PROJECT_FREAK_DATA_CONTRACT_VERSION,
  PROJECT_FREAK_DB_NAME,
  PROJECT_FREAK_DB_SCHEMA_VERSION,
  PROJECT_FREAK_SCHEMA_V1,
} from './schema'

export class ProjectFreakDatabase extends Dexie {
  schema_meta!: Table<SchemaMeta, string>
  migration_history!: Table<MigrationHistory, number>
  devices!: Table<Device, string>
  settings!: Table<Setting, string>

  exercises!: Table<Exercise, string>
  exercise_aliases!: Table<ExerciseAlias, string>
  muscles!: Table<Muscle, string>
  exercise_muscles!: Table<ExerciseMuscle, string>

  programme_blocks!: Table<ProgrammeBlock, string>
  workout_templates!: Table<WorkoutTemplate, string>
  template_exercises!: Table<TemplateExercise, string>
  template_sets!: Table<TemplateSet, string>
  template_set_components!: Table<TemplateSetComponent, string>

  programmed_sessions!: Table<ProgrammedSession, string>
  programmed_session_exercises!: Table<ProgrammedSessionExercise, string>
  programmed_session_sets!: Table<ProgrammedSessionSet, string>
  programmed_set_components!: Table<ProgrammedSetComponent, string>

  completed_sessions!: Table<CompletedSession, string>
  readiness_entries!: Table<ReadinessEntry, string>
  session_exercises!: Table<SessionExercise, string>
  sets!: Table<TrainingSet, string>
  set_components!: Table<SetComponent, string>
  exercise_metrics!: Table<ExerciseMetrics, string>
  coaching_notes!: Table<CoachingNote, string>

  import_batches!: Table<ImportBatch, string>
  import_records!: Table<ImportRecord, string>
  import_issues!: Table<ImportIssue, string>
  audit_events!: Table<AuditEvent, string>

  sync_outbox!: Table<SyncOutbox, string>
  sync_state!: Table<SyncState, string>

  constructor(database_name = PROJECT_FREAK_DB_NAME) {
    super(database_name)

    this.version(PROJECT_FREAK_DB_SCHEMA_VERSION).stores(
      PROJECT_FREAK_SCHEMA_V1,
    )
  }

  async ensure_schema_metadata(): Promise<SchemaMeta> {
    const existing = await this.schema_meta.get('main')
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const metadata: SchemaMeta = {
      key: 'main',
      db_schema_version: PROJECT_FREAK_DB_SCHEMA_VERSION,
      data_contract_version: PROJECT_FREAK_DATA_CONTRACT_VERSION,
      created_at: now,
      updated_at: now,
    }

    await this.schema_meta.add(metadata)
    return metadata
  }
}

export const projectFreakDb = new ProjectFreakDatabase()
