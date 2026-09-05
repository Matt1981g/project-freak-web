import { describe, expect, it } from 'vitest'
import {
  display_load_to_kilograms,
  kilograms_to_pounds,
  load_for_display,
  load_step_for_unit,
  pounds_to_kilograms,
  adjust_display_load_by_step,
  round_load_to_step,
} from './weightUnits'

describe('weight unit conversion', () => {
  it('converts pounds to kilograms for storage and metrics', () => {
    expect(pounds_to_kilograms(100)).toBeCloseTo(45.3592, 4)
    expect(display_load_to_kilograms(100, 'lb')).toBeCloseTo(45.3592, 4)
  })

  it('converts stored kilograms back to pounds for imperial entry', () => {
    expect(kilograms_to_pounds(45.3592)).toBeCloseTo(100, 2)
    expect(load_for_display(45.3592, 'lb')).toBeCloseTo(100, 2)
  })

  it('uses agreed gym-friendly step sizes', () => {
    expect(display_load_to_kilograms(80, 'kg')).toBe(80)
    expect(load_step_for_unit('kg')).toBe(1.25)
    expect(load_step_for_unit('lb')).toBe(5)
  })

  it('rounds converted display loads to the nearest agreed step', () => {
    expect(round_load_to_step(46.2, 'kg')).toBe(46.25)
    expect(round_load_to_step(46.9, 'kg')).toBe(47.5)
    expect(round_load_to_step(176.37, 'lb')).toBe(175)
    expect(round_load_to_step(178, 'lb')).toBe(180)

    expect(load_for_display(80, 'lb')).toBe(175)
    expect(load_for_display(pounds_to_kilograms(100), 'kg')).toBe(45)
  })

  it('allows exact manual values in storage while click controls use fixed steps', () => {
    expect(display_load_to_kilograms(46.3, 'kg')).toBe(46.3)
    expect(display_load_to_kilograms(102, 'lb')).toBeCloseTo(46.2664, 4)
    expect(adjust_display_load_by_step(46.3, 'kg', 1)).toBe(47.55)
    expect(adjust_display_load_by_step(46.3, 'kg', -1)).toBe(45.05)
    expect(adjust_display_load_by_step(102, 'lb', 1)).toBe(107)
    expect(adjust_display_load_by_step(102, 'lb', -1)).toBe(97)
  })

  it('keeps exact canonical kilograms in storage while displaying clean gym increments', () => {
    const stored_from_100_lb = display_load_to_kilograms(100, 'lb')
    expect(stored_from_100_lb).toBeCloseTo(45.3592, 4)
    expect(load_for_display(stored_from_100_lb, 'kg')).toBe(45)
    expect(load_for_display(stored_from_100_lb, 'lb')).toBe(100)
  })
})
