import type { Exercise, GymExerciseAvailability, GymProfile } from '../../domain/models'
import type { ExerciseRepository, GymRepository, SettingsRepository } from '../../data/repositories/contracts'

export const TRIDENT_GYM_ID = 'gym-trident-plymouth'
export const JACKSONS_GYM_ID = 'gym-jacksons-plymouth'
export const GENERIC_GYM_ID = 'gym-generic-travel'
export const ACTIVE_GYM_SETTING_KEY = 'active_gym_profile_id'
export const TRIDENT_COPY_KEY = 'trident_jacksons_copy_v1'

// One-time baseline, never a live link: subsequent Trident edits stay independent.
export async function copy_jacksons_to_trident(
  gyms: GymRepository, settings: SettingsRepository, device_id: string,
  timestamp = new Date().toISOString(),
) {
  if ((await settings.get(TRIDENT_COPY_KEY))?.value_json === true) return
  const source = await gyms.list_availability(JACKSONS_GYM_ID)
  if (source.length === 0) return // Wait for the original exercise data to arrive.
  const target = await gyms.get_profile(TRIDENT_GYM_ID)
  if (!target || target.deleted_at !== null) throw new Error('Trident profile was not found.')
  const existing = new Set((await gyms.list_availability(TRIDENT_GYM_ID)).map(row => row.exercise_id))
  for (const entry of source) {
    if (existing.has(entry.exercise_id)) continue // Includes explicitly removed items.
    await gyms.put_availability({
      ...entry, id: `${TRIDENT_GYM_ID}:${entry.exercise_id}`,
      gym_profile_id: TRIDENT_GYM_ID, created_at: timestamp, updated_at: timestamp,
      revision: 1, device_id, source_kind: 'user', source_id: null,
    })
  }
  await gyms.put_profile({
    ...target, notes: 'Copied from Jacksons as a starting list. Add or remove options to match Trident.',
    is_inventory_complete: false, revision: target.revision + 1, updated_at: timestamp, device_id,
  })
  await settings.put({ key: TRIDENT_COPY_KEY, scope: 'global', value_json: true,
    updated_at: timestamp, device_id })
}

export async function set_gym_exercise_available(
  gyms: GymRepository, exercises: ExerciseRepository,
  gym_id: string, exercise_id: string, available: boolean, device_id: string,
  timestamp = new Date().toISOString(),
) {
  const profile = await gyms.get_profile(gym_id)
  const exercise = await exercises.get_by_id(exercise_id)
  if (!profile || profile.deleted_at !== null || !exercise || exercise.deleted_at !== null) {
    throw new Error('Gym or exercise was not found.')
  }
  const existing = (await gyms.list_availability(gym_id)).find(row => row.exercise_id === exercise_id)
  await gyms.put_availability({
    ...(existing ?? availability_seed(gym_id, exercise, device_id, timestamp)),
    available, revision: (existing?.revision ?? 0) + 1, updated_at: timestamp, device_id,
  })
}

const PROFILE_SEEDS: Array<Pick<GymProfile, 'id' | 'name' | 'short_name' | 'kind' | 'is_inventory_complete' | 'notes'>> = [
  {
    id: TRIDENT_GYM_ID,
    name: 'Trident Gym Plymouth',
    short_name: 'Trident',
    kind: 'home',
    is_inventory_complete: false,
    notes: 'Current gym. Equipment inventory awaiting the approved Trident audit.',
  },
  {
    id: JACKSONS_GYM_ID,
    name: 'Jacksons',
    short_name: 'Jacksons',
    kind: 'previous',
    is_inventory_complete: true,
    notes: 'Preserved previous-gym profile. Existing active PF exercises were captured here.',
  },
  {
    id: GENERIC_GYM_ID,
    name: 'Generic Gym / Travel',
    short_name: 'Generic',
    kind: 'travel',
    is_inventory_complete: true,
    notes: 'Conservative commercial-gym equipment for England Rugby and travel.',
  },
]

