import { describe, expect, it } from 'vitest'
import type { Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import {
  availability_is_complete,
  build_next_week_availability_instruction,
  default_next_week_availability,
  load_next_week_availability,
  next_week_start_date,
  save_next_week_availability,
} from './nextWeekAvailability'

function settings_repository(initial?: Setting): SettingsRepository {
  let value = initial

  return {
    get: async () => value,
    put: async (setting) => {
      value = setting
      return setting.key
    },
  }
}

describe('next-week Coach availability', () => {
  it('uses the following Monday as the next block start', () => {
    expect(next_week_start_date('2026-10-03')).toBe('2026-10-05')
    expect(next_week_start_date('2026-10-05')).toBe('2026-10-12')
  })

  it('defaults every day to unspecified rather than inventing a schedule', () => {
    const state = default_next_week_availability('2026-10-03')
    expect(state.week_start_date_local).toBe('2026-10-05')
    expect(
      Object.values(state.days).every(
        (day) => day.status === 'unspecified' && day.max_minutes === null,
      ),
    ).toBe(true)
    expect(availability_is_complete(state)).toBe(false)
  })

  it('turns saved availability into dated hard scheduling evidence', () => {
    const state = default_next_week_availability('2026-10-03')
    state.days.monday = { status: 'available', max_minutes: 90 }
    state.days.tuesday = { status: 'unavailable', max_minutes: null }
    state.days.wednesday = { status: 'available', max_minutes: 90 }
    state.days.thursday = { status: 'available', max_minutes: 90 }
    state.days.friday = { status: 'available', max_minutes: 90 }
    state.days.saturday = { status: 'long_session', max_minutes: 120 }
    state.days.sunday = { status: 'unavailable', max_minutes: null }

    const instruction = build_next_week_availability_instruction(state)

    expect(instruction.complete).toBe(true)
    expect(instruction.source).toBe('coach_screen')
    expect(instruction.days.monday.date_local).toBe('2026-10-05')
    expect(instruction.days.saturday).toMatchObject({
      date_local: '2026-10-10',
      status: 'long_session',
      max_minutes: 120,
    })
    expect(instruction.scheduling_rule).toContain(
      'never programme training on a day marked unavailable',
    )
  })

  it('does not reuse a previous week availability record', async () => {
    const repo = settings_repository({
      key: 'coach-next-week-availability-v1',
      scope: 'global',
      value_json: {
        schema_version: '1.0.0',
        week_start_date_local: '2026-10-05',
        days: {
          monday: { status: 'available', max_minutes: 90 },
        },
      },
      updated_at: '2026-10-03T12:00:00.000Z',
      device_id: null,
    })

    const state = await load_next_week_availability(repo, '2026-10-05')
    expect(state.week_start_date_local).toBe('2026-10-12')
    expect(state.days.monday.status).toBe('unspecified')
  })

  it('persists only the current next-week block', async () => {
    const repo = settings_repository()
    const state = default_next_week_availability('2026-10-03')
    state.days.monday = { status: 'available', max_minutes: 95 }

    const saved = await save_next_week_availability(state, repo, {
      current_local_date: '2026-10-03',
      now_iso: '2026-10-03T12:00:00.000Z',
    })

    expect(saved.days.monday).toEqual({
      status: 'available',
      max_minutes: 95,
    })

    const loaded = await load_next_week_availability(repo, '2026-10-03')
    expect(loaded.days.monday.max_minutes).toBe(95)
  })
})
