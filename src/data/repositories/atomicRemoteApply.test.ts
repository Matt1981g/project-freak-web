import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Exercise, ExerciseMetrics } from '../../domain/models'
import { ProjectFreakDatabase } from '../db/projectFreakDb'
import { create_sync_outbox_entry } from './persistenceUtils'
import { DexieSyncRepository } from './dexieRepositories'

const DB_NAME = 'pf-atomic-remote-apply-test'
const NOW = '2026-10-11T11:30:00.000Z'

const base = {
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: 'device-pc',
  source_kind: 'user' as const,
  source_id: null,
}

const local_exercise: Exercise = {
  ...base,
  id: 'exercise-1',
  canonical_name: 'Original Curl',
  short_name: null,
  category: 'biceps',
  equipment: null,
  default_load_type: 'normal',
  rep_mode_default: 'total',
  archived_at: null,
  notes: null,
}

describe('atomic remote apply against real IndexedDB connections', () => {
  let first: ProjectFreakDatabase
  let other_tab: ProjectFreakDatabase
  let sync: DexieSyncRepository

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
    first = new ProjectFreakDatabase(DB_NAME)
    other_tab = new ProjectFreakDatabase(DB_NAME)
    await first.open()
    await other_tab.open()
    sync = new DexieSyncRepository(first)
    await first.exercises.add(local_exercise)
  })

  afterEach(async () => {
    first.close()
    other_tab.close()
    await Dexie.delete(DB_NAME)
  })

  it('preserves a cross-tab pending edit instead of overwriting with a divergent cloud revision', async () => {
    const local_edit = {
      ...local_exercise,
      revision: 2,
      device_id: 'device-phone',
      canonical_name: 'Manually corrected curl',
      updated_at: '2026-10-11T11:31:00.000Z',
    }
    const remote = {
      ...local_exercise,
      revision: 2,
      device_id: 'device-other',
      canonical_name: 'Earlier cloud edit',
      updated_at: '2026-10-11T11:30:30.000Z',
    }

    // A second tab writes both content and its outbox entry atomically
    // after a caller may have observed the old revision.
    await other_tab.transaction(
      'rw',
      other_tab.exercises,
      other_tab.sync_outbox,
      async () => {
        await other_tab.exercises.put(local_edit)
        await other_tab.sync_outbox.add(
          create_sync_outbox_entry('exercise', local_edit),
        )
      },
    )

    expect(
      await sync.apply_remote_entity_checked('exercise', remote, NOW),
    ).toBe('retained_conflict')
    expect(await first.exercises.get(local_edit.id)).toEqual(local_edit)

    const pending = await first.sync_outbox.toArray()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      entity_type: 'exercise',
      entity_id: local_edit.id,
      revision: 2,
      synced_at: null,
    })

    const evidence = (await first.audit_events.toArray())
      .filter((entry) => entry.action === 'sync_conflict')
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      before_json: expect.objectContaining({ canonical_name: 'Manually corrected curl' }),
      after_json: expect.objectContaining({ canonical_name: 'Earlier cloud edit' }),
    })

    // Retrying the same pull must not create duplicate conflict evidence.
    expect(
      await sync.apply_remote_entity_checked('exercise', remote, NOW),
    ).toBe('retained_conflict')
    expect(
      (await first.audit_events.toArray())
        .filter((entry) => entry.action === 'sync_conflict'),
    ).toHaveLength(1)
  })

  it('retains stale remote revisions with full recovery evidence', async () => {
    const newest = { ...local_exercise, revision: 3, canonical_name: 'Latest' }
    await first.exercises.put(newest)
    const stale = { ...local_exercise, revision: 2, canonical_name: 'Old cloud' }

    await expect(
      sync.apply_remote_entity_checked('exercise', stale, NOW),
    ).resolves.toBe('stale')
    expect(await first.exercises.get(local_exercise.id)).toEqual(newest)
    const evidence = await first.audit_events.toArray()
    expect(evidence).toHaveLength(1)
    expect(evidence[0].action).toBe('sync_conflict')
    expect(evidence[0].after_json).toMatchObject({ canonical_name: 'Old cloud' })
  })

  it('applies a newer cloud snapshot when no local mutation is pending', async () => {
    const remote = { ...local_exercise, revision: 2, canonical_name: 'Cloud update' }
    await expect(
      sync.apply_remote_entity_checked('exercise', remote, NOW),
    ).resolves.toBe('applied')
    expect(await first.exercises.get(local_exercise.id)).toEqual(remote)
    expect(await first.audit_events.toArray()).toHaveLength(1)
    expect(await first.sync_outbox.count()).toBe(0)
    await expect(
      sync.apply_remote_entity_checked('exercise', remote, NOW),
    ).resolves.toBe('verified_duplicate')
    expect(await first.audit_events.toArray()).toHaveLength(1)
  })

  it('does not delete a pending metrics edit when another ID uses the same unique logical key', async () => {
    const local: ExerciseMetrics = {
      ...base,
      id: 'metrics-local',
      session_exercise_id: 'session-exercise-1',
      rpe: 8,
      pump: 9,
      form: 9,
      where_felt_text: null,
      where_felt_tags: [],
      legacy_tension: null,
      legacy_mmc: null,
      notes: null,
    }
    await first.exercise_metrics.add(local)
    await other_tab.sync_outbox.add(
      create_sync_outbox_entry('exercise_metrics', local),
    )
    const remote: ExerciseMetrics = {
      ...local,
      id: 'metrics-remote',
      rpe: 6,
      device_id: 'remote-device',
    }

    expect(
      await sync.apply_remote_entity_checked('exercise_metrics', remote, NOW),
    ).toBe('retained_conflict')
    expect(await first.exercise_metrics.get(local.id)).toEqual(local)
    expect(await first.exercise_metrics.get(remote.id)).toBeUndefined()
    expect(await first.sync_outbox.count()).toBe(1)
    expect((await first.audit_events.toArray())[0].action).toBe('sync_conflict')
  })
})
