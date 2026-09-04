import { projectFreakDb } from '../data/db/projectFreakDb'
import { build_programme_exercise_catalogue_json } from '../application/programme/exerciseCatalogue'
import {
  complete_live_exercise,
  save_exercise_scores,
} from '../application/workout/exerciseCompletion'
import { save_training_set } from '../application/workout/logSet'
import { start_programmed_workout } from '../application/workout/startWorkout'
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

export function load_programmed_session_detail(
  programmed_session_id: string,
) {
  return repositories.programme.get_programmed_session_detail(
    programmed_session_id,
  )
}

function current_local_date(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function current_timezone(): string | null {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null
}

export async function start_programmed_session_workout(
  programmed_session_id: string,
) {
  const detail =
    await repositories.programme.get_programmed_session_detail(
      programmed_session_id,
    )
  if (!detail) {
    throw new Error('Programmed session was not found.')
  }

  return start_programmed_workout(detail, repositories.sessions, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
    local_date: current_local_date(),
    timezone: current_timezone(),
  })
}

export async function load_live_workout(completed_session_id: string) {
  const session = await repositories.sessions.get_session(completed_session_id)
  if (!session || session.deleted_at !== null) {
    return undefined
  }

  const actual_exercises =
    await repositories.sessions.list_session_exercises(completed_session_id)
  const programmed_detail = session.programmed_session_id
    ? await repositories.programme.get_programmed_session_detail(
        session.programmed_session_id,
      )
    : undefined

  const planned_by_id = new Map(
    programmed_detail?.exercises.map((detail) => [
      detail.exercise.id,
      detail,
    ]) ?? [],
  )

  return {
    session,
    exercises: await Promise.all(
      actual_exercises.map(async (exercise) => ({
        exercise,
        sets:
          await repositories.sessions.list_sets_for_session_exercise(
            exercise.id,
          ),
        metrics:
          await repositories.sessions.get_exercise_metrics(exercise.id),
        planned_sets:
          exercise.programmed_session_exercise_id === null
            ? []
            : planned_by_id.get(exercise.programmed_session_exercise_id)?.sets ??
              [],
      })),
    ),
  }
}

export async function save_live_training_set(input: {
  session_exercise: Parameters<typeof save_training_set>[0]['session_exercise']
  programmed_set: Parameters<typeof save_training_set>[0]['programmed_set']
  existing_set: Parameters<typeof save_training_set>[0]['existing_set']
  set_number: number
  load_kg: number | null
  completed_reps: number | null
  failed_next_rep: boolean
  complete: boolean
}) {
  return save_training_set(input, repositories.sessions, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
  })
}

export async function save_live_exercise_scores(
  session_exercise_id: string,
  scores: Parameters<typeof save_exercise_scores>[1],
) {
  return save_exercise_scores(
    session_exercise_id,
    scores,
    repositories.sessions,
    {
      device_id: await current_device_id(),
      now_iso: new Date().toISOString(),
    },
  )
}

export async function complete_live_session_exercise(
  exercise: Parameters<typeof complete_live_exercise>[0],
) {
  return complete_live_exercise(exercise, repositories.sessions, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
  })
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
