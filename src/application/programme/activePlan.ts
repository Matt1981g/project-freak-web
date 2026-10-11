import type {
  CompletedSession,
  ProgrammeBlock,
  ProgrammedSession,
} from '../../domain/models'
import { explicitly_supersedes } from './programmeLineage'

export interface PlanProgrammeSummary {
  block: ProgrammeBlock
  sessions: ProgrammedSession[]
}

export interface ActivePlanSelection {
  programmes: PlanProgrammeSummary[]
  hidden_blocks: number
}

export interface ActivePlanContext {
  today_local: string
  // Retained for compatibility and future non-destructive review warnings.
  // A later programming-input timestamp must never silently hide a valid plan.
  latest_programming_input_at: string | null
}

function is_final_actual(session: CompletedSession): boolean {
  return session.status === 'completed' || session.status === 'abandoned'
}

function programme_windows_overlap(
  left: ProgrammeBlock,
  right: ProgrammeBlock,
): boolean {
  if (left.block_type === 'custom' || right.block_type === 'custom') {
    return false
  }
  if (left.block_type !== right.block_type) return false
  if (
    !left.start_date_local ||
    !left.end_date_local ||
    !right.start_date_local ||
    !right.end_date_local
  ) {
    return false
  }

  return (
    left.start_date_local <= right.end_date_local &&
    right.start_date_local <= left.end_date_local
  )
}

/**
 * Single source of truth for Plan, the daily workout prompt and Plan Health.
 *
 * An older prescription is displaced per scheduled DATE, not merely because
 * a newer same-name or overlapping block exists. During phone/cloud sync a
 * replacement block may arrive before its sessions; it must not hide a usable
 * earlier workout. Older dates not yet replaced remain actionable.
 *
 * Intentional explicit lineage also supports a wholesale move to a new date
 * window once the successor has at least one persisted prescription.
 */
export function select_plan_candidate_sessions(
  blocks: readonly ProgrammeBlock[],
  sessions_by_block: ReadonlyMap<string, readonly ProgrammedSession[]>,
  today_local: string,
): Map<string, ProgrammedSession[]> {
  const eligible_blocks = blocks.filter((block) =>
    block.deleted_at === null &&
    block.status !== 'archived' &&
    block.status !== 'completed' &&
    (block.end_date_local === null || block.end_date_local >= today_local),
  )

  const usable_sessions = new Map(eligible_blocks.map((block) => [
    block.id,
    (sessions_by_block.get(block.id) ?? []).filter((session) =>
      session.deleted_at === null &&
      session.status !== 'cancelled',
    ),
  ] as const))

  const candidate_sessions = new Map<string, ProgrammedSession[]>()

  for (const block of eligible_blocks) {
    const sessions = (usable_sessions.get(block.id) ?? []).filter((session) => {
      if (session.status === 'completed') return false
      if (
        session.status === 'skipped' &&
        session.scheduled_date_local !== null &&
        session.scheduled_date_local < today_local
      ) return false

      return !eligible_blocks.some((successor) => {
        if (successor.id === block.id) return false
        const successor_sessions = usable_sessions.get(successor.id) ?? []
        if (successor_sessions.length === 0) return false

        const explicit = explicitly_supersedes(successor, block.id)
        const newer =
          successor.created_at > block.created_at ||
          (successor.created_at === block.created_at && successor.id > block.id)
        const same_named_week =
          newer &&
          successor.block_type === block.block_type &&
          successor.block_type !== 'custom' &&
          successor.name === block.name &&
          successor.start_date_local !== null &&
          successor.end_date_local !== null &&
          successor.start_date_local === block.start_date_local &&
          successor.end_date_local === block.end_date_local
        const legacy_overlap =
          newer &&
          successor.supersedes_programme_block_id === undefined &&
          programme_windows_overlap(block, successor)

        if (!explicit && !same_named_week && !legacy_overlap) return false

        // Explicit lineage to a distinct window deliberately replaces the old
        // schedule. A partially arrived, same-window successor only replaces
        // dates whose session has arrived; never hide missing future days.
        if (
          explicit &&
          !programme_windows_overlap(block, successor) &&
          (successor.start_date_local !== block.start_date_local ||
            successor.end_date_local !== block.end_date_local)
        ) return true

        return (
          session.scheduled_date_local !== null &&
          successor_sessions.some((replacement) =>
            replacement.scheduled_date_local === session.scheduled_date_local,
          )
        )
      })
    })

    if (sessions.length > 0) candidate_sessions.set(block.id, sessions)
  }

  return candidate_sessions
}

function session_is_visible(
  session: ProgrammedSession,
  final_actual_programmed_ids: ReadonlySet<string>,
  today_local: string,
): boolean {
  if (session.deleted_at !== null) return false
  if (final_actual_programmed_ids.has(session.id)) return false
  if (session.status === 'completed' || session.status === 'cancelled') {
    return false
  }

  if (
    session.status === 'skipped' &&
    session.scheduled_date_local !== null &&
    session.scheduled_date_local < today_local
  ) {
    return false
  }

  return true
}

export function select_active_plan_programmes(
  blocks: readonly ProgrammeBlock[],
  sessions_by_block: ReadonlyMap<string, readonly ProgrammedSession[]>,
  actuals: readonly CompletedSession[],
  context: ActivePlanContext,
): ActivePlanSelection {
  const final_actual_programmed_ids = new Set(
    actuals
      .filter(
        (actual) =>
          actual.deleted_at === null &&
          actual.programmed_session_id !== null &&
          is_final_actual(actual),
      )
      .map((actual) => actual.programmed_session_id as string),
  )

  const programmes: PlanProgrammeSummary[] = []

  const candidates = select_plan_candidate_sessions(
    blocks, sessions_by_block, context.today_local,
  )

  for (const block of blocks) {
    const raw = candidates.get(block.id)
    if (!raw) continue

    const sessions = raw.filter((session) =>
      session_is_visible(
        session, final_actual_programmed_ids, context.today_local,
      ),
    )
    if (sessions.length === 0) continue

    programmes.push({
      block,
      sessions: [...sessions].sort((left, right) => {
        const left_date = left.scheduled_date_local ?? '9999-12-31'
        const right_date = right.scheduled_date_local ?? '9999-12-31'
        return left_date.localeCompare(right_date)
      }),
    })
  }

  programmes.sort((left, right) => {
    const left_start = left.block.start_date_local ?? '9999-12-31'
    const right_start = right.block.start_date_local ?? '9999-12-31'
    const by_date = left_start.localeCompare(right_start)
    if (by_date !== 0) return by_date
    return right.block.created_at.localeCompare(left.block.created_at)
  })

  const eligible_block_count = blocks.filter(
    (block) =>
      block.deleted_at === null &&
      block.status !== 'archived' &&
      block.status !== 'completed',
  ).length

  return {
    programmes,
    hidden_blocks: Math.max(0, eligible_block_count - programmes.length),
  }
}
