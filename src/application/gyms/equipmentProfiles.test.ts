import { describe, expect, it } from 'vitest'
import type { EquipmentSnapshot, Exercise, GymExerciseAvailability, GymProfile, ProgrammedSessionSet } from '../../domain/models'
import type { ExerciseRepository, GymRepository } from '../../data/repositories/contracts'
import { assign_equipment_profile, comparable_equipment, ensure_equipment_profiles, equipment_snapshot, equipment_scoped_prescription, propose_equipment_profile } from './equipmentProfiles'
import { GENERIC_GYM_ID, JACKSONS_GYM_ID, TRIDENT_GYM_ID } from './gymProfiles'

const base = { created_at: '2026-09-17T12:00:00Z', updated_at: '2026-09-17T12:00:00Z', deleted_at: null,
  revision: 1, device_id: 'test', source_kind: 'user' as const, source_id: null }
function option(id: string, name: string, brand: string | null, model: string | null, gym = TRIDENT_GYM_ID) {
  const exercise: Exercise = { ...base, id, canonical_name: name, short_name: null, category: null, equipment: null,
    default_load_type: 'normal', rep_mode_default: 'total', archived_at: null, notes: null }
  const mapping: GymExerciseAvailability = { ...base, id: `link:${gym}:${id}`, gym_profile_id: gym, exercise_id: id,
    available: true, equipment_label: name, machine_brand: brand, machine_model: model, notes: null }
  return { exercise, mapping }
}
function fixture(options: ReturnType<typeof option>[]) {
  let gym: GymProfile = { ...base, id: TRIDENT_GYM_ID, name: 'Trident', short_name: 'Trident', kind: 'home', is_inventory_complete: true, notes: null }
  const rows = options.map(o => o.mapping)
  let writes = 0
  const gyms: GymRepository = {
    get_profile: async () => gym, list_profiles: async () => [gym], list_availability: async () => rows,
    put_profile: async row => { gym = row; writes++; return row.id },
    put_availability: async row => { rows[rows.findIndex(r => r.id === row.id)] = row; writes++; return row.id },
  }
  const exercises = { list_active: async () => options.map(o => o.exercise) } as ExerciseRepository
  return { gyms, exercises, rows, gym: () => gym, writes: () => writes }
}
const propose = (o: ReturnType<typeof option>) => propose_equipment_profile(o.exercise, o.mapping)

