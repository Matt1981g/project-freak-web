import type {
  FailureStatus,
  LoadType,
  RepMode,
  StructureType,
} from '../../domain/enums/training'
import type { JsonValue } from '../../domain/models'

export type HistoricalIssueSeverity = 'info' | 'warning' | 'error'

export interface HistoricalImportIssue {
  severity: HistoricalIssueSeverity
  code: string
  message: string
  source_sheet: string | null
  source_row_number: number | null
  source_record_key: string | null
  raw_json: JsonValue | null
}

export interface HistoricalSourceRow {
  raw: Record<string, JsonValue>
  display: Record<string, JsonValue>
}

export interface ParsedHistoricalSetRow {
  source_row_number: number
  source_record_key: string
  source_row_sha256: string
  source_row: HistoricalSourceRow

  workout_id: string
  session_date_local: string
  day: string | null
  start_text: string | null
  finish_text: string | null

  exercise_order: number
  exercise_name: string
  set_number: number

  load_kg: number | null
  load_type: LoadType
  structure_type: StructureType
  reps_as_recorded: string | null
  rep_mode: RepMode
  primary_reps_completed: number | null
  secondary_load_kg: number | null
  secondary_reps: number | null
  completed_reps: number | null
  partial_reps: number | null
  duration_seconds: number | null
  left_reps_completed: number | null
  right_reps_completed: number | null

  failure_status: FailureStatus
  left_failure_status: FailureStatus | null
  right_failure_status: FailureStatus | null

  rpe: number | null
  pump: number | null
  form: number | null
  legacy_tension: number | null
  legacy_mmc: number | null

  source_set_load_kg_reps: number | null
  set_load_method: string | null
  notes: string | null
  data_status: string | null
  source_text: string | null
}

export interface ParsedHistoricalSessionSummary {
  source_row_number: number
  workout_id: string
  session_date_local: string
  day: string | null
  start_text: string | null
  finish_text: string | null
  exercises: number | null
  working_sets: number | null
  completed_reps: number | null
  total_recorded_load: number | null
  data_notes: string | null
}

export interface HistoricalImportDetectedCounts {
  sessions: number
  session_exercises: number
  exact_exercise_labels: number
  sets: number
  case_only_duplicate_groups: number
}

export interface HistoricalImportPreview {
  importer_type: string
  importer_version: string
  file_name: string
  file_size_bytes: number
  file_sha256: string
  is_canonical_source: boolean
  detected: HistoricalImportDetectedCounts
  alias_candidate_groups: string[][]
  rows: ParsedHistoricalSetRow[]
  session_summaries: ParsedHistoricalSessionSummary[]
  issues: HistoricalImportIssue[]
  can_commit: boolean
}

export interface HistoricalImportCommitResult {
  status: 'committed' | 'duplicate_noop'
  import_batch_id: string | null
  inserted: {
    exercises: number
    sessions: number
    session_exercises: number
    sets: number
    set_components: number
    exercise_metrics: number
    import_records: number
  }
}
