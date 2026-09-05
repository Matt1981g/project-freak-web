import type { MutableEntity } from './common'
import type {
  FailureStatus,
  LoadType,
  RepMode,
  SetComponentType,
  SetRole,
  StructureType,
} from '../enums/training'

export interface CompletedSession extends MutableEntity {
  programmed_session_id: string | null
  programme_block_id: string | null
  workout_template_id_snapshot: string | null
  legacy_workout_id: string | null
  session_name: string
  session_date_local: string
  timezone: string | null
  status: 'in_progress' | 'completed' | 'abandoned'
  started_at: string | null
  completed_at: string | null
  source_start_text: string | null
  source_finish_text: string | null
  duration_seconds: number | null
  notes: string | null
}

export type MuscleRecoveryStatus =
  | 'fresh'
  | 'mild_soreness'
  | 'sore'
  | 'performance_affected'

export interface MuscleRecoveryRating {
  muscle: string
  status: MuscleRecoveryStatus
  source_session_id: string
  source_session_date_local: string
}

export interface ReadinessEntry extends MutableEntity {
  completed_session_id: string
  bodyweight_kg: number | null
  sleep_duration_minutes: number | null
  sleep_score: number | null
  energy_pre: number | null
  motivation_pre: number | null
  soreness_score: number | null
  soreness_notes: string | null
  muscle_recovery?: MuscleRecoveryRating[]
  joint_issue_present: boolean | null
  joint_issue_notes: string | null
  pre_workout_nutrition: string | null
  intra_workout_nutrition: string | null
  intra_hydration_ml: number | null
  post_workout_intake: string | null
  session_fatigue: number | null
  breathlessness: number | null
  energy_stability: number | null
  notes: string | null
}

export interface SessionExercise extends MutableEntity {
  completed_session_id: string
  programmed_session_exercise_id: string | null
  exercise_id: string
  exercise_name_snapshot: string
  planned_order: number | null
  actual_order: number
  rotation_group_key: string | null
  rotation_position: number | null
  target_sets: number | null
  target_rep_min: number | null
  target_rep_max: number | null
  rest_seconds: number | null
  tempo: string | null
  technique_cue: string | null
  programme_notes: string | null
  started_at: string | null
  completed_at: string | null
  notes: string | null
}

export interface TrainingSet extends MutableEntity {
  completed_session_id: string
  session_exercise_id: string
  exercise_id: string
  exercise_order_snapshot: number
  set_number: number
  set_role: SetRole
  structure_type: StructureType
  load_kg: number | null
  load_type: LoadType
  rep_mode: RepMode
  reps_as_recorded: string | null
  primary_reps_completed: number | null
  left_reps_completed: number | null
  right_reps_completed: number | null
  completed_reps: number | null
  partial_reps: number | null
  duration_seconds: number | null
  failure_status: FailureStatus
  left_failure_status: FailureStatus | null
  right_failure_status: FailureStatus | null
  actual_rest_seconds: number | null
  set_load_kg_reps: number | null
  set_load_method: string | null
  notes: string | null
  completed_at: string | null
  source_record_key: string | null
}

export interface SetComponent extends MutableEntity {
  set_id: string
  sequence: number
  component_type: SetComponentType
  load_kg: number | null
  load_type: LoadType | null
  reps_completed_full: number | null
  reps_partial: number | null
  duration_seconds: number | null
  failure_status: FailureStatus
  counts_toward_comparable_tonnage: boolean
  notes: string | null
}

export interface ExerciseMetrics extends MutableEntity {
  session_exercise_id: string
  rpe: number | null
  pump: number | null
  form: number | null
  where_felt_text: string | null
  where_felt_tags: string[]
  legacy_tension: number | null
  legacy_mmc: number | null
  notes: string | null
}

export interface CoachingNote extends MutableEntity {
  scope_type: 'programme' | 'session' | 'session_exercise' | 'set' | 'exercise'
  scope_id: string
  author_type: 'user' | 'coach' | 'import'
  note: string
  tags: string[]
}
