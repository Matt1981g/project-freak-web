import * as XLSX from 'xlsx'
import type { JsonValue } from '../../domain/models'
import { calculate_comparable_tonnage } from '../../domain/rules/tonnage'
import {
  CANONICAL_HISTORICAL_PROFILE,
  EXPECTED_CANONICAL_SHEETS,
  HISTORICAL_IMPORTER_TYPE,
  HISTORICAL_IMPORTER_VERSION,
  REQUIRED_SESSION_SUMMARY_COLUMNS,
  REQUIRED_SET_DATA_COLUMNS,
} from './profile'
import { sha256_hex, sha256_text } from './hash'
import type {
  HistoricalImportIssue,
  HistoricalImportPreview,
  HistoricalSourceRow,
  ParsedHistoricalSessionSummary,
  ParsedHistoricalSetRow,
} from './types'

type CellValue = string | number | boolean | null
type RowRecord = Record<string, CellValue>

function issue(
  severity: HistoricalImportIssue['severity'],
  code: string,
  message: string,
  source_sheet: string | null = null,
  source_row_number: number | null = null,
  source_record_key: string | null = null,
  raw_json: JsonValue | null = null,
): HistoricalImportIssue {
  return {
    severity,
    code,
    message,
    source_sheet,
    source_row_number,
    source_record_key,
    raw_json,
  }
}

