import type {
  CompletedSession,
  Device,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
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

export interface DeviceRepository {
  ensure_local(platform: string): Promise<Device>
}

export interface ExerciseRepository {
  get_by_id(id: string): Promise<Exercise | undefined>
  list_all(): Promise<Exercise[]>
  list_active(): Promise<Exercise[]>
  list_aliases(): Promise<ExerciseAlias[]>
  put(exercise: Exercise): Promise<string>
  merge_definitions(
    source_ids: string[],
    target_id: string,
    device_id: string,
    timestamp: string,
  ): Promise<ExerciseAlias[]>
}

export interface ProgrammeImportEntities {
  block: ProgrammeBlock
  templates: WorkoutTemplate[]
  template_exercises: TemplateExercise[]
  template_sets: TemplateSet[]
  template_set_components: TemplateSetComponent[]
  programmed_sessions: ProgrammedSession[]
  programmed_session_exercises: ProgrammedSessionExercise[]
  programmed_session_sets: ProgrammedSessionSet[]
  programmed_set_components: ProgrammedSetComponent[]
}

export interface ProgrammedSessionSetDetail {
  set: ProgrammedSessionSet
  components: ProgrammedSetComponent[]
}

export interface ProgrammedSessionExerciseDetail {
  exercise: ProgrammedSessionExercise
  sets: ProgrammedSessionSetDetail[]
}

export interface ProgrammedSessionDetail {
  session: ProgrammedSession
  exercises: ProgrammedSessionExerciseDetail[]
}

export interface ProgrammeRepository {
  list_blocks(): Promise<ProgrammeBlock[]>
  list_templates_for_block(programme_block_id: string): Promise<WorkoutTemplate[]>
  list_programmed_sessions_for_block(
    programme_block_id: string,
  ): Promise<ProgrammedSession[]>
  get_programmed_session_detail(
    programmed_session_id: string,
  ): Promise<ProgrammedSessionDetail | undefined>
  get_latest_template_version(template_family_id: string): Promise<number>
  commit_import(
    entities: ProgrammeImportEntities,
  ): Promise<'committed' | 'duplicate_noop'>
}

export interface SessionRepository {
  get_session(id: string): Promise<CompletedSession | undefined>
  get_by_programmed_session_id(
    programmed_session_id: string,
  ): Promise<CompletedSession | undefined>
  list_sessions_descending(): Promise<CompletedSession[]>
  list_session_exercises(
    completed_session_id: string,
  ): Promise<SessionExercise[]>
  create_session_graph(
    session: CompletedSession,
    exercises: SessionExercise[],
  ): Promise<{ session_id: string; created: boolean }>
  put_session(session: CompletedSession): Promise<string>
  put_session_exercise(session_exercise: SessionExercise): Promise<string>
  put_set(set: TrainingSet): Promise<string>
  put_set_components(components: SetComponent[]): Promise<void>
  put_exercise_metrics(metrics: ExerciseMetrics): Promise<string>
}

export interface RepositoryBundle {
  devices: DeviceRepository
  exercises: ExerciseRepository
  programme: ProgrammeRepository
  sessions: SessionRepository
}
