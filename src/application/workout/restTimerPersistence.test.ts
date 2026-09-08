import { describe, expect, it } from 'vitest'
import {
  load_stored_rest_timer,
  parse_stored_rest_timer,
  rest_timer_storage_key,
} from './restTimerPersistence'

describe('rest timer persistence', () => {
  it('uses a session-scoped storage key', () => {
    expect(rest_timer_storage_key('session-1')).toBe(
      'project-freak:rest-timer:session-1',
    )
  })

  it('restores valid timer state and normalises optional navigation fields', () => {
    const timer = parse_stored_rest_timer(
      JSON.stringify({
        planned_seconds: 90,
        ends_at_ms: 12345,
        paused_remaining_seconds: null,
        exercise_id: 'sx-1',
        exercise_name: 'Curl',
      }),
    )

    expect(timer).toEqual({
      planned_seconds: 90,
      ends_at_ms: 12345,
      paused_remaining_seconds: null,
      exercise_id: 'sx-1',
      exercise_name: 'Curl',
      next_exercise_id: null,
      next_exercise_name: null,
      next_exercise_label: null,
    })
  })

  it('rejects malformed timer state without throwing', () => {
    expect(parse_stored_rest_timer('{bad json')).toBeNull()
    expect(
      parse_stored_rest_timer(
        JSON.stringify({
          planned_seconds: 90,
          ends_at_ms: 'wrong',
          paused_remaining_seconds: null,
          exercise_id: 'sx-1',
          exercise_name: 'Curl',
        }),
      ),
    ).toBeNull()
  })

  it('loads through an injected storage boundary', () => {
    const storage = {
      getItem: (key: string) =>
        key === rest_timer_storage_key('session-2')
          ? JSON.stringify({
              planned_seconds: 60,
              ends_at_ms: null,
              paused_remaining_seconds: 30,
              exercise_id: 'sx-2',
              exercise_name: 'Row',
              next_exercise_id: 'sx-3',
              next_exercise_name: 'Press',
              next_exercise_label: '2',
            })
          : null,
    }

    expect(load_stored_rest_timer('session-2', storage)).toEqual(
      expect.objectContaining({
        planned_seconds: 60,
        paused_remaining_seconds: 30,
        next_exercise_id: 'sx-3',
      }),
    )
  })
})
