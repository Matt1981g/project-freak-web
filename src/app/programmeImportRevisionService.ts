import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import { request_auto_sync } from '../application/sync/autoSyncEvents'
import {
  commit_programme_revision_atomically,
  type ProgrammeRevisionOptions,
} from '../application/programme/atomicProgrammeRevision'
import type { ProgrammeImportPreview } from '../application/programme/programmeImport'

const repositories = create_repositories(projectFreakDb)

async function current_device_id(): Promise<string> {
  const platform = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
  return (await repositories.devices.ensure_local(platform)).id
}

export async function commit_programme_json_revision(
  preview: ProgrammeImportPreview,
  options: ProgrammeRevisionOptions = {},
) {
  const result = await commit_programme_revision_atomically(
    projectFreakDb,
    preview,
    repositories.programme,
    await current_device_id(),
    options,
  )

  // The atomic publication may also activate an existing imported block.
  // Let the coalescing sync queue decide whether there is new work.
  request_auto_sync('programme_imported')

  return result
}