describe('physical equipment attribution', () => {
  it('withholds adaptive loads and challenge flags for a different machine without changing the prescription', () => {
    const snapshot = { profile_id: 'machine', gym_profile_id: 'gym', label: 'Machine', comparable: true, setup_notes: null }
    const set = { target_load_kg: 40, equipment_snapshot: snapshot,
      notes: 'Keep elbows fixed\nPF_ADAPTIVE_SOURCE:s1\nPF_ADAPTIVE_CHALLENGE:{}' } as ProgrammedSessionSet
    expect(equipment_scoped_prescription(set, snapshot)).toBe(set)
    expect(equipment_scoped_prescription(set, { ...snapshot, profile_id: 'other' })).toMatchObject({ target_load_kg: null, notes: 'Keep elbows fixed' })
    expect(set.target_load_kg).toBe(40)
    const coach = { ...set, equipment_snapshot: undefined, notes: 'Coach prescribed load' }
    expect(equipment_scoped_prescription(coach, null)).toBe(coach)
  })
  it('links Jacksons confirmed duplicates but separates the row from the high row', () => {
    const p = (name: string) => propose(option(name, name, null, null, JACKSONS_GYM_ID))
    expect(p('High Row').id).toBe(p('MTS High Row').id)
    expect(p('MTS row').id).not.toBe(p('MTS High Row').id)
    expect(p('ISO Shoulder Press').id).toBe(p('Overhead press (ISO lateral machine)').id)
    expect(p('Single-Arm ISO Pulldown').id).toBe(p('Single-Arm ISO Lat Pulldown').id)
    expect(p('MTS row').status).toBe('identified')
  })
  it('links the owner-confirmed hip-thrust and arm-curl pairs without merging exercises', () => {
    expect(propose(option('glute', 'Glute bridge', 'Technogym', 'Pure strenth Hip thrust')).id)
      .toBe(propose(option('hip', 'Hip Thrust', 'Technogym', 'Pure Strength MG8000')).id)
    expect(propose(option('curl', 'Seated Arm Curl Machine', 'Technogym', 'Seated Stack loaded')).id)
      .toBe(propose(option('biceps', 'Biceps Curl', 'Technogym', 'Selection 700 MN6')).id)
    expect(propose(option('triceps', 'Triceps Extension', 'Technogym', 'Selection 700 MN6')).id)
      .not.toBe(propose(option('biceps', 'Biceps Curl', 'Technogym', 'Selection 700 MN6')).id)
  })
  it('uses saved corrections and keeps the three leg presses separate', () => {
    const edited = option('press', 'Leg Press', 'Hammer Strength', '45° adjustable lying/seated')
    edited.exercise.machine_brand = 'Technogym'
    edited.exercise.machine_model = 'Pure Strength MG5000'
    const profiles = [edited, option('iso', 'ISO Lat leg press', 'Hammer Strength', 'ISO lateral'),
      option('parallel', 'Leg Press (Parallel)', null, 'Plate loaded')].map(propose)
    expect(new Set(profiles.map(p => p.id)).size).toBe(3)
    expect(profiles[0].id).not.toContain('mg5000')
  })
  it('shares confirmed Trident cables only within their gym, leaving travel unresolved', () => {
    const a = propose(option('a', 'Cable row', 'Generic', null))
    const b = propose(option('b', 'Cable fly', 'Generic', null))
    expect(a.id).toBe(b.id)
    expect(a.status).toBe('identified')
    expect(propose(option('a', 'Cable row', 'Generic', null, JACKSONS_GYM_ID)).id).not.toBe(a.id)
    expect(propose(option('a', 'Cable row', 'Generic', null, GENERIC_GYM_ID)).status).toBe('needs_review')
  })
  it('confirms the four presence answers once, preserves IDs, and makes no repeat writes', async () => {
    const ids = ['trident-technogym-pure-strength-mg2500-low-row', 'trident-technogym-selection-700-mnhc-low-row',
      'trident-technogym-selection-700-mncc-lower-back', 'trident-technogym-selection-700-mn6-triceps-extension']
    const options = ids.map((id, i) => option(id, i === 3 ? 'Triceps Extension' : 'Machine', 'Technogym', ['MG2500','MNHC','MNCC','MN6'][i]))
    options.forEach(o => { o.mapping.notes = '[UNCONFIRMED] Listed in inventory' })
    const before = structuredClone(options.map(o => o.exercise))
    const f = fixture(options)
    expect(await ensure_equipment_profiles(f.gyms, f.exercises, TRIDENT_GYM_ID, 'test')).toBe(true)
    expect(f.rows.map(r => r.exercise_id)).toEqual(ids)
    expect(f.rows.every(r => r.notes?.startsWith('[CONFIRMED]'))).toBe(true)
    expect(f.rows.every(r => equipment_snapshot(f.gym(), r)?.comparable)).toBe(true)
    const writes = f.writes()
    expect(await ensure_equipment_profiles(f.gyms, f.exercises, TRIDENT_GYM_ID, 'test')).toBe(false)
    expect(f.writes()).toBe(writes)
    expect(options.map(o => o.exercise)).toEqual(before)
    f.rows[0] = { ...f.rows[0], notes: '[UNCONFIRMED] Later user correction' }
    await ensure_equipment_profiles(f.gyms, f.exercises, TRIDENT_GYM_ID, 'test')
    expect(equipment_snapshot(f.gym(), f.rows[0])?.comparable).toBe(false)
  })
  it('preserves a manually confirmed link over automatic refresh and rejects foreign equipment', async () => {
    const f = fixture([option('a', 'Machine', null, null)])
    await ensure_equipment_profiles(f.gyms, f.exercises, TRIDENT_GYM_ID, 'test')
    await assign_equipment_profile(f.gyms, TRIDENT_GYM_ID, 'a', null, 'Known machine A', 'test')
    const id = f.rows[0].equipment_profile_id
    f.rows[0] = { ...f.rows[0], machine_model: 'Renamed' }
    await ensure_equipment_profiles(f.gyms, f.exercises, TRIDENT_GYM_ID, 'test')
    expect(f.rows[0].equipment_profile_id).toBe(id)
    expect(equipment_snapshot(f.gym(), f.rows[0])?.comparable).toBe(true)
    await expect(assign_equipment_profile(f.gyms, TRIDENT_GYM_ID, 'a', 'foreign', '', 'test')).rejects.toThrow('this gym')
  })
  it('requires matching confirmed gym, machine and setup; punctuation in settings matters', () => {
    const a: EquipmentSnapshot = { profile_id: 'machine', gym_profile_id: 'gym', label: 'Machine', comparable: true, setup_notes: 'Seat 1.5' }
    expect(comparable_equipment(a, { ...a, label: 'Renamed', setup_notes: ' seat 1.5 ' })).toBe(true)
    for (const b of [null, { ...a, comparable: false }, { ...a, profile_id: 'other' }, { ...a, gym_profile_id: 'other' }, { ...a, setup_notes: 'Seat 1 5' }]) {
      expect(comparable_equipment(a, b)).toBe(false)
    }
  })
})
