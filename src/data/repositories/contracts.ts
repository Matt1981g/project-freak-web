import type {
  CompletedSession,
  Device,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
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

export interface SessionRepository {
  get_session(id: string): Promise<CompletedSession | undefined>
  list_sessions_descending(): Promise<CompletedSession[]>
  put_session(session: CompletedSession): Promise<string>
  put_session_exercise(session_exercise: SessionExercise): Promise<string>
  put_set(set: TrainingSet): Promise<string>
  put_set_components(components: SetComponent[]): Promise<void>
  put_exercise_metrics(metrics: ExerciseMetrics): Promise<string>
}

export interface RepositoryBundle {
  devices: DeviceRepository
  exercises: ExerciseRepository
  sessions: SessionRepository
}
