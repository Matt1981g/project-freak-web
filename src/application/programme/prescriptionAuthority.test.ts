import { describe, expect, it } from 'vitest'
import type { ProgrammedSessionSet } from '../../domain/models'
import {
  can_apply_adaptive_change,
  prescription_authority,
} from './prescriptionAuthority'
import { encode_adaptive_challenge } from './progressionChallenge'

function set(
  source_kind: ProgrammedSessionSet['source_kind'],
  notes: string | null = null,
): Pick<ProgrammedSessionSet, 'source_kind' | 'notes'> {
  return { source_kind, notes }
}

describe('prescription authority', () => {
  it('protects an explicit manual prescription from automatic adaptation', () => {
    const decision = prescription_authority(set('user'))
    expect(decision.authority).toBe('manual')
    expect(decision.adaptive_change_allowed).toBe(false)
  })

  it('allows constrained adaptation of the Coach-imported weekly baseline', () => {
    const decision = prescription_authority(set('programme_import'))
    expect(decision.authority).toBe('coach_import')
    expect(decision.adaptive_change_allowed).toBe(true)
  })

  it('recognises a prior PROJECT FREAK adaptive prescription before source kind', () => {
    const notes = [
      'Adaptive current week',
      'PF_ADAPTIVE_SOURCE:session-1',
      encode_adaptive_challenge({
        source_session_id: 'session-1',
        baseline_load_kg: 40,
        target_load_kg: 41.25,
        baseline_rep_min: 8,
        baseline_rep_max: 12,
        target_rep_min: 8,
        target_rep_max: 12,
      }),
    ].join('\n')

    const decision = prescription_authority(set('user', notes))
    expect(decision.authority).toBe('adaptive')
    expect(decision.adaptive_change_allowed).toBe(true)
  })

  it('preserves unknown authority instead of guessing', () => {
    expect(can_apply_adaptive_change(set('restore'))).toBe(false)
  })
})
