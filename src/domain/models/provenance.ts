import type { JsonValue } from './common'

export interface ImportBatch {
  id: string
  importer_type: string
  importer_version: string
  file_name: string
  file_sha256: string
  file_size_bytes: number
  started_at: string
  completed_at: string | null
  status: 'previewed' | 'committed' | 'failed' | 'cancelled'
  expected_sessions: number | null
  detected_sessions: number | null
  expected_exercises: number | null
  detected_exercises: number | null
  expected_sets: number | null
  detected_sets: number | null
  summary_json: JsonValue | null
}

export interface ImportRecord {
  id: string
  import_batch_id: string
  source_sheet: string
  source_row_number: number
  source_record_key: string
  source_row_sha256: string
  entity_type: string
  entity_id: string
  raw_json: JsonValue
  data_status: string | null
  source_text: string | null
  imported_at: string
}

export interface ImportIssue {
  id: string
  import_batch_id: string
  severity: 'info' | 'warning' | 'error'
  code: string
  source_sheet: string | null
  source_row_number: number | null
  source_record_key: string | null
  message: string
  raw_json: JsonValue | null
  resolution_status: 'open' | 'resolved' | 'ignored'
  resolved_at: string | null
}

export interface AuditEvent {
  id: string
  entity_type: string
  entity_id: string
  action:
    | 'create'
    | 'update'
    | 'soft_delete'
    | 'restore'
    | 'import'
    | 'restore_backup'
  before_json: JsonValue | null
  after_json: JsonValue | null
  reason: string | null
  device_id: string
  created_at: string
}
