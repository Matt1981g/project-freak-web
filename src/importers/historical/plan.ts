import type {
  AuditEvent,
  CompletedSession,
  Exercise,
  ExerciseMetrics,
  ImportRecord,
  SessionExercise,
  SetComponent,
  SyncOutbox,
  TrainingSet,
} from '../../domain/models'
import {
  create_audit_event,
  create_sync_outbox_entry,
} from '../../data/repositories/persistenceUtils'
import { deterministic_uuid } from './hash'
import type {
  HistoricalImportPreview,
  ParsedHistoricalSetRow,
} from './types'

export interface HistoricalImportPlan {
  exercises: Exercise[]
  sessions: CompletedSession[]
  session_exercises: SessionExercise[]
  sets: TrainingSet[]
  set_components: SetComponent[]
  exercise_metrics: ExerciseMetrics[]
  import_records: ImportRecord[]
  audit_events: AuditEvent[]
  sync_outbox: SyncOutbox[]
}

function mutable_metadata(
  id: string,
  timestamp: string,
  device_id: string,
  batch_id: string,
) {
  return {
    id,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    revision: 1,
    device_id,
    source_kind: 'historical_import' as const,
    source_id: batch_id,
  }
}

function group_rows(
  rows: ParsedHistoricalSetRow[],
  key: (row: ParsedHistoricalSetRow) => string,
): Map<string, ParsedHistoricalSetRow[]> {
  const groups = new Map<string, ParsedHistoricalSetRow[]>()
  for (const row of rows) {
    const group_key = key(row)
    const group = groups.get(group_key) ?? []
    group.push(row)
    groups.set(group_key, group)
  }
  return groups
}

function create_component(
  row: ParsedHistoricalSetRow,
  set_id: string,
  component_id: string,
  timestamp: string,
  device_id: string,
  batch_id: string,
): SetComponent | null {
  if (row.structure_type === 'drop') {
    if (row.secondary_load_kg === null || row.secondary_reps === null) {
      return null
    }
    return {
      ...mutable_metadata(component_id, timestamp, device_id, batch_id),
      set_id,
      sequence: 1,
      component_type: 'drop',
      load_kg: row.secondary_load_kg,
      load_type: row.load_type,
      reps_completed_full: row.secondary_reps,
      reps_partial: null,
      duration_seconds: null,
      failure_status: 'none',
      counts_toward_comparable_tonnage: true,
      notes: null,
    }
  }

  if (row.structure_type === 'rest_pause') {
    if (row.secondary_reps === null) {
      return null
    }
    return {
      ...mutable_metadata(component_id, timestamp, device_id, batch_id),
      set_id,
      sequence: 1,
      component_type: 'rest_pause',
      load_kg: row.secondary_load_kg ?? row.load_kg,
      load_type: row.load_type,
      reps_completed_full: row.secondary_reps,
      reps_partial: null,
      duration_seconds: null,
      failure_status: 'none',
      counts_toward_comparable_tonnage: true,
      notes: null,
    }
  }

  if (row.structure_type === 'partials') {
    if (row.secondary_reps === null) {
      return null
    }
    return {
      ...mutable_metadata(component_id, timestamp, device_id, batch_id),
      set_id,
      sequence: 1,
      component_type: 'partials',
      load_kg: row.secondary_load_kg ?? row.load_kg,
      load_type: row.load_type,
      reps_completed_full: null,
      reps_partial: row.secondary_reps,
      duration_seconds: null,
      failure_status: 'none',
      counts_toward_comparable_tonnage: false,
      notes: null,
    }
  }

  return null
}

