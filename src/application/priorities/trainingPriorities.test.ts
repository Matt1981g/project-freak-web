import { describe, expect, it } from 'vitest'
import type { Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import {
  TRAINING_PRIORITY_AREAS,
  load_training_priorities,
  move_priority,
  save_training_intents,
  save_training_priorities,
} from './trainingPriorities'

function repository_fixture() {
  const values = new Map<string, Setting>()

  const repository: SettingsRepository = {
    get: async (key) => values.get(key),
    put: async (setting) => {
      values.set(setting.key, setting)
      return setting.key
    },
  }

  return { repository, values }
}

describe('training priorities', () => {
  it('starts unconfigured with the 12 allowed areas in the supplied order', async () => {
    const fixture = repository_fixture()
    const state = await load_training_priorities(fixture.repository)

    expect(state.configured).toBe(false)
    expect(state.current).toEqual(TRAINING_PRIORITY_AREAS)
    expect(state.history).toEqual([])
    expect(Object.values(state.intent_by_area).every((value) => value === 'grow')).toBe(true)
  })

  it('moves one priority directly to a new rank', () => {
    const moved = move_priority(TRAINING_PRIORITY_AREAS, 11, 0)

    expect(moved[0]).toBe('Chest')
    expect(moved[1]).toBe('Biceps')
    expect(moved).toHaveLength(12)
  })

  it('saves one dated snapshot and replaces same-day edits', async () => {
    const fixture = repository_fixture()

    await save_training_priorities(
      move_priority(TRAINING_PRIORITY_AREAS, 11, 0),
      fixture.repository,
      {
        local_date: '2026-09-04',
        now_iso: '2026-09-04T18:00:00.000Z',
      },
    )

    const final_order = move_priority(TRAINING_PRIORITY_AREAS, 1, 0)
    const state = await save_training_priorities(
      final_order,
      fixture.repository,
      {
        local_date: '2026-09-04',
        now_iso: '2026-09-04T18:05:00.000Z',
      },
    )

    expect(state.configured).toBe(true)
    expect(state.current).toEqual(final_order)
    expect(state.history).toHaveLength(1)
    expect(state.history[0].ordered_areas).toEqual(final_order)
  })

  it('stores Grow / Maintain intent without changing priority order', async () => {
    const fixture = repository_fixture()
    const initial = await load_training_priorities(fixture.repository)
    const intents = { ...initial.intent_by_area, Chest: 'maintain' as const }

    const state = await save_training_intents(intents, fixture.repository, {
      now_iso: '2026-09-04T18:00:00.000Z',
    })

    expect(state.current).toEqual(TRAINING_PRIORITY_AREAS)
    expect(state.intent_by_area.Chest).toBe('maintain')
    expect(state.intent_by_area.Biceps).toBe('grow')
  })

  it('keeps older dated priority snapshots for future Coach Bridge context', async () => {
    const fixture = repository_fixture()

    await save_training_priorities(
      TRAINING_PRIORITY_AREAS,
      fixture.repository,
      {
        local_date: '2026-09-04',
        now_iso: '2026-09-04T18:00:00.000Z',
      },
    )

    const next_order = move_priority(TRAINING_PRIORITY_AREAS, 6, 0)
    const state = await save_training_priorities(
      next_order,
      fixture.repository,
      {
        local_date: '2026-10-01',
        now_iso: '2026-10-01T07:00:00.000Z',
      },
    )

    expect(state.history).toHaveLength(2)
    expect(state.history[0].effective_from_date_local).toBe('2026-09-04')
    expect(state.history[1].effective_from_date_local).toBe('2026-10-01')
    expect(state.current[0]).toBe('Quads')
  })
})
