import type { MutableEntity } from './common'

export type GymProfileKind = 'home' | 'previous' | 'travel'

export interface EquipmentProfile {
  id: string
  gym_profile_id: string
  label: string
  kind: 'machine' | 'cable' | 'dumbbell' | 'barbell' | 'bodyweight' | 'unknown'
  status: 'identified' | 'needs_review'
  source: 'gym_record' | 'user_confirmed'
  notes: string | null
}

export interface EquipmentSnapshot {
  profile_id: string
  gym_profile_id: string
  label: string
  comparable: boolean
  setup_notes: string | null
}

export interface GymProfile extends MutableEntity {
  // Stored with its owning gym so existing sync and backup contracts retain it.
  equipment_profiles?: EquipmentProfile[]
  equipment_attribution_version?: number
  name: string
  short_name: string
  kind: GymProfileKind
  is_inventory_complete: boolean
  notes: string | null
}

export interface GymExerciseAvailability extends MutableEntity {
  equipment_profile_id?: string | null
  equipment_identity_signature?: string | null
  gym_profile_id: string
  exercise_id: string
  available: boolean
  equipment_label: string | null
  machine_brand?: string | null
  machine_model?: string | null
  setup_notes?: string | null
  notes: string | null
}
