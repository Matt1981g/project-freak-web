import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import { apply_exercise_intelligence_review_policy } from './exerciseIntelligenceReviewPolicy'

function intelligence(
  exercise_family: string,
  grip_or_handle: string | null = null,
  metadata_status: ExerciseIntelligence['metadata_status'] = 'high_confidence',
  metadata_sources: string[] = ['PF biomechanics classification'],
): ExerciseIntelligence {
  return {
    primary_muscles: ['Back'],
    secondary_muscles: ['Lats', 'Biceps'],
    stabilizer_muscles: [],
    movement_pattern: exercise_family === 'Lat pulldown' ? 'Vertical pull' : 'Horizontal pull',
    exercise_family,
    mechanic: 'compound',
    laterality: 'bilateral',
    muscle_length_bias: 'lengthened',
    stability_support: 'high',
    systemic_fatigue: 'moderate',
    local_fatigue: 'high',
    loading_potential: 'high',
    progression_reliability: 'good',
    hypertrophy_role: 'primary',
    grip_or_handle,
    metadata_status,
    metadata_confidence: metadata_status === 'user_confirmed' ? 1 : 0.94,
    metadata_sources,
  }
}

function exercise(
  name: string,
  exercise_intelligence: ExerciseIntelligence,
): Exercise {
  return {
    id: 'exercise-1',
    canonical_name: name,
    short_name: null,
    category: 'Back',
    equipment: 'Machine',
    exercise_intelligence,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
    created_at: '2026-09-17T10:00:00.000Z',
    updated_at: '2026-09-17T10:00:00.000Z',
    deleted_at: null,
    revision: 4,
    device_id: 'device',
    source_kind: 'historical_import',
    source_id: 'batch',
  }
}

function repository_fixture(seed: Exercise): {
  repository: ExerciseRepository
  current: () => Exercise
} {
  let current = seed
  return {
    repository: {
      get_by_id: async (id) => id === current.id ? current : undefined,
      list_all: async () => [current],
      list_active: async () => [current],
      list_aliases: async () => [],
      put: async (item) => {
        current = item
        return item.id
      },
      merge_definitions: async () => [],
    },
    current: () => current,
  }
}

describe('apply_exercise_intelligence_review_policy', () => {
  it('downgrades a generic row to manual review', async () => {
    const fixture = repository_fixture(
      exercise('Technogym Pure Strength Row', intelligence('Row')),
    )

    await expect(
      apply_exercise_intelligence_review_policy(
        fixture.repository,
        '2026-09-17T16:00:00.000Z',
      ),
    ).resolves.toBe(1)

    expect(fixture.current().exercise_intelligence).toMatchObject({
      metadata_status: 'needs_review',
      metadata_confidence: 0.78,
    })
    expect(fixture.current().exercise_intelligence?.metadata_sources.join(' ')).toContain(
      'Row grip, elbow path or machine geometry is unspecified.',
    )
  })

  it('downgrades a generic pulldown when the handle is unspecified', async () => {
    const fixture = repository_fixture(
      exercise('Lat Pulldown', intelligence('Lat pulldown')),
    )

    await apply_exercise_intelligence_review_policy(fixture.repository)

    expect(fixture.current().exercise_intelligence?.metadata_status).toBe('needs_review')
  })

  it('leaves an explicit pulldown handle at high confidence', async () => {
    const fixture = repository_fixture(
      exercise('Wide Grip Lat Pulldown', intelligence('Lat pulldown', 'Wide pronated bar')),
    )

    await expect(
      apply_exercise_intelligence_review_policy(fixture.repository),
    ).resolves.toBe(0)

    expect(fixture.current().exercise_intelligence?.metadata_status).toBe('high_confidence')
  })

  it('never reopens a user-confirmed record', async () => {
    const fixture = repository_fixture(
      exercise('Lat Pulldown', intelligence('Lat pulldown', null, 'user_confirmed')),
    )

    await expect(
      apply_exercise_intelligence_review_policy(fixture.repository),
    ).resolves.toBe(0)

    expect(fixture.current().exercise_intelligence?.metadata_status).toBe('user_confirmed')
  })

  it('does not downgrade exact legacy mappings', async () => {
    const fixture = repository_fixture(
      exercise(
        'ISO Lat Row',
        intelligence('Row', null, 'high_confidence', [
          'PF legacy exercise audit',
          'PF biomechanics classification',
        ]),
      ),
    )

    await expect(
      apply_exercise_intelligence_review_policy(fixture.repository),
    ).resolves.toBe(0)

    expect(fixture.current().exercise_intelligence?.metadata_status).toBe('high_confidence')
  })
})
