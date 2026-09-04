import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import {
  archive_exercise,
  list_exercise_alias_candidates,
  query_exercise_library,
  restore_exercise,
} from './exerciseLibrary'

function make_exercise(
  id: string,
  canonical_name: string,
  category: string | null = null,
): Exercise {
  return {
    id,
    canonical_name,
    short_name: null,
    category,
    equipment: null,
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
    created_at: '2026-09-04T14:00:00.000Z',
    updated_at: '2026-09-04T14:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'original-device',
    source_kind: 'historical_import',
    source_id: 'batch',
  }
}

function repository_fixture(seed: Exercise[]): ExerciseRepository {
  const data = new Map(seed.map((exercise) => [exercise.id, exercise]))

  return {
    get_by_id: async (id) => data.get(id),
    list_all: async () => [...data.values()],
    list_active: async () =>
      [...data.values()].filter((exercise) => exercise.archived_at === null),
    put: async (exercise) => {
      data.set(exercise.id, exercise)
      return exercise.id
    },
  }
}

describe('exercise library application service', () => {
  it('searches active exercises across useful library fields', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Nautilus Bicep Curl', 'biceps'),
      make_exercise('2', 'Cable Upright Row', 'traps'),
    ])

    const result = await query_exercise_library(repository, {
      search: 'bicep',
    })

    expect(result.map((exercise) => exercise.id)).toEqual(['1'])
  })

  it('archives and restores without changing historical identity', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Lat Pulldown', 'lats'),
    ])

    const archived = await archive_exercise(
      repository,
      '1',
      'current-device',
      '2026-09-04T15:00:00.000Z',
    )

    expect(archived.id).toBe('1')
    expect(archived.canonical_name).toBe('Lat Pulldown')
    expect(archived.archived_at).toBe('2026-09-04T15:00:00.000Z')
    expect(archived.revision).toBe(2)
    expect(archived.source_kind).toBe('user')

    const restored = await restore_exercise(
      repository,
      '1',
      'current-device',
      '2026-09-04T15:05:00.000Z',
    )

    expect(restored.archived_at).toBeNull()
    expect(restored.revision).toBe(3)
  })

  it('surfaces alias candidates without changing either exercise', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Face Pull'),
      make_exercise('2', 'FACE PULL'),
    ])

    const candidates = await list_exercise_alias_candidates(repository)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].exercise_ids).toEqual(['1', '2'])
    expect(
      (await repository.list_all()).map(
        (exercise) => exercise.canonical_name,
      ),
    ).toEqual(['Face Pull', 'FACE PULL'])
  })
})
