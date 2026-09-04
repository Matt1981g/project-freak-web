import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { PROJECT_FREAK_STORE_NAMES } from '../../data/db/schema'
import {
  BACKUP_FORMAT,
  build_full_backup,
  preview_backup_json,
  restore_validated_backup,
} from './databaseBackup'

const TEST_DB_NAME = 'project-freak-backup-test'
const NOW = '2026-09-04T20:00:00.000Z'

describe('PROJECT FREAK database backup', () => {
  let db: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()

    await db.settings.put({
      key: 'test-setting',
      scope: 'global',
      value_json: { enabled: true },
      updated_at: NOW,
      device_id: null,
    })
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('exports every v1 table with a checksum', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(Object.keys(backup.database.tables).sort()).toEqual(
      [...PROJECT_FREAK_STORE_NAMES].sort(),
    )
    expect(Object.keys(backup.checksums.tables).sort()).toEqual(
      [...PROJECT_FREAK_STORE_NAMES].sort(),
    )
    expect(backup.database.tables.settings).toHaveLength(1)
    expect(backup.checksums.tables.settings).toMatch(/^[a-f0-9]{64}$/)
  })

  it('round-trips through validated restore preview without writing data', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    const preview = await preview_backup_json(JSON.stringify(backup))

    expect(preview.valid).toBe(true)
    expect(preview.created_at).toBe(NOW)
    expect(preview.source_device_id).toBe('device-1')
    expect(preview.table_counts.settings).toBe(1)
    expect(preview.total_records).toBeGreaterThanOrEqual(2)
    expect(await db.settings.count()).toBe(1)
  })

  it('restores the validated backup and returns the replaced database as a safety backup', async () => {
    const source_backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    await db.settings.put({
      key: 'changed-after-backup',
      scope: 'global',
      value_json: { changed: true },
      updated_at: '2026-09-04T20:05:00.000Z',
      device_id: null,
    })

    const preview = await preview_backup_json(JSON.stringify(source_backup))
    const result = await restore_validated_backup(db, preview, {
      now_iso: '2026-09-04T20:10:00.000Z',
      source_device_id: 'device-1',
    })

    expect(result.restored).toBe(true)
    expect(await db.settings.get('changed-after-backup')).toBeUndefined()
    expect(await db.settings.get('test-setting')).toBeDefined()
    expect(result.safety_backup.database.tables.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'changed-after-backup' }),
      ]),
    )
  })

  it('revalidates the preview immediately before restore', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })
    const preview = await preview_backup_json(JSON.stringify(backup))

    preview.backup.database.tables.settings[0] = {
      ...preview.backup.database.tables.settings[0],
      tampered: true,
    }

    await expect(
      restore_validated_backup(db, preview, {
        now_iso: '2026-09-04T20:10:00.000Z',
        source_device_id: 'device-1',
      }),
    ).rejects.toThrow('Backup checksum failed for settings')

    expect(await db.settings.get('test-setting')).toBeDefined()
  })

  it('rejects a damaged table checksum', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    backup.database.tables.settings[0] = {
      ...backup.database.tables.settings[0],
      changed: true,
    }

    await expect(
      preview_backup_json(JSON.stringify(backup)),
    ).rejects.toThrow('Backup checksum failed for settings')
  })

  it('rejects backups with a missing table', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    delete backup.database.tables.settings

    await expect(
      preview_backup_json(JSON.stringify(backup)),
    ).rejects.toThrow('Backup table set does not match this database')
  })

  it('rejects incompatible database schema versions', async () => {
    const backup = await build_full_backup(db, {
      now_iso: NOW,
      source_device_id: 'device-1',
    })

    backup.database.db_schema_version = 99

    await expect(
      preview_backup_json(JSON.stringify(backup)),
    ).rejects.toThrow('is not compatible with this app')
  })
})
