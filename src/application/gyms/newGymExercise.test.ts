import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { create_repositories } from '../../data/repositories'
import { build_full_backup, preview_backup_json } from '../backup/databaseBackup'
import { create_gym_exercise, ensure_default_gym_profiles, TRIDENT_GYM_ID, JACKSONS_GYM_ID, GENERIC_GYM_ID, edit_gym_machine_details, gym_machine_details, set_gym_exercise_available } from './gymProfiles'

describe('new gym machines', () => {
  let db: ProjectFreakDatabase
  let repos: ReturnType<typeof create_repositories>
  beforeEach(async () => {
    db = new ProjectFreakDatabase('new-gym-machine-test')
    await db.open()
    repos = create_repositories(db)
    await ensure_default_gym_profiles(repos.gyms, repos.exercises, repos.settings, 'test-device')
  })
  afterEach(async () => { await db.delete() })

  it('edits gym-local details without rewriting the exercise identity, another gym or history', async () => {
    const exercise = await create_gym_exercise(repos.gyms, repos.exercises, JACKSONS_GYM_ID,
      { name: 'Leg Press', brand: '', model: '', category: '' }, 'test-device')
    await set_gym_exercise_available(repos.gyms, repos.exercises, TRIDENT_GYM_ID, exercise.id, true, 'test-device')
    const trident = await repos.gyms.list_availability(TRIDENT_GYM_ID)
    const historyBefore = await db.audit_events.toArray()
    await edit_gym_machine_details(repos.gyms, repos.exercises, JACKSONS_GYM_ID,
      exercise.id, ' Panatta ', '45 degree', 'test-device')
    const mapping = (await repos.gyms.list_availability(JACKSONS_GYM_ID))[0]
    expect(mapping.exercise_id).toBe(exercise.id)
    expect(mapping.available).toBe(true)
    expect(gym_machine_details(exercise, mapping).display_name).toBe('Leg Press — Panatta 45 degree')
    expect(await repos.exercises.get_by_id(exercise.id)).toEqual(exercise)
    expect(await repos.gyms.list_availability(TRIDENT_GYM_ID)).toEqual(trident)
    const audit = await db.audit_events.toArray()
    const newEvents = audit.filter(event => !historyBefore.some(old => old.id === event.id))
    expect(newEvents).toHaveLength(1)
    expect(newEvents[0].entity_type).toBe('gym_exercise_availability')
    const backup = await build_full_backup(db, { now_iso: new Date().toISOString(), source_device_id: 'test-device' })
    expect((await preview_backup_json(JSON.stringify(backup))).valid).toBe(true)
    await edit_gym_machine_details(repos.gyms, repos.exercises, JACKSONS_GYM_ID,
      exercise.id, '', '', 'test-device')
    expect(gym_machine_details(exercise, (await repos.gyms.list_availability(JACKSONS_GYM_ID))[0]).display_name).toBe('Leg Press')
  })

  it('stores independent brand variants, sync entries and backup fields without populating other gyms', async () => {
    const input = { name: 'Leg Press', brand: 'Panatta', model: '45 degree', category: 'Quads' }
    const first = await create_gym_exercise(repos.gyms, repos.exercises, TRIDENT_GYM_ID, input, 'test-device')
    const second = await create_gym_exercise(repos.gyms, repos.exercises, TRIDENT_GYM_ID,
      { ...input, brand: 'Hammer Strength' }, 'test-device')
    expect(first.id).not.toBe(second.id)
    expect(first.canonical_name).toBe('Leg Press — Panatta 45 degree')
    await ensure_default_gym_profiles(repos.gyms, repos.exercises, repos.settings, 'test-device')
    expect(await repos.gyms.list_availability(TRIDENT_GYM_ID)).toHaveLength(2)
    expect(await repos.gyms.list_availability(JACKSONS_GYM_ID)).toHaveLength(0)
    expect(await repos.gyms.list_availability(GENERIC_GYM_ID)).toHaveLength(0)
    expect(await db.completed_sessions.count()).toBe(0)
    expect((await db.sync_outbox.toArray()).filter(row => row.entity_type === 'exercise')).toHaveLength(2)
    const backup = await build_full_backup(db, { now_iso: new Date().toISOString(), source_device_id: 'test-device' })
    const preview = await preview_backup_json(JSON.stringify(backup))
    expect(preview.valid).toBe(true)
    expect(preview.backup.database.tables.exercises.find(row => row.id === first.id)?.machine_brand).toBe('Panatta')
  })

  it('allows unknown brands, rejects duplicates and blank names without creating extra records', async () => {
    const input = { name: '  Chest Press  ', brand: '', model: '', category: '' }
    const first = await create_gym_exercise(repos.gyms, repos.exercises, TRIDENT_GYM_ID, input, 'test-device')
    expect(first.machine_brand).toBeNull()
    expect(first.canonical_name).toBe('Chest Press')
    await expect(create_gym_exercise(repos.gyms, repos.exercises, TRIDENT_GYM_ID,
      { ...input, name: 'chest press' }, 'test-device')).rejects.toThrow('already exists')
    await expect(create_gym_exercise(repos.gyms, repos.exercises, TRIDENT_GYM_ID,
      { ...input, name: '  ' }, 'test-device')).rejects.toThrow('Enter a machine')
    expect(await db.exercises.count()).toBe(1)
  })
})
