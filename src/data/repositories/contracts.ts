import type {
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'

export interface ExerciseRepository {
  get_by_id(id: string): Promise<Exercise | undefined>
  list_active(): Promise<Exercise[]>
  put(exercise: Exercise): Promise<string>
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
  exercises: ExerciseRepository
  sessions: SessionRepository
}
