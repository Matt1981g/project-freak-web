import { describe, expect, it } from 'vitest'
import { is_dangerous_feedback_deletion } from './syncSafetyGate'

describe('outbound workout feedback deletion safety gate', () => {
  it('blocks only unsent readiness/metrics tombstones', () => {
    expect(is_dangerous_feedback_deletion({
      entity_type: 'exercise_metrics', operation: 'delete', synced_at: null,
    })).toBe(true)
    expect(is_dangerous_feedback_deletion({
      entity_type: 'readiness_entry', operation: 'delete', synced_at: null,
    })).toBe(true)
    expect(is_dangerous_feedback_deletion({
      entity_type: 'set', operation: 'delete', synced_at: null,
    })).toBe(false)
    expect(is_dangerous_feedback_deletion({
      entity_type: 'readiness_entry', operation: 'upsert', synced_at: null,
    })).toBe(false)
    expect(is_dangerous_feedback_deletion({
      entity_type: 'exercise_metrics', operation: 'delete',
      synced_at: '2026-10-11T12:33:00Z',
    })).toBe(false)
  })
})
