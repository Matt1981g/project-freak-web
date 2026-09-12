import type { MutableEntity } from './common'

export type GymProfileKind = 'home' | 'previous' | 'travel'

export interface GymProfile extends MutableEntity {
  name: string
  short_name: string
  kind: GymProfileKind
  is_inventory_complete: boolean
  notes: string | null
}

export interface GymExerciseAvailability extends MutableEntity {
  gym_profile_id: string
  exercise_id: string
  available: boolean
  equipment_label: string | null
  machine_brand?: string | null
  machine_model?: string | null
  notes: string | null
}
