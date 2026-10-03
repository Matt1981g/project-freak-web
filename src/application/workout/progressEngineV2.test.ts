import { describe, expect, it } from 'vitest'
import {
  PROGRESS_ENGINE_V2_RULES,
  assess_poor_machine_response,
  build_machine_response_profiles,
  evaluate_progress_engine_fatigue,
  hypertrophy_response_score,
  infer_progression_class,
  is_high_quality,
  is_quality_qualified,
  run_progress_engine_regression,
  run_progress_engine_v2,
  type CurrentProgressionContext,
  type ProgressEngineInput,
  type ProgressionExposure,
  type ProgressionTarget,
} from './progressEngineV2'

const targets: ProgressionTarget[] = [
  { set_number: 1, target_rep_min: 8, target_rep_max: 12 },
  { set_number: 2, target_rep_min: 8, target_rep_max: 12 },
  { set_number: 3, target_rep_min: 8, target_rep_max: 12 },
]

const current: CurrentProgressionContext = {
  exercise_id: 'exercise-1',
  exercise_name: 'Machine Curl',
  progression_class: 'C',
  gym_profile_id: 'trident',
  equipment_profile_id: 'machine-a',
  equipment_label: 'Machine A',
  setup_notes: 'seat 4',
  equipment_comparable: true,
  is_superset: false,
  is_substitution: false,
  is_dumbbell: false,
  is_lower_body: false,
}

function exposure(
  id: string,
  overrides: Partial<ProgressionExposure> = {},
): ProgressionExposure {
  return {
    id,
    session_id: `session-${id}`,
    session_date_local: `2026-09-${id.padStart(2, '0')}`,
    exercise_id: current.exercise_id,
    gym_profile_id: current.gym_profile_id,
    equipment_profile_id: current.equipment_profile_id,
    equipment_label: current.equipment_label,
    setup_notes: current.setup_notes,
    equipment_comparable: true,
    progression_class: current.progression_class,
    is_superset: false,
    is_deload: false,
    is_substitution: false,
    sets: [
      { set_number: 1, load_kg: 50, completed_reps: 10, failure_status: 'none' },
      { set_number: 2, load_kg: 50, completed_reps: 10, failure_status: 'none' },
      { set_number: 3, load_kg: 50, completed_reps: 10, failure_status: 'none' },
    ],
    metrics: { rpe: 9, pump: 8, form: 9 },
    ...overrides,
  }
}

function input(
  exposures: ProgressionExposure[],
  overrides: Partial<ProgressEngineInput> = {},
): ProgressEngineInput {
  return {
    current,
    targets,
    exposures,
    ...overrides,
  }
}

describe('Progress Engine V2 constants', () => {
  it('locks the agreed hierarchy and thresholds', () => {
    expect(PROGRESS_ENGINE_V2_RULES.hierarchy).toEqual([
      'form',
      'stimulus',
      'reps',
      'load',
    ])
    expect(PROGRESS_ENGINE_V2_RULES.good_form).toBe(8)
    expect(PROGRESS_ENGINE_V2_RULES.good_pump).toBe(7)
    expect(PROGRESS_ENGINE_V2_RULES.calibration_exposures).toBe(2)
    expect(PROGRESS_ENGINE_V2_RULES.reset_required_poor_exposures).toBe(2)
    expect(PROGRESS_ENGINE_V2_RULES.reset_window).toBe(3)
    expect(PROGRESS_ENGINE_V2_RULES.set_dropoff_percent).toBe(30)
    expect(PROGRESS_ENGINE_V2_RULES.deload_load_percent).toEqual([10, 20])
    expect(PROGRESS_ENGINE_V2_RULES.deload_set_percent).toEqual([30, 50])
  })

  it('uses the agreed response-score weights', () => {
    expect(PROGRESS_ENGINE_V2_RULES.response_weights).toEqual({
      form: 0.4,
      pump: 0.35,
      reps: 0.15,
      rpe: 0.1,
    })
  })
})

describe('exercise progression classes', () => {
  it('classifies high-rep and isolation work conservatively', () => {
    expect(
      infer_progression_class({
        exercise_name: 'DB Lateral Raise',
        target_rep_max: 20,
      }),
    ).toBe('D')
    expect(
      infer_progression_class({ exercise_name: 'Nautilus Bicep Curl' }),
    ).toBe('C')
  })

  it('classifies high-fatigue compounds separately', () => {
    expect(
      infer_progression_class({ exercise_name: 'Pendulum Squat' }),
    ).toBe('A')
  })
})

describe('quality gates', () => {
  it('requires Form, stimulus and credible RPE for qualified history', () => {
    expect(is_quality_qualified(exposure('1'))).toBe(true)
    expect(is_high_quality(exposure('1'))).toBe(true)
    expect(is_high_quality(exposure('1', { metrics: { rpe: 9, pump: 6, form: 9 } }))).toBe(false)
    expect(is_high_quality(exposure('1', { metrics: { rpe: 9, pump: 9, form: 7 } }))).toBe(false)
  })

  it('computes a hypertrophy response score from Form, Pump, reps and RPE', () => {
    const score = hypertrophy_response_score(exposure('1'), targets)
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThan(8)
  })
})

