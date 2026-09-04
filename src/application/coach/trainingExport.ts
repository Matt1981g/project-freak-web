import type {
  CompletedSession,
  ExerciseAlias,
  ReadinessEntry,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type {
  ProgrammedSessionExerciseDetail,
  RepositoryBundle,
} from '../../data/repositories/contracts'
import { load_training_priorities } from '../priorities/trainingPriorities'
import { load_coach_excluded_sessions } from './coachExclusions'

export const TRAINING_EXPORT_FORMAT = 'project-freak-training-export' as const
export const TRAINING_EXPORT_SCHEMA_VERSION = '1.0.0' as const

export type TrainingExportScopeType =
  | 'today'
  | 'last_7_days'
  | 'exercise'
  | 'programme_block'
  | 'full'

export type TrainingExportScopeRequest =
  | { type: 'today' }
  | { type: 'last_7_days' }
  | { type: 'exercise'; exercise_id: string }
  | { type: 'programme_block'; programme_block_id: string }
  | { type: 'full' }

export interface TrainingExportContext {
  now_iso: string
  to_date_local: string
  app_version?: string | null
  db_schema_version?: number | null
}

export interface TrainingExportSet {
  id: string
  set_number: number
  set_role: TrainingSet['set_role']
  structure_type: TrainingSet['structure_type']
  load_kg: number | null
  load_type: TrainingSet['load_type']
  rep_mode: TrainingSet['rep_mode']
  reps_as_recorded: string | null
  primary_reps_completed: number | null
  left_reps_completed: number | null
  right_reps_completed: number | null
  completed_reps: number | null
  partial_reps: number | null
  duration_seconds: number | null
  failure_status: TrainingSet['failure_status']
  actual_rest_seconds: number | null
  set_load_kg_reps: number | null
  set_load_method: string | null
  notes: string | null
  completed_at: string | null
  components: Array<{
    id: string
    sequence: number
    component_type: SetComponent['component_type']
    load_kg: number | null
    load_type: SetComponent['load_type']
    reps_completed_full: number | null
    reps_partial: number | null
    duration_seconds: number | null
    failure_status: SetComponent['failure_status']
    counts_toward_comparable_tonnage: boolean
    notes: string | null
  }>
}

export interface TrainingExport {
  format: typeof TRAINING_EXPORT_FORMAT
  schema_version: typeof TRAINING_EXPORT_SCHEMA_VERSION
  app_version: string | null
  db_schema_version: number | null
  exported_at: string
  scope: {
    type: TrainingExportScopeType
    from_date: string | null
    to_date: string | null
    exercise_ids: string[]
    programme_block_id: string | null
  }
  coach_context: {
    training_priorities: Awaited<ReturnType<typeof load_training_priorities>>
    exercise_catalogue: Array<{
      id: string
      canonical_name: string
      category: string | null
      equipment: string | null
      default_load_type: string
      rep_mode_default: string
    }>
    exercise_aliases: Array<{
      source_exercise_id: string
      exercise_id: string
      alias: string
    }>
  }
  sessions: Array<{
    id: string
    legacy_workout_id: string | null
    session_name: string
    session_date_local: string
    timezone: string | null
    status: 'in_progress' | 'completed' | 'abandoned'
    started_at: string | null
    completed_at: string | null
    readiness: ReadinessEntry | null
    notes: string | null
    exercises: Array<{
      session_exercise_id: string
      exercise_id: string
      exercise_name_snapshot: string
      planned_order: number | null
      actual_order: number
      rotation_group_key: string | null
      rotation_position: number | null
      target: Record<string, unknown> | null
      metrics: {
        rpe: number | null
        pump: number | null
        form: number | null
        where_felt_text: string | null
        where_felt_tags: string[]
        legacy_tension: number | null
        legacy_mmc: number | null
        notes: string | null
      } | null
      notes: string | null
      sets: TrainingExportSet[]
    }>
  }>
  provenance: null
}

function date_minus_days(date_local: string, days: number): string {
  const parsed = new Date(`${date_local}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Export date must use YYYY-MM-DD.')
  }
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

function alias_row(alias: ExerciseAlias) {
  return {
    source_exercise_id: alias.source_exercise_id,
    exercise_id: alias.exercise_id,
    alias: alias.alias,
  }
}

function resolve_exercise_ids(
  requested_exercise_id: string,
  aliases: readonly ExerciseAlias[],
): Set<string> {
  const resolved = new Set([requested_exercise_id])
  let changed = true

  while (changed) {
    changed = false
    for (const alias of aliases) {
      if (
        alias.deleted_at === null &&
        resolved.has(alias.exercise_id) &&
        !resolved.has(alias.source_exercise_id)
      ) {
        resolved.add(alias.source_exercise_id)
        changed = true
      }
    }
  }

  return resolved
}

function programmed_target(
  detail: ProgrammedSessionExerciseDetail | undefined,
): Record<string, unknown> | null {
  if (!detail) return null

  return {
    target_sets: detail.exercise.target_sets,
    target_rep_min: detail.exercise.target_rep_min,
    target_rep_max: detail.exercise.target_rep_max,
    rest_seconds: detail.exercise.rest_seconds,
    tempo: detail.exercise.tempo,
    technique_cue: detail.exercise.technique_cue,
    notes: detail.exercise.notes,
    sets: detail.sets.map(({ set, components }) => ({
      set_number: set.set_number,
      set_role: set.set_role,
      structure_type: set.structure_type,
      target_rep_min: set.target_rep_min,
      target_rep_max: set.target_rep_max,
      target_duration_seconds: set.target_duration_seconds,
      target_load_kg: set.target_load_kg,
      target_load_type: set.target_load_type,
      failure_target: set.failure_target,
      notes: set.notes,
      components: components.map((component) => ({
        sequence: component.sequence,
        component_type: component.component_type,
        target_load_kg: component.target_load_kg,
        load_relation: component.load_relation,
        target_load_percent: component.target_load_percent,
        target_rep_min: component.target_rep_min,
        target_rep_max: component.target_rep_max,
        target_duration_seconds: component.target_duration_seconds,
        failure_target: component.failure_target,
        notes: component.notes,
      })),
    })),
  }
}

async function exported_set(
  set: TrainingSet,
  repositories: RepositoryBundle,
): Promise<TrainingExportSet> {
  const components = repositories.sessions.list_set_components
    ? await repositories.sessions.list_set_components(set.id)
    : []

  return {
    id: set.id,
    set_number: set.set_number,
    set_role: set.set_role,
    structure_type: set.structure_type,
    load_kg: set.load_kg,
    load_type: set.load_type,
    rep_mode: set.rep_mode,
    reps_as_recorded: set.reps_as_recorded,
    primary_reps_completed: set.primary_reps_completed,
    left_reps_completed: set.left_reps_completed,
    right_reps_completed: set.right_reps_completed,
    completed_reps: set.completed_reps,
    partial_reps: set.partial_reps,
    duration_seconds: set.duration_seconds,
    failure_status: set.failure_status,
    actual_rest_seconds: set.actual_rest_seconds,
    set_load_kg_reps: set.set_load_kg_reps,
    set_load_method: set.set_load_method,
    notes: set.notes,
    completed_at: set.completed_at,
    components: components.map((component) => ({
      id: component.id,
      sequence: component.sequence,
      component_type: component.component_type,
      load_kg: component.load_kg,
      load_type: component.load_type,
      reps_completed_full: component.reps_completed_full,
      reps_partial: component.reps_partial,
      duration_seconds: component.duration_seconds,
      failure_status: component.failure_status,
      counts_toward_comparable_tonnage:
        component.counts_toward_comparable_tonnage,
      notes: component.notes,
    })),
  }
}

function completed_and_included(
  session: CompletedSession,
  excluded_ids: ReadonlySet<string>,
): boolean {
  return (
    session.deleted_at === null &&
    session.status === 'completed' &&
    !excluded_ids.has(session.id)
  )
}

function session_matches_scope(
  session: CompletedSession,
  request: TrainingExportScopeRequest,
  context: TrainingExportContext,
  excluded_ids: ReadonlySet<string>,
): boolean {
  if (session.deleted_at !== null || excluded_ids.has(session.id)) return false

  switch (request.type) {
    case 'today':
      return (
        session.session_date_local === context.to_date_local &&
        (session.status === 'completed' || session.status === 'in_progress')
      )
    case 'last_7_days': {
      const from_date = date_minus_days(context.to_date_local, 6)
      return (
        completed_and_included(session, excluded_ids) &&
        session.session_date_local >= from_date &&
        session.session_date_local <= context.to_date_local
      )
    }
    case 'exercise':
      return completed_and_included(session, excluded_ids)
    case 'programme_block':
      return (
        completed_and_included(session, excluded_ids) &&
        session.programme_block_id === request.programme_block_id
      )
    case 'full':
      return completed_and_included(session, excluded_ids)
  }
}

async function scope_descriptor(
  repositories: RepositoryBundle,
  request: TrainingExportScopeRequest,
  context: TrainingExportContext,
  exercise_ids: readonly string[],
): Promise<TrainingExport['scope']> {
  switch (request.type) {
    case 'today':
      return {
        type: 'today',
        from_date: context.to_date_local,
        to_date: context.to_date_local,
        exercise_ids: [],
        programme_block_id: null,
      }
    case 'last_7_days':
      return {
        type: 'last_7_days',
        from_date: date_minus_days(context.to_date_local, 6),
        to_date: context.to_date_local,
        exercise_ids: [],
        programme_block_id: null,
      }
    case 'exercise':
      return {
        type: 'exercise',
        from_date: null,
        to_date: null,
        exercise_ids: [...exercise_ids],
        programme_block_id: null,
      }
    case 'programme_block': {
      const block = (await repositories.programme.list_blocks()).find(
        (item) => item.id === request.programme_block_id,
      )
      return {
        type: 'programme_block',
        from_date: block?.start_date_local ?? null,
        to_date: block?.end_date_local ?? null,
        exercise_ids: [],
        programme_block_id: request.programme_block_id,
      }
    }
    case 'full':
      return {
        type: 'full',
        from_date: null,
        to_date: null,
        exercise_ids: [],
        programme_block_id: null,
      }
  }
}

export async function build_training_export(
  repositories: RepositoryBundle,
  context: TrainingExportContext,
  request: TrainingExportScopeRequest,
): Promise<TrainingExport> {
  const [priorities, active_exercises, aliases, exclusions] = await Promise.all([
    load_training_priorities(repositories.settings),
    repositories.exercises.list_active(),
    repositories.exercises.list_aliases(),
    load_coach_excluded_sessions(repositories.settings),
  ])
  const excluded_ids = new Set(exclusions.session_ids)
  const exercise_filter =
    request.type === 'exercise'
      ? resolve_exercise_ids(request.exercise_id, aliases)
      : null

  const sessions = (await repositories.sessions.list_sessions_descending())
    .filter((session) =>
      session_matches_scope(session, request, context, excluded_ids),
    )
    .sort((a, b) =>
      a.session_date_local === b.session_date_local
        ? (a.started_at ?? a.created_at).localeCompare(
            b.started_at ?? b.created_at,
          )
        : a.session_date_local.localeCompare(b.session_date_local),
    )

  const exported_sessions = (
    await Promise.all(
      sessions.map(async (session) => {
        const [readiness, all_session_exercises, programmed_detail] =
          await Promise.all([
            repositories.readiness.get_by_session_id(session.id),
            repositories.sessions.list_session_exercises(session.id),
            session.programmed_session_id
              ? repositories.programme.get_programmed_session_detail(
                  session.programmed_session_id,
                )
              : Promise.resolve(undefined),
          ])

        const session_exercises = exercise_filter
          ? all_session_exercises.filter((exercise) =>
              exercise_filter.has(exercise.exercise_id),
            )
          : all_session_exercises

        if (exercise_filter && session_exercises.length === 0) return null

        const programmed_by_id = new Map(
          programmed_detail?.exercises.map((detail) => [
            detail.exercise.id,
            detail,
          ]) ?? [],
        )

        const exercises = await Promise.all(
          session_exercises.map(async (exercise) => {
            const [sets, metrics] = await Promise.all([
              repositories.sessions.list_sets_for_session_exercise(exercise.id),
              repositories.sessions.get_exercise_metrics(exercise.id),
            ])

            return {
              session_exercise_id: exercise.id,
              exercise_id: exercise.exercise_id,
              exercise_name_snapshot: exercise.exercise_name_snapshot,
              planned_order: exercise.planned_order,
              actual_order: exercise.actual_order,
              rotation_group_key: exercise.rotation_group_key,
              rotation_position: exercise.rotation_position,
              target: programmed_target(
                exercise.programmed_session_exercise_id
                  ? programmed_by_id.get(
                      exercise.programmed_session_exercise_id,
                    )
                  : undefined,
              ),
              metrics: metrics
                ? {
                    rpe: metrics.rpe,
                    pump: metrics.pump,
                    form: metrics.form,
                    where_felt_text: metrics.where_felt_text,
                    where_felt_tags: metrics.where_felt_tags,
                    legacy_tension: metrics.legacy_tension,
                    legacy_mmc: metrics.legacy_mmc,
                    notes: metrics.notes,
                  }
                : null,
              notes: exercise.notes,
              sets: await Promise.all(
                sets.map((set) => exported_set(set, repositories)),
              ),
            }
          }),
        )

        return {
          id: session.id,
          legacy_workout_id: session.legacy_workout_id,
          session_name: session.session_name,
          session_date_local: session.session_date_local,
          timezone: session.timezone,
          status: session.status,
          started_at: session.started_at,
          completed_at: session.completed_at,
          readiness: readiness ?? null,
          notes: session.notes,
          exercises,
        }
      }),
    )
  ).filter(
    (
      session,
    ): session is NonNullable<(typeof exported_sessions)[number]> =>
      session !== null,
  )

  const resolved_exercise_ids = exercise_filter ? [...exercise_filter] : []

  return {
    format: TRAINING_EXPORT_FORMAT,
    schema_version: TRAINING_EXPORT_SCHEMA_VERSION,
    app_version: context.app_version ?? null,
    db_schema_version: context.db_schema_version ?? null,
    exported_at: context.now_iso,
    scope: await scope_descriptor(
      repositories,
      request,
      context,
      resolved_exercise_ids,
    ),
    coach_context: {
      training_priorities: priorities,
      exercise_catalogue: active_exercises.map((exercise) => ({
        id: exercise.id,
        canonical_name: exercise.canonical_name,
        category: exercise.category,
        equipment: exercise.equipment,
        default_load_type: exercise.default_load_type,
        rep_mode_default: exercise.rep_mode_default,
      })),
      exercise_aliases: aliases
        .filter((alias) => alias.deleted_at === null)
        .map(alias_row),
    },
    sessions: exported_sessions,
    provenance: null,
  }
}

export function build_last_7_days_training_export(
  repositories: RepositoryBundle,
  context: TrainingExportContext,
): Promise<TrainingExport> {
  return build_training_export(repositories, context, {
    type: 'last_7_days',
  })
}
