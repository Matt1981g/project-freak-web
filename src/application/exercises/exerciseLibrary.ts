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
  return find_case_only_exercise_alias_candidates(await repository.list_all())
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
