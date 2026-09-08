import { describe, expect, it } from 'vitest'
import { live_set_capability_issues } from './liveSetCapability'

describe('live set capability contract', () => {
  it('accepts normal rep-based sets and rep-based structured components', () => {
    expect(
      live_set_capability_issues({
        target_duration_seconds: null,
        components: [
          { target_duration_seconds: null },
          { target_duration_seconds: null },
        ],
      }),
    ).toEqual([])
  })

  it('rejects a timed primary set rather than allowing the logger to misrecord it as reps', () => {
    expect(
      live_set_capability_issues({
        target_duration_seconds: 45,
        components: [],
      }),
    ).toEqual([
      expect.objectContaining({ code: 'timed_primary_not_supported' }),
    ])
  })

  it('rejects a timed component rather than silently dropping its duration target', () => {
    expect(
      live_set_capability_issues({
        target_duration_seconds: null,
        components: [{ target_duration_seconds: 20 }],
      }),
    ).toEqual([
      expect.objectContaining({ code: 'timed_component_not_supported' }),
    ])
  })
})
