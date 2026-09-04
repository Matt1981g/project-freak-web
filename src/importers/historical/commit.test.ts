import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { commit_historical_import } from './commit'
import { parse_historical_workbook } from './parser'
import { REQUIRED_SET_DATA_COLUMNS } from './profile'

const TEST_DB_NAME = 'project-freak-historical-import-test'
const DEVICE_ID = '11111111-1111-4111-8111-111111111111'

function workbook_fixture(): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [...REQUIRED_SET_DATA_COLUMNS],
      [
        'W01',
        46193,
        'Sat',
        '08:30',
        '10:30',
        1,
        'Nautilus Biceps Curl',
        1,
        25,
        'normal',
        'rest-pause',
        '14+4 rest-pause',
        14,
        25,
        4,
        18,
        0,
        10,
        10,
        9,
        null,
        null,
        450,
        'primary + secondary component',
        'Explicit rest-pause',
        'Verified',
        'Fixture',
      ],
    ]),
    'Set Data',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Workout ID',
        'Date',
        'Day',
        'Start',
        'Finish',
        'Exercises',
        'Working Sets',
        'Completed Reps',
        'Total Recorded Load',
        'Avg RPE',
        'Avg Pump',
        'Avg Form',
        'Data Notes',
      ],
      ['W01', 46193, 'Sat', '08:30', '10:30', 1, 1, 18, 450, null, null, null, null],
    ]),
    'Session Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Exercise']]),
    'Exercise Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Issue / rule', 'Handling in export']]),
    'Data Audit',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['PROJECT FREAK', null]]),
    'README',
  )
  return XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer
}

describe('commit_historical_import', () => {
  let db: ProjectFreakDatabase

  beforeEach(async () => {
    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('commits one atomic import with provenance, component, audit and outbox data', async () => {
    const preview = await parse_historical_workbook(
      workbook_fixture(),
      'fixture.xlsx',
    )
    const result = await commit_historical_import(db, preview, DEVICE_ID)

    expect(result.status).toBe('committed')
    expect(result.inserted).toMatchObject({
      exercises: 1,
      sessions: 1,
      session_exercises: 1,
      sets: 1,
      set_components: 1,
      exercise_metrics: 1,
      import_records: 1,
    })

    expect(await db.sets.count()).toBe(1)
    expect(await db.set_components.count()).toBe(1)
    expect(await db.import_records.count()).toBe(1)
    expect(await db.import_batches.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(6)
    expect(await db.sync_outbox.count()).toBe(6)

    const provenance = await db.import_records.toCollection().first()
    expect(provenance?.data_status).toBe('Verified')
    expect(provenance?.source_text).toBe('Fixture')
  })

  it('is duplicate-safe when the identical file is imported twice', async () => {
    const bytes = workbook_fixture()
    const preview = await parse_historical_workbook(bytes, 'fixture.xlsx')

    const first = await commit_historical_import(db, preview, DEVICE_ID)
    const second = await commit_historical_import(db, preview, DEVICE_ID)

    expect(first.status).toBe('committed')
    expect(second.status).toBe('duplicate_noop')
    expect(await db.sets.count()).toBe(1)
    expect(await db.completed_sessions.count()).toBe(1)
    expect(await db.import_records.count()).toBe(1)
  })
})
