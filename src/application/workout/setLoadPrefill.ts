import type { HistoricalLoad } from './historicalLoad'
import type { TrainingIntensity } from './trainingIntensity'
import type { TrainingSet } from '../../domain/models'
import type { PreviousComparablePerformance } from './previousComparable'
import type { ProgressionSuggestion } from './progressionSuggestion'

export type SetLoadPrefillSource =
  | 'historical_suggestion'
  | 'saved'
  | 'previous_set_actual'
  | 'programme'
  | 'previous_comparable'
  | 'blank'

export interface SetLoadPrefill {
  load_kg: number | null
  source: SetLoadPrefillSource
}

export interface SetLoadPrefillInput {
  historical?: HistoricalLoad | null
  intensity?: TrainingIntensity
  existing_set: TrainingSet | null
  programmed_load_kg: number | null
  previous_completed_load_kg?: number | null
  previous_programmed_load_kg?: number | null
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

  const previous_completed_load_kg =
    input.previous_completed_load_kg ?? null
  const previous_programmed_load_kg =
    input.previous_programmed_load_kg ?? null
  const current_programme_follows_previous =
    input.programmed_load_kg === null ||
    (previous_programmed_load_kg !== null &&
      input.programmed_load_kg === previous_programmed_load_kg)

  if (
    input.set_number > 1 &&
    previous_completed_load_kg !== null &&
    current_programme_follows_previous
  ) {
    return {
      load_kg: previous_completed_load_kg,
      source: 'previous_set_actual',
    }
  }

  if (input.programmed_load_kg !== null) {
    return {
      load_kg: input.programmed_load_kg,
      source: 'programme',
    }
  }

  if (input.historical) {
    const evidence = input.historical.sets.find(s => s.set_number === input.set_number) ?? input.historical.sets.at(-1)
    if (evidence) {
      const adjustment = input.progression.adjustment
      let factor = 1
      if (adjustment.kind === 'decrease' || adjustment.kind === 'reset' || adjustment.kind === 'deload') factor = 1 - (adjustment.percent_min ?? 5) / 100
      if (adjustment.kind === 'increase' && !input.historical.uncertain) factor = 1 + (adjustment.percent_min ?? 2.5) / 100
      if (input.intensity === 'recovery') factor = Math.min(factor, .85)
      if (evidence.rpe !== null && evidence.rpe >= 9.5) factor = Math.min(factor, .95)
      return {load_kg: factor === 1 ? evidence.load_kg : Math.max(0, Math.floor(evidence.load_kg * factor / 1.25) * 1.25), source: 'historical_suggestion'}
    }
  }

  const progression_blocks_previous_baseline =
    input.progression.verdict === 'reset' ||
    input.progression.verdict === 'reduce_load' ||
    input.progression.verdict === 'deload_hold' ||
    input.progression.verdict === 'review'

  if (!progression_blocks_previous_baseline) {
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
