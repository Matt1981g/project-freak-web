import type { TrainingExport, TrainingExportSet } from './trainingExport'

function format_number(value: number): string {
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function format_score(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}

function format_load(value: number | null): string {
  return value === null ? '— kg' : `${format_number(value)} kg`
}


function scope_title(scope: TrainingExport['scope']): string {
  switch (scope.type) {
    case 'today':
      return 'PROJECT FREAK — TODAY COACHING BRIEF'
    case 'last_7_days':
      return 'PROJECT FREAK — WEEKLY COACHING BRIEF'
    case 'exercise':
      return 'PROJECT FREAK — EXERCISE COACHING BRIEF'
    case 'programme_block':
      return 'PROJECT FREAK — MESOCYCLE COACHING BRIEF'
    case 'full':
      return 'PROJECT FREAK — FULL DATABASE COACHING BRIEF'
  }
}

function scope_period(scope: TrainingExport['scope']): string {
  if (scope.from_date && scope.to_date) {
    return scope.from_date === scope.to_date
      ? scope.from_date
      : `${scope.from_date} to ${scope.to_date}`
  }

  if (scope.type === 'exercise') return 'All completed history for selected exercise'
  if (scope.type === 'full') return 'All completed training history'
  return 'Dates not specified'
}

function set_description(set: TrainingExportSet): string {
  const reps =
    set.reps_as_recorded ??
    (set.completed_reps === null ? '—' : String(set.completed_reps))
  const structure =
    set.structure_type === 'straight'
      ? ''
      : ` [${set.structure_type.replaceAll('_', ' ')}]`

  return `S${set.set_number} ${format_load(set.load_kg)} × ${reps}${structure}`
}

function target_number(
  target: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!target) return null
  const value = target[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function target_string(
  target: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!target) return null
  const value = target[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function target_description(target: Record<string, unknown> | null): string {
  if (!target) return 'No programmed target'

  const sets = target_number(target, 'target_sets')
  const rep_min = target_number(target, 'target_rep_min')
  const rep_max = target_number(target, 'target_rep_max')
  const rest = target_number(target, 'rest_seconds')
  const tempo = target_string(target, 'tempo')
  const cue = target_string(target, 'technique_cue')

  const parts: string[] = []
  if (sets !== null) parts.push(`${sets} sets`)
  if (rep_min !== null || rep_max !== null) {
    parts.push(
      rep_min !== null && rep_max !== null
        ? `${rep_min}–${rep_max} reps`
        : `${rep_min ?? rep_max} reps`,
    )
  }
  if (rest !== null) parts.push(`${rest}s rest`)
  if (tempo) parts.push(`tempo ${tempo}`)
  if (cue) parts.push(`cue: ${cue}`)

  return parts.length > 0 ? parts.join(' | ') : 'Programmed target present'
}

function readiness_description(
  readiness: TrainingExport['sessions'][number]['readiness'],
): string {
  if (!readiness) return 'Not recorded'

  const fields = [
    ['BW', readiness.bodyweight_kg, 'kg'],
    ['Sleep', readiness.sleep_duration_minutes, 'min'],
    ['Sleep score', readiness.sleep_score, ''],
    ['Energy', readiness.energy_pre, '/10'],
    ['Motivation', readiness.motivation_pre, '/10'],
    ['Soreness', readiness.soreness_score, '/10'],
    ['Hydration', readiness.intra_hydration_ml, 'ml'],
    ['Fatigue', readiness.session_fatigue, '/10'],
    ['Breathlessness', readiness.breathlessness, '/10'],
    ['Energy stability', readiness.energy_stability, '/10'],
  ] as const

  const available = fields
    .filter(([, value]) => value !== null)
    .map(([label, value, suffix]) => `${label} ${value}${suffix}`)

  if (readiness.joint_issue_present !== null) {
    available.push(
      readiness.joint_issue_present
        ? `Joint issue YES${readiness.joint_issue_notes ? `: ${readiness.joint_issue_notes}` : ''}`
        : 'Joint issue NO',
    )
  }

  return available.length > 0 ? available.join(' | ') : 'Recorded, fields blank'
}

export function build_weekly_coaching_brief(payload: TrainingExport): string {
  const priorities = payload.coach_context.training_priorities.current
    .map((area, index) => `${index + 1}. ${area}`)
    .join(' | ')

  const total_sets = payload.sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (exercise_total, exercise) => exercise_total + exercise.sets.length,
        0,
      ),
    0,
  )
  const total_volume = payload.sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (exercise_total, exercise) =>
          exercise_total +
          exercise.sets.reduce(
            (set_total, set) => set_total + (set.set_load_kg_reps ?? 0),
            0,
          ),
        0,
      ),
    0,
  )

  let missing_readiness = 0
  let missing_metrics = 0
  let missing_targets = 0

  const lines: string[] = [
    scope_title(payload.scope),
    `Scope: ${scope_period(payload.scope)}`,
    `Sessions: ${payload.sessions.length}`,
    `Recorded sets: ${total_sets}`,
    `Comparable volume: ${format_number(total_volume)} kg`,
    '',
    'TRAINING PRIORITIES',
    priorities || 'Not configured',
    '',
    'SESSION DETAIL',
  ]

  for (const session of payload.sessions) {
    if (!session.readiness) missing_readiness += 1

    const session_sets = session.exercises.reduce(
      (total, exercise) => total + exercise.sets.length,
      0,
    )
    const session_volume = session.exercises.reduce(
      (total, exercise) =>
        total +
        exercise.sets.reduce(
          (set_total, set) => set_total + (set.set_load_kg_reps ?? 0),
          0,
        ),
      0,
    )

    lines.push(
      '',
      `## ${session.session_date_local} — ${session.session_name}${session.legacy_workout_id ? ` (${session.legacy_workout_id})` : ''}`,
      `Sets: ${session_sets} | Comparable volume: ${format_number(session_volume)} kg`,
      `Readiness / recovery: ${readiness_description(session.readiness)}`,
    )

    for (const exercise of session.exercises) {
      if (!exercise.metrics) missing_metrics += 1
      if (!exercise.target) missing_targets += 1

      lines.push(
        '',
        `- ${exercise.exercise_name_snapshot} [${exercise.exercise_id}]`,
        `  Target: ${target_description(exercise.target)}`,
        `  Actual: ${exercise.sets.length > 0 ? exercise.sets.map(set_description).join(' | ') : 'No sets recorded'}`,
      )

      if (exercise.metrics) {
        const where_felt =
          exercise.metrics.where_felt_text ??
          (exercise.metrics.where_felt_tags.length > 0
            ? exercise.metrics.where_felt_tags.join(', ')
            : '—')

        lines.push(
          `  Scores: RPE ${format_score(exercise.metrics.rpe)} | Pump ${format_score(exercise.metrics.pump)} | Form ${format_score(exercise.metrics.form)} | Where felt ${where_felt}`,
        )
      } else {
        lines.push('  Scores: Not recorded')
      }

      if (exercise.notes) lines.push(`  Notes: ${exercise.notes}`)
    }
  }

  lines.push(
    '',
    'DATA QUALITY',
    `Sessions without readiness/recovery: ${missing_readiness}`,
    `Exercise appearances without RPE/Pump/Form metrics: ${missing_metrics}`,
    `Exercise appearances without programmed targets: ${missing_targets}`,
    '',
    'COACH HANDOFF',
    'Use this brief for rapid review and the accompanying PROJECT FREAK JSON for exact set structures, IDs, aliases, provenance and programme-import-safe exercise references.',
    'The next programme JSON is the prescription. Historical performance is evidence, not an instruction to blindly repeat the previous load.',
  )

  return lines.join('\n')
}
