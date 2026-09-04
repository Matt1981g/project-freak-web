import { describe, expect, it } from 'vitest'
import type { ExerciseMetrics } from '../../domain/models'
import type { PreviousComparablePerformance } from './previousComparable'
import { build_progression_suggestion } from './progressionSuggestion'

function previous(
  overrides: Partial<PreviousComparablePerformance> = {},
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
        completed_reps: 10,
        failure_status: 'none',
        volume_kg: 450,
      },
      {
        set_number: 2,
        load_kg: 45,
        completed_reps: 10,
        failure_status: 'none',
        volume_kg: 450,
      },
    ],
    metrics,
    total_volume_kg: 900,
    ...overrides,
  }
}

const targets = [
  { set_number: 1, target_rep_min: 8, target_rep_max: 12 },
  { set_number: 2, target_rep_min: 8, target_rep_max: 12 },
]

describe('build_progression_suggestion', () => {
  it('returns insufficient data without previous comparable performance', () => {
    expect(build_progression_suggestion(null, targets).label).toBe(
      'INSUFFICIENT DATA',
    )
  })

  it('holds load when previous form was degraded', () => {
    expect(
      build_progression_suggestion(previous({}, { form: 7 }), targets).label,
    ).toBe('HOLD LOAD')
  })

  it('holds load when previous form was acceptable but imperfect', () => {
    expect(
      build_progression_suggestion(previous({}, { form: 8 }), targets).label,
    ).toBe('HOLD LOAD')
  })

  it('holds load when target-muscle sensation was poor', () => {
    expect(
      build_progression_suggestion(previous({}, { form: 10, pump: 6 }), targets)
        .label,
    ).toBe('HOLD LOAD')
  })

  it('adds reps when a comparable set is below the programmed range', () => {
    const result = build_progression_suggestion(
      previous({
        sets: [
          {
            set_number: 1,
            load_kg: 45,
            completed_reps: 7,
            failure_status: 'attempted_next_rep_failed',
            volume_kg: 315,
          },
          {
            set_number: 2,
            load_kg: 45,
            completed_reps: 10,
            failure_status: 'none',
            volume_kg: 450,
          },
        ],
      }),
      targets,
    )

    expect(result.label).toBe('ADD REPS')
  })

  it('adds reps when execution is valid but the top of the range is not reached', () => {
    expect(build_progression_suggestion(previous(), targets).label).toBe(
      'ADD REPS',
    )
  })

  it('considers load increase only after form, sensation and all upper rep targets are satisfied', () => {
    const result = build_progression_suggestion(
      previous({
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
            failure_status: 'attempted_next_rep_failed',
            volume_kg: 540,
          },
        ],
      }),
      targets,
    )

    expect(result.label).toBe('CONSIDER LOAD INCREASE')
  })

  it('refuses a load-increase suggestion when target-muscle sensation was not recorded', () => {
    const result = build_progression_suggestion(
      previous(
        {
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
        },
        { pump: null, legacy_mmc: null },
      ),
      targets,
    )

    expect(result.label).toBe('INSUFFICIENT DATA')
  })
})
