import type {
  CompletedSession,
  ProgrammeBlock,
  ProgrammedSession,
} from '../../domain/models'

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
  latest_programming_input_at: string | null
}

function is_final_actual(session: CompletedSession): boolean {
  return session.status === 'completed' || session.status === 'abandoned'
}

function same_programme_window(
  left: ProgrammeBlock,
  right: ProgrammeBlock,
): boolean {
  if (left.block_type === 'custom' || right.block_type === 'custom') {
    return false
  }

  return (
    left.start_date_local !== null &&
    left.end_date_local !== null &&
    left.start_date_local === right.start_date_local &&
    left.end_date_local === right.end_date_local
  )
}

function is_superseded(
  block: ProgrammeBlock,
  blocks: readonly ProgrammeBlock[],
): boolean {
  return blocks.some(
    (candidate) =>
      candidate.id !== block.id &&
      candidate.deleted_at === null &&
      candidate.status !== 'archived' &&
      candidate.status !== 'completed' &&
      candidate.created_at > block.created_at &&
      same_programme_window(block, candidate),
  )
}

function has_started_actual(
  block: ProgrammeBlock,
  actuals: readonly CompletedSession[],
): boolean {
  return actuals.some(
    (actual) =>
      actual.deleted_at === null &&
      actual.programme_block_id === block.id &&
      actual.status !== 'abandoned',
  )
}

function changed_before_block_started(
  block: ProgrammeBlock,
  actuals: readonly CompletedSession[],
  context: ActivePlanContext,
): boolean {
  if (!block.start_date_local) return false
  if (context.today_local > block.start_date_local) return false
  if (has_started_actual(block, actuals)) return false

  if (
    context.latest_programming_input_at &&
    context.latest_programming_input_at > block.created_at
  ) {
    return true
  }

  return actuals.some(
    (actual) =>
      actual.deleted_at === null &&
      is_final_actual(actual) &&
      actual.session_date_local < block.start_date_local! &&
      actual.updated_at > block.created_at,
  )
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

  for (const block of blocks) {
    if (block.deleted_at !== null) continue
    if (block.status === 'archived' || block.status === 'completed') continue

    if (
      block.end_date_local !== null &&
      block.end_date_local < context.today_local
    ) {
      continue
    }

    if (is_superseded(block, blocks)) continue
    if (changed_before_block_started(block, actuals, context)) continue

    const sessions = (sessions_by_block.get(block.id) ?? []).filter((session) =>
      session_is_visible(
        session,
        final_actual_programmed_ids,
        context.today_local,
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
