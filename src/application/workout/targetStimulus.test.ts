import { describe, expect, it } from 'vitest'
import {
  read_target_stimulus,
  with_target_stimulus_tag,
} from './targetStimulus'

describe('target stimulus evidence', () => {
  it('round-trips a target stimulus rating through exercise metric tags', () => {
    const tags = with_target_stimulus_tag(['legacy-tag'], 'target')
    expect(tags).toEqual(['legacy-tag', 'pf:target_stimulus:target'])
    expect(read_target_stimulus(tags)).toBe('target')
  })

  it('replaces only the PROJECT FREAK stimulus tag and preserves other evidence', () => {
    expect(
      with_target_stimulus_tag(
        ['biceps', 'pf:target_stimulus:mixed', 'machine'],
        'wrong_area',
      ),
    ).toEqual(['biceps', 'machine', 'pf:target_stimulus:wrong_area'])
  })

  it('can clear the derived stimulus rating without deleting other where-felt tags', () => {
    expect(
      with_target_stimulus_tag(
        ['biceps', 'pf:target_stimulus:target'],
        null,
      ),
    ).toEqual(['biceps'])
  })
})
