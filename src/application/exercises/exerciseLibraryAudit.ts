import type { ExerciseRepository } from '../../data/repositories/contracts'
import { find_case_only_exercise_alias_candidates } from '../../domain/rules/exerciseAliases'

export interface ExerciseLibraryAudit {
  total_definitions: number
  active_definitions: number
  archived_definitions: number
  alias_records: number
  unresolved_case_groups: number
  orphan_aliases: number
  status: 'clean' | 'warning'
}

export async function audit_exercise_library(
  repository: ExerciseRepository,
): Promise<ExerciseLibraryAudit> {
  const [exercises, aliases] = await Promise.all([
    repository.list_all(),
    repository.list_aliases(),
  ])

  const live_exercises = exercises.filter(
    (exercise) => exercise.deleted_at === null,
  )
  const live_aliases = aliases.filter((alias) => alias.deleted_at === null)
  const exercise_ids = new Set(live_exercises.map((exercise) => exercise.id))

  const orphan_aliases = live_aliases.filter(
    (alias) =>
      !exercise_ids.has(alias.exercise_id) ||
      !exercise_ids.has(alias.source_exercise_id),
  ).length

  const active_definitions = live_exercises.filter(
    (exercise) => exercise.archived_at === null,
  ).length
  const unresolved_case_groups = find_case_only_exercise_alias_candidates(
    live_exercises,
    live_aliases,
  ).length

  return {
    total_definitions: live_exercises.length,
    active_definitions,
    archived_definitions: live_exercises.length - active_definitions,
    alias_records: live_aliases.length,
    unresolved_case_groups,
    orphan_aliases,
    status:
      unresolved_case_groups === 0 && orphan_aliases === 0
        ? 'clean'
        : 'warning',
  }
}
