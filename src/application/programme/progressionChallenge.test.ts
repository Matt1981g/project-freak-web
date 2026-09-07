import { describe, expect, it } from 'vitest'
import {
  encode_adaptive_challenge,
  is_progression_challenge_note,
  parse_adaptive_challenge,
  progression_challenge_fields,
} from './progressionChallenge'

describe('progression challenge metadata', () => {
  it('round-trips adaptive challenge metadata and identifies changed load', () => {
    const line = encode_adaptive_challenge({
      source_session_id: 'session-1',
      baseline_load_kg: 85,
      target_load_kg: 87.5,
      baseline_rep_min: 8,
      baseline_rep_max: 12,
      target_rep_min: 8,
      target_rep_max: 12,
    })

    expect(parse_adaptive_challenge(line)?.baseline_load_kg).toBe(85)
    expect(progression_challenge_fields(line)).toEqual({
      load: true,
      reps: false,
    })
    expect(is_progression_challenge_note(line)).toBe(true)
  })

  it('treats coach challenge notes as visible challenge targets', () => {
    const notes = 'PF_COACH_CHALLENGE · deliberate rep progression'
    expect(is_progression_challenge_note(notes)).toBe(true)
    expect(progression_challenge_fields(notes)).toEqual({
      load: true,
      reps: true,
    })
  })
})
