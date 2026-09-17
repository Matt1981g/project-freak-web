import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseIntelligence, ExerciseRepository } from '../../domain/models'
import type { ExerciseRepository as ExerciseRepositoryContract } from '../../data/repositories/contracts'
import { confirm_exercise_intelligence } from './exerciseIntelligenceReview'

const intelligence: ExerciseIntelligence = {
  primary_muscles: [' Shoulders '],
  secondary_muscles: ['Triceps', ' Shoulders '],
  stabilizer_muscles: [],
  movement_pattern: ' Shoulder abduction ',
  exercise_family: ' Lateral raise ',
  mechanic: 'isolation',
  laterality: 'bilateral',
  muscle_length_bias: 'mixed',
  stability_support: 'high',
  systemic_fatigue: 'very_low',
  local_fatigue: 'moderate',
  loading_potential: 'low',
  progression_reliability: 'good',
  hypertrophy_role: 'primary',
  grip_or_handle: ' D handles ',
  metadata_status: 'needs_review',
  metadata_confidence: 0.68,
  metadata_sources: ['PF category fallback — manual review required'],
}

function exercise(): Exercise {
  return {
    id: 'exercise-1',
    canonical_name: 'Test Lateral Raise',
    short_name: null,
    category: 'Shoulders',
    equipment: 'Cable',
    exercise_intelligence: intelligence,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
    created_at: '2026-09-17T10:00:00.000Z',
    updated_at: '2026-09-17T10:00:00.000Z',
    deleted_at: null,
    revision: 4,
    device_id: 'old-device',
    source_kind: 'historical_import',
    source_id: 'batch',
  }
}

function repository_fixture(seed: Exercise): ExerciseRepositoryContract {
  let current = seed
  return {
    get_by_id: async (id) => id === current.id ? current : undefined,
    list_all: async () => [current],
    list_active: async () => [current],
    list_aliases: async () => [],
    put: async (item) => {
      current = item
      return item.id
    },
    merge_definitions: async () => [],
  }
}

describe('confirm_exercise_intelligence', () => {
  it('marks reviewed intelligence as user confirmed and preserves the exercise id', async () => {
    const repository = repository_fixture(exercise())
    const updated = await confirm_exercise_intelligence(
      repository,
      'exercise-1',
      intelligence,
      'review-device',
      '2026-09-17T15:10:00.000Z',
    )

    expect(updated.id).toBe('exercise-1')
    expect(updated.revision).toBe(5)
    expect(updated.device_id).toBe('review-device')
    expect(updated.source_kind).toBe('user')
    expect(updated.source_id).toBeNull()
    expect(updated.exercise_intelligence).toMatchObject({
      primary_muscles: ['Shoulders'],
      secondary_muscles: ['Triceps'],
      movement_pattern: 'Shoulder abduction',
      exercise_family: 'Lateral raise',
      grip_or_handle: 'D handles',
      metadata_status: 'user_confirmed',
      metadata_confidence: 1,
    })
    expect(updated.exercise_intelligence?.metadata_sources).toContain(
      'PF user-confirmed exercise intelligence',
    )
  })

  it('rejects confirmation without a primary muscle', async () => {
    const repository = repository_fixture(exercise())
    await expect(
      confirm_exercise_intelligence(
        repository,
        'exercise-1',
        { ...intelligence, primary_muscles: [] },
        'review-device',
      ),
    ).rejects.toThrow('Choose at least one primary muscle')
  })
})
