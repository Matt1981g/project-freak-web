import { describe, expect, it } from 'vitest'
import type { UnderperformanceSignal } from './analysisTypes'
import { build_adaptive_deload_analysis } from './adaptiveAnalysis'

function signal(
  severity: UnderperformanceSignal['severity'],
  code: string,
): UnderperformanceSignal {
  return {
    code,
    severity,
    label: code,
    detail: code,
    muscles: [],
    exercise_id: null,
  }
}

describe('adaptive deload analysis', () => {
  it('continues when repeated fatigue evidence is absent', () => {
    expect(
      build_adaptive_deload_analysis([], {
        completed_sessions: 4,
        scored_exercises: 10,
        recovery_samples: 4,
      }).recommendation,
    ).toBe('continue')
  })

  it('reduces fatigue before jumping straight to a deload', () => {
    expect(
      build_adaptive_deload_analysis(
        [signal('moderate', 'a'), signal('moderate', 'b')],
        {
          completed_sessions: 4,
          scored_exercises: 8,
          recovery_samples: 2,
        },
      ).recommendation,
    ).toBe('reduce_fatigue')
  })

  it('recommends a deload only after strong accumulated signals', () => {
    expect(
      build_adaptive_deload_analysis(
        [signal('high', 'a'), signal('high', 'b')],
        {
          completed_sessions: 5,
          scored_exercises: 12,
          recovery_samples: 5,
        },
      ).recommendation,
    ).toBe('deload')
  })
})
