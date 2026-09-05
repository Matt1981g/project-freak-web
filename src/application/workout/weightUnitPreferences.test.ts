import { describe, expect, it } from 'vitest'
import type { Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import {
  EXERCISE_WEIGHT_UNIT_SETTING_KEY,
  load_exercise_weight_unit_preferences,
  save_exercise_weight_unit_preference,
} from './weightUnitPreferences'

function repository(initial?: Setting): SettingsRepository {
  let stored = initial
  return {
    get: async (key) =>
      key === EXERCISE_WEIGHT_UNIT_SETTING_KEY ? stored : undefined,
    put: async (setting) => {
      stored = setting
      return setting.key
    },
  }
}

describe('exercise weight unit preferences', () => {
  it('defaults to kg by absence rather than storing redundant kg rows', async () => {
    expect(await load_exercise_weight_unit_preferences(repository())).toEqual({})
  })

  it('persists a unit against the canonical exercise ID', async () => {
    const repo = repository()

    await save_exercise_weight_unit_preference(
      'exercise-1',
      'lb',
      repo,
      '2026-09-05T06:00:00.000Z',
    )

    expect(await load_exercise_weight_unit_preferences(repo)).toEqual({
      'exercise-1': 'lb',
    })
  })

  it('keeps preferences for other exercises when one changes', async () => {
    const repo = repository()

    await save_exercise_weight_unit_preference(
      'exercise-1',
      'lb',
      repo,
      '2026-09-05T06:00:00.000Z',
    )
    await save_exercise_weight_unit_preference(
      'exercise-2',
      'kg',
      repo,
      '2026-09-05T06:01:00.000Z',
    )

    expect(await load_exercise_weight_unit_preferences(repo)).toEqual({
      'exercise-1': 'lb',
      'exercise-2': 'kg',
    })
  })
})
