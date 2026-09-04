import { basename, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import Dexie from 'dexie'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../src/data/db/projectFreakDb'
import { commit_historical_import } from '../../src/importers/historical/commit'
import { parse_historical_workbook } from '../../src/importers/historical/parser'
import { CANONICAL_HISTORICAL_PROFILE } from '../../src/importers/historical/profile'

const workbook_path = process.env.PROJECT_FREAK_HISTORICAL_XLSX
const TEST_DB_NAME = 'project-freak-real-historical-import-test'
const DEVICE_ID = '11111111-1111-4111-8111-111111111111'

describe.skipIf(!workbook_path)('canonical historical workbook', () => {
  let db: ProjectFreakDatabase
  let file_data: ArrayBuffer

  beforeAll(async () => {
    const bytes = await readFile(resolve(workbook_path!))
    file_data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer

    await Dexie.delete(TEST_DB_NAME)
    db = new ProjectFreakDatabase(TEST_DB_NAME)
    await db.open()
  })

  afterAll(async () => {
    db.close()
    await Dexie.delete(TEST_DB_NAME)
  })

  it('validates and imports the locked canonical workbook twice without duplication', async () => {
    const preview = await parse_historical_workbook(
      file_data,
      basename(workbook_path!),
    )

    const blocking_issues = preview.issues.filter(
      (entry) => entry.severity === 'error',
    )

    expect(blocking_issues).toEqual([])
    expect(preview.can_commit).toBe(true)
    expect(preview.is_canonical_source).toBe(true)
    expect(preview.file_size_bytes).toBe(
      CANONICAL_HISTORICAL_PROFILE.size_bytes,
    )
    expect(preview.detected).toEqual({
      sessions: CANONICAL_HISTORICAL_PROFILE.sessions,
      session_exercises:
        CANONICAL_HISTORICAL_PROFILE.session_exercises,
      exact_exercise_labels:
        CANONICAL_HISTORICAL_PROFILE.exact_exercise_labels,
      sets: CANONICAL_HISTORICAL_PROFILE.sets,
      case_only_duplicate_groups:
        CANONICAL_HISTORICAL_PROFILE.case_only_duplicate_groups,
    })

    const first = await commit_historical_import(
      db,
      preview,
      DEVICE_ID,
    )

    expect(first.status).toBe('committed')
    expect(first.inserted.exercises).toBe(
      CANONICAL_HISTORICAL_PROFILE.exact_exercise_labels,
    )
    expect(first.inserted.sessions).toBe(
      CANONICAL_HISTORICAL_PROFILE.sessions,
    )
    expect(first.inserted.session_exercises).toBe(
      CANONICAL_HISTORICAL_PROFILE.session_exercises,
    )
    expect(first.inserted.sets).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )
    expect(first.inserted.import_records).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )

    expect(await db.exercises.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.exact_exercise_labels,
    )
    expect(await db.completed_sessions.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sessions,
    )
    expect(await db.session_exercises.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.session_exercises,
    )
    expect(await db.sets.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )
    expect(await db.import_records.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )

    const failure_sets = await db.sets
      .filter((set) => set.failure_status !== 'none')
      .count()
    expect(failure_sets).toBe(200)

    const second = await commit_historical_import(
      db,
      preview,
      DEVICE_ID,
    )

    expect(second.status).toBe('duplicate_noop')
    expect(await db.completed_sessions.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sessions,
    )
    expect(await db.sets.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )
    expect(await db.import_records.count()).toBe(
      CANONICAL_HISTORICAL_PROFILE.sets,
    )
  })
})
