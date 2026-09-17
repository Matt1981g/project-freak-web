import type { Exercise, ProgrammeBlock, ProgrammedSession } from '../../domain/models'
import type { ProgrammedSessionDetail } from '../../data/repositories/contracts'
import type { ActivePlanSelection } from './activePlan'
import { explicitly_supersedes } from './programmeLineage'

export type PlanHealthStatus = 'ok' | 'warning' | 'failed'
export type PlanHealthSeverity = 'warning' | 'error'

export interface PlanHealthIssue {
  severity: PlanHealthSeverity
  code: string
  detail: string
  programme_block_id: string | null
  programmed_session_id: string | null
}

export interface PlanHealthReport {
  status: PlanHealthStatus
  checked_at: string
  today_local: string
  candidate_blocks: number
  candidate_sessions: number
  visible_sessions: number
  checked_exercises: number
  issues: PlanHealthIssue[]
}

export interface PlanHealthInspection {
  report: PlanHealthReport
  selection: ActivePlanSelection
}

export interface PlanHealthSource {
  list_blocks(): Promise<ProgrammeBlock[]>
  list_sessions(programme_block_id: string): Promise<ProgrammedSession[]>
  list_active_plan(): Promise<ActivePlanSelection>
  get_session_detail(programmed_session_id: string): Promise<ProgrammedSessionDetail | undefined>
  list_active_exercises(): Promise<Exercise[]>
}

