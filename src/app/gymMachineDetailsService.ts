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
  session_exercise_id?: string,
) {
  const device_id = await current_device_id()
  const timestamp = new Date().toISOString()
  await projectFreakDb.transaction('rw', [
    projectFreakDb.gym_profiles,
    projectFreakDb.exercises,
    projectFreakDb.gym_exercise_availability,
    projectFreakDb.audit_events,
    projectFreakDb.sync_outbox,
    projectFreakDb.completed_sessions,
    projectFreakDb.session_exercises,
  ], async () => {
    if (session_exercise_id) {
      const appearance = await repositories.sessions.get_session_exercise?.(session_exercise_id)
      const session = appearance ? await repositories.sessions.get_session(appearance.completed_session_id) : undefined
      if (!appearance || appearance.deleted_at !== null || appearance.exercise_id !== exercise_id ||
          !session || session.deleted_at !== null || session.status !== 'in_progress' || session.gym_profile_id !== gym_id) {
        throw new Error('Setup can only be changed for this exercise in an active workout.')
      }
      if (appearance.equipment_snapshot && appearance.equipment_snapshot.setup_notes !== (setup_notes?.trim() || null)) {
        await repositories.sessions.put_session_exercise({ ...appearance,
          equipment_snapshot: { ...appearance.equipment_snapshot, setup_notes: setup_notes?.trim() || null, comparable: false },
          revision: appearance.revision + 1, updated_at: timestamp, device_id })
      }
    }
    await edit_gym_machine_details_with_name(
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
    )
  })
  request_auto_sync('setting_changed')
}
