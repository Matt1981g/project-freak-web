import { describe, expect, it } from 'vitest'
import type { Exercise } from '../../domain/models'
import type {
  ExerciseRepository,
  ProgrammeRepository,
} from '../../data/repositories/contracts'
import {
  build_programme_import_entities,
  preview_programme_import,
} from './programmeImport'

const EXERCISE_ID = '22222222-2222-4222-8222-222222222222'

function exercise_fixture(): Exercise {
  return {
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
    revision: 3,
    device_id: 'device',
    source_kind: 'user',
    source_id: null,
  }
}

function exercise_repository(
  active: Exercise[] = [exercise_fixture()],
): ExerciseRepository {
  return {
    get_by_id: async (id) => active.find((exercise) => exercise.id === id),
    list_all: async () => active,
    list_active: async () => active,
    list_aliases: async () => [],
    put: async (exercise) => exercise.id,
    merge_definitions: async () => [],
  }
}

function programme_repository(
  latest_version = 0,
): ProgrammeRepository {
  return {
    list_blocks: async () => [],
    list_templates_for_block: async () => [],
    list_programmed_sessions_for_block: async () => [],
    get_latest_template_version: async () => latest_version,
    commit_import: async () => 'committed',
  }
}

function valid_document() {
  return {
    format: 'project-freak-programme',
    schema_version: '1.0.0',
    source: 'ChatGPT',
    programme: {
      external_id: 'pf-sept-2026',
      name: 'Project Freak September',
      block_type: 'mesocycle',
      start_date_local: '2026-09-07',
      end_date_local: '2026-10-04',
      goal: 'Biceps priority hypertrophy',
      sessions: [
        {
          external_id: 'monday-arms',
          name: 'Monday Arms',
          scheduled_date_local: '2026-09-07',
          day_label: 'Monday',
          exercises: [
            {
              exercise_id: EXERCISE_ID,
              exercise_name: 'Nautilus Bicep Curl',
              planned_order: 1,
              target_sets: 2,
              target_rep_min: 8,
              target_rep_max: 12,
              rest_seconds: 120,
              tempo: '3-0-1-0',
              technique_cue: 'Keep shoulder quiet',
              sets: [
                {
                  set_number: 1,
                  set_role: 'work',
                  structure_type: 'straight',
                  target_rep_min: 8,
                  target_rep_max: 12,
                  target_load_type: 'normal',
                  failure_target: 'none',
                  components: [],
                },
                {
                  set_number: 2,
                  set_role: 'work',
                  structure_type: 'straight',
                  target_rep_min: 8,
                  target_rep_max: 12,
                  target_load_type: 'normal',
                  failure_target: 'allowed',
                  components: [],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

describe('programme import', () => {
  it('validates a programme and returns exact preview counts', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(valid_document()),
      exercise_repository(),
    )

    expect(preview.can_commit).toBe(true)
    expect(preview.issues).toEqual([])
    expect(preview.counts).toEqual({
      sessions: 1,
      exercises: 1,
      sets: 2,
      components: 0,
    })
    expect(preview.source_id).toMatch(/^programme-json:[0-9a-f]{64}$/)
  })

  it('hashes semantically identical JSON the same regardless of formatting', async () => {
    const document = valid_document()
    const compact = await preview_programme_import(
      JSON.stringify(document),
      exercise_repository(),
    )
    const pretty = await preview_programme_import(
      JSON.stringify(document, null, 2),
      exercise_repository(),
    )

    expect(pretty.document_hash).toBe(compact.document_hash)
  })

  it('rejects an unknown or archived exercise id before mutation', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(valid_document()),
      exercise_repository([]),
    )

    expect(preview.can_commit).toBe(false)
    expect(
      preview.issues.some(
        (entry) => entry.code === 'unknown_or_archived_exercise_id',
      ),
    ).toBe(true)
  })

  it('rejects explicit target set counts that contradict supplied sets', async () => {
    const document = valid_document()
    document.programme.sessions[0].exercises[0].target_sets = 3

    const preview = await preview_programme_import(
      JSON.stringify(document),
      exercise_repository(),
    )

    expect(preview.can_commit).toBe(false)
    expect(
      preview.issues.some(
        (entry) => entry.code === 'target_set_count_mismatch',
      ),
    ).toBe(true)
  })

  it('warns when imported exercise text differs but resolves by active id', async () => {
    const document = valid_document()
    document.programme.sessions[0].exercises[0].exercise_name =
      'Nautilus Biceps Curl'

    const preview = await preview_programme_import(
      JSON.stringify(document),
      exercise_repository(),
    )

    expect(preview.can_commit).toBe(true)
    expect(
      preview.issues.some(
        (entry) => entry.code === 'exercise_name_snapshot_updated',
      ),
    ).toBe(true)
    expect(preview.exercise_resolutions[0].canonical_name).toBe(
      'Nautilus Bicep Curl',
    )
  })

  it('builds separate versioned templates and immutable programmed snapshots', async () => {
    const preview = await preview_programme_import(
      JSON.stringify(valid_document()),
      exercise_repository(),
    )

    const entities = await build_programme_import_entities(
      preview,
      programme_repository(2),
      'current-device',
      '2026-09-04T16:00:00.000Z',
    )

    expect(entities.block.status).toBe('draft')
    expect(entities.templates).toHaveLength(1)
    expect(entities.templates[0].version_number).toBe(3)
    expect(entities.templates[0].template_family_id).toBe(
      'programme:pf-sept-2026:session:monday-arms',
    )

    expect(entities.template_exercises).toHaveLength(1)
    expect(entities.programmed_sessions).toHaveLength(1)
    expect(entities.programmed_session_exercises).toHaveLength(1)
    expect(entities.programmed_session_exercises[0].exercise_name_snapshot).toBe(
      'Nautilus Bicep Curl',
    )

    expect(entities.template_sets).toHaveLength(2)
    expect(entities.programmed_session_sets).toHaveLength(2)
    expect(entities.template_sets[0].id).not.toBe(
      entities.programmed_session_sets[0].id,
    )
  })
})
