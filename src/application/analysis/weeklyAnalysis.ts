import type { ExerciseMetrics, TrainingSet } from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import { is_training_set_completed } from '../../domain/rules/completion'
import type {
  MetricAverage,
  WeeklyTrainingAnalysis,
} from './analysisTypes'

interface MutableWeek {
  week_start_local: string
  week_end_local: string
  session_ids: Set<string>
  working_sets: number
  comparable_tonnage_kg: number
  failure_sets: number
  rpe: number[]
  pump: number[]
  form: number[]
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parse_local_date(date_local: string): Date {
  const match = LOCAL_DATE_PATTERN.exec(date_local)
  if (!match) {
    throw new Error(`Invalid local training date: ${date_local}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local training date: ${date_local}`)
  }

  return date
}

function format_local_date(date: Date): string {
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
}

export function monday_week_start(date_local: string): string {
  const date = parse_local_date(date_local)
  const monday_offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - monday_offset)
  return format_local_date(date)
}

function sunday_week_end(week_start_local: string): string {
  const date = parse_local_date(week_start_local)
  date.setUTCDate(date.getUTCDate() + 6)
  return format_local_date(date)
}

function average(values: readonly number[]): MetricAverage {
  if (values.length === 0) {
    return { value: null, samples: 0 }
  }

  return {
    value: values.reduce((total, value) => total + value, 0) / values.length,
    samples: values.length,
  }
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

function is_completed_working_set(set: TrainingSet): boolean {
  return (
    set.deleted_at === null &&
    set.set_role === 'work' &&
    is_training_set_completed(set)
  )
}

function collect_metrics(
  week: MutableWeek,
  metrics: ExerciseMetrics | undefined,
): void {
  if (!metrics || metrics.deleted_at !== null) return

  if (metrics.rpe !== null) week.rpe.push(metrics.rpe)
  if (metrics.pump !== null) week.pump.push(metrics.pump)
  if (metrics.form !== null) week.form.push(metrics.form)
}

export async function load_weekly_training_analysis(
  session_repository: SessionRepository,
): Promise<WeeklyTrainingAnalysis[]> {
  const sessions = await session_repository.list_sessions_descending()
  const weeks = new Map<string, MutableWeek>()

  for (const session of sessions) {
    if (session.deleted_at !== null || session.status !== 'completed') continue

    const week_start_local = monday_week_start(session.session_date_local)
    let week = weeks.get(week_start_local)

    if (!week) {
      week = {
        week_start_local,
        week_end_local: sunday_week_end(week_start_local),
        session_ids: new Set<string>(),
        working_sets: 0,
        comparable_tonnage_kg: 0,
        failure_sets: 0,
        rpe: [],
        pump: [],
        form: [],
      }
      weeks.set(week_start_local, week)
    }

    week.session_ids.add(session.id)

    const [sets, session_exercises] = await Promise.all([
      session_repository.list_sets_for_session(session.id),
      session_repository.list_session_exercises(session.id),
    ])

    for (const set of sets.filter(is_completed_working_set)) {
      week.working_sets += 1
      if (set.set_load_kg_reps !== null) {
        week.comparable_tonnage_kg += set.set_load_kg_reps
      }
      if (has_failure(set)) {
        week.failure_sets += 1
      }
    }

    const metric_records = await Promise.all(
      session_exercises
        .filter((exercise) => exercise.deleted_at === null)
        .map((exercise) =>
          session_repository.get_exercise_metrics(exercise.id),
        ),
    )

    for (const metrics of metric_records) {
      collect_metrics(week, metrics)
    }
  }

  return [...weeks.values()]
    .sort((left, right) =>
      right.week_start_local.localeCompare(left.week_start_local),
    )
    .map((week) => ({
      week_start_local: week.week_start_local,
      week_end_local: week.week_end_local,
      completed_sessions: week.session_ids.size,
      working_sets: week.working_sets,
      comparable_tonnage_kg: week.comparable_tonnage_kg,
      failure_sets: week.failure_sets,
      rpe: average(week.rpe),
      pump: average(week.pump),
      form: average(week.form),
    }))
}
