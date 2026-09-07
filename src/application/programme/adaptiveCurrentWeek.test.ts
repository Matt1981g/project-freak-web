import { describe, expect, it } from 'vitest'
import {
  decide_current_week_progression,
  progressed_load_kg,
} from './adaptiveCurrentWeek'

const good = { form: 9, pump: 9, legacy_mmc: null }

describe('adaptive current week', () => {
  it('increases load only when every comparable set reaches the top with valid form and stimulus', () => {
    const decision = decide_current_week_progression(good, [
      { set_number: 1, load_kg: 40, completed_reps: 12, target_rep_min: 8, target_rep_max: 12 },
      { set_number: 2, load_kg: 40, completed_reps: 12, target_rep_min: 8, target_rep_max: 12 },
    ])

    expect(decision.verdict).toBe('increase_load')
  })

  it('holds load when form has not cleared the execution gate', () => {
    const decision = decide_current_week_progression(
      { form: 8, pump: 9, legacy_mmc: null },
      [{ set_number: 1, load_kg: 40, completed_reps: 12, target_rep_min: 8, target_rep_max: 12 }],
    )

    expect(decision.verdict).toBe('hold_load')
  })

  it('holds load when target-muscle sensation is poor', () => {
    const decision = decide_current_week_progression(
      { form: 10, pump: 6, legacy_mmc: null },
      [{ set_number: 1, load_kg: 40, completed_reps: 12, target_rep_min: 8, target_rep_max: 12 }],
    )

    expect(decision.verdict).toBe('hold_load')
  })

  it('keeps the achieved load and asks for reps before load', () => {
    const decision = decide_current_week_progression(good, [
      { set_number: 1, load_kg: 40, completed_reps: 10, target_rep_min: 8, target_rep_max: 12 },
      { set_number: 2, load_kg: 40, completed_reps: 9, target_rep_min: 8, target_rep_max: 12 },
    ])

    expect(decision.verdict).toBe('add_reps')
  })

  it('does not invent progression when form is missing', () => {
    const decision = decide_current_week_progression(
      { form: null, pump: 9, legacy_mmc: null },
      [{ set_number: 1, load_kg: 40, completed_reps: 12, target_rep_min: 8, target_rep_max: 12 }],
    )

    expect(decision.verdict).toBe('insufficient_data')
  })

  it('uses the configured entry increment for kg and lb', () => {
    expect(progressed_load_kg(40, 'kg')).toBe(41.25)
    expect(progressed_load_kg(40.3, 'kg')).toBe(41.55)
    expect(progressed_load_kg(40.8233, 'lb')).toBeCloseTo(43.0913, 3)
  })
})
