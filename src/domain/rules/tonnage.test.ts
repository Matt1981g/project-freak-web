import { describe, expect, it } from 'vitest'
import {
  COMPARABLE_TONNAGE_METHOD,
  calculate_comparable_tonnage,
} from './tonnage'

describe('calculate_comparable_tonnage', () => {
  it('counts only completed reps for a failure set', () => {
    expect(
      calculate_comparable_tonnage({
        load_kg: 25,
        load_type: 'normal',
        rep_mode: 'total',
        primary_reps_completed: 13,
      }),
    ).toEqual({
      value: 325,
      method: COMPARABLE_TONNAGE_METHOD,
    })
  })

  it('adds an explicitly recorded rest-pause component', () => {
    expect(
      calculate_comparable_tonnage({
        load_kg: 25,
        load_type: 'normal',
        rep_mode: 'total',
        primary_reps_completed: 14,
        components: [
          {
            component_type: 'rest_pause',
            load_kg: 25,
            load_type: 'normal',
            reps_completed_full: 4,
            counts_toward_comparable_tonnage: true,
          },
        ],
      }).value,
    ).toBe(450)
  })

  it('adds a quantified drop component', () => {
    expect(
      calculate_comparable_tonnage({
        load_kg: 16,
        load_type: 'normal',
        rep_mode: 'total',
        primary_reps_completed: 16,
        components: [
          {
            component_type: 'drop',
            load_kg: 12,
            load_type: 'normal',
            reps_completed_full: 4,
            counts_toward_comparable_tonnage: true,
          },
        ],
      }).value,
    ).toBe(304)
  })

  it('excludes partial repetitions from comparable tonnage', () => {
    expect(
      calculate_comparable_tonnage({
        load_kg: 56,
        load_type: 'normal',
        rep_mode: 'total',
        primary_reps_completed: 16,
        components: [
          {
            component_type: 'partials',
            load_kg: 56,
            load_type: 'normal',
            reps_completed_full: 8,
            counts_toward_comparable_tonnage: false,
          },
        ],
      }).value,
    ).toBe(896)
  })

  it.each(['assistance', 'band_plus_machine'] as const)(
    'returns null for non-comparable %s resistance',
    (load_type) => {
      expect(
        calculate_comparable_tonnage({
          load_kg: 25,
          load_type,
          rep_mode: 'total',
          primary_reps_completed: 10,
        }),
      ).toEqual({ value: null, method: null })
    },
  )

  it('returns null for timed holds', () => {
    expect(
      calculate_comparable_tonnage({
        load_kg: 40,
        load_type: 'normal',
        rep_mode: 'timed',
        primary_reps_completed: null,
      }),
    ).toEqual({ value: null, method: null })
  })
})
