import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'

export type IntegritySeverity = 'warning' | 'error'

export interface DataIntegrityIssue {
  code: string
  severity: IntegritySeverity
  entity_type: string
  entity_id: string
  detail: string
}

export interface DataIntegrityDiagnostics {
  status: 'clean' | 'warning' | 'error'
  checked_at: string
  checked_records: number
  error_count: number
  warning_count: number
  issues: DataIntegrityIssue[]
}

function issue(
  issues: DataIntegrityIssue[],
  severity: IntegritySeverity,
  code: string,
  entity_type: string,
  entity_id: string,
  detail: string,
) {
  issues.push({ severity, code, entity_type, entity_id, detail })
}

export async function inspect_data_integrity(
  db: ProjectFreakDatabase,
  now_iso = new Date().toISOString(),
): Promise<DataIntegrityDiagnostics> {
  const [
    sessions,
    session_exercises,
    sets,
    components,
    metrics,
    readiness,
    programmed_sessions,
    programmed_exercises,
    programmed_sets,
    programmed_components,
  ] = await Promise.all([
    db.completed_sessions.toArray(),
    db.session_exercises.toArray(),
    db.sets.toArray(),
    db.set_components.toArray(),
    db.exercise_metrics.toArray(),
    db.readiness_entries.toArray(),
    db.programmed_sessions.toArray(),
    db.programmed_session_exercises.toArray(),
    db.programmed_session_sets.toArray(),
    db.programmed_set_components.toArray(),
  ])

  const issues: DataIntegrityIssue[] = []
  const session_ids = new Set(sessions.map((row) => row.id))
  const session_exercise_ids = new Set(session_exercises.map((row) => row.id))
  const set_ids = new Set(sets.map((row) => row.id))
  const programmed_session_ids = new Set(programmed_sessions.map((row) => row.id))
  const programmed_exercise_ids = new Set(programmed_exercises.map((row) => row.id))
  const programmed_set_ids = new Set(programmed_sets.map((row) => row.id))

  for (const row of session_exercises) {
    if (!session_ids.has(row.completed_session_id)) {
      issue(
        issues,
        'error',
        'orphan_session_exercise',
        'session_exercise',
        row.id,
        `References missing completed session ${row.completed_session_id}.`,
      )
    }
  }

  for (const row of sets) {
    if (!session_ids.has(row.completed_session_id)) {
      issue(
        issues,
        'error',
        'orphan_set_session',
        'set',
        row.id,
        `References missing completed session ${row.completed_session_id}.`,
      )
    }
    if (!session_exercise_ids.has(row.session_exercise_id)) {
      issue(
        issues,
        'error',
        'orphan_set_exercise',
        'set',
        row.id,
        `References missing session exercise ${row.session_exercise_id}.`,
      )
    }
  }

  for (const row of components) {
    if (!set_ids.has(row.set_id)) {
      issue(
        issues,
        'error',
        'orphan_set_component',
        'set_component',
        row.id,
        `References missing set ${row.set_id}.`,
      )
    }
  }

  for (const row of metrics) {
    if (!session_exercise_ids.has(row.session_exercise_id)) {
      issue(
        issues,
        'error',
        'orphan_exercise_metrics',
        'exercise_metrics',
        row.id,
        `References missing session exercise ${row.session_exercise_id}.`,
      )
    }
  }

  for (const row of readiness) {
    if (!session_ids.has(row.completed_session_id)) {
      issue(
        issues,
        'error',
        'orphan_readiness',
        'readiness_entry',
        row.id,
        `References missing completed session ${row.completed_session_id}.`,
      )
    }
  }

  for (const row of programmed_exercises) {
    if (!programmed_session_ids.has(row.programmed_session_id)) {
      issue(
        issues,
        'error',
        'orphan_programmed_exercise',
        'programmed_session_exercise',
        row.id,
        `References missing programmed session ${row.programmed_session_id}.`,
      )
    }
  }

  for (const row of programmed_sets) {
    if (!programmed_exercise_ids.has(row.programmed_session_exercise_id)) {
      issue(
        issues,
        'error',
        'orphan_programmed_set',
        'programmed_session_set',
        row.id,
        `References missing programmed exercise ${row.programmed_session_exercise_id}.`,
      )
    }
  }

  for (const row of programmed_components) {
    if (!programmed_set_ids.has(row.programmed_session_set_id)) {
      issue(
        issues,
        'error',
        'orphan_programmed_component',
        'programmed_set_component',
        row.id,
        `References missing programmed set ${row.programmed_session_set_id}.`,
      )
    }
  }

  const seen_set_numbers = new Map<string, string>()
  for (const row of sets.filter((set) => set.deleted_at === null)) {
    const key = `${row.session_exercise_id}:${row.set_number}`
    const existing = seen_set_numbers.get(key)
    if (existing) {
      issue(
        issues,
        'error',
        'duplicate_active_set_number',
        'set',
        row.id,
        `Duplicates active set number ${row.set_number} with ${existing}.`,
      )
    } else {
      seen_set_numbers.set(key, row.id)
    }
  }

  for (const row of sessions.filter((session) => session.deleted_at === null)) {
    if (row.status === 'completed' && row.completed_at === null) {
      issue(
        issues,
        'warning',
        'completed_session_missing_time',
        'completed_session',
        row.id,
        'Session is completed but completed_at is blank.',
      )
    }
    if (row.status === 'in_progress' && row.completed_at !== null) {
      issue(
        issues,
        'warning',
        'active_session_has_completion_time',
        'completed_session',
        row.id,
        'Session is in progress but already has completed_at.',
      )
    }
  }

  const checked_records =
    sessions.length +
    session_exercises.length +
    sets.length +
    components.length +
    metrics.length +
    readiness.length +
    programmed_sessions.length +
    programmed_exercises.length +
    programmed_sets.length +
    programmed_components.length

  const error_count = issues.filter((entry) => entry.severity === 'error').length
  const warning_count = issues.length - error_count

  return {
    status: error_count > 0 ? 'error' : warning_count > 0 ? 'warning' : 'clean',
    checked_at: now_iso,
    checked_records,
    error_count,
    warning_count,
    issues,
  }
}
