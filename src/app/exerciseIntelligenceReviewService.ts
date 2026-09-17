import type { ExerciseIntelligence } from '../domain/models'
import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import { request_auto_sync } from '../application/sync/autoSyncEvents'
import { confirm_exercise_intelligence } from '../application/exercises/exerciseIntelligenceReview'

const repositories = create_repositories(projectFreakDb)

function current_platform(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
}

async function current_device_id(): Promise<string> {
  const device = await repositories.devices.ensure_local(current_platform())
  return device.id
}

export async function save_confirmed_exercise_intelligence(
  exercise_id: string,
  intelligence: ExerciseIntelligence,
) {
  const updated = await confirm_exercise_intelligence(
    repositories.exercises,
    exercise_id,
    intelligence,
    await current_device_id(),
  )
  request_auto_sync('setting_changed')
  return updated
}
