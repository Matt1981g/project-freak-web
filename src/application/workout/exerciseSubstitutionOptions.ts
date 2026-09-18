import type { Exercise } from '../../domain/models'
import { muscle_area_from_name } from '../analysis/muscleMapping'

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function primary_target_areas(exercise: Exercise): string[] {
  const intelligent =
    exercise.exercise_intelligence &&
    exercise.exercise_intelligence.metadata_status !== 'needs_review' &&
    exercise.exercise_intelligence.metadata_confidence >= 0.8
      ? exercise.exercise_intelligence.primary_muscles
          .map(muscle_area_from_name)
          .filter((area): area is NonNullable<typeof area> => area !== null)
      : []

  if (intelligent.length > 0) return [...new Set(intelligent)]

  const category = exercise.category
    ? muscle_area_from_name(exercise.category)
    : null
  return category ? [category] : []
}

function shares_target_area(original: Exercise, candidate: Exercise): boolean {
  const original_areas = new Set(primary_target_areas(original))
  if (original_areas.size === 0) return false
  return primary_target_areas(candidate).some((area) => original_areas.has(area))
}

function substitution_rank(original: Exercise, candidate: Exercise): number {
  const original_intelligence = original.exercise_intelligence
  const candidate_intelligence = candidate.exercise_intelligence
  const original_family = normalise(original_intelligence?.exercise_family)
  const candidate_family = normalise(candidate_intelligence?.exercise_family)
  if (
    original_family &&
    candidate_family &&
    original_family === candidate_family
  ) {
    return 0
  }

  const original_movement = normalise(original_intelligence?.movement_pattern)
  const candidate_movement = normalise(candidate_intelligence?.movement_pattern)
  if (
    original_movement &&
    candidate_movement &&
    original_movement === candidate_movement
  ) {
    return 1
  }

  return 2
}

export function rank_exercise_substitution_options(input: {
  original: Exercise
  candidates: readonly Exercise[]
  session_exercise_ids: ReadonlySet<string>
  available_exercise_ids: ReadonlySet<string> | null
}): Exercise[] {
  return input.candidates
    .filter((candidate) => candidate.deleted_at === null && candidate.archived_at === null)
    .filter((candidate) => candidate.id !== input.original.id)
    .filter((candidate) => !input.session_exercise_ids.has(candidate.id))
    .filter((candidate) =>
      input.available_exercise_ids === null ||
      input.available_exercise_ids.has(candidate.id),
    )
    .filter((candidate) => shares_target_area(input.original, candidate))
    .sort((left, right) => {
      const rank_difference =
        substitution_rank(input.original, left) -
        substitution_rank(input.original, right)
      if (rank_difference !== 0) return rank_difference
      return left.canonical_name.localeCompare(right.canonical_name)
    })
}
