import type { MutableEntity } from './common'
import type {
  FailureTarget,
  LoadType,
  SetComponentType,
  SetRole,
  StructureType,
} from '../enums/training'

export interface ProgrammeBlock extends MutableEntity {
  name: string
  block_type: 'mesocycle' | 'microcycle' | 'custom'
  start_date_local: string | null
  end_date_local: string | null
  status: 'draft' | 'active' | 'completed' | 'archived'
  goal: string | null
  notes: string | null
}

export interface WorkoutTemplate extends MutableEntity {
  programme_block_id: string | null
  name: string
  day_label: string | null
  template_family_id: string
  version_number: number
  status: 'draft' | 'active' | 'retired'
  notes: string | null
}

export interface TemplateExercise extends MutableEntity {
  workout_template_id: string
  exercise_id: string
  planned_order: number
  rotation_group_key: string | null
  rotation_position: number | null
  target_sets: number
  target_rep_min: number | null
  target_rep_max: number | null
  rest_seconds: number | null
  tempo: string | null
  technique_cue: string | null
  notes: string | null
}

export interface TemplateSet extends MutableEntity {
  template_exercise_id: string
  set_number: number
  set_role: SetRole
  structure_type: StructureType
  target_rep_min: number | null
  target_rep_max: number | null
  target_duration_seconds: number | null
  target_load_kg: number | null
  target_load_type: LoadType
  failure_target: FailureTarget
  notes: string | null
}

export type LoadRelation =
  | 'absolute'
  | 'same_as_primary'
  | 'percentage_of_primary'
  | 'unknown'

export interface TemplateSetComponent {
  id: string
  template_set_id: string
  sequence: number
  component_type: SetComponentType
  target_load_kg: number | null
  load_relation: LoadRelation
  target_load_percent: number | null
  target_rep_min: number | null
  target_rep_max: number | null
  target_duration_seconds: number | null
  failure_target: FailureTarget
  notes: string | null
}

export interface ProgrammedSession extends MutableEntity {
  programme_block_id: string | null
  workout_template_id: string | null
  scheduled_date_local: string | null
  name_snapshot: string
  status: 'planned' | 'started' | 'completed' | 'skipped' | 'cancelled'
  notes: string | null
}

export interface ProgrammedSessionExercise extends MutableEntity {
  programmed_session_id: string
  exercise_id: string
  exercise_name_snapshot: string
  planned_order: number
  rotation_group_key: string | null
  rotation_position: number | null
  target_sets: number | null
  target_rep_min: number | null
  target_rep_max: number | null
  rest_seconds: number | null
  tempo: string | null
  technique_cue: string | null
  notes: string | null
}

export interface ProgrammedSessionSet extends MutableEntity {
  programmed_session_exercise_id: string
  set_number: number
  set_role: SetRole
  structure_type: StructureType
  target_rep_min: number | null
  target_rep_max: number | null
  target_duration_seconds: number | null
  target_load_kg: number | null
  target_load_type: LoadType
  failure_target: FailureTarget
  notes: string | null
}

export interface ProgrammedSetComponent {
  id: string
  programmed_session_set_id: string
  sequence: number
  component_type: SetComponentType
  target_load_kg: number | null
  load_relation: LoadRelation
  target_load_percent: number | null
  target_rep_min: number | null
  target_rep_max: number | null
  target_duration_seconds: number | null
  failure_target: FailureTarget
  notes: string | null
}
