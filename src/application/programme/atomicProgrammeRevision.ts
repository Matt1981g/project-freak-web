import type { ProgrammeBlock, ProgrammedSession } from '../../domain/models'
import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import type { ProgrammeRepository } from '../../data/repositories/contracts'
import {
  create_audit_event,
  create_sync_outbox_entry,
} from '../../data/repositories/persistenceUtils'
import {
  build_programme_import_entities,
  type ProgrammeImportPreview,
} from './programmeImport'

export interface ProgrammeRevisionOptions {
  replace_existing_on_matching_dates?: boolean
  now_iso?: string
}

export interface ProgrammeRevisionResult {
  import_result: 'committed' | 'duplicate_noop'
  replaced_sessions: number
  reactivated_sessions: number
  replacement_dates: string[]
}

function action_date(session: ProgrammedSession, dates: ReadonlySet<string>): boolean {
  return (
    session.deleted_at === null &&
    session.scheduled_date_local !== null &&
    dates.has(session.scheduled_date_local)
  )
}

function actionable(session: ProgrammedSession): boolean {
  return session.status === 'planned' || session.status === 'skipped' || session.status === 'started'
}

function publication_dates(preview: ProgrammeImportPreview): string[] {
  if (!preview.can_commit || !preview.document) {
    throw new Error('Programme preview contains blocking validation errors.')
  }

  const dates = preview.document.programme.sessions.map(
    (session) => session.scheduled_date_local,
  )
  if (dates.some((date) => !date)) {
    throw new Error('Publishing a replacement requires a scheduled date for every imported session.')
  }
  const unique = new Set(dates as string[])
  if (unique.size !== dates.length) {
    throw new Error('Publishing a replacement requires exactly one imported session per date.')
  }
  if (unique.size === 0) {
    throw new Error('A replacement must contain at least one scheduled session.')
  }
  return [...unique].sort()
}

/**
 * Programme publication is one local unit of work. Either the new graph, old
 * session cancellations, source block lifecycle, audit and outbox all commit,
 * or NONE do. No post-commit fix-up or deleting training history is allowed.
 *
 * The enclosing read-write transaction serializes concurrent local imports;
 * a remote account-level authority contract is a separate sync concern.
 */
