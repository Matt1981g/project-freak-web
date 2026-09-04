import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseAlias } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import {
  archive_exercise,
  consolidate_exercises,
  list_exercise_alias_candidates,
  query_exercise_library,
  rename_exercise,
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
  const aliases: ExerciseAlias[] = []

  return {
    get_by_id: async (id) => data.get(id),
    list_all: async () => [...data.values()],
    list_active: async () =>
      [...data.values()].filter((exercise) => exercise.archived_at === null),
    list_aliases: async () => aliases,
    put: async (exercise) => {
      data.set(exercise.id, exercise)
      return exercise.id
    },
    merge_definitions: async (
      source_ids,
      target_id,
      device_id,
      timestamp,
    ) => {
      const created: ExerciseAlias[] = []
      const target = data.get(target_id)
      if (!target) throw new Error('Target missing')

      for (const source_id of source_ids) {
        const source = data.get(source_id)
        if (!source || source_id === target_id) continue

        data.set(source_id, {
          ...source,
          archived_at: timestamp,
          updated_at: timestamp,
          revision: source.revision + 1,
          device_id,
          source_kind: 'user',
          source_id: null,
        })

        const alias: ExerciseAlias = {
          id: `alias-${source_id}`,
          exercise_id: target_id,
          source_exercise_id: source_id,
          alias: source.canonical_name,
          normalized_alias: source.canonical_name.toLocaleLowerCase('en-GB'),
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
          revision: 1,
          device_id,
          source_kind: 'user',
          source_id: null,
        }
        aliases.push(alias)
        created.push(alias)
      }

      return created
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
    expect(candidates[0].members).toEqual([
      { exercise_id: '2', label: 'FACE PULL' },
      { exercise_id: '1', label: 'Face Pull' },
    ])
  })

  it('renames a library definition without changing its id', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Lat Pulldwon'),
    ])

    const renamed = await rename_exercise(
      repository,
      '1',
      'Lat Pulldown',
      'current-device',
      '2026-09-04T15:10:00.000Z',
    )

    expect(renamed.id).toBe('1')
    expect(renamed.canonical_name).toBe('Lat Pulldown')
    expect(renamed.revision).toBe(2)
  })

  it('refuses to rename over an existing active exercise', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Lat Pulldwon'),
      make_exercise('2', 'Lat Pulldown'),
    ])

    await expect(
      rename_exercise(
        repository,
        '1',
        'Lat Pulldown',
        'current-device',
        '2026-09-04T15:10:00.000Z',
      ),
    ).rejects.toThrow('Consolidate the duplicate')
  })

  it('consolidates a duplicate into a canonical target and resolves review', async () => {
    const repository = repository_fixture([
      make_exercise('1', 'Face Pull'),
      make_exercise('2', 'FACE PULL'),
    ])

    await consolidate_exercises(
      repository,
      ['2'],
      '1',
      'current-device',
      '2026-09-04T15:15:00.000Z',
    )

    expect((await repository.get_by_id('2'))?.archived_at).not.toBeNull()
    expect(await repository.list_aliases()).toHaveLength(1)
    expect(await list_exercise_alias_candidates(repository)).toEqual([])
  })
})
