import type { JsonValue, Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import type { WeightEntryUnit } from './weightUnits'

export const EXERCISE_WEIGHT_UNIT_SETTING_KEY = 'exercise-weight-units-v1'

export type ExerciseWeightUnitPreferences = Record<string, WeightEntryUnit>

interface ExerciseWeightUnitState {
  schema_version: '1.0.0'
  units: ExerciseWeightUnitPreferences
}

function parse_unit(value: unknown): WeightEntryUnit | null {
  return value === 'kg' || value === 'lb' ? value : null
}

function parse_state(value: JsonValue): ExerciseWeightUnitState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, JsonValue>
  const units = record.units
  if (!units || typeof units !== 'object' || Array.isArray(units)) return null

  const parsed: ExerciseWeightUnitPreferences = {}
  for (const [exercise_id, unit] of Object.entries(units)) {
    const valid = parse_unit(unit)
    if (valid) parsed[exercise_id] = valid
  }

  return {
    schema_version: '1.0.0',
    units: parsed,
  }
}

export async function load_exercise_weight_unit_preferences(
  repository: SettingsRepository,
): Promise<ExerciseWeightUnitPreferences> {
  const stored = await repository.get(EXERCISE_WEIGHT_UNIT_SETTING_KEY)
  const parsed = stored ? parse_state(stored.value_json) : null
  return parsed?.units ?? {}
}

export async function save_exercise_weight_unit_preference(
  exercise_id: string,
  unit: WeightEntryUnit,
  repository: SettingsRepository,
  now_iso: string,
): Promise<ExerciseWeightUnitPreferences> {
  const current = await load_exercise_weight_unit_preferences(repository)
  const next: ExerciseWeightUnitPreferences = {
    ...current,
    [exercise_id]: unit,
  }

  const state: ExerciseWeightUnitState = {
    schema_version: '1.0.0',
    units: next,
  }

  const setting: Setting = {
    key: EXERCISE_WEIGHT_UNIT_SETTING_KEY,
    scope: 'global',
    value_json: state as unknown as JsonValue,
    updated_at: now_iso,
    device_id: null,
  }

  await repository.put(setting)
  return next
}
