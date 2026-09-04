import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from './projectFreakDb'
import {
  PROJECT_FREAK_DATA_CONTRACT_VERSION,
  PROJECT_FREAK_DB_SCHEMA_VERSION,
  PROJECT_FREAK_STORE_NAMES,
} from './schema'

const TEST_DB_NAME = 'project-freak-test'

describe('ProjectFreakDatabase', () => {
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

  it('creates every v1 store declared by the locked specification', () => {
    const actual = db.tables.map((table) => table.name).sort()
    const expected = [...PROJECT_FREAK_STORE_NAMES].sort()

    expect(actual).toEqual(expected)
  })

  it('creates schema metadata without inventing a second record', async () => {
    const first = await db.ensure_schema_metadata()
    const second = await db.ensure_schema_metadata()

    expect(first.key).toBe('main')
    expect(first.db_schema_version).toBe(PROJECT_FREAK_DB_SCHEMA_VERSION)
    expect(first.data_contract_version).toBe(
      PROJECT_FREAK_DATA_CONTRACT_VERSION,
    )
    expect(second).toEqual(first)
    expect(await db.schema_meta.count()).toBe(1)
  })
})
