export type WeightEntryUnit = 'kg' | 'lb'

const POUNDS_PER_KILOGRAM = 2.2046226218487757

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function kilograms_to_pounds(value_kg: number): number {
  return round(value_kg * POUNDS_PER_KILOGRAM, 2)
}

export function pounds_to_kilograms(value_lb: number): number {
  return round(value_lb / POUNDS_PER_KILOGRAM, 4)
}

export function round_load_to_step(
  value: number,
  unit: WeightEntryUnit,
): number {
  const step = load_step_for_unit(unit)
  const rounded = Math.round((value + Number.EPSILON) / step) * step
  return round(rounded, unit === 'kg' ? 1 : 0)
}

export function load_for_display(
  load_kg: number | null,
  unit: WeightEntryUnit,
): number | null {
  if (load_kg === null) return null
  const converted =
    unit === 'kg' ? load_kg : kilograms_to_pounds(load_kg)
  return round_load_to_step(converted, unit)
}

export function display_load_to_kilograms(
  value: number | null,
  unit: WeightEntryUnit,
): number | null {
  if (value === null) return null
  return unit === 'kg' ? value : pounds_to_kilograms(value)
}

export function load_step_for_unit(unit: WeightEntryUnit): number {
  return unit === 'kg' ? 2.5 : 5
}
