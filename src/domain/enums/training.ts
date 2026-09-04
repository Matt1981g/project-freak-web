export const SET_ROLES = ['warmup', 'work'] as const
export type SetRole = (typeof SET_ROLES)[number]

export const STRUCTURE_TYPES = [
  'straight',
  'drop',
  'rest_pause',
  'myo_rep',
  'partials',
  'other',
] as const
export type StructureType = (typeof STRUCTURE_TYPES)[number]

export const FAILURE_STATUSES = [
  'none',
  'attempted_next_rep_failed',
  'unknown_failure',
] as const
export type FailureStatus = (typeof FAILURE_STATUSES)[number]

export const LOAD_TYPES = [
  'normal',
  'assistance',
  'band_plus_machine',
  'bodyweight',
  'other',
  'unknown',
] as const
export type LoadType = (typeof LOAD_TYPES)[number]

export const REP_MODES = ['total', 'per_side', 'timed', 'mixed'] as const
export type RepMode = (typeof REP_MODES)[number]

export const SET_COMPONENT_TYPES = [
  'drop',
  'rest_pause',
  'myo_cluster',
  'partials',
  'other',
] as const
export type SetComponentType = (typeof SET_COMPONENT_TYPES)[number]

export const FAILURE_TARGETS = ['none', 'allowed', 'target'] as const
export type FailureTarget = (typeof FAILURE_TARGETS)[number]
