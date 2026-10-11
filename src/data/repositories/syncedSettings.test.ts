import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../db/projectFreakDb'
import { create_repositories } from './dexieRepositories'

const DB = 'project-freak-synced-settings-test'

describe('cross-device global settings', () => {
  let db: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(DB)
    db = new ProjectFreakDatabase(DB)
    await db.open()
    await db.devices.add({
      id: 'device-1',
      display_name: 'Test Device',
      platform: 'test',
      first_seen_at: '2026-09-05T12:00:00.000Z',
      last_seen_at: '2026-09-05T12:00:00.000Z',
    })
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(DB)
  })

  it('queues global settings for sync as user_setting entities', async () => {
    const repositories = create_repositories(db)

    await repositories.settings.put({
      key: 'training-priorities-v1',
      scope: 'global',
      value_json: { configured: true },
      updated_at: '2026-09-05T13:00:00.000Z',
      device_id: null,
    })

    const synced = await db.synced_settings.get('training-priorities-v1')
    expect(synced?.value_json).toEqual({ configured: true })

    const outbox = await db.sync_outbox.toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0].entity_type).toBe('user_setting')
    expect(outbox[0].entity_id).toBe('training-priorities-v1')
  })

  it('allocates unique revisions and preserves both pending snapshots across tabs', async () => {
    const other_tab = new ProjectFreakDatabase(DB)
    await other_tab.open()

    try {
      const first = create_repositories(db).settings
      const second = create_repositories(other_tab).settings
      const key = 'concurrent-priority-state'

      // Different IndexedDB connections attempt to update the same setting
      // simultaneously; the transactions must serialize the read/modify/write.
      await Promise.all([
        first.put({
          key,
          scope: 'global',
          value_json: { writer: 'desktop' },
          updated_at: '2026-10-11T10:00:00.000Z',
          device_id: null,
        }),
        second.put({
          key,
          scope: 'global',
          value_json: { writer: 'phone' },
          updated_at: '2026-10-11T10:00:01.000Z',
          device_id: null,
        }),
      ])

      const current = await db.synced_settings.get(key)
      const pending = (await db.sync_outbox.toArray())
        .filter((item) => item.entity_type === 'user_setting' && item.entity_id === key)
        .sort((a, b) => a.revision - b.revision)
      const audits = (await db.audit_events.toArray())
        .filter((item) => item.entity_type === 'user_setting' && item.entity_id === key)

      expect(current?.revision).toBe(2)
      expect(pending.map((item) => item.revision)).toEqual([1, 2])
      expect(pending.every((item) => item.synced_at === null)).toBe(true)
      expect(pending.map((item) => item.payload_json)).toEqual([
        expect.objectContaining({
          revision: 1,
          value_json: { writer: 'desktop' },
        }),
        expect.objectContaining({
          revision: 2,
          value_json: { writer: 'phone' },
        }),
      ])
      expect(audits).toHaveLength(2)
      expect(audits.map((item) => item.action).sort()).toEqual([
        'create',
        'update',
      ])
      expect(current?.value_json).toEqual({ writer: 'phone' })
    } finally {
      other_tab.close()
    }
  })

  it('keeps device-only settings local', async () => {
    const repositories = create_repositories(db)

    await repositories.settings.put({
      key: 'device-layout',
      scope: 'device',
      value_json: { compact: true },
      updated_at: '2026-09-05T13:00:00.000Z',
      device_id: 'device-1',
    })

    expect(await db.settings.get('device-layout')).toBeDefined()
    expect(await db.synced_settings.get('device-layout')).toBeUndefined()
    expect(await db.sync_outbox.count()).toBe(0)
  })
})