describe('calibration and machine identity', () => {
  it('calibrates until two valid exposures exist on the same setup', () => {
    expect(run_progress_engine_v2(input([])).state).toBe('CALIBRATE')
    expect(run_progress_engine_v2(input([exposure('1')])).state).toBe(
      'CALIBRATE',
    )
  })

  it('does not borrow a baseline from another machine', () => {
    const other_machine = exposure('1', {
      equipment_profile_id: 'machine-b',
      equipment_label: 'Machine B',
    })
    expect(run_progress_engine_v2(input([other_machine, exposure('2')])).state).toBe(
      'CALIBRATE',
    )
  })
})

describe('normal progression', () => {
  it('uses REPS_UP before load when quality is high but top reps are not reached', () => {
    const result = run_progress_engine_v2(
      input([exposure('2'), exposure('1')]),
    )
    expect(result.state).toBe('REPS_UP')
    expect(result.adjustment.kind).toBe('none')
  })

  it('allows LOAD_UP only after all upper rep targets and quality gates pass', () => {
    const top = (id: string) =>
      exposure(id, {
        sets: [
          { set_number: 1, load_kg: 50, completed_reps: 12, failure_status: 'none' },
          { set_number: 2, load_kg: 50, completed_reps: 12, failure_status: 'none' },
          { set_number: 3, load_kg: 50, completed_reps: 12, failure_status: 'none' },
        ],
      })
    const result = run_progress_engine_v2(input([top('2'), top('1')]))
    expect(result.state).toBe('LOAD_UP')
    expect(result.adjustment.percent_min).toBe(2.5)
    expect(result.adjustment.percent_max).toBe(5)
  })

  it('blocks LOAD_UP when Form is below 8', () => {
    const top = exposure('2', {
      metrics: { rpe: 9, pump: 9, form: 7 },
      sets: targets.map((target) => ({
        set_number: target.set_number,
        load_kg: 50,
        completed_reps: 12,
        failure_status: 'none',
      })),
    })
    const result = run_progress_engine_v2(input([top, exposure('1')]))
    expect(result.state).not.toBe('LOAD_UP')
  })

  it('holds when reps miss the range without a high-RPE collapse', () => {
    const latest = exposure('2', {
      sets: [
        { set_number: 1, load_kg: 50, completed_reps: 10, failure_status: 'none' },
        { set_number: 2, load_kg: 50, completed_reps: 9, failure_status: 'none' },
        { set_number: 3, load_kg: 50, completed_reps: 7, failure_status: 'none' },
      ],
      metrics: { rpe: 9, pump: 8, form: 9 },
    })
    expect(run_progress_engine_v2(input([latest, exposure('1')])).state).toBe(
      'HOLD',
    )
  })
})

describe('corrective actions', () => {
  it('uses LOAD_DOWN for poor Form below the minimum threshold', () => {
    const latest = exposure('3', {
      metrics: { rpe: 9, pump: 8, form: 6 },
    })
    const result = run_progress_engine_v2(
      input([latest, exposure('2'), exposure('1')]),
    )
    expect(result.state).toBe('LOAD_DOWN')
    expect(result.adjustment.percent_min).toBe(2.5)
    expect(result.adjustment.percent_max).toBe(5)
  })

  it('uses RESET when two of the last three exposures show poor quality', () => {
    const bad = (id: string) =>
      exposure(id, {
        metrics: { rpe: 9.5, pump: 6, form: 7 },
      })
    const result = run_progress_engine_v2(
      input([bad('3'), bad('2'), exposure('1')]),
    )
    expect(result.state).toBe('RESET')
    expect(result.adjustment.percent_min).toBe(5)
    expect(result.adjustment.percent_max).toBe(10)
  })

  it('permits a 10-15% severe reset when quality has seriously broken down', () => {
    const severe = exposure('3', {
      metrics: { rpe: 10, pump: 4, form: 5 },
      technique_breakdown: true,
    })
    const second_bad = exposure('2', {
      metrics: { rpe: 9.5, pump: 6, form: 7 },
    })
    const result = run_progress_engine_v2(
      input([severe, second_bad, exposure('1')]),
    )
    expect(result.state).toBe('RESET')
    expect(result.adjustment.percent_min).toBe(10)
    expect(result.adjustment.percent_max).toBe(15)
  })

  it('detects more than 30% set-to-set rep deterioration', () => {
    const latest = exposure('2', {
      sets: [
        { set_number: 1, load_kg: 50, completed_reps: 12, failure_status: 'none' },
        { set_number: 2, load_kg: 50, completed_reps: 9, failure_status: 'none' },
        { set_number: 3, load_kg: 50, completed_reps: 8, failure_status: 'none' },
      ],
    })
    const result = run_progress_engine_v2(input([latest, exposure('1')]))
    expect(result.state).toBe('LOAD_DOWN')
    expect(result.flags).toContain('material_deterioration')
  })
})

