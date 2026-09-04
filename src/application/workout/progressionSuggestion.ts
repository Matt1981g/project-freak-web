import type { PreviousComparablePerformance } from './previousComparable'

export type ProgressionVerdict =
  | 'hold_load'
  | 'add_reps'
  | 'consider_load_increase'
  | 'insufficient_data'

export interface ProgressionTarget {
  set_number: number
  target_rep_min: number | null
  target_rep_max: number | null
}

export interface ProgressionSuggestion {
  verdict: ProgressionVerdict
  label:
    | 'HOLD LOAD'
    | 'ADD REPS'
    | 'CONSIDER LOAD INCREASE'
    | 'INSUFFICIENT DATA'
  reason: string
}

function suggestion(
  verdict: ProgressionVerdict,
  label: ProgressionSuggestion['label'],
  reason: string,
): ProgressionSuggestion {
  return { verdict, label, reason }
}

export function build_progression_suggestion(
  previous: PreviousComparablePerformance | null,
  targets: readonly ProgressionTarget[],
): ProgressionSuggestion {
  if (!previous) {
    return suggestion(
      'insufficient_data',
      'INSUFFICIENT DATA',
      'No previous comparable performance.',
    )
  }

  const form = previous.metrics?.form ?? null
  if (form === null) {
    return suggestion(
      'insufficient_data',
      'INSUFFICIENT DATA',
      'Previous Form was not recorded.',
    )
  }

  if (form <= 7) {
    return suggestion(
      'hold_load',
      'HOLD LOAD',
      `Previous Form was ${form}/10. Improve execution before progressing.`,
    )
  }

  if (form === 8) {
    return suggestion(
      'hold_load',
      'HOLD LOAD',
      'Previous Form was 8/10. Repeat the load with cleaner execution.',
    )
  }

  const sensation =
    previous.metrics?.pump ?? previous.metrics?.legacy_mmc ?? null
  if (sensation !== null && sensation <= 6) {
    return suggestion(
      'hold_load',
      'HOLD LOAD',
      `Target-muscle sensation was only ${sensation}/10. Keep the load and improve stimulus.`,
    )
  }

  const targets_by_set = new Map(
    targets.map((target) => [target.set_number, target]),
  )
  const comparable = previous.sets
    .map((set) => ({
      set,
      target: targets_by_set.get(set.set_number),
    }))
    .filter(
      (
        item,
      ): item is {
        set: PreviousComparablePerformance['sets'][number]
        target: ProgressionTarget
      } => item.target !== undefined,
    )

  if (comparable.length === 0) {
    return suggestion(
      'insufficient_data',
      'INSUFFICIENT DATA',
      'No previous sets match the current programmed rep targets.',
    )
  }

  if (
    comparable.every(
      ({ target }) =>
        target.target_rep_min === null && target.target_rep_max === null,
    )
  ) {
    return suggestion(
      'insufficient_data',
      'INSUFFICIENT DATA',
      'The current programme does not define a usable rep target.',
    )
  }

  if (
    comparable.some(
      ({ set, target }) =>
        set.completed_reps === null ||
        (target.target_rep_min !== null &&
          set.completed_reps < target.target_rep_min),
    )
  ) {
    return suggestion(
      'add_reps',
      'ADD REPS',
      'Previous performance did not reach the programmed rep range on every comparable set.',
    )
  }

  const all_have_upper_target = comparable.every(
    ({ set, target }) =>
      set.completed_reps !== null && target.target_rep_max !== null,
  )

  const all_at_or_above_upper =
    all_have_upper_target &&
    comparable.every(
      ({ set, target }) =>
        set.completed_reps! >= target.target_rep_max!,
    )

  if (all_at_or_above_upper) {
    if (sensation === null) {
      return suggestion(
        'insufficient_data',
        'INSUFFICIENT DATA',
        'Rep targets were achieved, but target-muscle sensation was not recorded.',
      )
    }

    return suggestion(
      'consider_load_increase',
      'CONSIDER LOAD INCREASE',
      'Form and target-muscle sensation were good, and every comparable set reached the top of its rep range.',
    )
  }

  return suggestion(
    'add_reps',
    'ADD REPS',
    'Execution is progression-valid. Add reps within the programmed range before adding load.',
  )
}
