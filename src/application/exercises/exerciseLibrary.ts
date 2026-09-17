import type { Exercise } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import {
  find_case_only_exercise_alias_candidates,
  type ExerciseAliasCandidateGroup,
} from '../../domain/rules/exerciseAliases'

export interface ExerciseLibraryQuery {
  search?: string
  include_archived?: boolean
}

function matches_search(exercise: Exercise, search: string): boolean {
  if (!search) return true

  const haystack = [
    exercise.canonical_name,
    exercise.short_name,
    exercise.category,
    exercise.equipment,
  ]
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLocaleLowerCase('en-GB')

  return haystack.includes(search.toLocaleLowerCase('en-GB'))
}

export async function query_exercise_library(
  repository: ExerciseRepository,
  query: ExerciseLibraryQuery = {},
): Promise<Exercise[]> {
  const exercises = query.include_archived
    ? await repository.list_all()
    : await repository.list_active()
  const search = query.search?.trim() ?? ''

  return exercises.filter((exercise) => matches_search(exercise, search))
}

export async function list_exercise_alias_candidates(
  repository: ExerciseRepository,
): Promise<ExerciseAliasCandidateGroup[]> {
  const [exercises, aliases] = await Promise.all([
    repository.list_all(),
    repository.list_aliases(),
  ])
  return find_case_only_exercise_alias_candidates(exercises, aliases)
}

async function set_exercise_archived(
  repository: ExerciseRepository,
  exercise_id: string,
  archived: boolean,
  device_id: string,
  timestamp: string,
): Promise<Exercise> {
  const existing = await repository.get_by_id(exercise_id)
  if (!existing || existing.deleted_at !== null) {
    throw new Error(`Exercise ${exercise_id} was not found.`)
  }

  const updated: Exercise = {
    ...existing,
    archived_at: archived ? timestamp : null,
    updated_at: timestamp,
    revision: existing.revision + 1,
    device_id,
    source_kind: 'user',
    source_id: null,
  }

  await repository.put(updated)
  return updated
}

export function archive_exercise(
  repository: ExerciseRepository,
  exercise_id: string,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<Exercise> {
  return set_exercise_archived(
    repository,
    exercise_id,
    true,
    device_id,
    timestamp,
  )
}

export function restore_exercise(
  repository: ExerciseRepository,
  exercise_id: string,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<Exercise> {
  return set_exercise_archived(
    repository,
    exercise_id,
    false,
    device_id,
    timestamp,
  )
}

export async function rename_exercise(
  repository: ExerciseRepository,
  exercise_id: string,
  canonical_name: string,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<Exercise> {
  const name = canonical_name.trim()
  if (!name) {
    throw new Error('Exercise name cannot be blank.')
  }

  const existing = await repository.get_by_id(exercise_id)
  if (!existing || existing.deleted_at !== null) {
    throw new Error(`Exercise ${exercise_id} was not found.`)
  }

  const normalized_name = name.toLocaleLowerCase('en-GB')
  const collision = (await repository.list_all()).find(
    (exercise) =>
      exercise.id !== exercise_id &&
      exercise.archived_at === null &&
      exercise.canonical_name.trim().toLocaleLowerCase('en-GB') ===
        normalized_name,
  )

  if (collision) {
    throw new Error(
      `"${collision.canonical_name}" already exists. Consolidate the duplicate instead of renaming over it.`,
    )
  }

  const updated: Exercise = {
    ...existing,
    canonical_name: name,
    updated_at: timestamp,
    revision: existing.revision + 1,
    device_id,
    source_kind: 'user',
    source_id: null,
  }

  await repository.put(updated)
  return updated
}

export function consolidate_exercises(
  repository: ExerciseRepository,
  source_ids: string[],
  target_id: string,
  device_id: string,
  timestamp = new Date().toISOString(),
) {
  return repository.merge_definitions(
    source_ids,
    target_id,
    device_id,
    timestamp,
  )
}
