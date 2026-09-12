import { describe, expect, it } from 'vitest'
import type { Exercise, GymExerciseAvailability, GymProfile, Setting } from '../../domain/models'
import type { ExerciseRepository, GymRepository, SettingsRepository } from '../../data/repositories/contracts'
import {
  GENERIC_GYM_ID,
  JACKSONS_GYM_ID,
  TRIDENT_GYM_ID,
  ensure_default_gym_profiles,
  load_gym_profiles,
  save_active_gym,
  copy_jacksons_to_trident,
  set_gym_exercise_available,
  edit_gym_machine_details_with_name,
  gym_machine_details,
} from './gymProfiles'

const NOW = '2026-09-12T18:00:00.000Z'
const DEVICE = 'device-1'

function exercise(id: string, name: string, equipment: string): Exercise {
  return { id, canonical_name: name, short_name: null, category: null, equipment,
    default_load_type: 'normal', rep_mode_default: 'total', archived_at: null, notes: null,
    created_at: NOW, updated_at: NOW, deleted_at: null, revision: 1, device_id: DEVICE,
    source_kind: 'user', source_id: null }
}

function fixtures() {
  const profiles: GymProfile[] = []
  const availability: GymExerciseAvailability[] = []
  const settings = new Map<string, Setting>()
  const exercises = [
    exercise('db-curl', 'Dumbbell Curl', 'Dumbbells'),
    exercise('pendulum', 'Pendulum Squat', 'Pendulum squat'),
  ]
  const gymRepo: GymRepository = {
    list_profiles: async () => profiles,
    get_profile: async (id) => profiles.find((profile) => profile.id === id),
    put_profile: async (profile) => {
      const index = profiles.findIndex(row => row.id === profile.id)
      if (index < 0) profiles.push(profile)
      else profiles[index] = profile
      return profile.id
    },
    list_availability: async (id) => availability.filter((entry) => entry.gym_profile_id === id),
    put_availability: async (entry) => {
      const index = availability.findIndex(row => row.id === entry.id)
      if (index < 0) availability.push(entry)
      else availability[index] = entry
      return entry.id
    },
  }
  const exerciseRepo = {
    list_active: async () => exercises,
    get_by_id: async (id: string) => exercises.find(row => row.id === id),
  } as ExerciseRepository
  const settingsRepo: SettingsRepository = {
    get: async (key) => settings.get(key),
    put: async (setting) => { settings.set(setting.key, setting); return setting.key },
  }
  return { profiles, availability, exercises, gymRepo, exerciseRepo, settingsRepo }
}

