import { describe, expect, it } from 'vitest'
import { summarise_exercise_enjoyment } from './exerciseEnjoyment'

function exposure(session: number, enjoyment: number, pump = 8, form = 9) {
  return {
    session_id: `session-${session}`,
    date: `2026-10-${String(session).padStart(2, '0')}`,
    enjoyment, pump, form,
  }
}

describe('PF19 enjoyment intelligence', () => {
  it('does not infer an exercise preference from fewer than three ratings', () => {
    const result = summarise_exercise_enjoyment('curl', 'Curl', 'trident', [
      exposure(1, 10), exposure(2, 10),
    ])
    expect(result?.samples).toBe(2)
    expect(result?.status).toBe('insufficient_evidence')
    expect(result?.trend).toBeNull()
  })

  it('detects a consistent favourite with a rising recent trend', () => {
    const result = summarise_exercise_enjoyment('curl', 'Curl', 'trident', [
      exposure(1, 5), exposure(2, 6), exposure(3, 7),
      exposure(4, 8), exposure(5, 9), exposure(6, 10),
    ])
    expect(result?.status).toBe('favourite')
    expect(result?.recent_average).toBe(9)
    expect(result?.trend).toBe(3)
    expect(result?.average_pump).toBe(8)
  })

  it('detects persistent low enjoyment even when stimulus is high', () => {
    const result = summarise_exercise_enjoyment('curl', 'Curl', null, [
      exposure(1, 3, 9), exposure(2, 4, 9), exposure(3, 2, 9),
    ])
    expect(result?.status).toBe('low_enjoyment')
    expect(result?.average_pump).toBe(9)
  })

  it('returns no fabricated data for a movement with no ratings', () => {
    expect(summarise_exercise_enjoyment('curl', 'Curl', null, [])).toBeNull()
  })
})
