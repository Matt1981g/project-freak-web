import type {
  ProgrammeBlock,
  ProgrammedSession,
} from '../../domain/models'
import type {
  ProgrammeRepository,
  SessionRepository,
} from '../../data/repositories/contracts'
import {
  commit_programme_import,
  type ProgrammeImportPreview,
} from './programmeImport'

export interface ProgrammeImportReplacementOptions {
  replace_existing_on_matching_dates?: boolean
  now_iso?: string
}

export interface ProgrammeImportReplacementResult {
  import_result: 'committed' | 'duplicate_noop'
  replaced_sessions: number
  reactivated_sessions: number
  replacement_dates: string[]
}

interface ProgrammeSessionEntry {
  block: ProgrammeBlock
  session: ProgrammedSession
}

function incoming_dates(preview: ProgrammeImportPreview): string[] {
  if (!preview.document) return []

  return [
    ...new Set(
      preview.document.programme.sessions
        .map((session) => session.scheduled_date_local ?? null)
        .filter((date): date is string => date !== null),
    ),
  ].sort()
}

async function list_programme_session_entries(
  programme_repository: ProgrammeRepository,
): Promise<ProgrammeSessionEntry[]> {
  const blocks = await programme_repository.list_blocks()
  const rows = await Promise.all(
    blocks.map(async (block) =>
      (
        await programme_repository.list_programmed_sessions_for_block(block.id)
      ).map((session) => ({ block, session })),
    ),
  )

  return rows.flat()
}

function import_block_for_source(
  entries: readonly ProgrammeSessionEntry[],
  source_id: string,
): ProgrammeBlock | null {
  const matching = entries
    .map((entry) => entry.block)
    .filter(
      (block, index, blocks) =>
        blocks.findIndex((candidate) => candidate.id === block.id) === index,
    )
    .filter(
      (block) =>
        block.deleted_at === null &&
        block.source_kind === 'programme_import' &&
        block.source_id === source_id,
    )
    .sort((left, right) => right.created_at.localeCompare(left.created_at))

  return matching[0] ?? null
}

function is_matching_date(
  session: ProgrammedSession,
  dates: ReadonlySet<string>,
): boolean {
  return (
    session.deleted_at === null &&
    session.scheduled_date_local !== null &&
    dates.has(session.scheduled_date_local)
  )
}

async function assert_replaceable_session(
  session: ProgrammedSession,
  session_repository: SessionRepository,
): Promise<void> {
  if (session.status === 'started') {
    throw new Error(
      `Cannot replace "${session.name_snapshot}" on ${session.scheduled_date_local ?? 'an unscheduled date'} because the workout has already started.`,
    )
  }

  if (session.status !== 'planned' && session.status !== 'skipped') {
    return
  }

  const actual = await session_repository.get_by_programmed_session_id(
    session.id,
  )
  if (actual && actual.deleted_at === null) {
    throw new Error(
      `Cannot replace "${session.name_snapshot}" on ${session.scheduled_date_local ?? 'an unscheduled date'} because workout history already exists for it.`,
    )
  }
}

async function change_session_status(
  programme_repository: ProgrammeRepository,
  session: ProgrammedSession,
  status: ProgrammedSession['status'],
  device_id: string,
  now_iso: string,
): Promise<void> {
  if (!programme_repository.put_programmed_session) {
    throw new Error(
      'This programme repository cannot update existing session lifecycle state.',
    )
  }

  if (session.status === status) return

  await programme_repository.put_programmed_session({
    ...session,
    status,
    updated_at: now_iso,
    revision: session.revision + 1,
    device_id,
  })
}

/**
 * Commits a programme import and, when explicitly requested, makes the imported
 * sessions the sole actionable prescriptions on their scheduled dates.
 *
 * Existing completed/cancelled sessions are never rewritten. Started sessions
 * and any planned/skipped session that already has workout history block the
 * replacement. Superseded planned/skipped prescriptions are preserved as
 * cancelled records for audit/history rather than deleted.
 *
 * The exact same JSON can be re-applied in replacement mode. In that case the
 * existing imported block is reused, its skipped/cancelled target sessions are
 * reactivated, and competing uncompleted prescriptions are cancelled.
 */
