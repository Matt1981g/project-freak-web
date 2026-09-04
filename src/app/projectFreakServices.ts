import { projectFreakDb } from '../data/db/projectFreakDb'
import {
  build_full_backup,
  preview_backup_json,
  restore_validated_backup,
  type BackupPreview,
} from '../application/backup/databaseBackup'
import { load_workout_history } from '../application/history/workoutHistory'
import {
  build_last_7_days_training_export,
  build_training_export,
  type TrainingExportScopeRequest,
} from '../application/coach/trainingExport'
import {
  load_coach_excluded_sessions,
  set_session_coach_excluded,
} from '../application/coach/coachExclusions'
import { load_exercise_history } from '../application/history/exerciseHistory'
import { correct_completed_set } from '../application/history/correctCompletedSet'
import { build_programme_exercise_catalogue_json } from '../application/programme/exerciseCatalogue'
import {
  load_training_priorities,
  save_training_priorities,
  type TrainingPriorityArea,
} from '../application/priorities/trainingPriorities'
import {
  build_workout_summary,
  complete_workout_session,
} from '../application/workout/completeWorkout'
import {
  complete_live_exercise,
  save_exercise_scores,
} from '../application/workout/exerciseCompletion'
import { save_training_set } from '../application/workout/logSet'
import {
  save_session_readiness,
  save_session_recovery,
} from '../application/workout/readiness'
import { start_programmed_workout } from '../application/workout/startWorkout'
import { select_previous_comparable } from '../application/workout/previousComparable'
import { build_progression_suggestion } from '../application/workout/progressionSuggestion'
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


export interface StorageDiagnostics {
  origin: string
  href: string
  standalone: boolean
  database_name: string
  database_version: number
  known_database_names: string[]
  persistent_storage: boolean | null
  usage_bytes: number | null
  quota_bytes: number | null
  total_records: number
  completed_sessions: number
  training_sets: number
  exercises: number
  programme_blocks: number
  programmed_sessions: number
  devices: number
}

export async function load_storage_diagnostics(): Promise<StorageDiagnostics> {
  await projectFreakDb.open()

  const standalone =
    (typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    )

  let persistent_storage: boolean | null = null
  let usage_bytes: number | null = null
  let quota_bytes: number | null = null

  if (typeof navigator.storage?.persisted === 'function') {
    try {
      persistent_storage = await navigator.storage.persisted()
    } catch {
      persistent_storage = null
    }
  }

  if (typeof navigator.storage?.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate()
      usage_bytes = estimate.usage ?? null
      quota_bytes = estimate.quota ?? null
    } catch {
      usage_bytes = null
      quota_bytes = null
    }
  }

  let known_database_names: string[] = []
  const indexed_db_factory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string; version?: number }>>
  }

  if (typeof indexed_db_factory.databases === 'function') {
    try {
      known_database_names = (await indexed_db_factory.databases())
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .sort()
    } catch {
      known_database_names = []
    }
  }

  const table_counts = await Promise.all(
    projectFreakDb.tables.map(async (table) => ({
      name: table.name,
      count: await table.count(),
    })),
  )
  const count_by_name = new Map(
    table_counts.map((entry) => [entry.name, entry.count]),
  )

  return {
    origin: typeof location === 'undefined' ? 'unknown' : location.origin,
    href: typeof location === 'undefined' ? 'unknown' : location.href,
    standalone,
    database_name: projectFreakDb.name,
    database_version: projectFreakDb.verno,
    known_database_names,
    persistent_storage,
    usage_bytes,
    quota_bytes,
    total_records: table_counts.reduce((total, entry) => total + entry.count, 0),
    completed_sessions: count_by_name.get('completed_sessions') ?? 0,
    training_sets: count_by_name.get('sets') ?? 0,
    exercises: count_by_name.get('exercises') ?? 0,
    programme_blocks: count_by_name.get('programme_blocks') ?? 0,
    programmed_sessions: count_by_name.get('programmed_sessions') ?? 0,
    devices: count_by_name.get('devices') ?? 0,
  }
}

export async function build_database_backup() {
  return build_full_backup(projectFreakDb, {
    now_iso: new Date().toISOString(),
    source_device_id: await current_device_id(),
    app_version: null,
  })
}

export async function preview_database_backup(file: File) {
  return preview_backup_json(await file.text())
}


