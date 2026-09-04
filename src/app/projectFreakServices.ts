import { projectFreakDb } from '../data/db/projectFreakDb'
import { build_programme_exercise_catalogue_json } from '../application/programme/exerciseCatalogue'
import {
  commit_programme_import,
  preview_programme_import,
  type ProgrammeImportPreview,
} from '../application/programme/programmeImport'
import { create_repositories } from '../data/repositories'
import { audit_exercise_library } from '../application/exercises/exerciseLibraryAudit'
import {
  archive_exercise,
  consolidate_exercises,
  list_exercise_alias_candidates,
  query_exercise_library,
  rename_exercise,
  restore_exercise,
  type ExerciseLibraryQuery,
} from '../application/exercises/exerciseLibrary'
import {
  commit_historical_import,
  parse_historical_workbook,
  type HistoricalImportPreview,
} from '../importers/historical'

const repositories = create_repositories(projectFreakDb)

function current_platform(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
}

async function current_device_id(): Promise<string> {
  const device = await repositories.devices.ensure_local(current_platform())
  return device.id
}

export function load_exercise_library(query: ExerciseLibraryQuery = {}) {
  return query_exercise_library(repositories.exercises, query)
}

export function load_exercise_alias_candidates() {
  return list_exercise_alias_candidates(repositories.exercises)
}

export function load_exercise_library_audit() {
  return audit_exercise_library(repositories.exercises)
}

export async function archive_exercise_definition(exercise_id: string) {
  return archive_exercise(
    repositories.exercises,
    exercise_id,
    await current_device_id(),
  )
}

export async function restore_exercise_definition(exercise_id: string) {
  return restore_exercise(
    repositories.exercises,
    exercise_id,
    await current_device_id(),
  )
}

export async function rename_exercise_definition(
  exercise_id: string,
  canonical_name: string,
) {
  return rename_exercise(
    repositories.exercises,
    exercise_id,
    canonical_name,
    await current_device_id(),
  )
}

export async function consolidate_exercise_definitions(
  source_ids: string[],
  target_id: string,
) {
  return consolidate_exercises(
    repositories.exercises,
    source_ids,
    target_id,
    await current_device_id(),
  )
}

export function load_programme_blocks() {
  return repositories.programme.list_blocks()
}

export function export_programme_exercise_catalogue() {
  return build_programme_exercise_catalogue_json(repositories.exercises)
}

export function load_programme_sessions(programme_block_id: string) {
  return repositories.programme.list_programmed_sessions_for_block(
    programme_block_id,
  )
}

export function preview_programme_json(json_text: string) {
  return preview_programme_import(json_text, repositories.exercises)
}

export async function commit_programme_json(
  preview: ProgrammeImportPreview,
) {
  return commit_programme_import(
    preview,
    repositories.programme,
    await current_device_id(),
  )
}

export async function preview_historical_workbook(file: File) {
  const bytes = await file.arrayBuffer()
  return parse_historical_workbook(bytes, file.name)
}

export async function commit_historical_workbook(
  preview: HistoricalImportPreview,
) {
  return commit_historical_import(
    projectFreakDb,
    preview,
    await current_device_id(),
  )
}
