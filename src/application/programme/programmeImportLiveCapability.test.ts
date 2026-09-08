import { describe, expect, it } from 'vitest'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import type { Exercise } from '../../domain/models'
import { preview_programme_import } from './programmeImport'

const EXERCISE_ID = '22222222-2222-4222-8222-222222222222'

const exercise: Exercise = {
  id: EXERCISE_ID,
  canonical_name: 'Nautilus Bicep Curl',
  short_name: null,
  category: 'biceps',
  equipment: 'Nautilus',
  default_load_type: 'normal',
  rep_mode_default: 'total',
  archived_at: null,
  notes: null,
  created_at: '2026-09-04T14:00:00.000Z',
  updated_at: '2026-09-04T14:00:00.000Z',
  deleted_at: null,
  revision: 1,
  device_id: 'device',
  source_kind: 'user',
  source_id: null,
}

const exercises: ExerciseRepository = {
  get_by_id: async (id) => (id === EXERCISE_ID ? exercise : undefined),
  list_all: async () => [exercise],
  list_active: async () => [exercise],
  list_aliases: async () => [],
  put: async (value) => value.id,
  merge_definitions: async () => [],
}

function document_with_set(set: Record<string, unknown>) {
  return {
    format: 'project-freak-programme',
    schema_version: '1.0.0',
    source: 'ChatGPT',
    programme: {
      external_id: 'live-capability-test',
      name: 'Capability Test',
      block_type: 'microcycle',
      start_date_local: '2026-09-07',
      end_date_local: '2026-09-13',
      sessions: [
        {
          external_id: 'session-1',
          name: 'Session 1',
          scheduled_date_local: '2026-09-08',
          exercises: [
            {
              exercise_id: EXERCISE_ID,
              exercise_name: 'Nautilus Bicep Curl',
              planned_order: 1,
              target_sets: 1,
              sets: [set],
            },
          ],
        },
      ],
    },
  }
}

const base_set = {
  set_number: 1,
  set_role: 'work',
  structure_type: 'straight',
  target_rep_min: 8,
  target_rep_max: 12,
  target_load_type: 'normal',
  failure_target: 'none',
  components: [],
}

describe('programme import live logger capability gate', () => {
  it('accepts the normal straight-set path', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(document_with_set(base_set)),
      exercises,
    )

    expect(preview.can_commit).toBe(true)
  })

  it('rejects timed primary work until the live logger can faithfully capture duration', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(
        document_with_set({
          ...base_set,
          target_rep_min: null,
          target_rep_max: null,
          target_duration_seconds: 45,
        }),
      ),
      exercises,
    )

    expect(preview.can_commit).toBe(false)
    expect(
      preview.issues.some(
        (entry) =>
          entry.code === 'schema_validation_error' &&
          entry.path.includes('target_duration_seconds'),
      ),
    ).toBe(true)
  })

  it('rejects timed components until component duration is loggable', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(
        document_with_set({
          ...base_set,
          structure_type: 'rest_pause',
          components: [
            {
              sequence: 1,
              component_type: 'rest_pause',
              target_duration_seconds: 20,
              failure_target: 'none',
            },
          ],
        }),
      ),
      exercises,
    )

    expect(preview.can_commit).toBe(false)
    expect(
      preview.issues.some(
        (entry) =>
          entry.code === 'schema_validation_error' &&
          entry.path.includes('components'),
      ),
    ).toBe(true)
  })
})
