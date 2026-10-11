import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import {
  DATASET_OWNER_SETTING_KEY,
  assert_dataset_account_compatible,
  evaluate_dataset_binding,
  get_dataset_cloud_owner,
  link_dataset_cloud_owner,
  require_dataset_cloud_owner,
} from './datasetIdentity'

const DB_NAME = 'pf-ownership-test'
const PROJECT = 'https://owner-pf.supabase.co'
const OTHER_PROJECT = 'https://other-pf.supabase.co'
const OWNER = 'user-primary'
const OTHER_USER = 'user-other'
const NOW = '2026-10-11T11:15:00.000Z'

describe('persistent, explicit dataset/account association', () => {
  let db: ProjectFreakDatabase
  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
    db = new ProjectFreakDatabase(DB_NAME)
    await db.open()
  })
  afterEach(async () => {
    db.close()
    await Dexie.delete(DB_NAME)
  })

  it('never infers ownership on initial sign in or before explicit linking', async () => {
    expect(await get_dataset_cloud_owner(db)).toBeNull()
    await assert_dataset_account_compatible(db, PROJECT, OWNER)
    await expect(
      require_dataset_cloud_owner(db, PROJECT, OWNER),
    ).rejects.toThrow('not linked')
    expect(await db.settings.get(DATASET_OWNER_SETTING_KEY)).toBeUndefined()
  })

  it('persists a device-local link and rejects both account and project switching', async () => {
    const owner = await link_dataset_cloud_owner(db, PROJECT + '/', OWNER, NOW)
    expect(owner).toEqual({
      project_url: PROJECT,
      user_id: OWNER,
      linked_at: NOW,
    })
    expect((await db.settings.get(DATASET_OWNER_SETTING_KEY))?.scope).toBe('device')
    expect(await require_dataset_cloud_owner(db, PROJECT, OWNER)).toEqual(owner)
    expect(evaluate_dataset_binding(owner, PROJECT, OWNER)).toBe('matched')
    expect(evaluate_dataset_binding(owner, PROJECT, OTHER_USER)).toBe('mismatch')
    expect(evaluate_dataset_binding(owner, OTHER_PROJECT, OWNER)).toBe('mismatch')
    expect(evaluate_dataset_binding(owner, PROJECT, null)).toBe('signed_out')

    await expect(
      assert_dataset_account_compatible(db, PROJECT, OTHER_USER),
    ).rejects.toThrow('different Supabase account or project')
    await expect(
      require_dataset_cloud_owner(db, OTHER_PROJECT, OWNER),
    ).rejects.toThrow('different Supabase account or project')
    expect(await link_dataset_cloud_owner(db, PROJECT, OWNER, NOW))
      .toEqual(owner)
    await expect(
      link_dataset_cloud_owner(db, PROJECT, OTHER_USER, NOW),
    ).rejects.toThrow('already linked')
    expect(await get_dataset_cloud_owner(db)).toEqual(owner)
  })

  it('refuses claiming a legacy dataset already synced to another account', async () => {
    await db.sync_state.put({
      provider: 'supabase',
      remote_user_id: OWNER,
      pull_cursor: 'old-cursor',
      last_pull_at: NOW,
      last_push_at: NOW,
      status: 'idle',
      error: null,
    })
    await expect(
      link_dataset_cloud_owner(db, PROJECT, OTHER_USER, NOW),
    ).rejects.toThrow('previously synced with a different account')
    expect(await db.settings.get(DATASET_OWNER_SETTING_KEY)).toBeUndefined()
    expect((await db.sync_state.get('supabase'))?.pull_cursor).toBe('old-cursor')
    await link_dataset_cloud_owner(db, PROJECT, OWNER, NOW)
    expect(await get_dataset_cloud_owner(db)).toMatchObject({ user_id: OWNER })
  })

  it('fails closed on damaged or modified binding metadata', async () => {
    await db.settings.add({
      key: DATASET_OWNER_SETTING_KEY,
      scope: 'device',
      value_json: { project_url: PROJECT, user_id: 5 },
      updated_at: NOW,
      device_id: null,
    })
    await expect(get_dataset_cloud_owner(db)).rejects.toThrow('damaged')
    await expect(
      require_dataset_cloud_owner(db, PROJECT, OWNER),
    ).rejects.toThrow('damaged')
  })

  it('serializes competing links from separate tabs and never reassigns ownership', async () => {
    const other_tab = new ProjectFreakDatabase(DB_NAME)
    await other_tab.open()
    try {
      const results = await Promise.allSettled([
        link_dataset_cloud_owner(db, PROJECT, OWNER, NOW),
        link_dataset_cloud_owner(other_tab, PROJECT, OTHER_USER, NOW),
      ])
      expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1)
      const persisted = await get_dataset_cloud_owner(db)
      expect([OWNER, OTHER_USER]).toContain(persisted?.user_id)
      expect((await db.settings.toArray())
        .filter((row) => row.key === DATASET_OWNER_SETTING_KEY)).toHaveLength(1)
    } finally {
      other_tab.close()
    }
  })
})
