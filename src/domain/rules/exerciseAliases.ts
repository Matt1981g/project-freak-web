import type { Exercise, ExerciseAlias } from '../models'

export interface ExerciseAliasCandidateMember {
  exercise_id: string
  label: string
}

export interface ExerciseAliasCandidateGroup {
  normalized_name: string
  members: ExerciseAliasCandidateMember[]
}

export function find_case_only_exercise_alias_candidates(
  exercises: Exercise[],
  aliases: ExerciseAlias[] = [],
): ExerciseAliasCandidateGroup[] {
  const resolved_source_ids = new Set(
    aliases
      .filter((alias) => alias.deleted_at === null)
      .map((alias) => alias.source_exercise_id),
  )
  const groups = new Map<string, Exercise[]>()

  for (const exercise of exercises) {
    if (
      exercise.deleted_at !== null ||
      resolved_source_ids.has(exercise.id)
    ) {
      continue
    }

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
      members: group
        .map((exercise) => ({
          exercise_id: exercise.id,
          label: exercise.canonical_name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter(
      (group) =>
        new Set(group.members.map((member) => member.label)).size > 1,
    )
    .sort((a, b) => a.members[0].label.localeCompare(b.members[0].label))
}
