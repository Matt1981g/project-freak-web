import type { MutableEntity } from './common'
import type { LoadType, RepMode } from '../enums/training'

export interface Exercise extends MutableEntity {
  canonical_name: string
  short_name: string | null
  category: string | null
  equipment: string | null
  default_load_type: LoadType
  rep_mode_default: RepMode
  archived_at: string | null
  notes: string | null
}

export interface ExerciseAlias extends MutableEntity {
  exercise_id: string
  source_exercise_id: string
  alias: string
  normalized_alias: string
}

export interface Muscle {
  id: string
  name: string
  region: string | null
}

export interface ExerciseMuscle {
  id: string
  exercise_id: string
  muscle_id: string
  role: 'primary' | 'secondary' | 'stabilizer'
  allocation_weight: number | null
}