function is_blank(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function as_text(value: unknown): string | null {
  if (is_blank(value)) {
    return null
  }
  return String(value)
}

function as_number(value: unknown): number | null {
  if (is_blank(value)) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function as_integer(value: unknown): number | null {
  const parsed = as_number(value)
  if (parsed === null || !Number.isInteger(parsed)) {
    return null
  }
  return parsed
}

function excel_serial_to_iso_date(serial: number): string {
  const milliseconds = Date.UTC(1899, 11, 30) + serial * 86_400_000
  return new Date(milliseconds).toISOString().slice(0, 10)
}

function parse_date(raw_value: unknown, display_value: unknown): string | null {
  if (typeof raw_value === 'number' && Number.isFinite(raw_value)) {
    return excel_serial_to_iso_date(raw_value)
  }

  const displayed = as_text(display_value)
  if (displayed && /^\d{4}-\d{2}-\d{2}$/.test(displayed)) {
    return displayed
  }

  return null
}

function normalize_headers(row: unknown[]): string[] {
  return row.map((value) => (is_blank(value) ? '' : String(value)))
}

function validate_headers(
  headers: string[],
  required: readonly string[],
  sheet_name: string,
  issues: HistoricalImportIssue[],
): void {
  const available = new Set(headers)
  for (const column of required) {
    if (!available.has(column)) {
      issues.push(
        issue(
          'error',
          'missing_required_column',
          `${sheet_name} is missing required column "${column}".`,
          sheet_name,
          1,
        ),
      )
    }
  }
}

function row_record(headers: string[], row: unknown[]): RowRecord {
  const record: RowRecord = {}
  headers.forEach((header, index) => {
    if (!header) {
      return
    }
    const value = row[index]
    record[header] = is_blank(value)
      ? null
      : (value as string | number | boolean)
  })
  return record
}

function historical_source_row(
  headers: string[],
  raw_row: unknown[],
  display_row: unknown[],
): HistoricalSourceRow {
  return {
    raw: row_record(headers, raw_row) as Record<string, JsonValue>,
    display: row_record(headers, display_row) as Record<string, JsonValue>,
  }
}

function map_load_type(value: string | null): ParsedHistoricalSetRow['load_type'] {
  switch (value) {
    case 'normal':
      return 'normal'
    case 'assistance':
      return 'assistance'
    case 'band+machine':
      return 'band_plus_machine'
    default:
      return 'unknown'
  }
}

function map_structure_type(
  value: string | null,
): ParsedHistoricalSetRow['structure_type'] {
  switch (value) {
    case 'drop':
    case 'drop-unquantified':
      return 'drop'
    case 'rest-pause':
      return 'rest_pause'
    case 'partials':
      return 'partials'
    case 'failure':
    case 'straight':
    default:
      return 'straight'
  }
}

interface RepShape {
  rep_mode: ParsedHistoricalSetRow['rep_mode']
  duration_seconds: number | null
  left_reps_completed: number | null
  right_reps_completed: number | null
  left_failure_status: ParsedHistoricalSetRow['left_failure_status']
  right_failure_status: ParsedHistoricalSetRow['right_failure_status']
}

function parse_rep_shape(reps_as_recorded: string | null): RepShape {
  if (!reps_as_recorded) {
    return {
      rep_mode: 'total',
      duration_seconds: null,
      left_reps_completed: null,
      right_reps_completed: null,
      left_failure_status: null,
      right_failure_status: null,
    }
  }

  const timed = /^\s*(\d+(?:\.\d+)?)s\s*$/i.exec(reps_as_recorded)
  if (timed) {
    return {
      rep_mode: 'timed',
      duration_seconds: Number(timed[1]),
      left_reps_completed: null,
      right_reps_completed: null,
      left_failure_status: null,
      right_failure_status: null,
    }
  }

  if (/hold/i.test(reps_as_recorded)) {
    return {
      rep_mode: 'timed',
      duration_seconds: null,
      left_reps_completed: null,
      right_reps_completed: null,
      left_failure_status: null,
      right_failure_status: null,
    }
  }

  const unilateral =
    /^\s*(\d+)(F?)\s*L\s*\+\s*(\d+)(F?)\s*R\s*$/i.exec(
      reps_as_recorded,
    ) ??
    /^\s*(\d+)(F?)\s+L\s*\+\s*(\d+)(F?)\s+R\s*$/i.exec(
      reps_as_recorded,
    )

  if (unilateral) {
    return {
      rep_mode: 'per_side',
      duration_seconds: null,
      left_reps_completed: Number(unilateral[1]),
      right_reps_completed: Number(unilateral[3]),
      left_failure_status: unilateral[2]
        ? 'attempted_next_rep_failed'
        : 'none',
      right_failure_status: unilateral[4]
        ? 'attempted_next_rep_failed'
        : 'none',
    }
  }

  return {
    rep_mode: 'total',
    duration_seconds: null,
    left_reps_completed: null,
    right_reps_completed: null,
    left_failure_status: null,
    right_failure_status: null,
  }
}

function create_source_record_key(
  workout_id: string,
  exercise_order: number,
  set_number: number,
): string {
  return `project-freak-historical:xlsx:v1:${workout_id}:${exercise_order}:${set_number}`
}

function source_row_fingerprint_payload(source_row: HistoricalSourceRow): string {
  return JSON.stringify(source_row)
}

function alias_candidate_groups(exercise_names: string[]): string[][] {
  const groups = new Map<string, Set<string>>()
  for (const name of exercise_names) {
    const key = name.toLocaleLowerCase('en-GB')
    const group = groups.get(key) ?? new Set<string>()
    group.add(name)
    groups.set(key, group)
  }

  return [...groups.values()]
    .filter((group) => group.size > 1)
    .map((group) => [...group].sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function build_tonnage_components(row: ParsedHistoricalSetRow) {
  if (
    row.structure_type === 'drop' &&
    row.secondary_load_kg !== null &&
    row.secondary_reps !== null
  ) {
    return [
      {
        component_type: 'drop' as const,
        load_kg: row.secondary_load_kg,
        load_type: row.load_type,
        reps_completed_full: row.secondary_reps,
        counts_toward_comparable_tonnage: true,
      },
    ]
  }

  if (
    row.structure_type === 'rest_pause' &&
    row.secondary_reps !== null
  ) {
    return [
      {
        component_type: 'rest_pause' as const,
        load_kg: row.secondary_load_kg ?? row.load_kg,
        load_type: row.load_type,
        reps_completed_full: row.secondary_reps,
        counts_toward_comparable_tonnage: true,
      },
    ]
  }

  if (row.structure_type === 'partials' && row.secondary_reps !== null) {
    return [
      {
        component_type: 'partials' as const,
        load_kg: row.secondary_load_kg ?? row.load_kg,
        load_type: row.load_type,
        reps_completed_full: row.secondary_reps,
        counts_toward_comparable_tonnage: false,
      },
    ]
  }

  return []
}

function validate_tonnage(
  row: ParsedHistoricalSetRow,
  issues: HistoricalImportIssue[],
): void {
  const calculated = calculate_comparable_tonnage({
    load_kg: row.load_kg,
    load_type: row.load_type,
    rep_mode: row.rep_mode,
    primary_reps_completed: row.primary_reps_completed,
    components: build_tonnage_components(row),
  }).value

  if (calculated === null && row.source_set_load_kg_reps === null) {
    return
  }

  if (
    calculated !== null &&
    row.source_set_load_kg_reps !== null &&
    Math.abs(calculated - row.source_set_load_kg_reps) < 0.000001
  ) {
    return
  }

  issues.push(
    issue(
      'warning',
      'tonnage_reconciliation_mismatch',
      `Recorded set load and deterministic comparable tonnage differ for ${row.source_record_key}. Recorded=${row.source_set_load_kg_reps ?? 'blank'}, calculated=${calculated ?? 'blank'}.`,
      'Set Data',
      row.source_row_number,
      row.source_record_key,
      row.source_row as unknown as JsonValue,
    ),
  )
}

function metrics_signature(row: ParsedHistoricalSetRow): string {
  return JSON.stringify([
    row.rpe,
    row.pump,
    row.form,
    row.legacy_tension,
    row.legacy_mmc,
  ])
}

function validate_group_consistency(
  rows: ParsedHistoricalSetRow[],
  issues: HistoricalImportIssue[],
): void {
  const sessions = new Map<string, ParsedHistoricalSetRow[]>()
  const session_exercises = new Map<string, ParsedHistoricalSetRow[]>()

  for (const row of rows) {
    const session = sessions.get(row.workout_id) ?? []
    session.push(row)
    sessions.set(row.workout_id, session)

    const key = `${row.workout_id}:${row.exercise_order}`
    const exercise_group = session_exercises.get(key) ?? []
    exercise_group.push(row)
    session_exercises.set(key, exercise_group)
  }

  for (const [workout_id, group] of sessions) {
    const signatures = new Set(
      group.map((row) =>
        JSON.stringify([
          row.session_date_local,
          row.day,
          row.start_text,
          row.finish_text,
        ]),
      ),
    )
    if (signatures.size > 1) {
      issues.push(
        issue(
          'error',
          'inconsistent_session_metadata',
          `Set Data contains inconsistent date/day/start/finish values within ${workout_id}.`,
          'Set Data',
        ),
      )
    }
  }

  for (const [group_key, group] of session_exercises) {
    const exercise_names = new Set(group.map((row) => row.exercise_name))
    if (exercise_names.size > 1) {
      issues.push(
        issue(
          'error',
          'inconsistent_exercise_order',
          `Session/exercise group ${group_key} contains more than one exercise label.`,
          'Set Data',
        ),
      )
    }

    const metric_signatures = new Set(group.map(metrics_signature))
    if (metric_signatures.size > 1) {
      issues.push(
        issue(
          'error',
          'inconsistent_exercise_metrics',
          `Session/exercise group ${group_key} contains conflicting RPE/Pump/Form/Tension/MMC values.`,
          'Set Data',
        ),
      )
    }
  }
}

function reconcile_session_summaries(
  rows: ParsedHistoricalSetRow[],
  summaries: ParsedHistoricalSessionSummary[],
  issues: HistoricalImportIssue[],
): void {
  const rows_by_workout = new Map<string, ParsedHistoricalSetRow[]>()
  for (const row of rows) {
    const group = rows_by_workout.get(row.workout_id) ?? []
    group.push(row)
    rows_by_workout.set(row.workout_id, group)
  }

  for (const summary of summaries) {
    const group = rows_by_workout.get(summary.workout_id)
    if (!group) {
      issues.push(
        issue(
          'error',
          'summary_without_set_rows',
          `Session Summary contains ${summary.workout_id}, but Set Data has no matching rows.`,
          'Session Summary',
          summary.source_row_number,
        ),
      )
      continue
    }

    // Session Summary counts distinct exercise labels. A session can return to
    // the same exercise later as a separate occurrence/order block (W29 does
    // this with Leg Extension), which must remain a separate session_exercise.
    const exercise_count = new Set(group.map((row) => row.exercise_name)).size
    const completed_reps = group.reduce(
      (sum, row) => sum + (row.completed_reps ?? 0),
      0,
    )
    const total_recorded_load = group.reduce(
      (sum, row) => sum + (row.source_set_load_kg_reps ?? 0),
      0,
    )

    const checks: Array<[number | null, number, string]> = [
      [summary.exercises, exercise_count, 'Exercises'],
      [summary.working_sets, group.length, 'Working Sets'],
      [summary.completed_reps, completed_reps, 'Completed Reps'],
    ]

    for (const [recorded, calculated, label] of checks) {
      if (recorded !== null && recorded !== calculated) {
        issues.push(
          issue(
            'error',
            'session_summary_reconciliation_mismatch',
            `${summary.workout_id} ${label} mismatch. Summary=${recorded}, Set Data=${calculated}.`,
            'Session Summary',
            summary.source_row_number,
          ),
        )
      }
    }

    if (
      summary.total_recorded_load !== null &&
      Math.abs(summary.total_recorded_load - total_recorded_load) > 0.000001
    ) {
      issues.push(
        issue(
          'error',
          'session_summary_load_mismatch',
          `${summary.workout_id} Total Recorded Load mismatch. Summary=${summary.total_recorded_load}, Set Data=${total_recorded_load}.`,
          'Session Summary',
          summary.source_row_number,
        ),
      )
    }
  }

  if (summaries.length !== rows_by_workout.size) {
    issues.push(
      issue(
        'error',
        'session_count_reconciliation_mismatch',
        `Session Summary has ${summaries.length} sessions while Set Data has ${rows_by_workout.size}.`,
        'Session Summary',
      ),
    )
  }
}

function canonical_count_checks(
  preview: Omit<HistoricalImportPreview, 'issues' | 'can_commit'>,
  issues: HistoricalImportIssue[],
): void {
  if (!preview.is_canonical_source) {
    issues.push(
      issue(
        'warning',
        'noncanonical_workbook',
        'Workbook matches the historical import shape but its SHA-256 is not the locked canonical Project Freak workbook.',
      ),
    )
    return
  }

  const expected = CANONICAL_HISTORICAL_PROFILE
  const checks: Array<[number, number, string]> = [
    [preview.detected.sessions, expected.sessions, 'sessions'],
    [
      preview.detected.session_exercises,
      expected.session_exercises,
      'session/exercise groups',
    ],
    [
      preview.detected.exact_exercise_labels,
      expected.exact_exercise_labels,
      'exact exercise labels',
    ],
    [preview.detected.sets, expected.sets, 'sets'],
    [
      preview.detected.case_only_duplicate_groups,
      expected.case_only_duplicate_groups,
      'case-only duplicate groups',
    ],
  ]

  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) {
      issues.push(
        issue(
          'error',
          'canonical_count_mismatch',
          `Canonical workbook expected ${wanted} ${label}, detected ${actual}.`,
        ),
      )
    }
  }

  if (preview.file_size_bytes !== expected.size_bytes) {
    issues.push(
      issue(
        'error',
        'canonical_size_mismatch',
        `Canonical workbook expected ${expected.size_bytes} bytes, detected ${preview.file_size_bytes}.`,
      ),
    )
  }
}

function sheet_rows(
  workbook: XLSX.WorkBook,
  sheet_name: string,
): { raw: unknown[][]; display: unknown[][] } | null {
  const sheet = workbook.Sheets[sheet_name]
  if (!sheet) {
    return null
  }

  return {
    raw: XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }) as unknown[][],
    display: XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    }) as unknown[][],
  }
}

