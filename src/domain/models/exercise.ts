import type { MutableEntity } from './common'
import type { LoadType, RepMode } from '../enums/training'

export type ExerciseMechanic = 'compound' | 'isolation' | 'isometric' | 'mixed'
export type ExerciseLaterality =
  | 'bilateral'
  | 'unilateral'
  | 'alternating'
  | 'either'
export type ExerciseLengthBias =
  | 'lengthened'
  | 'midrange'
  | 'shortened'
  | 'mixed'
  | 'variable'
  | 'unknown'
export type ExerciseDemand =
  | 'very_low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
export type ExerciseStabilitySupport = 'low' | 'moderate' | 'high'
export type ExerciseLoadingPotential = 'low' | 'moderate' | 'high'
export type ExerciseProgressionReliability = 'poor' | 'good' | 'excellent'
export type ExerciseHypertrophyRole =
  | 'primary'
  | 'secondary'
  | 'finisher'
  | 'specialised'
export type ExerciseMetadataStatus =
  | 'verified'
  | 'high_confidence'
  | 'needs_review'
  | 'user_confirmed'

export interface ExerciseIntelligence {
  primary_muscles: string[]
  secondary_muscles: string[]
  stabilizer_muscles: string[]
  movement_pattern: string
  exercise_family: string
  mechanic: ExerciseMechanic
  laterality: ExerciseLaterality
  muscle_length_bias: ExerciseLengthBias
  stability_support: ExerciseStabilitySupport
  systemic_fatigue: ExerciseDemand
  local_fatigue: ExerciseDemand
  loading_potential: ExerciseLoadingPotential
  progression_reliability: ExerciseProgressionReliability
  hypertrophy_role: ExerciseHypertrophyRole
  grip_or_handle: string | null
  metadata_status: ExerciseMetadataStatus
  metadata_confidence: number
  metadata_sources: string[]
}

export interface Exercise extends MutableEntity {
  canonical_name: string
  short_name: string | null
  category: string | null
  equipment: string | null
  machine_brand?: string | null
  machine_model?: string | null
  origin_gym_profile_id?: string | null
  exercise_intelligence?: ExerciseIntelligence | null
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
