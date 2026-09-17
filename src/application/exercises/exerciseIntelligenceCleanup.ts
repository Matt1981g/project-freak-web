import type { ExerciseRepository } from '../../data/repositories/contracts'
import { exercise_intelligence_schema, intelligence_key } from '../../domain/rules/exerciseIntelligenceValidation'

/** Remove redundant muscle labels from automatic proposals, preserving primary roles. */
export async function cleanup_exercise_intelligence(
  repository: ExerciseRepository,
  timestamp = new Date().toISOString(),
): Promise<number> {
  let updated = 0
  for (const exercise of await repository.list_active()) {
    const current = exercise.exercise_intelligence
    if (exercise.deleted_at !== null || exercise.archived_at !== null ||
        current?.metadata_status !== 'high_confidence' ||
        !exercise_intelligence_schema.safeParse(current).success) continue
    const seen = new Set<string>()
    const unique = (values: string[]) => values.filter((value) => {
      const key = intelligence_key(value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const next = {
      ...current,
      primary_muscles: unique(current.primary_muscles),
      secondary_muscles: unique(current.secondary_muscles),
      stabilizer_muscles: unique(current.stabilizer_muscles),
    }
    if (JSON.stringify(next) === JSON.stringify(current)) continue
    await repository.put({ ...exercise, exercise_intelligence: next,
      revision: exercise.revision + 1, updated_at: timestamp })
    updated += 1
  }
  return updated
}
