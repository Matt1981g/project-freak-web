import type {
  LoadType,
  RepMode,
  SetComponentType,
} from '../enums/training'

export const COMPARABLE_TONNAGE_METHOD = 'kg_reps_full_reps_only_v1'

export interface ComparableTonnageComponentInput {
  component_type: SetComponentType
  load_kg: number | null
  load_type: LoadType | null
  reps_completed_full: number | null
  counts_toward_comparable_tonnage: boolean
}

export interface ComparableTonnageSetInput {
  load_kg: number | null
  load_type: LoadType
  rep_mode: RepMode
  primary_reps_completed: number | null
  components?: ComparableTonnageComponentInput[]
}

export interface ComparableTonnageResult {
  value: number | null
  method: typeof COMPARABLE_TONNAGE_METHOD | null
}

function is_comparable_load_type(load_type: LoadType | null): boolean {
  return load_type === 'normal' || load_type === 'bodyweight'
}

export function calculate_comparable_tonnage(
  set: ComparableTonnageSetInput,
): ComparableTonnageResult {
  if (
    set.rep_mode === 'timed' ||
    !is_comparable_load_type(set.load_type) ||
    set.load_kg === null ||
    set.primary_reps_completed === null
  ) {
    return { value: null, method: null }
  }

  let total = set.load_kg * set.primary_reps_completed

  for (const component of set.components ?? []) {
    if (
      !component.counts_toward_comparable_tonnage ||
      component.component_type === 'partials' ||
      !is_comparable_load_type(component.load_type) ||
      component.load_kg === null ||
      component.reps_completed_full === null
    ) {
      continue
    }

    total += component.load_kg * component.reps_completed_full
  }

  return {
    value: total,
    method: COMPARABLE_TONNAGE_METHOD,
  }
}
