import type { EquipmentProfile, EquipmentSnapshot, Exercise, GymExerciseAvailability, GymProfile, ProgrammedSessionSet } from '../../domain/models'
import type { ExerciseRepository, GymRepository } from '../../data/repositories/contracts'
import { create_uuid } from '../../domain/ids/uuid'
import { GENERIC_GYM_ID, JACKSONS_GYM_ID, TRIDENT_GYM_ID, gym_machine_details } from './gymProfiles'

function key(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function equipment_identity_signature(exercise: Exercise, mapping: GymExerciseAvailability): string {
  const details = gym_machine_details(exercise, mapping)
  return JSON.stringify([details.display_name, details.machine_brand, details.machine_model,
    exercise.equipment, mapping.notes?.startsWith('[UNCONFIRMED]') ?? false])
}

/** Attribution uses saved gym corrections; a catalogue name never overrides them. */
export function propose_equipment_profile(exercise: Exercise, mapping: GymExerciseAvailability): EquipmentProfile {
  const gym = mapping.gym_profile_id
  const details = gym_machine_details(exercise, mapping)
  const text = key(`${details.display_name} ${exercise.equipment ?? ''}`)
  const brand = key(details.machine_brand)
  const model = key(details.machine_model)
  let kind: EquipmentProfile['kind'] = /\bcable\b/.test(text) ? 'cable'
    : /\bdumbbell\b|\bdb\b/.test(text) ? 'dumbbell'
    : /\bbarbell\b|\bez bar\b|\bolympic bar\b/.test(text) ? 'barbell'
    : /\bplank\b|\bbodyweight\b/.test(text) ? 'bodyweight'
    : /machine|loaded|smith|nautilus|mts|iso|press|curl|raise|row|pulldown/.test(text) ? 'machine' : 'unknown'
  let identity = `option:${exercise.id}`
  let label = details.display_name
  let source: EquipmentProfile['source'] = 'gym_record'
  let status: EquipmentProfile['status'] = kind === 'unknown' ||
    (kind === 'machine' && !model) ? 'needs_review' : 'identified'
  const code = model.match(/\b(?:mg\d{4}|mn[a-z0-9]{1,2})\b/)?.[0]
  if (code && brand === 'technogym') {
    kind = 'machine'
    status = 'identified'
    identity = `technogym:${code === 'mn6' ? `${code}-${/triceps/.test(text) ? 'triceps' : 'biceps'}` : code}`
    label = `Technogym ${details.machine_model}`
  }
  if (gym === TRIDENT_GYM_ID && brand === 'technogym' &&
      ((code === 'mn6' && !/triceps/.test(text)) || /seated arm curl/.test(text))) {
    identity = 'technogym:mn6-biceps'
    label = 'Technogym Selection 700 MN6 Biceps Curl'
    kind = 'machine'
    source = 'user_confirmed'
    status = 'identified'
  }
  // User confirmed on 17 September 2026: all four Trident cable stations are
  // load-equivalent, and the edited glute bridge is the MG8000 hip-thrust machine.
  if (gym === TRIDENT_GYM_ID && kind === 'cable' &&
      (brand.startsWith('generic') || !brand)) {
    identity = 'equivalent-cable-stations'
    label = 'Trident cable stations (equivalent stacks)'
    source = 'user_confirmed'
    status = 'identified'
  }
  if (gym === TRIDENT_GYM_ID && brand === 'technogym' &&
      (code === 'mg8000' || /pure str(?:ength|enth) hip thrust/.test(model))) {
    identity = 'technogym:mg8000'
    label = 'Technogym Pure Strength Hip Thrust MG8000'
    kind = 'machine'
    source = 'user_confirmed'
    status = 'identified'
  }
  if (kind === 'dumbbell') { identity = 'dumbbells'; label = 'Dumbbell equipment' }
  if (kind === 'barbell') {
    identity = /\bez\b/.test(text) ? 'ez-bars' : 'barbells'
    label = identity === 'ez-bars' ? 'EZ bars' : 'Barbell equipment'
  }
  const jackson_confirmations: Array<[string[], string, string]> = [
    [['mts high row', 'high row'], 'mts-high-row', 'MTS High Row'],
    [['mts row'], 'mts-row', 'MTS Row'],
    [['iso shoulder press', 'overhead press iso lateral machine'], 'iso-shoulder-press', 'ISO Shoulder Press'],
    [['single arm iso pulldown', 'single arm iso lat pulldown'], 'single-arm-iso-pulldown', 'Single-Arm ISO Lat Pulldown'],
  ]
  if (gym === JACKSONS_GYM_ID) {
    const match = jackson_confirmations.find(([names]) => names.includes(key(details.display_name)))
    if (match) {
      identity = match[1]; label = match[2]; kind = 'machine'; status = 'identified'; source = 'user_confirmed'
    }
  }
  if (gym === GENERIC_GYM_ID || mapping.notes?.startsWith('[UNCONFIRMED]')) status = 'needs_review'
  return { id: `equipment:${gym}:${identity}`, gym_profile_id: gym, label, kind, status, source,
    notes: gym === GENERIC_GYM_ID ? 'Identify the actual travel venue and machine before comparing loads.'
      : status === 'needs_review' ? 'Keep separate until the physical equipment is confirmed.' : null }
}

/** Add profiles and links only. Never rewrite exercise definitions or past workouts. */
export async function ensure_equipment_profiles(
  gyms: GymRepository, exercises: ExerciseRepository, gym_id: string, device_id: string,
  timestamp = new Date().toISOString(),
): Promise<boolean> {
  const gym = await gyms.get_profile(gym_id)
  if (!gym || gym.deleted_at !== null) throw new Error('Gym was not found.')
  const definitions = new Map((await exercises.list_active()).map((exercise) => [exercise.id, exercise]))
  const profiles = new Map((gym.equipment_profiles ?? []).map((profile) => [profile.id, profile]))
  const links: GymExerciseAvailability[] = []
  for (let mapping of await gyms.list_availability(gym_id)) {
    let presence_confirmed = false
    const exercise = definitions.get(mapping.exercise_id)
    if (!mapping.available || mapping.deleted_at !== null || !exercise || exercise.deleted_at !== null || exercise.archived_at !== null) continue
    // One-time answers supplied by the owner, never repeated over later edits.
    if (gym_id === TRIDENT_GYM_ID && !gym.equipment_attribution_version && [
      'trident-technogym-pure-strength-mg2500-low-row',
      'trident-technogym-selection-700-mnhc-low-row',
      'trident-technogym-selection-700-mncc-lower-back',
      'trident-technogym-selection-700-mn6-triceps-extension',
    ].includes(mapping.exercise_id) && mapping.notes?.startsWith('[UNCONFIRMED]')) {
      mapping = { ...mapping, notes: mapping.notes.replace('[UNCONFIRMED]', '[CONFIRMED]') }
      presence_confirmed = true
    }
    const signature = equipment_identity_signature(exercise, mapping)
    const current = profiles.get(mapping.equipment_profile_id ?? '')
    if (current && (mapping.equipment_identity_signature === 'user_confirmed' || mapping.equipment_identity_signature === signature)) {
      if (presence_confirmed) links.push({ ...mapping, updated_at: timestamp, revision: mapping.revision + 1, device_id })
      continue
    }
    const candidate = propose_equipment_profile(exercise, mapping)
    const existing = profiles.get(candidate.id)
    // Never promote an uncertain shared machine merely because another movement
    // on it was listed as confirmed. Verification of availability is per option.
    if (!existing || existing.source !== 'user_confirmed') profiles.set(candidate.id, candidate)
    links.push({ ...mapping, equipment_profile_id: candidate.id, equipment_identity_signature: signature,
      updated_at: timestamp, revision: mapping.revision + 1, device_id })
  }
  const next = [...profiles.values()]
  const changed = !gym.equipment_attribution_version || JSON.stringify(next) !== JSON.stringify(gym.equipment_profiles ?? [])
  if (changed) {
    await gyms.put_profile({ ...gym, equipment_profiles: next, equipment_attribution_version: 1,
      updated_at: timestamp, revision: gym.revision + 1, device_id })
  }
  for (const link of links) await gyms.put_availability(link)
  return changed || links.length > 0
}

export function equipment_snapshot(gym: GymProfile, mapping?: GymExerciseAvailability): EquipmentSnapshot | null {
  if (!mapping || !mapping.available || mapping.deleted_at !== null) return null
  const profile = gym.equipment_profiles?.find((item) => item.id === mapping.equipment_profile_id && item.gym_profile_id === gym.id)
  if (!profile) return null
  return { profile_id: profile.id, gym_profile_id: gym.id, label: profile.label,
    comparable: profile.status === 'identified' && !mapping.notes?.startsWith('[UNCONFIRMED]'),
    setup_notes: mapping.setup_notes?.trim() || null }
}

export function comparable_equipment(a: EquipmentSnapshot | null | undefined, b: EquipmentSnapshot | null | undefined): boolean {
  return Boolean(a?.comparable && b?.comparable && a.profile_id === b.profile_id &&
    a.gym_profile_id === b.gym_profile_id &&
    (a.setup_notes ?? '').trim().toLowerCase() === (b.setup_notes ?? '').trim().toLowerCase())
}

export function equipment_scoped_prescription(set: ProgrammedSessionSet, snapshot: EquipmentSnapshot | null | undefined): ProgrammedSessionSet {
  if (!(set.equipment_snapshot || /PF_ADAPTIVE_(SOURCE|CHALLENGE):/.test(set.notes ?? '')) || comparable_equipment(set.equipment_snapshot, snapshot)) return set
  return { ...set, target_load_kg: null, notes: set.notes?.split('\n').filter(line =>
    !line.startsWith('PF_ADAPTIVE_CHALLENGE:') && !line.startsWith('PF_ADAPTIVE_SOURCE:') &&
    !line.startsWith('Adaptive current week')).join('\n') || null }
}

export async function assign_equipment_profile(
  gyms: GymRepository, gym_id: string, exercise_id: string, profile_id: string | null,
  label: string, device_id: string, timestamp = new Date().toISOString(),
): Promise<void> {
  const gym = await gyms.get_profile(gym_id)
  const mapping = (await gyms.list_availability(gym_id)).find((row) => row.exercise_id === exercise_id && row.available && row.deleted_at === null)
  if (!gym || gym.deleted_at !== null || !mapping) throw new Error('Available gym exercise was not found.')
  const profiles = [...(gym.equipment_profiles ?? [])]
  let profile = profiles.find((item) => item.id === profile_id && item.gym_profile_id === gym_id)
  if (profile_id && !profile) throw new Error('Choose equipment from this gym.')
  if (!profile) {
    if (!label.trim() || label.length > 120) throw new Error('Enter an equipment label of 1–120 characters.')
    profile = { id: `equipment:${gym_id}:${create_uuid()}`, gym_profile_id: gym_id, label: label.trim(),
      kind: 'unknown', status: 'identified', source: 'user_confirmed', notes: null }
    profiles.push(profile)
  } else {
    profile = { ...profile, status: 'identified', source: 'user_confirmed', notes: null }
    profiles[profiles.findIndex((item) => item.id === profile!.id)] = profile
  }
  await gyms.put_profile({ ...gym, equipment_profiles: profiles, revision: gym.revision + 1, updated_at: timestamp, device_id })
  await gyms.put_availability({ ...mapping, equipment_profile_id: profile.id, equipment_identity_signature: 'user_confirmed',
    revision: mapping.revision + 1, updated_at: timestamp, device_id })
}
