import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { PROJECT_FREAK_STORE_NAMES } from '../../data/db/schema'
import {
  BACKUP_FORMAT,
  build_full_backup,
  preview_backup_json,
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
