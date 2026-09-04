import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseAlias } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import { audit_exercise_library } from './exerciseLibraryAudit'

function exercise(
  id: string,
  name: string,
  archived_at: string | null = null,
): Exercise {
  return {
    id,
    canonical_name: name,
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

function alias(
  source_exercise_id: string,
  target_exercise_id: string,
): ExerciseAlias {
  return {
    id: `alias-${source_exercise_id}`,
    exercise_id: target_exercise_id,
    source_exercise_id,
    alias: 'Alias',
    normalized_alias: 'alias',
    created_at: '2026-09-04T15:00:00.000Z',
    updated_at: '2026-09-04T15:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device',
    source_kind: 'user',
    source_id: null,
  }
}

function repository_fixture(
  exercises: Exercise[],
  aliases: ExerciseAlias[],
): ExerciseRepository {
  return {
    get_by_id: async (id) => exercises.find((item) => item.id === id),
    list_all: async () => exercises,
    list_active: async () =>
      exercises.filter((item) => item.archived_at === null),
    list_aliases: async () => aliases,
    put: async (item) => item.id,
    merge_definitions: async () => [],
  }
}

describe('audit_exercise_library', () => {
  it('reports a clean consolidated library', async () => {
    const repository = repository_fixture(
      [
        exercise('1', 'Face Pull'),
        exercise('2', 'FACE PULL', '2026-09-04T15:00:00.000Z'),
      ],
      [alias('2', '1')],
    )

    await expect(audit_exercise_library(repository)).resolves.toEqual({
      total_definitions: 2,
      active_definitions: 1,
      archived_definitions: 1,
      alias_records: 1,
      unresolved_case_groups: 0,
      orphan_aliases: 0,
      status: 'clean',
    })
  })

  it('warns when case-only duplicates remain unresolved', async () => {
    const repository = repository_fixture(
      [exercise('1', 'Face Pull'), exercise('2', 'FACE PULL')],
      [],
    )

    const result = await audit_exercise_library(repository)
    expect(result.unresolved_case_groups).toBe(1)
    expect(result.status).toBe('warning')
  })

  it('warns about aliases whose source or target definition is missing', async () => {
    const repository = repository_fixture(
      [exercise('1', 'Face Pull')],
      [alias('missing-source', '1')],
    )

    const result = await audit_exercise_library(repository)
    expect(result.orphan_aliases).toBe(1)
    expect(result.status).toBe('warning')
  })
})
