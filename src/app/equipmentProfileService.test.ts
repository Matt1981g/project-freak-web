import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectFreakDb as db } from '../data/db/projectFreakDb'
import { load_equipment_profile_state, save_equipment_profile_link } from './equipmentProfileService'
import { TRIDENT_GYM_ID } from '../application/gyms/gymProfiles'
import { add_new_gym_equipment, load_gym_profile_state } from './projectFreakServices'

describe('equipment service database transactions', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    const base = { created_at: '2026-09-17T12:00:00Z', updated_at: '2026-09-17T12:00:00Z', deleted_at: null,
      revision: 1, device_id: 'test', source_kind: 'user' as const, source_id: null }
    await db.gym_profiles.put({ ...base, id: TRIDENT_GYM_ID, name: 'Trident', short_name: 'Trident', kind: 'home', is_inventory_complete: true, notes: null })
    for (let index = 0; index < 88; index++) {
      const id = `exercise-${index}`
      await db.exercises.put({ ...base, id, canonical_name: `Machine ${index}`, short_name: null, category: null, equipment: 'Machine',
        default_load_type: 'normal', rep_mode_default: 'total', archived_at: null, notes: null })
      await db.gym_exercise_availability.put({ ...base, id: `link-${index}`, gym_profile_id: TRIDENT_GYM_ID, exercise_id: id,
        available: true, equipment_label: `Machine ${index}`, machine_brand: 'Brand', machine_model: `Model ${index}`, notes: null })
    }
  })
  afterEach(async () => { await db.delete() })

  it('attributes a full gym, reloads without writes and commits manual equipment links', async () => {
    const first = await load_equipment_profile_state(TRIDENT_GYM_ID)
    expect(first.mappings).toHaveLength(88)
    expect(first.mappings.every(row => row.equipment_profile_id)).toBe(true)
    const writes = await db.sync_outbox.count()
    await load_equipment_profile_state(TRIDENT_GYM_ID)
    expect(await db.sync_outbox.count()).toBe(writes)
    await save_equipment_profile_link(TRIDENT_GYM_ID, 'exercise-0', first.profiles[1].id, '')
    expect((await db.gym_exercise_availability.get('link-0'))?.equipment_profile_id).toBe(first.profiles[1].id)
  })

  it('initialises gym equipment and creates a new machine through the screen services', async () => {
    await load_gym_profile_state()
    await load_gym_profile_state()
    const exercise = await add_new_gym_equipment(TRIDENT_GYM_ID, { name: 'New row', brand: 'Test', model: 'R1', category: 'Back' })
    const state = await load_equipment_profile_state(TRIDENT_GYM_ID)
    expect(state.mappings.find(row => row.exercise_id === exercise.id)?.equipment_profile_id).toBeTruthy()
  })

  it('rolls back all equipment and audit writes if attribution fails partway through', async () => {
    const fail = (_changes: object, id: string) => {
      if (id === 'link-40') throw new Error('Simulated write failure')
    }
    db.gym_exercise_availability.hook('updating', fail)
    try {
      await expect(load_equipment_profile_state(TRIDENT_GYM_ID)).rejects.toThrow('Simulated write failure')
      expect((await db.gym_profiles.get(TRIDENT_GYM_ID))?.equipment_profiles).toBeUndefined()
      expect((await db.gym_exercise_availability.toArray()).every(row => !row.equipment_profile_id)).toBe(true)
      expect(await db.sync_outbox.count()).toBe(0)
      expect(await db.audit_events.count()).toBe(0)
    } finally { db.gym_exercise_availability.hook('updating').unsubscribe(fail) }
    expect((await load_equipment_profile_state(TRIDENT_GYM_ID)).profiles).toHaveLength(88)
  })
})
