import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import {
  build_programme_exercise_catalogue,
  build_programme_exercise_catalogue_json,
} from './exerciseCatalogue'

function exercise(id: string, name: string, archived = false): Exercise {
  return {
    id,
    canonical_name: name,
    short_name: null,
    category: 'biceps',
    equipment: 'machine',
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: archived ? '2026-09-04T16:00:00.000Z' : null,
    notes: null,
    created_at: '2026-09-04T15:00:00.000Z',
    updated_at: '2026-09-04T15:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device',
    source_kind: 'user',
    source_id: null,
  }
}

function repository(): ExerciseRepository {
  const active = [
    exercise('2', 'Cable Curl'),
    exercise('1', 'Nautilus Bicep Curl'),
  ]

  return {
    get_by_id: async (id) => active.find((item) => item.id === id),
    list_all: async () => [...active, exercise('3', 'Old Curl', true)],
    list_active: async () => active,
    list_aliases: async () => [],
    put: async (item) => item.id,
    merge_definitions: async () => [],
  }
}

describe('programme exercise catalogue', () => {
  it('exports active canonical definitions only and sorts by name', async () => {
    const result = await build_programme_exercise_catalogue(repository())

    expect(result.map((entry) => entry.exercise_name)).toEqual([
      'Cable Curl',
      'Nautilus Bicep Curl',
    ])
    expect(result[0].exercise_id).toBe('2')
  })

  it('produces a stable JSON envelope for ChatGPT programme generation', async () => {
    const json = await build_programme_exercise_catalogue_json(repository())
    const parsed = JSON.parse(json)

    expect(parsed.format).toBe('project-freak-exercise-catalogue')
    expect(parsed.schema_version).toBe('1.0.0')
    expect(parsed.exercises).toHaveLength(2)
  })
})