describe('failure and plateau rules', () => {
  it('blocks routine RPE 10 progression on class A compounds', () => {
    const compound_current = {
      ...current,
      progression_class: 'A' as const,
      exercise_name: 'Pendulum Squat',
      is_lower_body: true,
    }
    const compound = (id: string) =>
      exposure(id, {
        progression_class: 'A',
        metrics: { rpe: 10, pump: 8, form: 9 },
      })
    const result = run_progress_engine_v2({
      ...input([compound('2'), compound('1')]),
      current: compound_current,
    })
    expect(result.state).toBe('HOLD')
    expect(result.flags).toContain('compound_failure_gate')
  })

  it('flags a true three-exposure plateau rather than adding load automatically', () => {
    const result = run_progress_engine_v2(
      input([exposure('3'), exposure('2'), exposure('1')]),
    )
    expect(result.state).toBe('REVIEW')
    expect(result.flags).toContain('plateau_review')
  })
})

describe('adaptive fatigue and deload', () => {
  it('raises FATIGUE_WATCH after two consecutive sessions with 3+ indicators', () => {
    const fatigue = evaluate_progress_engine_fatigue([
      { session_id: '1', session_date_local: '2026-09-01', indicators: ['rpe', 'pump', 'form'] },
      { session_id: '2', session_date_local: '2026-09-02', indicators: ['rpe', 'reps', 'form'] },
    ])
    expect(fatigue.state).toBe('FATIGUE_WATCH')
  })

  it('raises DELOAD after the pattern persists for three sessions', () => {
    const sessions = [1, 2, 3].map((value) => ({
      session_id: String(value),
      session_date_local: `2026-09-0${value}`,
      indicators: ['rpe', 'pump', 'form'],
    }))
    const fatigue = evaluate_progress_engine_fatigue(sessions)
    expect(fatigue.state).toBe('DELOAD')

    const result = run_progress_engine_v2({
      ...input([exposure('2'), exposure('1')]),
      fatigue_sessions: sessions,
    })
    expect(result.state).toBe('DELOAD_HOLD')
    expect(result.adjustment.percent_min).toBe(10)
    expect(result.adjustment.percent_max).toBe(20)
    expect(result.adjustment.set_reduction_percent_min).toBe(30)
    expect(result.adjustment.set_reduction_percent_max).toBe(50)
  })

  it('excludes deload exposures from the normal trusted baseline', () => {
    const deload = exposure('3', { is_deload: true })
    const result = run_progress_engine_v2(
      input([deload, exposure('2'), exposure('1')]),
    )
    expect(result.state).toBe('REPS_UP')
  })
})

describe('historical regression harness', () => {
  it('replays history without using future exposures', () => {
    const rows = run_progress_engine_regression(
      input([exposure('1'), exposure('2'), exposure('3')]),
    )

    expect(rows).toHaveLength(3)
    expect(rows[0].decision.state).toBe('CALIBRATE')
    expect(rows[1].decision.state).toBe('REPS_UP')
    expect(rows[2].decision.state).toBe('REVIEW')
    expect(rows[2].decision.flags).toContain('plateau_review')
  })
})

describe('machine response profiles', () => {
  it('does not judge a machine before three exposures', () => {
    const profiles = build_machine_response_profiles(
      [exposure('1'), exposure('2')],
      targets,
    )
    const assessment = assess_poor_machine_response(profiles[0], [])
    expect(assessment.low_response).toBe(false)
  })

  it('flags a materially lower sampled machine response', () => {
    const current_machine = [
      exposure('1', { metrics: { rpe: 9, pump: 7, form: 8 } }),
      exposure('2', { metrics: { rpe: 9, pump: 7, form: 8 } }),
      exposure('3', { metrics: { rpe: 9, pump: 7, form: 8 } }),
    ]
    const alternative = [
      exposure('4', {
        equipment_profile_id: 'machine-b',
        equipment_label: 'Machine B',
        metrics: { rpe: 9, pump: 10, form: 10 },
      }),
      exposure('5', {
        equipment_profile_id: 'machine-b',
        equipment_label: 'Machine B',
        metrics: { rpe: 9, pump: 10, form: 10 },
      }),
      exposure('6', {
        equipment_profile_id: 'machine-b',
        equipment_label: 'Machine B',
        metrics: { rpe: 9, pump: 10, form: 10 },
      }),
    ]

    const profiles = build_machine_response_profiles(
      [...current_machine, ...alternative],
      targets,
    )
    const profile_a = profiles.find(
      (profile) => profile.equipment_profile_id === 'machine-a',
    )!
    const assessment = assess_poor_machine_response(profile_a, profiles)
    expect(assessment.low_response).toBe(true)
  })
})
