import type { ExerciseMetrics, TrainingSet } from '../../domain/models'
import type { ExerciseHistoryResult } from '../history/exerciseHistory'
import { is_training_set_completed } from '../../domain/rules/completion'

export type ExerciseProgressionVerdict =
  | 'baseline'
  | 'improved'
  | 'held'
  | 'regressed'
  | 'not_comparable'

export interface ExerciseProgressionRow {
  session_id: string
  session_date_local: string
  session_name: string
  working_sets: number
  comparable_tonnage_kg: number
  failure_sets: number
  best_load_kg: number | null
  best_reps_at_load: number | null
  rpe: number | null
  pump: number | null
  form: number | null
  verdict: ExerciseProgressionVerdict
  reason: string
}

export interface ExerciseProgressionAnalysis {
  completed_sessions: number
  rows: ExerciseProgressionRow[]
  latest: ExerciseProgressionRow | null
}

interface BestSet {
  load_kg: number
  completed_reps: number
}

function is_completed_work_set(set: TrainingSet): boolean {
  return (
    set.deleted_at === null &&
    set.set_role === 'work' &&
    is_training_set_completed(set)
  )
}

function is_strict_comparable_set(set: TrainingSet): boolean {
  return (
    is_completed_work_set(set) &&
    set.structure_type === 'straight' &&
    set.rep_mode === 'total' &&
    set.load_type === 'normal' &&
    set.load_kg !== null &&
    set.completed_reps !== null
  )
}

function has_failure(set: TrainingSet): boolean {
  return (
    set.failure_status !== 'none' ||
    (set.left_failure_status !== null &&
      set.left_failure_status !== 'none') ||
    (set.right_failure_status !== null &&
      set.right_failure_status !== 'none')
  )
}

function average(
  metrics: readonly (ExerciseMetrics | undefined)[],
  key: 'rpe' | 'pump' | 'form',
): number | null {
  const values = metrics
    .map((entry) => entry?.[key] ?? null)
    .filter((value): value is number => value !== null)

  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function select_best_set(sets: readonly TrainingSet[]): BestSet | null {
  const comparable = sets.filter(is_strict_comparable_set)

  if (comparable.length === 0) return null

  const best = [...comparable].sort((left, right) => {
    const by_load = right.load_kg! - left.load_kg!
    if (by_load !== 0) return by_load
    return right.completed_reps! - left.completed_reps!
  })[0]

  return {
    load_kg: best.load_kg!,
    completed_reps: best.completed_reps!,
  }
}

function classify_progression(
  current: ExerciseProgressionRow,
  previous: ExerciseProgressionRow | null,
): Pick<ExerciseProgressionRow, 'verdict' | 'reason'> {
  if (!previous) {
    return {
      verdict: 'baseline',
      reason: 'First completed comparable performance.',
    }
  }

  if (
    current.best_load_kg === null ||
    current.best_reps_at_load === null ||
    previous.best_load_kg === null ||
    previous.best_reps_at_load === null
  ) {
    return {
      verdict: 'not_comparable',
      reason: 'No directly comparable straight working set.',
    }
  }

  if (current.form === null || previous.form === null) {
    return {
      verdict: 'not_comparable',
      reason: 'Form is missing, so load and reps are not promoted as progression.',
    }
  }

  if (current.form < 8 || previous.form < 8) {
    return {
      verdict: 'not_comparable',
      reason: 'Execution quality was below the progression-valid threshold.',
    }
  }

  if (current.form < previous.form - 1) {
    return {
      verdict: 'not_comparable',
      reason: 'Load or reps changed alongside materially worse execution.',
    }
  }

  if (current.best_load_kg === previous.best_load_kg) {
    if (current.best_reps_at_load > previous.best_reps_at_load) {
      return {
        verdict: 'improved',
        reason: 'More reps at the same best load with progression-valid Form.',
      }
    }

    if (current.best_reps_at_load < previous.best_reps_at_load) {
      if (current.form > previous.form) {
        return {
          verdict: 'not_comparable',
          reason: 'Fewer reps were performed with cleaner execution.',
        }
      }

      return {
        verdict: 'regressed',
        reason: 'Fewer reps at the same best load without an execution gain.',
      }
    }

    if (current.form > previous.form) {
      return {
        verdict: 'improved',
        reason: 'Same best load and reps with better Form.',
      }
    }

    return {
      verdict: 'held',
      reason: 'Best load, reps and execution were effectively held.',
    }
  }

  if (current.best_load_kg > previous.best_load_kg) {
    if (
      current.best_reps_at_load >= previous.best_reps_at_load &&
      current.form >= previous.form - 1
    ) {
      return {
        verdict: 'improved',
        reason: 'Higher best load without sacrificing reps or execution.',
      }
    }

    return {
      verdict: 'not_comparable',
      reason: 'Load increased but reps changed enough to prevent a clean verdict.',
    }
  }

  if (
    current.best_reps_at_load <= previous.best_reps_at_load &&
    current.form <= previous.form
  ) {
    return {
      verdict: 'regressed',
      reason: 'Lower best load without a rep or execution improvement.',
    }
  }

  return {
    verdict: 'not_comparable',
    reason: 'Lower load was paired with more reps or cleaner execution.',
  }
}

export function build_exercise_progression(
  history: ExerciseHistoryResult,
): ExerciseProgressionAnalysis {
  const chronological = history.entries
    .filter(
      (entry) =>
        entry.session.deleted_at === null &&
        entry.session.status === 'completed',
    )
    .sort((left, right) => {
      const by_date = left.session.session_date_local.localeCompare(
        right.session.session_date_local,
      )
      if (by_date !== 0) return by_date
      return (left.session.completed_at ?? left.session.created_at).localeCompare(
        right.session.completed_at ?? right.session.created_at,
      )
    })

  const rows: ExerciseProgressionRow[] = []
  let previous_comparable: ExerciseProgressionRow | null = null

  for (const entry of chronological) {
    const sets_by_id = new Map<string, TrainingSet>()
    const metrics: Array<ExerciseMetrics | undefined> = []

    for (const appearance of entry.appearances) {
      metrics.push(appearance.metrics)
      for (const set of appearance.sets) {
        if (set.deleted_at === null) sets_by_id.set(set.id, set)
      }
    }

    const sets = [...sets_by_id.values()]
    const working_sets = sets.filter(is_completed_work_set)
    const best_set = select_best_set(working_sets)

    const row: ExerciseProgressionRow = {
      session_id: entry.session.id,
      session_date_local: entry.session.session_date_local,
      session_name: entry.session.session_name,
      working_sets: working_sets.length,
      comparable_tonnage_kg: working_sets.reduce(
        (total, set) => total + (set.set_load_kg_reps ?? 0),
        0,
      ),
      failure_sets: working_sets.filter(has_failure).length,
      best_load_kg: best_set?.load_kg ?? null,
      best_reps_at_load: best_set?.completed_reps ?? null,
      rpe: average(metrics, 'rpe'),
      pump: average(metrics, 'pump'),
      form: average(metrics, 'form'),
      verdict: 'baseline',
      reason: '',
    }

    const classification = classify_progression(row, previous_comparable)
    row.verdict = classification.verdict
    row.reason = classification.reason
    rows.push(row)

    if (best_set) {
      previous_comparable = row
    }
  }

  rows.reverse()

  return {
    completed_sessions: rows.length,
    rows,
    latest: rows[0] ?? null,
  }
}