export async function restore_database_backup(preview: BackupPreview) {
  return restore_validated_backup(projectFreakDb, preview, {
    now_iso: new Date().toISOString(),
    source_device_id: await current_device_id(),
    app_version: null,
  })
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

export function load_priority_settings() {
  return load_training_priorities(repositories.settings)
}

export function save_priority_settings(
  ordered_areas: readonly TrainingPriorityArea[],
) {
  return save_training_priorities(ordered_areas, repositories.settings, {
    local_date: current_local_date(),
    now_iso: new Date().toISOString(),
  })
}

export function load_coach_exclusions() {
  return load_coach_excluded_sessions(repositories.settings)
}

export function set_coach_session_excluded(
  session_id: string,
  excluded: boolean,
) {
  return set_session_coach_excluded(session_id, excluded, repositories.settings, {
    now_iso: new Date().toISOString(),
  })
}

export function build_coach_export(scope: TrainingExportScopeRequest) {
  return build_training_export(repositories, {
    now_iso: new Date().toISOString(),
    to_date_local: current_local_date(),
    app_version: null,
    db_schema_version: Number(projectFreakDb.verno) || null,
  }, scope)
}

export function build_last_7_days_coach_export() {
  return build_last_7_days_training_export(repositories, {
    now_iso: new Date().toISOString(),
    to_date_local: current_local_date(),
    app_version: null,
    db_schema_version: Number(projectFreakDb.verno) || null,
  })
}

export function load_exercise_history_entries(exercise_id: string) {
  return load_exercise_history(
    exercise_id,
    repositories.exercises,
    repositories.sessions,
  )
}

export function load_history_entries() {
  return load_workout_history(repositories.sessions)
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

  const all_sets =
    await repositories.sessions.list_sets_for_session(completed_session_id)

  return {
    session,
    readiness:
      await repositories.readiness.get_by_session_id(completed_session_id),
    summary: build_workout_summary(session, actual_exercises, all_sets),
    exercises: await Promise.all(
      actual_exercises.map(async (exercise) => {
        const [sets, metrics, history] = await Promise.all([
          repositories.sessions.list_sets_for_session_exercise(exercise.id),
          repositories.sessions.get_exercise_metrics(exercise.id),
          load_exercise_history(
            exercise.exercise_id,
            repositories.exercises,
            repositories.sessions,
          ),
        ])

        const planned_sets =
          exercise.programmed_session_exercise_id === null
            ? []
            : planned_by_id.get(exercise.programmed_session_exercise_id)?.sets ??
              []
        const previous_comparable = history
          ? select_previous_comparable(
              history,
              session.id,
              session.session_date_local,
            )
          : null
        const progression_targets =
          planned_sets.length > 0
            ? planned_sets.map((detail) => ({
                set_number: detail.set.set_number,
                target_rep_min:
                  detail.set.target_rep_min ?? exercise.target_rep_min,
                target_rep_max:
                  detail.set.target_rep_max ?? exercise.target_rep_max,
              }))
            : (previous_comparable?.sets ?? []).map((set) => ({
                set_number: set.set_number,
                target_rep_min: exercise.target_rep_min,
                target_rep_max: exercise.target_rep_max,
              }))

        return {
          exercise,
          sets,
          metrics,
          previous_comparable,
          progression_suggestion: build_progression_suggestion(
            previous_comparable,
            progression_targets,
          ),
          planned_sets,
        }
      }),
    ),
  }
}

export async function correct_history_training_set(
  input: Parameters<typeof correct_completed_set>[0],
) {
  return correct_completed_set(input, repositories.sessions, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
  })
}

export async function save_live_readiness(
  input: Omit<
    Parameters<typeof save_session_readiness>[0],
    'completed_session_id'
  > & { completed_session_id: string },
) {
  return save_session_readiness(input, repositories.readiness, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
  })
}

export async function save_live_recovery(
  input: Parameters<typeof save_session_recovery>[0],
) {
  return save_session_recovery(input, repositories.readiness, {
    device_id: await current_device_id(),
    now_iso: new Date().toISOString(),
  })
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

export async function complete_live_workout(
  completed_session_id: string,
) {
  const session = await repositories.sessions.get_session(completed_session_id)
  if (!session || session.deleted_at !== null) {
    throw new Error('Workout session was not found.')
  }

  return complete_workout_session(session, repositories.sessions, {
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
