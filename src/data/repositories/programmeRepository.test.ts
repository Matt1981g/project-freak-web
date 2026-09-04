import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProgrammeImportEntities } from './contracts'
import { ProjectFreakDatabase } from '../db/projectFreakDb'
import { create_repositories } from './dexieRepositories'

const TEST_DB_NAME = 'project-freak-programme-repository-test'
const NOW = '2026-09-04T16:00:00.000Z'
const DEVICE_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ID = 'programme-json:test-hash'

function meta(id: string) {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'programme_import' as const,
    source_id: SOURCE_ID,
  }
}

function import_entities(): ProgrammeImportEntities {
  return {
    block: {
      ...meta('block-1'),
      name: 'September',
      block_type: 'mesocycle',
      start_date_local: '2026-09-07',
      end_date_local: '2026-10-04',
      status: 'draft',
      goal: 'Hypertrophy',
      notes: null,
    },
    templates: [
      {
        ...meta('template-1'),
        programme_block_id: 'block-1',
        name: 'Monday',
        day_label: 'Monday',
        template_family_id: 'family-1',
        version_number: 1,
        status: 'draft',
        notes: null,
      },
    ],
    template_exercises: [
      {
        ...meta('template-exercise-1'),
        workout_template_id: 'template-1',
        exercise_id: 'exercise-1',
        planned_order: 1,
        rotation_group_key: null,
        rotation_position: null,
        target_sets: 1,
        target_rep_min: 8,
        target_rep_max: 12,
        rest_seconds: 120,
        tempo: null,
        technique_cue: null,
        notes: null,
      },
    ],
    template_sets: [
      {
        ...meta('template-set-1'),
        template_exercise_id: 'template-exercise-1',
        set_number: 1,
        set_role: 'work',
        structure_type: 'rest_pause',
        target_rep_min: 10,
        target_rep_max: 12,
        target_duration_seconds: null,
        target_load_kg: 25,
        target_load_type: 'normal',
        failure_target: 'allowed',
        notes: null,
      },
    ],
    template_set_components: [
      {
        ...meta('template-component-1'),
        template_set_id: 'template-set-1',
        sequence: 1,
        component_type: 'rest_pause',
        target_load_kg: null,
        load_relation: 'same_as_primary',
        target_load_percent: null,
        target_rep_min: 3,
        target_rep_max: 5,
        target_duration_seconds: null,
        failure_target: 'target',
        notes: null,
      },
    ],
    programmed_sessions: [
      {
        ...meta('programmed-session-1'),
        programme_block_id: 'block-1',
        workout_template_id: 'template-1',
        scheduled_date_local: '2026-09-07',
        name_snapshot: 'Monday',
        status: 'planned',
        notes: null,
      },
    ],
    programmed_session_exercises: [
      {
        ...meta('programmed-exercise-1'),
        programmed_session_id: 'programmed-session-1',
        exercise_id: 'exercise-1',
        exercise_name_snapshot: 'Nautilus Bicep Curl',
        planned_order: 1,
        rotation_group_key: null,
        rotation_position: null,
        target_sets: 1,
        target_rep_min: 8,
        target_rep_max: 12,
        rest_seconds: 120,
        tempo: null,
        technique_cue: null,
        notes: null,
      },
    ],
    programmed_session_sets: [
      {
        ...meta('programmed-set-1'),
        programmed_session_exercise_id: 'programmed-exercise-1',
        set_number: 1,
        set_role: 'work',
        structure_type: 'rest_pause',
        target_rep_min: 10,
        target_rep_max: 12,
        target_duration_seconds: null,
        target_load_kg: 25,
        target_load_type: 'normal',
        failure_target: 'allowed',
        notes: null,
      },
    ],
    programmed_set_components: [
      {
        ...meta('programmed-component-1'),
        programmed_session_set_id: 'programmed-set-1',
        sequence: 1,
        component_type: 'rest_pause',
        target_load_kg: null,
        load_relation: 'same_as_primary',
        target_load_percent: null,
        target_rep_min: 3,
        target_rep_max: 5,
        target_duration_seconds: null,
        failure_target: 'target',
        notes: null,
      },
    ],
  }
}

describe('DexieProgrammeRepository', () => {
  let db: ProjectFreakDatabase
  let repositories: ReturnType<typeof create_repositories>

  beforeEach(async () => {
    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()
    repositories = create_repositories(db)
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('commits a complete programme graph atomically with audit and outbox records', async () => {
    const entities = import_entities()
    const result = await repositories.programme.commit_import(entities)

    expect(result).toBe('committed')
    expect(await db.programme_blocks.count()).toBe(1)
    expect(await db.workout_templates.count()).toBe(1)
    expect(await db.template_exercises.count()).toBe(1)
    expect(await db.template_sets.count()).toBe(1)
    expect(await db.template_set_components.count()).toBe(1)
    expect(await db.programmed_sessions.count()).toBe(1)
    expect(await db.programmed_session_exercises.count()).toBe(1)
    expect(await db.programmed_session_sets.count()).toBe(1)
    expect(await db.programmed_set_components.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(9)
    expect(await db.sync_outbox.count()).toBe(9)
  })

  it('loads a programmed session with ordered exercises, sets and components', async () => {
    const entities = import_entities()
    await repositories.programme.commit_import(entities)

    const detail = await repositories.programme.get_programmed_session_detail(
      'programmed-session-1',
    )

    expect(detail?.session.name_snapshot).toBe('Monday')
    expect(detail?.exercises).toHaveLength(1)
    expect(detail?.exercises[0].exercise.exercise_name_snapshot).toBe(
      'Nautilus Bicep Curl',
    )
    expect(detail?.exercises[0].sets).toHaveLength(1)
    expect(detail?.exercises[0].sets[0].set.structure_type).toBe('rest_pause')
    expect(detail?.exercises[0].sets[0].components).toHaveLength(1)
    expect(
      detail?.exercises[0].sets[0].components[0].component_type,
    ).toBe('rest_pause')
  })

  it('treats an identical source import as a no-op', async () => {
    const entities = import_entities()

    expect(await repositories.programme.commit_import(entities)).toBe(
      'committed',
    )
    expect(await repositories.programme.commit_import(import_entities())).toBe(
      'duplicate_noop',
    )

    expect(await db.programme_blocks.count()).toBe(1)
    expect(await db.workout_templates.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(9)
  })

  it('returns the latest template family version', async () => {
    const first = import_entities()
    await repositories.programme.commit_import(first)

    await db.workout_templates.add({
      ...first.templates[0],
      id: 'template-2',
      programme_block_id: null,
      version_number: 4,
      source_id: 'other-source',
    })

    await expect(
      repositories.programme.get_latest_template_version('family-1'),
    ).resolves.toBe(4)
  })
})
