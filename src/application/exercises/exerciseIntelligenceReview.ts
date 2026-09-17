import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'

function clean_list(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function validate_intelligence(intelligence: ExerciseIntelligence): ExerciseIntelligence {
  const primary_muscles = clean_list(intelligence.primary_muscles)
  if (primary_muscles.length === 0) {
    throw new Error('Choose at least one primary muscle before confirming.')
  }

  const movement_pattern = intelligence.movement_pattern.trim()
  const exercise_family = intelligence.exercise_family.trim()
  if (!movement_pattern) throw new Error('Movement pattern cannot be blank.')
  if (!exercise_family) throw new Error('Exercise family cannot be blank.')

  return {
    ...intelligence,
    primary_muscles,
    secondary_muscles: clean_list(intelligence.secondary_muscles).filter(
      (muscle) => !primary_muscles.includes(muscle),
    ),
    stabilizer_muscles: clean_list(intelligence.stabilizer_muscles),
    movement_pattern,
    exercise_family,
    grip_or_handle: intelligence.grip_or_handle?.trim() || null,
    metadata_status: 'user_confirmed',
    metadata_confidence: 1,
    metadata_sources: [
      ...new Set([
        ...intelligence.metadata_sources,
        'PF user-confirmed exercise intelligence',
      ]),
    ],
  }
}

export async function confirm_exercise_intelligence(
  repository: ExerciseRepository,
  exercise_id: string,
  intelligence: ExerciseIntelligence,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<Exercise> {
  const exercise = await repository.get_by_id(exercise_id)
  if (!exercise || exercise.deleted_at !== null || exercise.archived_at !== null) {
    throw new Error('Active exercise was not found.')
  }

  const confirmed = validate_intelligence(intelligence)
  const updated: Exercise = {
    ...exercise,
    exercise_intelligence: confirmed,
    updated_at: timestamp,
    revision: exercise.revision + 1,
    device_id,
    source_kind: 'user',
    source_id: null,
  }

  await repository.put(updated)
  return updated
}
