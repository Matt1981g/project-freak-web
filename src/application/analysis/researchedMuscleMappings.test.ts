import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../domain/models'
import { researched_mapping_for_exercise } from './researchedMuscleMappings'

function exercise(name: string, category: string | null = null): Exercise {
  return {
    id: name,
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    canonical_name: name,
    short_name: null,
    category,
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
  }
}

describe('researched exercise muscle mappings', () => {
  it('requires at least three independent source families for every automatic high-confidence rule', () => {
    const names = [
      'Nautilus Bicep Curl',
      'Lat Pulldown',
      'MTS High Row',
      'Leg Extension',
      'Pendulum Squat',
      'Leg Press',
      'DB Lateral Raise',
      'Shoulder Press',
      'Pec Deck',
      'Standing Calf Raise',
    ]

    for (const name of names) {
      const result = researched_mapping_for_exercise(exercise(name))
      expect(result?.confidence).toBe('high')
      expect(result?.source_ids.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('flags execution-sensitive movements as medium confidence instead of silently auto-certifying them', () => {
    expect(
      researched_mapping_for_exercise(exercise('Cable Upright Row'))?.confidence,
    ).toBe('medium')
    expect(
      researched_mapping_for_exercise(exercise('Weighted Dip'))?.confidence,
    ).toBe('medium')
  })
})
