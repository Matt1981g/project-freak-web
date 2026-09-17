import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import { ensure_equipment_profiles, assign_equipment_profile } from '../application/gyms/equipmentProfiles'
import { request_auto_sync } from '../application/sync/autoSyncEvents'

const repositories = create_repositories(projectFreakDb)

export async function load_equipment_profile_state(gym_id: string) {
  const device = await repositories.devices.ensure_local(typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent)
  // Dexie must see a native async scope to track awaits in the delegated work.
  // A synchronous arrow returning its promise can lose the transaction zone.
  const changed = await projectFreakDb.transaction('rw', [projectFreakDb.gym_profiles, projectFreakDb.exercises,
    projectFreakDb.gym_exercise_availability, projectFreakDb.audit_events, projectFreakDb.sync_outbox],
  async () => await ensure_equipment_profiles(repositories.gyms, repositories.exercises, gym_id, device.id))
  if (changed) request_auto_sync('setting_changed')
  const gym = await repositories.gyms.get_profile(gym_id)
  const mappings = await repositories.gyms.list_availability(gym_id)
  return { gym, profiles: gym?.equipment_profiles ?? [], mappings }
}

export async function save_equipment_profile_link(gym_id: string, exercise_id: string, profile_id: string | null, label: string) {
  const device = await repositories.devices.ensure_local(typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent)
  await projectFreakDb.transaction('rw', [projectFreakDb.gym_profiles, projectFreakDb.gym_exercise_availability,
    projectFreakDb.audit_events, projectFreakDb.sync_outbox],
  async () => await assign_equipment_profile(repositories.gyms, gym_id, exercise_id, profile_id, label, device.id))
  request_auto_sync('setting_changed')
}
