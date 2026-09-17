import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseIntelligence } from '../../domain/models'
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

const intelligence: ExerciseIntelligence = {
  primary_muscles: ['Pectoralis major - clavicular'],
  secondary_muscles: ['Triceps brachii', 'Anterior deltoid'],
  stabilizer_muscles: [],
  movement_pattern: 'horizontal push',
  exercise_family: 'incline_press',
  mechanic: 'compound',
  laterality: 'bilateral',
  muscle_length_bias: 'mixed',
  stability_support: 'high',
  systemic_fatigue: 'moderate',
  local_fatigue: 'moderate',
  loading_potential: 'high',
  progression_reliability: 'excellent',
  hypertrophy_role: 'primary',
  grip_or_handle: null,
  metadata_status: 'verified',
  metadata_confidence: 0.98,
  metadata_sources: ['manufacturer'],
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

  it('uses trusted exercise intelligence before generic research or category fallback', () => {
    const candidate: Exercise = {
      ...exercise,
      canonical_name: 'Incline Chest Press — Test Machine',
      exercise_intelligence: intelligence,
    }
    const targets = resolve_exercise_muscle_targets(candidate, {
      muscles: [],
      links: [],
    })

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: 'Chest',
          role: 'primary',
          source: 'intelligence',
        }),
        expect.objectContaining({
          area: 'Triceps',
          role: 'secondary',
          source: 'intelligence',
        }),
        expect.objectContaining({
          area: 'Shoulders',
          role: 'secondary',
          source: 'intelligence',
        }),
      ]),
    )
  })

  it('does not use intelligence that is still awaiting review', () => {
    const candidate: Exercise = {
      ...exercise,
      canonical_name: 'Incline Chest Press — Test Machine',
      exercise_intelligence: {
        ...intelligence,
        metadata_status: 'needs_review',
        metadata_confidence: 0.72,
      },
    }
    const targets = resolve_exercise_muscle_targets(candidate, {
      muscles: [],
      links: [],
    })

    expect(targets.some((target) => target.source === 'intelligence')).toBe(false)
    expect(targets.some((target) => target.source === 'research')).toBe(true)
  })

  it('maps hip adductors into the Adductors training area', () => {
    const candidate: Exercise = {
      ...exercise,
      category: 'adductors',
      exercise_intelligence: {
        ...intelligence,
        primary_muscles: ['Hip adductors'],
        secondary_muscles: [],
      },
    }
    const targets = resolve_exercise_muscle_targets(candidate, {
      muscles: [],
      links: [],
    })
    expect(targets[0]).toMatchObject({
      area: 'Adductors',
      role: 'primary',
      source: 'intelligence',
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
