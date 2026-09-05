import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../domain/models'
import { resolve_exercise_muscle_targets } from './muscleMapping'

const exercise: Exercise = {
  id: 'exercise-1',
  created_at: '2026-09-05T00:00:00.000Z',
  updated_at: '2026-09-05T00:00:00.000Z',
  deleted_at: null,
  revision: 1,
  device_id: 'device-1',
  source_kind: 'user',
  source_id: null,
  canonical_name: 'Example Press',
  short_name: null,
  category: 'chest',
  equipment: null,
  default_load_type: 'normal',
  rep_mode_default: 'total',
  archived_at: null,
  notes: null,
}

describe('muscle mapping', () => {
  it('uses conservative category fallback when no explicit links exist', () => {
    const targets = resolve_exercise_muscle_targets(exercise, {
      muscles: [],
      links: [],
    })
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'Chest', role: 'primary' }),
        expect.objectContaining({ area: 'Triceps', role: 'secondary' }),
      ]),
    )
  })

  it('prefers explicit mappings over category fallback', () => {
    const targets = resolve_exercise_muscle_targets(exercise, {
      muscles: [{ id: 'm1', name: 'Biceps Brachii', region: null }],
      links: [
        {
          id: 'l1',
          exercise_id: exercise.id,
          muscle_id: 'm1',
          role: 'primary',
          allocation_weight: 1,
        },
      ],
    })
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      area: 'Biceps',
      role: 'primary',
      source: 'explicit',
    })
  })
})


describe('multi-source researched mappings', () => {
  it('auto-maps common machine exercises without user input', () => {
    const catalogue = { muscles: [], links: [] }

    const examples = [
      ['Nautilus Bicep Curl', 'biceps', 'Biceps'],
      ['Lat Pulldown', 'lats', 'Lats'],
      ['MTS High Row', 'back', 'Back'],
      ['Leg Extension', 'quads', 'Quads'],
      ['Pendulum Squat', 'quads', 'Quads'],
      ['DB Lateral Raise', 'shoulders', 'Shoulders'],
    ] as const

    for (const [name, category, expected] of examples) {
      const candidate = {
        ...exercise,
        id: name,
        canonical_name: name,
        category,
      }
      const targets = resolve_exercise_muscle_targets(candidate, catalogue)
      expect(targets[0]).toMatchObject({
        area: expected,
        role: 'primary',
        source: 'research',
      })
    }
  })

  it('does not auto-certify ambiguous upright-row emphasis', () => {
    const candidate = {
      ...exercise,
      canonical_name: 'Cable Upright Row',
      category: null,
    }
    const targets = resolve_exercise_muscle_targets(candidate, {
      muscles: [],
      links: [],
    })
    expect(targets).toEqual([])
  })
})
