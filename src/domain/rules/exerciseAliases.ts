import type { Exercise } from '../models'

export interface ExerciseAliasCandidateGroup {
  normalized_name: string
  exercise_ids: string[]
  labels: string[]
}

export function find_case_only_exercise_alias_candidates(
  exercises: Exercise[],
): ExerciseAliasCandidateGroup[] {
  const groups = new Map<string, Exercise[]>()

  for (const exercise of exercises) {
    if (exercise.deleted_at !== null) continue

    const normalized_name = exercise.canonical_name
      .trim()
      .toLocaleLowerCase('en-GB')
    const group = groups.get(normalized_name) ?? []
    group.push(exercise)
    groups.set(normalized_name, group)
  }

  return [...groups.entries()]
    .map(([normalized_name, group]) => ({
      normalized_name,
      exercise_ids: group.map((exercise) => exercise.id).sort(),
      labels: [...new Set(group.map((exercise) => exercise.canonical_name))]
        .sort((a, b) => a.localeCompare(b)),
    }))
    .filter((group) => group.labels.length > 1)
    .sort((a, b) => a.labels[0].localeCompare(b.labels[0]))
}
