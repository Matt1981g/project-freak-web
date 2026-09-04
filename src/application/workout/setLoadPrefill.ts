import type { TrainingSet } from '../../domain/models'
import type { PreviousComparablePerformance } from './previousComparable'
import type { ProgressionSuggestion } from './progressionSuggestion'

export type SetLoadPrefillSource =
  | 'saved'
  | 'programme'
  | 'previous_comparable'
  | 'blank'

export interface SetLoadPrefill {
  load_kg: number | null
  source: SetLoadPrefillSource
}

export interface SetLoadPrefillInput {
  existing_set: TrainingSet | null
  programmed_load_kg: number | null
  previous: PreviousComparablePerformance | null
  progression: ProgressionSuggestion
  set_number: number
}

export function select_set_load_prefill(
  input: SetLoadPrefillInput,
): SetLoadPrefill {
  if (input.existing_set !== null) {
    return {
      load_kg: input.existing_set.load_kg,
      source: 'saved',
    }
  }

  if (input.programmed_load_kg !== null) {
    return {
      load_kg: input.programmed_load_kg,
      source: 'programme',
    }
  }

  if (input.progression.verdict !== 'insufficient_data') {
    const previous_set = input.previous?.sets.find(
      (set) => set.set_number === input.set_number,
    )
    if (previous_set?.load_kg !== null && previous_set?.load_kg !== undefined) {
      return {
        load_kg: previous_set.load_kg,
        source: 'previous_comparable',
      }
    }
  }

  return {
    load_kg: null,
    source: 'blank',
  }
}
