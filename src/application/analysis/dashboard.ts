import type { RepositoryBundle } from '../../data/repositories/contracts'
import type { AnalysisDashboard } from './analysisTypes'
import { load_weekly_training_analysis } from './weeklyAnalysis'
import { load_training_priorities } from '../priorities/trainingPriorities'
import { load_current_week_muscle_analysis } from './muscleAnalysis'
import { load_adaptive_training_analysis } from './adaptiveAnalysis'
import { build_long_term_trends } from './longTermTrends'

export async function load_analysis_dashboard_data(
  repositories: RepositoryBundle,
): Promise<AnalysisDashboard> {
  const weeks = await load_weekly_training_analysis(repositories.sessions)

  if (weeks.length === 0) {
    return {
      weeks: [],
      trend_windows: [],
      muscles: [],
      mapping_coverage: {
        explicit_exercises: 0,
        researched_exercises: 0,
        category_fallback_exercises: 0,
        unmapped_exercises: 0,
      },
      underperformance: {
        status: 'clear',
        signals: [],
        regressed_exercises: 0,
        performance_affected_recoveries: 0,
      },
      deload: {
        recommendation: 'insufficient_evidence',
        score: 0,
        confidence: 'low',
        reasons: ['No completed training week is available yet.'],
      },
    }
  }

  const priorities = await load_training_priorities(repositories.settings)
  const current = weeks[0]
  const muscle = await load_current_week_muscle_analysis(
    repositories,
    current.week_start_local,
    current.week_end_local,
    priorities,
  )
  const [adaptive, trend_windows] = await Promise.all([
    load_adaptive_training_analysis(
      repositories,
      current,
      muscle.muscles,
    ),
    build_long_term_trends(repositories, weeks, priorities),
  ])

  return {
    weeks,
    trend_windows,
    muscles: adaptive.muscles,
    mapping_coverage: muscle.mapping_coverage,
    underperformance: adaptive.underperformance,
    deload: adaptive.deload,
  }
}
