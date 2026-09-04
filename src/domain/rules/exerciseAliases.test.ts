import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseAlias } from '../models'
import { find_case_only_exercise_alias_candidates } from './exerciseAliases'

function exercise(
  id: string,
  canonical_name: string,
  archived_at: string | null = null,
): Exercise {
  return {
    id,
    canonical_name,
    short_name: null,
    category: null,
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at,
    notes: null,
    created_at: '2026-09-04T14:00:00.000Z',
    updated_at: '2026-09-04T14:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device',
    source_kind: 'historical_import',
    source_id: 'batch',
  }
}

function alias(source_exercise_id: string): ExerciseAlias {
  return {
    id: 'alias-1',
    exercise_id: '1',
    source_exercise_id,
    alias: 'FACE PULL',
    normalized_alias: 'face pull',
    created_at: '2026-09-04T15:00:00.000Z',
    updated_at: '2026-09-04T15:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device',
    source_kind: 'user',
    source_id: null,
  }
}

describe('find_case_only_exercise_alias_candidates', () => {
  it('finds case-only duplicates without merging or discarding labels', () => {
    const result = find_case_only_exercise_alias_candidates([
      exercise('1', 'Lat Pulldown'),
      exercise('2', 'LAT PULLDOWN'),
      exercise('3', 'Nautilus Bicep Curl'),
    ])

    expect(result).toEqual([
      {
        normalized_name: 'lat pulldown',
        members: [
          { exercise_id: '1', label: 'Lat Pulldown' },
          { exercise_id: '2', label: 'LAT PULLDOWN' },
        ],
      },
    ])
  })

  it('keeps archived historical labels eligible for review until resolved', () => {
    const result = find_case_only_exercise_alias_candidates([
      exercise('1', 'Face Pull'),
      exercise('2', 'FACE PULL', '2026-09-04T15:00:00.000Z'),
    ])

    expect(result).toHaveLength(1)
  })

  it('removes a source from review after an explicit alias merge', () => {
    const result = find_case_only_exercise_alias_candidates(
      [exercise('1', 'Face Pull'), exercise('2', 'FACE PULL')],
      [alias('2')],
    )

    expect(result).toEqual([])
  })

  it('ignores soft-deleted definitions', () => {
    const deleted = exercise('2', 'FACE PULL')
    deleted.deleted_at = '2026-09-04T15:00:00.000Z'

    const result = find_case_only_exercise_alias_candidates([
      exercise('1', 'Face Pull'),
      deleted,
    ])

    expect(result).toEqual([])
  })
})
