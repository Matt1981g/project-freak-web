import type { RepositoryBundle } from '../../data/repositories/contracts'
import type {
  AnalysisTrendWindow,
  MetricAverage,
  MuscleAnalysisRow,
  WeeklyTrainingAnalysis,
} from './analysisTypes'
import type { TrainingPriorityState } from '../priorities/trainingPriorities'
import { load_current_week_muscle_analysis } from './muscleAnalysis'

function weighted_average(
  entries: readonly MetricAverage[],
): MetricAverage {
  const samples = entries.reduce((total, entry) => total + entry.samples, 0)
  if (samples === 0) return { value: null, samples: 0 }

  const weighted = entries.reduce(
    (total, entry) =>
      total + (entry.value === null ? 0 : entry.value * entry.samples),
    0,
  )
  return { value: weighted / samples, samples }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function aggregate_muscles(
  muscle_weeks: readonly MuscleAnalysisRow[][],
  priorities: TrainingPriorityState,
) {
  return priorities.current.map((muscle, index) => {
    const rows = muscle_weeks
      .map((week) => week.find((row) => row.muscle === muscle))
      .filter((row): row is MuscleAnalysisRow => Boolean(row))

    return {
      muscle,
      priority: index + 1,
      intent: priorities.intent_by_area[muscle],
      direct_sets: sum(rows.map((row) => row.direct_sets)),
      secondary_sets: sum(rows.map((row) => row.secondary_sets)),
      weighted_sets:
        Math.round(sum(rows.map((row) => row.weighted_sets)) * 10) / 10,
      frequency: sum(rows.map((row) => row.frequency)),
      failure_exposure_sets: sum(
        rows.map((row) => row.failure_exposure_sets),
      ),
    }
  })
}

export async function build_long_term_trends(
  repositories: RepositoryBundle,
  weeks: readonly WeeklyTrainingAnalysis[],
  priorities: TrainingPriorityState,
): Promise<AnalysisTrendWindow[]> {
  const available = weeks.slice(0, 12)
  const muscle_by_week = await Promise.all(
    available.map(async (week) => {
      const result = await load_current_week_muscle_analysis(
        repositories,
        week.week_start_local,
        week.week_end_local,
        priorities,
      )
      return result.muscles
    }),
  )

  return ([4, 8, 12] as const).map((weeks_requested) => {
    const selected_weeks = available.slice(0, weeks_requested)
    const selected_muscles = muscle_by_week.slice(0, weeks_requested)
    const weeks_available = selected_weeks.length

    return {
      weeks_requested,
      weeks_available,
      from_date_local:
        weeks_available > 0
          ? selected_weeks[weeks_available - 1].week_start_local
          : null,
      to_date_local:
        weeks_available > 0 ? selected_weeks[0].week_end_local : null,
      completed_sessions: sum(
        selected_weeks.map((week) => week.completed_sessions),
      ),
      working_sets: sum(selected_weeks.map((week) => week.working_sets)),
      comparable_tonnage_kg: sum(
        selected_weeks.map((week) => week.comparable_tonnage_kg),
      ),
      failure_sets: sum(selected_weeks.map((week) => week.failure_sets)),
      average_sessions_per_week:
        weeks_available === 0
          ? 0
          : sum(selected_weeks.map((week) => week.completed_sessions)) /
            weeks_available,
      average_working_sets_per_week:
        weeks_available === 0
          ? 0
          : sum(selected_weeks.map((week) => week.working_sets)) /
            weeks_available,
      rpe: weighted_average(selected_weeks.map((week) => week.rpe)),
      pump: weighted_average(selected_weeks.map((week) => week.pump)),
      form: weighted_average(selected_weeks.map((week) => week.form)),
      muscles: aggregate_muscles(selected_muscles, priorities),
    }
  })
}
