import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import { request_auto_sync } from '../application/sync/autoSyncEvents'
import {
  commit_programme_import_with_replacement,
  type ProgrammeImportReplacementOptions,
} from '../application/programme/programmeImportReplacement'
import type { ProgrammeImportPreview } from '../application/programme/programmeImport'

const repositories = create_repositories(projectFreakDb)

function current_platform(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
}

async function current_device_id(): Promise<string> {
  const device = await repositories.devices.ensure_local(current_platform())
  return device.id
}

export async function commit_programme_json_revision(
  preview: ProgrammeImportPreview,
  options: ProgrammeImportReplacementOptions = {},
) {
  const result = await commit_programme_import_with_replacement(
    preview,
    repositories.programme,
    repositories.sessions,
    await current_device_id(),
    options,
  )

  request_auto_sync('programme_imported')
  if (result.replaced_sessions > 0 || result.reactivated_sessions > 0) {
    request_auto_sync('programme_changed')
  }

  return result
}
