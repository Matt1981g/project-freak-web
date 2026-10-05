import { describe, expect, it } from 'vitest'
import {
  final_working_set_number,
  is_final_working_set,
} from './finalSetDetection'

describe('final set detection', () => {
  it('uses the last programmed working set and ignores warmups', () => {
    const planned_sets = [
      { set: { set_number: 1, set_role: 'warmup' } },
      { set: { set_number: 2, set_role: 'work' } },
      { set: { set_number: 3, set_role: 'work' } },
      { set: { set_number: 4, set_role: 'work' } },
    ]

    expect(final_working_set_number(planned_sets, 4)).toBe(4)
    expect(
      is_final_working_set({
        next_set_number: 4,
        planned_sets,
        fallback_target_sets: 4,
      }),
    ).toBe(true)
    expect(
      is_final_working_set({
        next_set_number: 3,
        planned_sets,
        fallback_target_sets: 4,
      }),
    ).toBe(false)
  })

  it('uses the explicit exercise target when programmed sets are unavailable', () => {
    expect(final_working_set_number([], 3)).toBe(3)
    expect(
      is_final_working_set({
        next_set_number: 3,
        planned_sets: [],
        fallback_target_sets: 3,
      }),
    ).toBe(true)
  })

  it('fails closed when PF cannot prove which set is final', () => {
    expect(final_working_set_number([], null)).toBeNull()
    expect(
      is_final_working_set({
        next_set_number: 1,
        planned_sets: [],
        fallback_target_sets: null,
      }),
    ).toBe(false)
  })
})
