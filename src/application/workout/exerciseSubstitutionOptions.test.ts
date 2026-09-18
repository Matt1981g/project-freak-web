import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import { rank_exercise_substitution_options } from './exerciseSubstitutionOptions'

const intelligence = (
  primary: string[],
  family: string,
  movement: string,
): ExerciseIntelligence => ({
  primary_muscles: primary,
  secondary_muscles: [],
  stabilizer_muscles: [],
  movement_pattern: movement,
  exercise_family: family,
  mechanic: 'compound',
  laterality: 'bilateral',
  muscle_length_bias: 'lengthened',
  stability_support: 'high',
  systemic_fatigue: 'moderate',
  local_fatigue: 'high',
  loading_potential: 'high',
  progression_reliability: 'excellent',
  hypertrophy_role: 'primary',
  grip_or_handle: null,
  metadata_status: 'high_confidence',
  metadata_confidence: 0.94,
  metadata_sources: ['fixture'],
})

function exercise(
  id: string,
  name: string,
  category: string,
  intel: ExerciseIntelligence | null,
): Exercise {
  return {
    id,
    canonical_name: name,
    short_name: null,
    category,
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
    exercise_intelligence: intel,
    created_at: '2026-09-18T05:00:00.000Z',
    updated_at: '2026-09-18T05:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device',
    source_kind: 'user',
    source_id: null,
  }
}

describe('rank_exercise_substitution_options', () => {
  it('keeps same-target current-gym options and excludes session duplicates', () => {
    const original = exercise(
      'lat-pulldown',
      'Lat Pulldown',
      'Lats',
      intelligence(['Lats'], 'Lat pulldown', 'Vertical pull'),
    )
    const same_family = exercise(
      'wide-pulldown',
      'Wide-Grip Pulldown',
      'Lats',
      intelligence(['Latissimus dorsi'], 'Lat pulldown', 'Vertical pull'),
    )
    const same_movement = exercise(
      'vertical-traction',
      'Vertical Traction',
      'Lats',
      intelligence(['Lats'], 'Vertical traction', 'Vertical pull'),
    )
    const same_target = exercise(
      'pullover',
      'Pullover',
      'Lats',
      intelligence(['Lats'], 'Pullover', 'Shoulder extension'),
    )
    const already_planned = exercise(
      'lat-row',
      'Lat Row',
      'Lats',
      intelligence(['Lats'], 'Row', 'Horizontal pull'),
    )
    const chest = exercise(
      'chest-press',
      'Chest Press',
      'Chest',
      intelligence(['Chest'], 'Chest press', 'Horizontal press'),
    )
    const unavailable = exercise(
      'single-arm-pulldown',
      'Single-Arm Pulldown',
      'Lats',
      intelligence(['Lats'], 'Lat pulldown', 'Vertical pull'),
    )

    const result = rank_exercise_substitution_options({
      original,
      candidates: [
        chest,
        same_target,
        unavailable,
        same_movement,
        already_planned,
        same_family,
      ],
      session_exercise_ids: new Set(['lat-pulldown', 'lat-row']),
      available_exercise_ids: new Set([
        'wide-pulldown',
        'vertical-traction',
        'pullover',
        'lat-row',
        'chest-press',
      ]),
    })

    expect(result.map((item) => item.id)).toEqual([
      'wide-pulldown',
      'vertical-traction',
      'pullover',
    ])
  })

  it('falls back to exercise category when intelligence is unavailable', () => {
    const original = exercise('curl-a', 'Curl A', 'Biceps', null)
    const biceps = exercise('curl-b', 'Curl B', 'Biceps', null)
    const triceps = exercise('pressdown', 'Pressdown', 'Triceps', null)

    const result = rank_exercise_substitution_options({
      original,
      candidates: [triceps, biceps],
      session_exercise_ids: new Set(['curl-a']),
      available_exercise_ids: null,
    })

    expect(result.map((item) => item.id)).toEqual(['curl-b'])
  })
})
