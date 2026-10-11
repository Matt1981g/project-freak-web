import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { build_full_backup } from './databaseBackup'

const DB_NAME = 'pf-concurrent-backup-snapshot-test'
const NOW = '2026-10-11T11:00:00.000Z'

describe('atomic full-backup read snapshot', () => {
  let backup_connection: ProjectFreakDatabase
  let writer_connection: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
    backup_connection = new ProjectFreakDatabase(DB_NAME)
    writer_connection = new ProjectFreakDatabase(DB_NAME)
    await backup_connection.open()
    await writer_connection.open()

    await backup_connection.settings.put({
      key: 'paired-snapshot',
      scope: 'global',
      value_json: { epoch: 'before' },
      updated_at: NOW,
      device_id: null,
    })
    await backup_connection.sync_state.put({
      provider: 'paired-snapshot',
      remote_user_id: null,
      pull_cursor: 'before',
      last_pull_at: null,
      last_push_at: null,
      status: 'idle',
      error: null,
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    backup_connection.close()
    writer_connection.close()
    await Dexie.delete(DB_NAME)
  })

  it('never mixes rows read before and after a cross-tab atomic write', async () => {
    await backup_connection.ensure_schema_metadata()

    // Backup calls db.table(name); Dexie may create a different table wrapper
    // than the db.settings property, so intercept the same lookup path.
    const settings_table = backup_connection.table('settings')
    const original_to_array = settings_table.toArray.bind(settings_table)
    let write_started = false
    let write_promise: Promise<unknown> | null = null

    // Trigger a real write transaction from another IndexedDB connection
    // after the backup has already read its early settings store but before
    // it reads sync_state (near the end of the complete store list).
    vi.spyOn(settings_table, 'toArray').mockImplementation(() =>
      original_to_array().then((rows) => {
      if (!write_started) {
        write_started = true
        write_promise = writer_connection.transaction(
          'rw',
          writer_connection.settings,
          writer_connection.sync_state,
          async () => {
            await writer_connection.settings.put({
              key: 'paired-snapshot',
              scope: 'global',
              value_json: { epoch: 'after' },
              updated_at: '2026-10-11T11:00:01.000Z',
              device_id: null,
            })
            await writer_connection.sync_state.put({
              provider: 'paired-snapshot',
              remote_user_id: null,
              pull_cursor: 'after',
              last_pull_at: null,
              last_push_at: null,
              status: 'idle',
              error: null,
            })
          },
        )
        // Keep the read transaction alive while the other connection tries
        // to commit; without a single encompassing read transaction, the
        // later store would reflect the writer and form a torn backup.
        return Dexie.waitFor(
          new Promise<void>((resolve) => setTimeout(resolve, 25)),
        ).then(() => rows)
      }
      return rows
    }),
  )

    const backup = await build_full_backup(backup_connection, {
      now_iso: NOW,
      source_device_id: 'snapshot-test',
    })
    expect(write_started).toBe(true)
    await write_promise

    const epoch = (
      backup.database.tables.settings.find(
        (row) => row.key === 'paired-snapshot',
      )?.value_json as { epoch?: string } | undefined
    )?.epoch
    const cursor = backup.database.tables.sync_state.find(
      (row) => row.provider === 'paired-snapshot',
    )?.pull_cursor

    expect([epoch, cursor]).toEqual(['before', 'before'])
    expect(
      (await writer_connection.settings.get('paired-snapshot'))?.value_json,
    ).toEqual({ epoch: 'after' })
    expect(
      (await writer_connection.sync_state.get('paired-snapshot'))?.pull_cursor,
    ).toBe('after')
  })
})
