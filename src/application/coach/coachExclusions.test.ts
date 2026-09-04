import { describe, expect, it } from 'vitest'
import type { Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import {
  COACH_EXCLUDED_SESSIONS_SETTING_KEY,
  load_coach_excluded_sessions,
  set_session_coach_excluded,
} from './coachExclusions'

function repository_fixture(initial?: Setting) {
  let stored = initial

  const repository: SettingsRepository = {
    get: async (key) => (stored?.key === key ? stored : undefined),
    put: async (setting) => {
      stored = setting
      return setting.key
    },
  }

  return {
    repository,
    stored: () => stored,
  }
}

describe('Coach session exclusions', () => {
  it('defaults to no excluded sessions', async () => {
    const fixture = repository_fixture()
    await expect(
      load_coach_excluded_sessions(fixture.repository),
    ).resolves.toEqual({
      schema_version: '1.0.0',
      session_ids: [],
    })
  })

  it('adds and removes a session without touching workout data', async () => {
    const fixture = repository_fixture()

    const excluded = await set_session_coach_excluded(
      'session-test',
      true,
      fixture.repository,
      { now_iso: '2026-09-04T19:00:00.000Z' },
    )

    expect(excluded.session_ids).toEqual(['session-test'])
    expect(fixture.stored()).toMatchObject({
      key: COACH_EXCLUDED_SESSIONS_SETTING_KEY,
      scope: 'global',
      device_id: null,
    })

    const included = await set_session_coach_excluded(
      'session-test',
      false,
      fixture.repository,
      { now_iso: '2026-09-04T19:01:00.000Z' },
    )

    expect(included.session_ids).toEqual([])
  })
})
