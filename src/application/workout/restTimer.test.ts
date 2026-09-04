import { describe, expect, it } from 'vitest'
import {
  add_rest_seconds,
  pause_rest_timer,
  reset_rest_timer,
  rest_seconds_remaining,
  resume_rest_timer,
  start_rest_timer,
} from './restTimer'

describe('rest timer', () => {
  it('counts down from an absolute deadline', () => {
    const timer = start_rest_timer(90, 1_000)

    expect(rest_seconds_remaining(timer, 1_000)).toBe(90)
    expect(rest_seconds_remaining(timer, 31_000)).toBe(60)
    expect(rest_seconds_remaining(timer, 91_500)).toBe(0)
  })

  it('pauses and resumes without losing remaining time', () => {
    const started = start_rest_timer(90, 1_000)
    const paused = pause_rest_timer(started, 31_000)

    expect(paused.ends_at_ms).toBeNull()
    expect(paused.paused_remaining_seconds).toBe(60)
    expect(rest_seconds_remaining(paused, 500_000)).toBe(60)

    const resumed = resume_rest_timer(paused, 100_000)
    expect(rest_seconds_remaining(resumed, 100_000)).toBe(60)
    expect(rest_seconds_remaining(resumed, 160_000)).toBe(0)
  })

  it('adds time while running or paused', () => {
    const running = add_rest_seconds(start_rest_timer(60, 0), 30)
    expect(rest_seconds_remaining(running, 0)).toBe(90)

    const paused = add_rest_seconds(pause_rest_timer(running, 10_000), 15)
    expect(rest_seconds_remaining(paused, 999_000)).toBe(95)
  })

  it('resets back to the programmed rest duration', () => {
    const timer = add_rest_seconds(start_rest_timer(75, 0), 30)
    const reset = reset_rest_timer(timer, 20_000)

    expect(reset.planned_seconds).toBe(75)
    expect(rest_seconds_remaining(reset, 20_000)).toBe(75)
  })
})
