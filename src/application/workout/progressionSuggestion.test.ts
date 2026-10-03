import { describe, expect, it } from 'vitest'
import type { ExerciseMetrics } from '../../domain/models'
import type { PreviousComparablePerformance } from './previousComparable'
import { build_progression_suggestion } from './progressionSuggestion'

function previous(
  metrics_overrides: Partial<ExerciseMetrics> = {},
): PreviousComparablePerformance {
  const metrics: ExerciseMetrics = {
    id: 'metrics-1',
    created_at: '2026-09-01T06:00:00.000Z',
    updated_at: '2026-09-01T06:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    session_exercise_id: 'session-exercise-1',
    rpe: 9,
    pump: 9,
    form: 9,
    where_felt_text: null,
    where_felt_tags: [],
    legacy_tension: null,
    legacy_mmc: null,
    notes: null,
    ...metrics_overrides,
  }

  return {
    session_id: 'session-1',
    session_date_local: '2026-09-01',
    source_exercise_name: 'Nautilus Bicep Curl',
    sets: [
      {
        set_number: 1,
        load_kg: 45,
        completed_reps: 12,
        failure_status: 'none',
        volume_kg: 540,
      },
      {
        set_number: 2,
        load_kg: 45,
        completed_reps: 12,
        failure_status: 'none',
        volume_kg: 540,
      },
    ],
    metrics,
    total_volume_kg: 1080,
  }
}

const targets = [
  { set_number: 1, target_rep_min: 8, target_rep_max: 12 },
  { set_number: 2, target_rep_min: 8, target_rep_max: 12 },
]

describe('build_progression_suggestion V2 adapter', () => {
  it('returns CALIBRATE when there is no trusted machine history', () => {
    const result = build_progression_suggestion(null, targets)
    expect(result.state).toBe('CALIBRATE')
    expect(result.label).toBe('CALIBRATE')
  })

  it('requires two valid same-machine exposures before normal progression', () => {
    const result = build_progression_suggestion(previous(), targets, {
      exercise_id: 'exercise-1',
      exercise_name: 'Nautilus Bicep Curl',
      gym_profile_id: 'trident',
    })
    expect(result.state).toBe('CALIBRATE')
    expect(result.flags).toContain('machine_calibration')
  })
})