describe('gym profiles', () => {
  it('copies Jacksons once and preserves independent removals on subsequent loads', async () => {
    const f = fixtures()
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)
    const original = JSON.stringify(await f.gymRepo.list_availability(JACKSONS_GYM_ID))
    await copy_jacksons_to_trident(f.gymRepo, f.settingsRepo, DEVICE, NOW)
    expect((await f.gymRepo.list_availability(TRIDENT_GYM_ID)).filter(row => row.available)).toHaveLength(2)
    await set_gym_exercise_available(f.gymRepo, f.exerciseRepo, TRIDENT_GYM_ID, 'pendulum', false, DEVICE, NOW)
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)
    await copy_jacksons_to_trident(f.gymRepo, f.settingsRepo, DEVICE, NOW)
    expect((await f.gymRepo.list_availability(TRIDENT_GYM_ID)).filter(row => row.available)).toHaveLength(1)
    expect(JSON.stringify(await f.gymRepo.list_availability(JACKSONS_GYM_ID))).toBe(original)
    await set_gym_exercise_available(f.gymRepo, f.exerciseRepo, TRIDENT_GYM_ID, 'pendulum', true, DEVICE, NOW)
    expect((await f.gymRepo.list_availability(TRIDENT_GYM_ID)).filter(row => row.available)).toHaveLength(2)
  })

  it('does not mark an empty source as copied and preserves pre-existing Trident exclusions', async () => {
    const f = fixtures()
    await copy_jacksons_to_trident(f.gymRepo, f.settingsRepo, DEVICE, NOW)
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)
    await set_gym_exercise_available(f.gymRepo, f.exerciseRepo, TRIDENT_GYM_ID, 'pendulum', false, DEVICE, NOW)
    await copy_jacksons_to_trident(f.gymRepo, f.settingsRepo, DEVICE, NOW)
    expect((await f.gymRepo.list_availability(TRIDENT_GYM_ID)).find(row => row.exercise_id === 'pendulum')?.available).toBe(false)
    expect((await f.gymRepo.list_availability(TRIDENT_GYM_ID)).find(row => row.exercise_id === 'db-curl')?.available).toBe(true)
  })

  it('keeps Trident machine identity independent while preserving the shared exercise ID', async () => {
    const f = fixtures()
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)

    const jacksonPendulum = (await f.gymRepo.list_availability(JACKSONS_GYM_ID)).find(row => row.exercise_id === 'pendulum')!
    await f.gymRepo.put_availability({
      ...jacksonPendulum,
      machine_brand: 'Jackson Brand',
      machine_model: 'J-100',
      equipment_label: 'Jacksons Pendulum',
    })
    const jacksonBeforeCopy = JSON.stringify((await f.gymRepo.list_availability(JACKSONS_GYM_ID)).find(row => row.exercise_id === 'pendulum'))

    await copy_jacksons_to_trident(f.gymRepo, f.settingsRepo, DEVICE, NOW)
    const copied = (await f.gymRepo.list_availability(TRIDENT_GYM_ID)).find(row => row.exercise_id === 'pendulum')!
    expect(copied.exercise_id).toBe('pendulum')
    expect(copied.machine_brand).toBeNull()
    expect(copied.machine_model).toBeNull()
    expect(copied.equipment_label).toBeNull()

    await edit_gym_machine_details_with_name(
      f.gymRepo,
      f.exerciseRepo,
      TRIDENT_GYM_ID,
      'pendulum',
      'Panatta',
      'Super Pendulum',
      'Trident Pendulum Squat',
      DEVICE,
      NOW,
    )

    const trident = (await f.gymRepo.list_availability(TRIDENT_GYM_ID)).find(row => row.exercise_id === 'pendulum')!
    const exerciseRecord = f.exercises.find(row => row.id === 'pendulum')!
    expect(trident.exercise_id).toBe('pendulum')
    expect(gym_machine_details(exerciseRecord, trident)).toEqual({
      machine_brand: 'Panatta',
      machine_model: 'Super Pendulum',
      display_name: 'Trident Pendulum Squat',
    })
    expect(JSON.stringify((await f.gymRepo.list_availability(JACKSONS_GYM_ID)).find(row => row.exercise_id === 'pendulum'))).toBe(jacksonBeforeCopy)
    expect(f.exercises.find(row => row.id === 'pendulum')?.canonical_name).toBe('Pendulum Squat')
  })

  it('seeds Trident, preserves all current exercises at Jacksons, and keeps Generic conservative', async () => {
    const f = fixtures()
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)
    const state = await load_gym_profiles(f.gymRepo, f.settingsRepo)

    expect(state.profiles.map((profile) => profile.id).sort()).toEqual(
      [TRIDENT_GYM_ID, JACKSONS_GYM_ID, GENERIC_GYM_ID].sort(),
    )
    expect(state.active_gym_id).toBe(TRIDENT_GYM_ID)
    expect(state.availability_counts[JACKSONS_GYM_ID]).toBe(2)
    expect(state.availability_counts[GENERIC_GYM_ID]).toBe(1)
    expect(state.availability_counts[TRIDENT_GYM_ID]).toBe(0)
  })

  it('switches active gym without deleting profiles or mappings', async () => {
    const f = fixtures()
    await ensure_default_gym_profiles(f.gymRepo, f.exerciseRepo, f.settingsRepo, DEVICE, NOW)
    await save_active_gym(GENERIC_GYM_ID, f.gymRepo, f.settingsRepo, DEVICE, NOW)
    expect((await load_gym_profiles(f.gymRepo, f.settingsRepo)).active_gym_id).toBe(GENERIC_GYM_ID)
    expect(f.profiles).toHaveLength(3)
    expect(f.availability.length).toBe(3)
  })
})
