type PlannedSetLike = {
  set: {
    set_number: number
    set_role: string
  }
}

export function final_working_set_number(
  planned_sets: readonly PlannedSetLike[],
  fallback_target_sets: number | null | undefined,
): number | null {
  const programmed_working_sets = planned_sets
    .map((detail) => detail.set)
    .filter((set) => set.set_role === 'work')
    .map((set) => set.set_number)
    .filter((set_number) => Number.isFinite(set_number) && set_number > 0)

  if (programmed_working_sets.length > 0) {
    return Math.max(...programmed_working_sets)
  }

  if (
    fallback_target_sets !== null &&
    fallback_target_sets !== undefined &&
    Number.isFinite(fallback_target_sets) &&
    fallback_target_sets > 0
  ) {
    return Math.round(fallback_target_sets)
  }

  return null
}

export function is_final_working_set(input: {
  next_set_number: number | null | undefined
  planned_sets: readonly PlannedSetLike[]
  fallback_target_sets: number | null | undefined
}): boolean {
  if (
    input.next_set_number === null ||
    input.next_set_number === undefined
  ) {
    return false
  }

  const final_set_number = final_working_set_number(
    input.planned_sets,
    input.fallback_target_sets,
  )

  return final_set_number !== null && input.next_set_number === final_set_number
}
