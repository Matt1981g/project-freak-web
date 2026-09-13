import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import { request_auto_sync } from '../application/sync/autoSyncEvents'
import { edit_gym_machine_details_with_name } from '../application/gyms/gymProfiles'

const repositories = create_repositories(projectFreakDb)

function current_platform(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
}

async function current_device_id(): Promise<string> {
  const device = await repositories.devices.ensure_local(current_platform())
  return device.id
}

export async function save_gym_machine_identity(
  gym_id: string,
  exercise_id: string,
  display_name: string,
  brand: string,
  model: string,
  setup_notes?: string,
) {
  const device_id = await current_device_id()
  const timestamp = new Date().toISOString()
  await projectFreakDb.transaction('rw', [
    projectFreakDb.gym_profiles,
    projectFreakDb.exercises,
    projectFreakDb.gym_exercise_availability,
    projectFreakDb.audit_events,
    projectFreakDb.sync_outbox,
  ], () => edit_gym_machine_details_with_name(
    repositories.gyms,
    repositories.exercises,
    gym_id,
    exercise_id,
    brand,
    model,
    display_name,
    device_id,
    timestamp,
    setup_notes,
  ))
  request_auto_sync('setting_changed')
}
