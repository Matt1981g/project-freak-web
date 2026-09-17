import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import {
  create_audit_event,
  create_sync_outbox_entry,
} from '../data/repositories/persistenceUtils'
import { request_auto_sync } from '../application/sync/autoSyncEvents'
import {
  commit_programme_import_with_replacement,
  type ProgrammeImportReplacementOptions,
} from '../application/programme/programmeImportReplacement'
import type { ProgrammeImportPreview } from '../application/programme/programmeImport'
import type { ProgrammeBlock, ProgrammedSession } from '../domain/models'

const repositories = create_repositories(projectFreakDb)

function current_platform(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
}

async function current_device_id(): Promise<string> {
  const device = await repositories.devices.ensure_local(current_platform())
  return device.id
}

function imported_dates(preview: ProgrammeImportPreview): Set<string> {
  return new Set(
    preview.document?.programme.sessions
      .map((session) => session.scheduled_date_local ?? null)
      .filter((date): date is string => date !== null) ?? [],
  )
}

function updated_session(
  session: ProgrammedSession,
  status: ProgrammedSession['status'],
  device_id: string,
  now_iso: string,
): ProgrammedSession {
  return {
    ...session,
    status,
    updated_at: now_iso,
    revision: session.revision + 1,
    device_id,
  }
}

function updated_block(
  block: ProgrammeBlock,
  device_id: string,
  now_iso: string,
): ProgrammeBlock {
  return {
    ...block,
    status: 'archived',
    updated_at: now_iso,
    revision: block.revision + 1,
    device_id,
  }
}

/**
 * Replacement mode has a strict postcondition: the imported prescription must
 * be the only actionable prescription on each imported date.
 *
 * This second pass deliberately runs against the database rather than relying
 * on cached repository reads. It also archives a competing programme block
 * when every remaining actionable session in that block is being replaced.
 * Completed workout history is separate and is never deleted or rewritten.
 */
async function enforce_replacement_postcondition(
  preview: ProgrammeImportPreview,
  device_id: string,
  now_iso: string,
): Promise<{ cancelled_sessions: number; archived_blocks: number }> {
  const dates = imported_dates(preview)
  if (dates.size === 0) {
    return { cancelled_sessions: 0, archived_blocks: 0 }
  }

  const target_blocks = (await projectFreakDb.programme_blocks.toArray())
    .filter(
      (block) =>
        block.deleted_at === null &&
        block.source_kind === 'programme_import' &&
        block.source_id === preview.source_id,
    )
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
  const target_block = target_blocks[0]
  if (!target_block) {
    throw new Error(
      'Replacement verification failed because the imported programme block could not be found.',
    )
  }

  const all_blocks = (await projectFreakDb.programme_blocks.toArray()).filter(
    (block) => block.deleted_at === null,
  )
  const all_sessions = (await projectFreakDb.programmed_sessions.toArray()).filter(
    (session) => session.deleted_at === null,
  )

  const target_sessions = all_sessions.filter(
    (session) =>
      session.programme_block_id === target_block.id &&
      session.scheduled_date_local !== null &&
      dates.has(session.scheduled_date_local),
  )

  const competitors = all_sessions.filter(
    (session) =>
      session.programme_block_id !== target_block.id &&
      session.scheduled_date_local !== null &&
      dates.has(session.scheduled_date_local) &&
      (session.status === 'planned' || session.status === 'skipped'),
  )

  const target_updates = target_sessions
    .filter(
      (session) => session.status === 'skipped' || session.status === 'cancelled',
    )
    .map((session) => ({
      before: session,
      after: updated_session(session, 'planned', device_id, now_iso),
    }))

  const competitor_updates = competitors.map((session) => ({
    before: session,
    after: updated_session(session, 'cancelled', device_id, now_iso),
  }))

  const blocks_to_archive = all_blocks.filter((block) => {
    if (
      block.id === target_block.id ||
      block.status === 'archived' ||
      block.status === 'completed'
    ) {
      return false
    }

    const block_sessions = all_sessions.filter(
      (session) => session.programme_block_id === block.id,
    )
    const actionable = block_sessions.filter(
      (session) =>
        session.status === 'planned' ||
        session.status === 'skipped' ||
        session.status === 'started',
    )

    if (actionable.length === 0) return false
    if (actionable.some((session) => session.status === 'started')) return false

    return actionable.every(
      (session) =>
        session.scheduled_date_local !== null &&
        dates.has(session.scheduled_date_local),
    )
  })

  const block_updates = blocks_to_archive.map((block) => ({
    before: block,
    after: updated_block(block, device_id, now_iso),
  }))

  if (
    target_updates.length === 0 &&
    competitor_updates.length === 0 &&
    block_updates.length === 0
  ) {
    return { cancelled_sessions: 0, archived_blocks: 0 }
  }

  await projectFreakDb.transaction(
    'rw',
    [
      projectFreakDb.programme_blocks,
      projectFreakDb.programmed_sessions,
      projectFreakDb.audit_events,
      projectFreakDb.sync_outbox,
    ],
    async () => {
      for (const update of target_updates) {
        await projectFreakDb.programmed_sessions.put(update.after)
        await projectFreakDb.audit_events.add(
          create_audit_event(
            'programmed_session',
            update.after,
            update.before,
            'update',
          ),
        )
        await projectFreakDb.sync_outbox.add(
          create_sync_outbox_entry('programmed_session', update.after),
        )
      }

      for (const update of competitor_updates) {
        await projectFreakDb.programmed_sessions.put(update.after)
        await projectFreakDb.audit_events.add(
          create_audit_event(
            'programmed_session',
            update.after,
            update.before,
            'update',
          ),
        )
        await projectFreakDb.sync_outbox.add(
          create_sync_outbox_entry('programmed_session', update.after),
        )
      }

      for (const update of block_updates) {
        await projectFreakDb.programme_blocks.put(update.after)
        await projectFreakDb.audit_events.add(
          create_audit_event(
            'programme_block',
            update.after,
            update.before,
            'update',
          ),
        )
        await projectFreakDb.sync_outbox.add(
          create_sync_outbox_entry('programme_block', update.after),
        )
      }
    },
  )

  const remaining = (await projectFreakDb.programmed_sessions.toArray()).filter(
    (session) =>
      session.deleted_at === null &&
      session.programme_block_id !== target_block.id &&
      session.scheduled_date_local !== null &&
      dates.has(session.scheduled_date_local) &&
      (session.status === 'planned' ||
        session.status === 'skipped' ||
        session.status === 'started') &&
      !blocks_to_archive.some((block) => block.id === session.programme_block_id),
  )

  if (remaining.length > 0) {
    throw new Error(
      `Replacement verification failed: ${remaining.length} competing actionable session${remaining.length === 1 ? '' : 's'} remain on the replacement dates.`,
    )
  }

  return {
    cancelled_sessions: competitor_updates.length,
    archived_blocks: block_updates.length,
  }
}

export async function commit_programme_json_revision(
  preview: ProgrammeImportPreview,
  options: ProgrammeImportReplacementOptions = {},
) {
  const device_id = await current_device_id()
  const result = await commit_programme_import_with_replacement(
    preview,
    repositories.programme,
    repositories.sessions,
    device_id,
    options,
  )

  if (options.replace_existing_on_matching_dates) {
    const enforced = await enforce_replacement_postcondition(
      preview,
      device_id,
      new Date().toISOString(),
    )
    result.replaced_sessions += enforced.cancelled_sessions
  }

  request_auto_sync('programme_imported')
  if (result.replaced_sessions > 0 || result.reactivated_sessions > 0) {
    request_auto_sync('programme_changed')
  }

  return result
}