export async function parse_historical_workbook(
  file_data: ArrayBuffer,
  file_name: string,
): Promise<HistoricalImportPreview> {
  const issues: HistoricalImportIssue[] = []
  const file_sha256 = await sha256_hex(file_data)
  const workbook = XLSX.read(file_data, { type: 'array' })

  for (const sheet_name of EXPECTED_CANONICAL_SHEETS) {
    if (!workbook.SheetNames.includes(sheet_name)) {
      issues.push(
        issue(
          sheet_name === 'Set Data' || sheet_name === 'Session Summary'
            ? 'error'
            : 'warning',
          'missing_expected_sheet',
          `Workbook is missing expected sheet "${sheet_name}".`,
          sheet_name,
        ),
      )
    }
  }

  const set_sheet = sheet_rows(workbook, 'Set Data')
  const summary_sheet = sheet_rows(workbook, 'Session Summary')

  if (!set_sheet || !summary_sheet) {
    return {
      importer_type: HISTORICAL_IMPORTER_TYPE,
      importer_version: HISTORICAL_IMPORTER_VERSION,
      file_name,
      file_size_bytes: file_data.byteLength,
      file_sha256,
      is_canonical_source:
        file_sha256 === CANONICAL_HISTORICAL_PROFILE.sha256,
      detected: {
        sessions: 0,
        session_exercises: 0,
        exact_exercise_labels: 0,
        sets: 0,
        case_only_duplicate_groups: 0,
      },
      alias_candidate_groups: [],
      rows: [],
      session_summaries: [],
      issues,
      can_commit: false,
    }
  }

  const set_headers = normalize_headers(set_sheet.display[0] ?? [])
  const summary_headers = normalize_headers(summary_sheet.display[0] ?? [])
  validate_headers(
    set_headers,
    REQUIRED_SET_DATA_COLUMNS,
    'Set Data',
    issues,
  )
  validate_headers(
    summary_headers,
    REQUIRED_SESSION_SUMMARY_COLUMNS,
    'Session Summary',
    issues,
  )

  const parsed_rows: ParsedHistoricalSetRow[] = []
  const seen_source_keys = new Set<string>()

  for (let index = 1; index < set_sheet.raw.length; index += 1) {
    const raw_row = set_sheet.raw[index] ?? []
    const display_row = set_sheet.display[index] ?? []
    const raw_record = row_record(set_headers, raw_row)
    const display_record = row_record(set_headers, display_row)

    if (is_blank(raw_record['Workout ID'])) {
      continue
    }

    const source_row_number = index + 1
    const workout_id = as_text(display_record['Workout ID'])
    const session_date_local = parse_date(
      raw_record.Date,
      display_record.Date,
    )
    const exercise_order = as_integer(raw_record['Exercise Order'])
    const exercise_name = as_text(display_record.Exercise)
    const set_number = as_integer(raw_record.Set)

    if (
      !workout_id ||
      !session_date_local ||
      exercise_order === null ||
      !exercise_name ||
      set_number === null
    ) {
      issues.push(
        issue(
          'error',
          'malformed_set_identity',
          `Set Data row ${source_row_number} is missing a valid workout ID, date, exercise order, exercise name, or set number.`,
          'Set Data',
          source_row_number,
          null,
          historical_source_row(
            set_headers,
            raw_row,
            display_row,
          ) as unknown as JsonValue,
        ),
      )
      continue
    }

    const source_record_key = create_source_record_key(
      workout_id,
      exercise_order,
      set_number,
    )

    if (seen_source_keys.has(source_record_key)) {
      issues.push(
        issue(
          'error',
          'duplicate_source_record_key',
          `Duplicate historical source key ${source_record_key}.`,
          'Set Data',
          source_row_number,
          source_record_key,
        ),
      )
      continue
    }
    seen_source_keys.add(source_record_key)

    const reps_as_recorded = as_text(display_record['Reps as Recorded'])
    const rep_shape = parse_rep_shape(reps_as_recorded)
    const source_row = historical_source_row(
      set_headers,
      raw_row,
      display_row,
    )
    const failure_recorded = as_integer(raw_record.Failure) === 1
    const structure_type = map_structure_type(
      as_text(display_record['Set Type']),
    )
    const secondary_reps = as_integer(raw_record['Secondary Reps'])

    const parsed: ParsedHistoricalSetRow = {
      source_row_number,
      source_record_key,
      source_row_sha256: await sha256_text(
        source_row_fingerprint_payload(source_row),
      ),
      source_row,
      workout_id,
      session_date_local,
      day: as_text(display_record.Day),
      start_text: as_text(display_record.Start),
      finish_text: as_text(display_record.Finish),
      exercise_order,
      exercise_name,
      set_number,
      load_kg: as_number(raw_record['Load (kg)']),
      load_type: map_load_type(as_text(display_record['Load Type'])),
      structure_type,
      reps_as_recorded,
      rep_mode: rep_shape.rep_mode,
      primary_reps_completed: as_integer(raw_record['Primary Reps']),
      secondary_load_kg: as_number(raw_record['Secondary Load (kg)']),
      secondary_reps,
      completed_reps: as_integer(raw_record['Completed Reps']),
      partial_reps:
        structure_type === 'partials' ? secondary_reps : null,
      duration_seconds: rep_shape.duration_seconds,
      left_reps_completed: rep_shape.left_reps_completed,
      right_reps_completed: rep_shape.right_reps_completed,
      failure_status: failure_recorded
        ? 'attempted_next_rep_failed'
        : 'none',
      left_failure_status: rep_shape.left_failure_status,
      right_failure_status: rep_shape.right_failure_status,
      rpe: as_number(raw_record.RPE),
      pump: as_number(raw_record.Pump),
      form: as_number(raw_record.Form),
      legacy_tension: as_number(raw_record['Legacy Tension']),
      legacy_mmc: as_number(raw_record['Legacy MMC']),
      source_set_load_kg_reps: as_number(raw_record['Set Load (kg-reps)']),
      set_load_method: as_text(display_record['Set Load Method']),
      notes: as_text(display_record.Notes),
      data_status: as_text(display_record['Data Status']),
      source_text: as_text(display_record.Source),
    }

    validate_tonnage(parsed, issues)
    parsed_rows.push(parsed)
  }

  const session_summaries: ParsedHistoricalSessionSummary[] = []
  for (let index = 1; index < summary_sheet.raw.length; index += 1) {
    const raw_row = summary_sheet.raw[index] ?? []
    const display_row = summary_sheet.display[index] ?? []
    const raw_record = row_record(summary_headers, raw_row)
    const display_record = row_record(summary_headers, display_row)

    if (is_blank(raw_record['Workout ID'])) {
      continue
    }

    const workout_id = as_text(display_record['Workout ID'])
    const session_date_local = parse_date(
      raw_record.Date,
      display_record.Date,
    )

    if (!workout_id || !session_date_local) {
      issues.push(
        issue(
          'error',
          'malformed_session_summary',
          `Session Summary row ${index + 1} has an invalid workout ID or date.`,
          'Session Summary',
          index + 1,
        ),
      )
      continue
    }

    session_summaries.push({
      source_row_number: index + 1,
      workout_id,
      session_date_local,
      day: as_text(display_record.Day),
      start_text: as_text(display_record.Start),
      finish_text: as_text(display_record.Finish),
      exercises: as_integer(raw_record.Exercises),
      working_sets: as_integer(raw_record['Working Sets']),
      completed_reps: as_integer(raw_record['Completed Reps']),
      total_recorded_load: as_number(raw_record['Total Recorded Load']),
      data_notes: as_text(display_record['Data Notes']),
    })
  }

  validate_group_consistency(parsed_rows, issues)
  reconcile_session_summaries(parsed_rows, session_summaries, issues)

  const exercise_names = [...new Set(parsed_rows.map((row) => row.exercise_name))]
  const aliases = alias_candidate_groups(exercise_names)
  const session_exercise_keys = new Set(
    parsed_rows.map((row) => `${row.workout_id}:${row.exercise_order}`),
  )
  const session_ids = new Set(parsed_rows.map((row) => row.workout_id))

  const partial_preview = {
    importer_type: HISTORICAL_IMPORTER_TYPE,
    importer_version: HISTORICAL_IMPORTER_VERSION,
    file_name,
    file_size_bytes: file_data.byteLength,
    file_sha256,
    is_canonical_source:
      file_sha256 === CANONICAL_HISTORICAL_PROFILE.sha256,
    detected: {
      sessions: session_ids.size,
      session_exercises: session_exercise_keys.size,
      exact_exercise_labels: exercise_names.length,
      sets: parsed_rows.length,
      case_only_duplicate_groups: aliases.length,
    },
    alias_candidate_groups: aliases,
    rows: parsed_rows,
    session_summaries,
  }

  canonical_count_checks(partial_preview, issues)

  return {
    ...partial_preview,
    issues,
    can_commit: !issues.some((entry) => entry.severity === 'error'),
  }
}