export async function commit_programme_revision_atomically(
  db: ProjectFreakDatabase,
  preview: ProgrammeImportPreview,
  programme_repository: ProgrammeRepository,
  device_id: string,
  options: ProgrammeRevisionOptions = {},
): Promise<ProgrammeRevisionResult> {
  if (!preview.can_commit || !preview.document) {
    throw new Error('Programme preview contains blocking validation errors.')
  }

  const replace = options.replace_existing_on_matching_dates === true
  const replacement_dates = replace ? publication_dates(preview) : []
  const dates = new Set(replacement_dates)
  const entities = await build_programme_import_entities(
    preview,
    programme_repository,
    device_id,
    options.now_iso,
  )

  if (!replace) {
    return {
      import_result: await programme_repository.commit_import(entities),
      replaced_sessions: 0,
      reactivated_sessions: 0,
      replacement_dates,
    }
  }

  return db.transaction(
    'rw',
    [
      db.programme_blocks,
      db.workout_templates,
      db.template_exercises,
      db.template_sets,
      db.template_set_components,
      db.programmed_sessions,
      db.programmed_session_exercises,
      db.programmed_session_sets,
      db.programmed_set_components,
      db.completed_sessions,
      db.audit_events,
      db.sync_outbox,
    ],
    async (): Promise<ProgrammeRevisionResult> => {
      const all_blocks = (await db.programme_blocks.toArray()).filter(
        (block) => block.deleted_at === null,
      )
      const existing = all_blocks
        .filter(
          (block) =>
            block.source_kind === 'programme_import' &&
            block.source_id === preview.source_id,
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]

      const target_block_id = existing?.id ?? entities.block.id
      const stored_sessions = (await db.programmed_sessions.toArray()).filter(
        (session) => session.deleted_at === null,
      )
      const target_sessions = existing
        ? stored_sessions.filter(
            (session) =>
              session.programme_block_id === target_block_id &&
              action_date(session, dates),
          )
        : entities.programmed_sessions
      const completed_actuals = (await db.completed_sessions.toArray()).filter(
        (actual) => actual.deleted_at === null,
      )
      const actual_ids = new Set(
        completed_actuals
          .map((actual) => actual.programmed_session_id)
          .filter((id): id is string => id !== null),
      )

      // Fail closed before making ANY change, including creating the imported
      // graph. Re-publishing cannot rewrite a started/completed workout.
      const targets_by_date = new Map<string, ProgrammedSession[]>()
      for (const target of target_sessions) {
        const date = target.scheduled_date_local
        if (!date || !dates.has(date)) continue
        const day = targets_by_date.get(date) ?? []
        day.push(target)
        targets_by_date.set(date, day)
      }
      for (const date of replacement_dates) {
        const day = targets_by_date.get(date) ?? []
        if (day.length !== 1) {
          throw new Error(
            'Replacement verification failed: expected exactly one imported prescription for ' + date + '.',
          )
        }
        if (
          day[0].status === 'started' ||
          day[0].status === 'completed' ||
          actual_ids.has(day[0].id)
        ) {
          throw new Error(
            'Cannot republish ' + date + ' because the imported workout has already started or has history.',
          )
        }
      }

      const competitors = stored_sessions.filter(
        (session) =>
          session.programme_block_id !== target_block_id &&
          action_date(session, dates) &&
          actionable(session),
      )
      for (const session of competitors) {
        if (session.status === 'started' || actual_ids.has(session.id)) {
          throw new Error(
            'Cannot replace "' + session.name_snapshot +
            '" on ' + session.scheduled_date_local +
            ' because a workout has started or workout history exists.',
          )
        }
      }

      // This call uses a nested Dexie transaction: its graph insert, duplicate
      // check and audit/outbox are committed only with the outer publication.
      const import_result = await programme_repository.commit_import(entities)
      if (!existing && import_result !== 'committed') {
        throw new Error('Concurrent programme source changed during publication.')
      }

      const now_iso = options.now_iso ?? new Date().toISOString()
      const update_session = async (
        before: ProgrammedSession,
        status: ProgrammedSession['status'],
      ) => {
        if (before.status === status) return
        const after: ProgrammedSession = {
          ...before,
          status,
          revision: before.revision + 1,
          updated_at: now_iso,
          device_id,
        }
        await db.programmed_sessions.put(after)
        await db.audit_events.add(
          create_audit_event('programmed_session', after, before, 'update'),
        )
        await db.sync_outbox.add(
          create_sync_outbox_entry('programmed_session', after),
        )
      }

      let reactivated_sessions = 0
      for (const target of target_sessions) {
        if (target.status === 'skipped' || target.status === 'cancelled') {
          await update_session(target, 'planned')
          reactivated_sessions++
        }
      }

      for (const competitor of competitors) {
        await update_session(competitor, 'cancelled')
      }

      // Only archive an old block when every outstanding session was
      // superseded. Preserve all other dates and completed history.
      const blocks_to_archive = all_blocks.filter((block) => {
        if (
          block.id === target_block_id ||
          block.status === 'archived' ||
          block.status === 'completed'
        ) return false
        const pending = stored_sessions.filter(
          (session) =>
            session.programme_block_id === block.id && actionable(session),
        )
        return (
          pending.length > 0 &&
          pending.every(
            (session) =>
              session.status !== 'started' && action_date(session, dates),
          )
        )
      })

      const target_block = existing ?? entities.block
      if (target_block.status !== 'active') {
        const active: ProgrammeBlock = {
          ...target_block,
          status: 'active',
          revision: target_block.revision + 1,
          updated_at: now_iso,
          device_id,
        }
        await db.programme_blocks.put(active)
        await db.audit_events.add(
          create_audit_event('programme_block', active, target_block, 'update'),
        )
        await db.sync_outbox.add(
          create_sync_outbox_entry('programme_block', active),
        )
      }

      for (const block of blocks_to_archive) {
        const archived: ProgrammeBlock = {
          ...block,
          status: 'archived',
          revision: block.revision + 1,
          updated_at: now_iso,
          device_id,
        }
        await db.programme_blocks.put(archived)
        await db.audit_events.add(
          create_audit_event('programme_block', archived, block, 'update'),
        )
        await db.sync_outbox.add(
          create_sync_outbox_entry('programme_block', archived),
        )
      }

      // Verification lives inside the transaction so any violated invariant
      // aborts the entire write rather than discovering damage after commit.
      const authoritative = (await db.programmed_sessions.toArray()).filter(
        (session) => action_date(session, dates) && actionable(session),
      )
      for (const date of replacement_dates) {
        const on_date = authoritative.filter(
          (session) => session.scheduled_date_local === date,
        )
        if (
          on_date.length !== 1 ||
          on_date[0].programme_block_id !== target_block_id ||
          on_date[0].status !== 'planned'
        ) {
          throw new Error('Atomic programme publication failed its postcondition for ' + date + '.')
        }
      }

      return {
        import_result,
        replaced_sessions: competitors.length,
        reactivated_sessions,
        replacement_dates,
      }
    },
  )
}