export async function build_historical_import_plan(
  preview: HistoricalImportPreview,
  batch_id: string,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<HistoricalImportPlan> {
  const exercise_names = [
    ...new Set(preview.rows.map((row) => row.exercise_name)),
  ]
  const exercise_id_entries = await Promise.all(
    exercise_names.map(async (name) => [
      name,
      await deterministic_uuid(`historical-exercise:${name}`),
    ] as const),
  )
  const exercise_ids = new Map(exercise_id_entries)

  const workout_groups = group_rows(preview.rows, (row) => row.workout_id)
  const session_exercise_groups = group_rows(
    preview.rows,
    (row) => `${row.workout_id}:${row.exercise_order}`,
  )

  const session_id_entries = await Promise.all(
    [...workout_groups.keys()].map(async (workout_id) => [
      workout_id,
      await deterministic_uuid(`historical-session:${workout_id}`),
    ] as const),
  )
  const session_ids = new Map(session_id_entries)

  const session_exercise_id_entries = await Promise.all(
    [...session_exercise_groups.keys()].map(async (key) => [
      key,
      await deterministic_uuid(`historical-session-exercise:${key}`),
    ] as const),
  )
  const session_exercise_ids = new Map(session_exercise_id_entries)

  const exercises: Exercise[] = exercise_names.map((name) => ({
    ...mutable_metadata(
      exercise_ids.get(name)!,
      timestamp,
      device_id,
      batch_id,
    ),
    canonical_name: name,
    short_name: null,
    category: null,
    equipment: null,
    default_load_type: 'unknown',
    rep_mode_default: 'mixed',
    archived_at: null,
    notes: null,
  }))

  const sessions: CompletedSession[] = [...workout_groups].map(
    ([workout_id, rows]) => {
      const first = rows[0]
      return {
        ...mutable_metadata(
          session_ids.get(workout_id)!,
          timestamp,
          device_id,
          batch_id,
        ),
        programmed_session_id: null,
        programme_block_id: null,
        workout_template_id_snapshot: null,
        legacy_workout_id: workout_id,
        session_name: workout_id,
        session_date_local: first.session_date_local,
        timezone: null,
        status: 'completed',
        started_at: null,
        completed_at: null,
        source_start_text: first.start_text,
        source_finish_text: first.finish_text,
        duration_seconds: null,
        notes: null,
      }
    },
  )

  const session_exercises: SessionExercise[] = [
    ...session_exercise_groups,
  ].map(([key, rows]) => {
    const first = rows[0]
    return {
      ...mutable_metadata(
        session_exercise_ids.get(key)!,
        timestamp,
        device_id,
        batch_id,
      ),
      completed_session_id: session_ids.get(first.workout_id)!,
      programmed_session_exercise_id: null,
      exercise_id: exercise_ids.get(first.exercise_name)!,
      exercise_name_snapshot: first.exercise_name,
      planned_order: null,
      actual_order: first.exercise_order,
      rotation_group_key: null,
      rotation_position: null,
      target_sets: null,
      target_rep_min: null,
      target_rep_max: null,
      rest_seconds: null,
      tempo: null,
      technique_cue: null,
      programme_notes: null,
      started_at: null,
      completed_at: null,
      notes: null,
    }
  })

  const set_id_entries = await Promise.all(
    preview.rows.map(async (row) => [
      row.source_record_key,
      await deterministic_uuid(row.source_record_key),
    ] as const),
  )
  const set_ids = new Map(set_id_entries)

  const sets: TrainingSet[] = preview.rows.map((row) => ({
    ...mutable_metadata(
      set_ids.get(row.source_record_key)!,
      timestamp,
      device_id,
      batch_id,
    ),
    completed_session_id: session_ids.get(row.workout_id)!,
    session_exercise_id: session_exercise_ids.get(
      `${row.workout_id}:${row.exercise_order}`,
    )!,
    exercise_id: exercise_ids.get(row.exercise_name)!,
    exercise_order_snapshot: row.exercise_order,
    set_number: row.set_number,
    set_role: 'work',
    structure_type: row.structure_type,
    load_kg: row.load_kg,
    load_type: row.load_type,
    rep_mode: row.rep_mode,
    reps_as_recorded: row.reps_as_recorded,
    primary_reps_completed: row.primary_reps_completed,
    left_reps_completed: row.left_reps_completed,
    right_reps_completed: row.right_reps_completed,
    completed_reps: row.completed_reps,
    partial_reps: row.partial_reps,
    duration_seconds: row.duration_seconds,
    failure_status: row.failure_status,
    left_failure_status: row.left_failure_status,
    right_failure_status: row.right_failure_status,
    actual_rest_seconds: null,
    set_load_kg_reps: row.source_set_load_kg_reps,
    set_load_method: row.set_load_method,
    notes: row.notes,
    completed_at: null,
    source_record_key: row.source_record_key,
  }))

  const component_candidates = await Promise.all(
    preview.rows.map(async (row) => {
      const set_id = set_ids.get(row.source_record_key)!
      const component_id = await deterministic_uuid(
        `${row.source_record_key}:component:1`,
      )
      return create_component(
        row,
        set_id,
        component_id,
        timestamp,
        device_id,
        batch_id,
      )
    }),
  )
  const set_components = component_candidates.filter(
    (component): component is SetComponent => component !== null,
  )

  const exercise_metrics: ExerciseMetrics[] = []
  for (const [key, rows] of session_exercise_groups) {
    const first = rows[0]
    const has_metrics =
      first.rpe !== null ||
      first.pump !== null ||
      first.form !== null ||
      first.legacy_tension !== null ||
      first.legacy_mmc !== null

    if (!has_metrics) {
      continue
    }

    exercise_metrics.push({
      ...mutable_metadata(
        await deterministic_uuid(`historical-exercise-metrics:${key}`),
        timestamp,
        device_id,
        batch_id,
      ),
      session_exercise_id: session_exercise_ids.get(key)!,
      rpe: first.rpe,
      pump: first.pump,
      form: first.form,
      where_felt_text: null,
      where_felt_tags: [],
      legacy_tension: first.legacy_tension,
      legacy_mmc: first.legacy_mmc,
      notes: null,
    })
  }

  const import_records: ImportRecord[] = await Promise.all(
    preview.rows.map(async (row) => ({
      id: await deterministic_uuid(
        `historical-import-record:${row.source_record_key}`,
      ),
      import_batch_id: batch_id,
      source_sheet: 'Set Data',
      source_row_number: row.source_row_number,
      source_record_key: row.source_record_key,
      source_row_sha256: row.source_row_sha256,
      entity_type: 'set',
      entity_id: set_ids.get(row.source_record_key)!,
      raw_json: row.source_row as unknown as ImportRecord['raw_json'],
      data_status: row.data_status,
      source_text: row.source_text,
      imported_at: timestamp,
    })),
  )

  const syncable_entities = [
    ...exercises.map((entity) => ['exercise', entity] as const),
    ...sessions.map((entity) => ['completed_session', entity] as const),
    ...session_exercises.map(
      (entity) => ['session_exercise', entity] as const,
    ),
    ...sets.map((entity) => ['set', entity] as const),
    ...set_components.map((entity) => ['set_component', entity] as const),
    ...exercise_metrics.map(
      (entity) => ['exercise_metrics', entity] as const,
    ),
  ]

  const audit_events = syncable_entities.map(([entity_type, entity]) =>
    create_audit_event(entity_type, entity, null, 'import'),
  )
  const sync_outbox = syncable_entities.map(([entity_type, entity]) =>
    create_sync_outbox_entry(entity_type, entity),
  )

  return {
    exercises,
    sessions,
    session_exercises,
    sets,
    set_components,
    exercise_metrics,
    import_records,
    audit_events,
    sync_outbox,
  }
}