export async function commit_programme_import_with_replacement(
  preview: ProgrammeImportPreview,
  programme_repository: ProgrammeRepository,
  session_repository: SessionRepository,
  device_id: string,
  options: ProgrammeImportReplacementOptions = {},
): Promise<ProgrammeImportReplacementResult> {
  const dates = incoming_dates(preview)
  const replacement_dates = options.replace_existing_on_matching_dates
    ? dates
    : []

  if (!options.replace_existing_on_matching_dates || dates.length === 0) {
    return {
      import_result: await commit_programme_import(
        preview,
        programme_repository,
        device_id,
      ),
      replaced_sessions: 0,
      reactivated_sessions: 0,
      replacement_dates,
    }
  }

  if (!preview.can_commit || !preview.document) {
    throw new Error('Programme preview contains blocking validation errors.')
  }

  if (!programme_repository.put_programmed_session) {
    throw new Error(
      'This programme repository cannot replace existing prescriptions.',
    )
  }

  const date_set = new Set(dates)
  const before_entries = await list_programme_session_entries(
    programme_repository,
  )
  const existing_target_block = import_block_for_source(
    before_entries,
    preview.source_id,
  )

  const preflight_conflicts = before_entries.filter(
    ({ block, session }) =>
      block.id !== existing_target_block?.id &&
      is_matching_date(session, date_set) &&
      session.status !== 'completed' &&
      session.status !== 'cancelled',
  )

  for (const { session } of preflight_conflicts) {
    await assert_replaceable_session(session, session_repository)
  }

  const import_result = await commit_programme_import(
    preview,
    programme_repository,
    device_id,
  )

  const after_entries = await list_programme_session_entries(
    programme_repository,
  )
  const target_block = import_block_for_source(after_entries, preview.source_id)
  if (!target_block) {
    throw new Error(
      'The imported programme could not be located after commit. Replacement was not applied.',
    )
  }

  const target_sessions = after_entries
    .filter(
      ({ block, session }) =>
        block.id === target_block.id && is_matching_date(session, date_set),
    )
    .map(({ session }) => session)

  if (target_sessions.length === 0) {
    throw new Error(
      'The imported programme contains no stored sessions on the replacement dates.',
    )
  }

  const competing_sessions = after_entries
    .filter(
      ({ block, session }) =>
        block.id !== target_block.id &&
        is_matching_date(session, date_set) &&
        session.status !== 'completed' &&
        session.status !== 'cancelled',
    )
    .map(({ session }) => session)

  // Re-check after the commit so a concurrent/local lifecycle change cannot be
  // silently overwritten between preflight and mutation.
  for (const session of competing_sessions) {
    await assert_replaceable_session(session, session_repository)
  }

  const now_iso = options.now_iso ?? new Date().toISOString()
  let reactivated_sessions = 0
  let replaced_sessions = 0

  // Reactivate the intended imported prescription first. If a later cancel
  // write fails, Plan Health will still surface duplicates rather than leaving
  // the athlete with no actionable session.
  for (const session of target_sessions) {
    if (session.status !== 'skipped' && session.status !== 'cancelled') continue

    const actual = await session_repository.get_by_programmed_session_id(
      session.id,
    )
    if (actual && actual.deleted_at === null) {
      throw new Error(
        `Cannot reactivate "${session.name_snapshot}" because workout history already exists for it.`,
      )
    }

    await change_session_status(
      programme_repository,
      session,
      'planned',
      device_id,
      now_iso,
    )
    reactivated_sessions += 1
  }

  for (const session of competing_sessions) {
    if (session.status !== 'planned' && session.status !== 'skipped') continue

    await change_session_status(
      programme_repository,
      session,
      'cancelled',
      device_id,
      now_iso,
    )
    replaced_sessions += 1
  }

  return {
    import_result,
    replaced_sessions,
    reactivated_sessions,
    replacement_dates,
  }
}
