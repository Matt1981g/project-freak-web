export const PROJECT_FREAK_DB_NAME = 'project-freak'
export const PROJECT_FREAK_DB_SCHEMA_VERSION = 1
export const PROJECT_FREAK_DATA_CONTRACT_VERSION = '1.0.0'

export const PROJECT_FREAK_SCHEMA_V1 = {
  schema_meta: '&key',
  migration_history: '&version, applied_at',
  devices: '&id, last_seen_at',
  settings: '&key, scope, device_id',

  exercises: '&id, canonical_name, archived_at, updated_at',
  exercise_aliases:
    '&id, exercise_id, normalized_alias, [exercise_id+normalized_alias]',
  muscles: '&id, &name, region',
  exercise_muscles:
    '&id, exercise_id, muscle_id, [exercise_id+muscle_id], role',

  programme_blocks:
    '&id, status, start_date_local, end_date_local, updated_at',
  workout_templates:
    '&id, programme_block_id, template_family_id, version_number, status, [template_family_id+version_number]',
  template_exercises:
    '&id, workout_template_id, exercise_id, planned_order, rotation_group_key',
  template_sets:
    '&id, template_exercise_id, set_number, set_role, structure_type',
  template_set_components:
    '&id, template_set_id, sequence, component_type',

  programmed_sessions:
    '&id, programme_block_id, workout_template_id, scheduled_date_local, status',
  programmed_session_exercises:
    '&id, programmed_session_id, exercise_id, planned_order, rotation_group_key',
  programmed_session_sets:
    '&id, programmed_session_exercise_id, set_number, set_role, structure_type',
  programmed_set_components:
    '&id, programmed_session_set_id, sequence, component_type',

  completed_sessions:
    '&id, programmed_session_id, programme_block_id, legacy_workout_id, session_date_local, status, started_at, completed_at, updated_at',
  readiness_entries:
    '&id, &completed_session_id, updated_at',
  session_exercises:
    '&id, completed_session_id, programmed_session_exercise_id, exercise_id, actual_order, [completed_session_id+exercise_id], updated_at',
  sets:
    '&id, completed_session_id, session_exercise_id, exercise_id, [completed_session_id+exercise_id], &source_record_key, completed_at, updated_at',
  set_components:
    '&id, set_id, sequence, component_type, updated_at',
  exercise_metrics:
    '&id, &session_exercise_id, updated_at',
  coaching_notes:
    '&id, scope_type, scope_id, [scope_type+scope_id], created_at',

  import_batches:
    '&id, file_sha256, status, started_at, completed_at',
  import_records:
    '&id, import_batch_id, &source_record_key, entity_type, entity_id, source_row_sha256',
  import_issues:
    '&id, import_batch_id, severity, code, source_record_key, resolution_status',
  audit_events:
    '&id, entity_type, entity_id, [entity_type+entity_id], action, created_at',

  sync_outbox:
    '&id, entity_type, entity_id, [entity_type+entity_id], operation, revision, synced_at, created_at',
  sync_state: '&provider, status',
} as const

export const PROJECT_FREAK_STORE_NAMES = Object.keys(
  PROJECT_FREAK_SCHEMA_V1,
) as Array<keyof typeof PROJECT_FREAK_SCHEMA_V1>
