import { describe, expect, it } from 'vitest'
import type { WeeklyTrainingAnalysis } from './analysisTypes'

function weighted_score(
  weeks: readonly WeeklyTrainingAnalysis[],
  key: 'rpe' | 'pump' | 'form',
) {
  const samples = weeks.reduce((total, week) => total + week[key].samples, 0)
  if (!samples) return null
  return (
    weeks.reduce(
      (total, week) =>
        total + (week[key].value ?? 0) * week[key].samples,
      0,
    ) / samples
  )
}

describe('long-term trend score weighting', () => {
  it('weights weekly score averages by their sample counts', () => {
    const weeks: WeeklyTrainingAnalysis[] = [
      {
        week_start_local: '2026-09-01',
        week_end_local: '2026-09-07',
        completed_sessions: 5,
        working_sets: 50,
        comparable_tonnage_kg: 10000,
        failure_sets: 5,
        rpe: { value: 9, samples: 10 },
        pump: { value: 8, samples: 10 },
        form: { value: 9, samples: 10 },
      },
      {
        week_start_local: '2026-08-25',
        week_end_local: '2026-08-31',
        completed_sessions: 1,
        working_sets: 10,
        comparable_tonnage_kg: 2000,
        failure_sets: 1,
        rpe: { value: 5, samples: 2 },
        pump: { value: 5, samples: 2 },
        form: { value: 5, samples: 2 },
      },
    ]

    expect(weighted_score(weeks, 'rpe')).toBeCloseTo(8.333, 2)
  })
})