function current_local_date(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function programme_windows_overlap(
  left: ProgrammeBlock,
  right: ProgrammeBlock,
): boolean {
  if (left.block_type === 'custom' || right.block_type === 'custom') return false
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

function is_superseded_candidate(
  block: ProgrammeBlock,
  blocks: readonly ProgrammeBlock[],
): boolean {
  return blocks.some((candidate) => {
    if (
      candidate.id === block.id ||
      candidate.deleted_at !== null ||
      candidate.status === 'archived' ||
      candidate.status === 'completed'
    ) {
      return false
    }

    if (explicitly_supersedes(candidate, block.id)) return true

    if (candidate.supersedes_programme_block_id !== undefined) return false

    return (
      candidate.created_at > block.created_at &&
      programme_windows_overlap(block, candidate)
    )
  })
}

function block_is_candidate(
  block: ProgrammeBlock,
  blocks: readonly ProgrammeBlock[],
  today_local: string,
): boolean {
  if (block.deleted_at !== null) return false
  if (block.status === 'archived' || block.status === 'completed') return false
  if (block.end_date_local !== null && block.end_date_local < today_local) return false
  if (is_superseded_candidate(block, blocks)) return false
  return true
}

function session_is_candidate(
  session: ProgrammedSession,
  today_local: string,
): boolean {
  if (session.deleted_at !== null) return false
  if (session.status === 'completed' || session.status === 'cancelled') return false
  if (
    session.status === 'skipped' &&
    session.scheduled_date_local !== null &&
    session.scheduled_date_local < today_local
  ) {
    return false
  }
  return true
}

function issue(
  severity: PlanHealthSeverity,
  code: string,
  detail: string,
  programme_block_id: string | null = null,
  programmed_session_id: string | null = null,
): PlanHealthIssue {
  return {
    severity,
    code,
    detail,
    programme_block_id,
    programmed_session_id,
  }
}

function status_from_issues(issues: readonly PlanHealthIssue[]): PlanHealthStatus {
  if (issues.some((entry) => entry.severity === 'error')) return 'failed'
  if (issues.some((entry) => entry.severity === 'warning')) return 'warning'
  return 'ok'
}

export async function inspect_plan_health(
  source: PlanHealthSource,
  options: { today_local?: string; checked_at?: string } = {},
): Promise<PlanHealthInspection> {
  const today_local = options.today_local ?? current_local_date()
  const checked_at = options.checked_at ?? new Date().toISOString()

  const [blocks, selection, active_exercises] = await Promise.all([
    source.list_blocks(),
    source.list_active_plan(),
    source.list_active_exercises(),
  ])

  const sessions_by_block = new Map(
    await Promise.all(
      blocks.map(async (block) => [block.id, await source.list_sessions(block.id)] as const),
    ),
  )

  const candidate_blocks = blocks.filter((block) =>
    block_is_candidate(block, blocks, today_local),
  )
  const candidate_sessions = candidate_blocks.flatMap((block) =>
    (sessions_by_block.get(block.id) ?? []).filter((session) =>
      session_is_candidate(session, today_local),
    ),
  )
  const visible_sessions = selection.programmes.flatMap((programme) => programme.sessions)
  const visible_ids = new Set(visible_sessions.map((session) => session.id))
  const candidate_ids = new Set(candidate_sessions.map((session) => session.id))
  const issues: PlanHealthIssue[] = []

  if (candidate_sessions.length === 0) {
    issues.push(
      issue(
        'warning',
        'no_actionable_sessions',
        'No actionable programmed sessions remain in the current or future plan.',
      ),
    )
  }

  for (const session of candidate_sessions) {
    if (!visible_ids.has(session.id)) {
      issues.push(
        issue(
          'error',
          'plan_filter_mismatch',
          `Session "${session.name_snapshot}" exists as actionable programme data but is missing from the Plan screen resolver.`,
          session.programme_block_id,
          session.id,
        ),
      )
    }
  }

  for (const session of visible_sessions) {
    if (!candidate_ids.has(session.id)) {
      issues.push(
        issue(
          'error',
          'unexpected_visible_session',
          `Session "${session.name_snapshot}" is visible in Plan but is not an actionable candidate from the underlying programme data.`,
          session.programme_block_id,
          session.id,
        ),
      )
    }
  }

  const sessions_by_date = new Map<string, ProgrammedSession[]>()
  for (const session of visible_sessions) {
    if (!session.scheduled_date_local) {
      issues.push(
        issue(
          'warning',
          'unscheduled_session',
          `Session "${session.name_snapshot}" is visible but has no scheduled date.`,
          session.programme_block_id,
          session.id,
        ),
      )
      continue
    }
    const same_date = sessions_by_date.get(session.scheduled_date_local) ?? []
    same_date.push(session)
    sessions_by_date.set(session.scheduled_date_local, same_date)
  }

  for (const [date, sessions] of sessions_by_date) {
    if (sessions.length > 1) {
      issues.push(
        issue(
          'warning',
          'multiple_sessions_same_date',
          `${sessions.length} actionable sessions are scheduled for ${date}. Confirm this is intentional.`,
        ),
      )
    }
  }

  const active_exercise_ids = new Set(active_exercises.map((exercise) => exercise.id))
  let checked_exercises = 0

  const detail_entries = await Promise.all(
    visible_sessions.map(async (session) => [
      session,
      await source.get_session_detail(session.id),
    ] as const),
  )

  for (const [session, detail] of detail_entries) {
    if (!detail) {
      issues.push(
        issue(
          'error',
          'missing_session_detail',
          `Session "${session.name_snapshot}" is visible but its workout prescription cannot be loaded.`,
          session.programme_block_id,
          session.id,
        ),
      )
      continue
    }

    if (session.workout_template_id === null) {
      issues.push(
        issue(
          'warning',
          'missing_template_link',
          `Session "${session.name_snapshot}" has no workout-template link.`,
          session.programme_block_id,
          session.id,
        ),
      )
    }

    if (detail.exercises.length === 0) {
      issues.push(
        issue(
          'error',
          'empty_session_prescription',
          `Session "${session.name_snapshot}" contains no programmed exercises.`,
          session.programme_block_id,
          session.id,
        ),
      )
      continue
    }

    for (const entry of detail.exercises) {
      checked_exercises += 1
      const programmed_exercise = entry.exercise

      if (!active_exercise_ids.has(programmed_exercise.exercise_id)) {
        issues.push(
          issue(
            'error',
            'inactive_exercise_reference',
            `"${programmed_exercise.exercise_name_snapshot}" points to an exercise that is no longer active.`,
            session.programme_block_id,
            session.id,
          ),
        )
      }

      if (entry.sets.length === 0) {
        issues.push(
          issue(
            'error',
            'exercise_without_sets',
            `"${programmed_exercise.exercise_name_snapshot}" has no programmed sets in "${session.name_snapshot}".`,
            session.programme_block_id,
            session.id,
          ),
        )
      }
    }
  }

  return {
    selection,
    report: {
      status: status_from_issues(issues),
      checked_at,
      today_local,
      candidate_blocks: candidate_blocks.length,
      candidate_sessions: candidate_sessions.length,
      visible_sessions: visible_sessions.length,
      checked_exercises,
      issues,
    },
  }
}