function generic_safe_bet(exercise: Exercise): boolean {
  const text = `${exercise.canonical_name} ${exercise.equipment ?? ''}`.toLocaleLowerCase('en-GB')
  const specialist = /nautilus|pendulum|belt squat|peach builder|iso[- ]|mts|hammer strength|panatta|watson|converging/
  const common = /dumbbell|\bdb\b|barbell|\bez\b|cable|smith|lat pulldown|seated row|leg press|leg extension|leg curl|chest press|shoulder press|pec deck|rear delt|calf|bodyweight|dip|pull[- ]?up/
  return common.test(text) && !specialist.test(text)
}

function availability_seed(
  gym_profile_id: string,
  exercise: Exercise,
  device_id: string,
  timestamp: string,
): GymExerciseAvailability {
  return {
    id: `${gym_profile_id}:${exercise.id}`,
    gym_profile_id,
    exercise_id: exercise.id,
    available: true,
    equipment_label: exercise.equipment,
    notes: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    revision: 1,
    device_id,
    source_kind: 'user',
    source_id: null,
  }
}

export async function ensure_default_gym_profiles(
  gyms: GymRepository,
  exercises: ExerciseRepository,
  settings: SettingsRepository,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<void> {
  const existing = new Map((await gyms.list_profiles()).map((profile) => [profile.id, profile]))
  for (const seed of PROFILE_SEEDS) {
    if (existing.has(seed.id)) continue
    await gyms.put_profile({
      ...seed,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
      revision: 1,
      device_id,
      source_kind: 'user',
      source_id: null,
    })
  }

  const active_exercises = await exercises.list_active()
  for (const gym_profile_id of [JACKSONS_GYM_ID, GENERIC_GYM_ID]) {
    const mapped = new Set((await gyms.list_availability(gym_profile_id)).map((entry) => entry.exercise_id))
    for (const exercise of active_exercises) {
      if (mapped.has(exercise.id)) continue
      if (gym_profile_id === GENERIC_GYM_ID && !generic_safe_bet(exercise)) continue
      await gyms.put_availability(availability_seed(gym_profile_id, exercise, device_id, timestamp))
    }
  }

  if (!(await settings.get(ACTIVE_GYM_SETTING_KEY))) {
    await settings.put({
      key: ACTIVE_GYM_SETTING_KEY,
      scope: 'global',
      value_json: TRIDENT_GYM_ID,
      updated_at: timestamp,
      device_id,
    })
  }
}

export async function load_gym_profiles(gyms: GymRepository, settings: SettingsRepository) {
  const [profiles, active_setting] = await Promise.all([
    gyms.list_profiles(),
    settings.get(ACTIVE_GYM_SETTING_KEY),
  ])
  const active_gym_id = typeof active_setting?.value_json === 'string'
    ? active_setting.value_json
    : TRIDENT_GYM_ID
  const availability_counts = Object.fromEntries(
    await Promise.all(profiles.map(async (profile) => [
      profile.id,
      (await gyms.list_availability(profile.id)).filter((entry) => entry.available).length,
    ])),
  )
  return { profiles, active_gym_id, availability_counts }
}

export async function save_active_gym(
  gym_profile_id: string,
  gyms: GymRepository,
  settings: SettingsRepository,
  device_id: string,
  timestamp = new Date().toISOString(),
) {
  const profile = await gyms.get_profile(gym_profile_id)
  if (!profile || profile.deleted_at !== null) throw new Error('Gym profile was not found.')
  await settings.put({
    key: ACTIVE_GYM_SETTING_KEY,
    scope: 'global',
    value_json: gym_profile_id,
    updated_at: timestamp,
    device_id,
  })
  return profile
}

export async function load_active_gym(gyms: GymRepository, settings: SettingsRepository) {
  const setting = await settings.get(ACTIVE_GYM_SETTING_KEY)
  const id = typeof setting?.value_json === 'string' ? setting.value_json : TRIDENT_GYM_ID
  return gyms.get_profile(id)
}
