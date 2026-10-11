import { describe, expect, it } from 'vitest'
import type { Exercise, ProgrammeBlock, ProgrammedSession } from '../../domain/models'
import type { ProgrammedSessionDetail } from '../../data/repositories/contracts'
import { select_active_plan_programmes, type ActivePlanSelection } from './activePlan'
import { inspect_plan_health, type PlanHealthSource } from './planHealth'

const NOW = '2026-09-17T05:00:00.000Z'

function block(id = 'block-1'): ProgrammeBlock {
  return {
    id,
    created_at: '2026-09-15T16:25:18.862Z',
    updated_at: '2026-09-15T16:25:18.862Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'programme_import',
    source_id: 'programme-json:test',
    name: 'Test Week',
    block_type: 'microcycle',
    start_date_local: '2026-09-17',
    end_date_local: '2026-09-19',
    status: 'draft',
    supersedes_programme_block_id: null,
    goal: null,
    notes: null,
  }
}

function session(programme_block_id = 'block-1'): ProgrammedSession {
  return {
    id: 'session-1',
    created_at: '2026-09-15T16:25:18.862Z',
    updated_at: '2026-09-15T16:25:18.862Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'programme_import',
    source_id: 'programme-json:test',
    programme_block_id,
    workout_template_id: 'template-1',
    scheduled_date_local: '2026-09-17',
    name_snapshot: 'Thursday — Triceps + Shoulders',
    status: 'planned',
    notes: null,
  }
}

function exercise(): Exercise {
  return {
    id: 'exercise-1',
    canonical_name: 'Cable Pressdown',
    short_name: null,
    category: 'Triceps',
    equipment: 'Cable',
    default_load_type: 'normal',
    rep_mode_default: 'total',
    archived_at: null,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
  }
}

function source(
  selection: ActivePlanSelection,
  detail?: ProgrammedSessionDetail,
): PlanHealthSource {
  const programme_block = block()
  const programmed_session = session(programme_block.id)

  return {
    list_blocks: async () => [programme_block],
    list_sessions: async () => [programmed_session],
    list_active_plan: async () => selection,
    list_actuals: async () => [],
    get_session_detail: async () => detail,
    list_active_exercises: async () => [exercise()],
  }
}

describe('Plan Health', () => {
  it('fails when actionable raw sessions exist but the Plan resolver returns none', async () => {
    const result = await inspect_plan_health(
      source({ programmes: [], hidden_blocks: 1 }),
      { today_local: '2026-09-17', checked_at: NOW },
    )

    expect(result.report.status).toBe('failed')
    expect(result.report.candidate_sessions).toBe(1)
    expect(result.report.visible_sessions).toBe(0)
    expect(result.report.issues.some((entry) => entry.code === 'plan_filter_mismatch')).toBe(true)
  })

  it('reports PLAN OK when the visible session has valid exercises and sets', async () => {
    const programme_block = block()
    const programmed_session = session(programme_block.id)
    const detail = {
      session: programmed_session,
      exercises: [
        {
          exercise: {
            id: 'programmed-exercise-1',
            exercise_id: 'exercise-1',
            exercise_name_snapshot: 'Cable Pressdown',
          },
          sets: [{ set: { id: 'programmed-set-1' }, components: [] }],
        },
      ],
    } as unknown as ProgrammedSessionDetail

    const result = await inspect_plan_health(
      source(
        {
          programmes: [{ block: programme_block, sessions: [programmed_session] }],
          hidden_blocks: 0,
        },
        detail,
      ),
      { today_local: '2026-09-17', checked_at: NOW },
    )

    expect(result.report.status).toBe('ok')
    expect(result.report.visible_sessions).toBe(1)
    expect(result.report.checked_exercises).toBe(1)
    expect(result.report.issues).toEqual([])
  })

  it('does not report five false missing sessions when ten stored sessions belong to duplicate imported weeks', async () => {
    const first: ProgrammeBlock = {
      ...block('old-week'),
      created_at: '2026-09-14T10:00:00Z',
      name: 'FREAK Week',
    }
    const second: ProgrammeBlock = {
      ...block('new-week'),
      created_at: '2026-09-16T10:00:00Z',
      name: 'FREAK Week',
    }
    const dates = ['17','18','19','20','21']
    const old_sessions = dates.map((day) => ({
      ...session(first.id), id: 'old-' + day,
      scheduled_date_local: '2026-09-' + day,
    }))
    const new_sessions = dates.map((day) => ({
      ...session(second.id), id: 'new-' + day,
      scheduled_date_local: '2026-09-' + day,
    }))
    const all = new Map([
      [first.id, old_sessions],
      [second.id, new_sessions],
    ])
    const selection = select_active_plan_programmes(
      [first, second], all, [],
      { today_local: '2026-09-17', latest_programming_input_at: null },
    )
    const detail = {
      exercises: [{
        exercise: {
          id: 'programmed-exercise-1',
          exercise_id: 'exercise-1',
          exercise_name_snapshot: 'Cable Pressdown',
        },
        sets: [{ set: { id: 'programmed-set-1' }, components: [] }],
      }],
    } as unknown as ProgrammedSessionDetail
    const input: PlanHealthSource = {
      list_blocks: async () => [first, second],
      list_sessions: async (id) => all.get(id) ?? [],
      list_active_plan: async () => selection,
      list_actuals: async () => [],
      get_session_detail: async (id) => ({
        ...detail,
        session: new_sessions.find((entry) => entry.id === id)!,
      }),
      list_active_exercises: async () => [exercise()],
    }
    const inspected = await inspect_plan_health(input, {
      today_local: '2026-09-17', checked_at: NOW,
    })
    expect(inspected.report.status).toBe('ok')
    expect(inspected.report.candidate_sessions).toBe(5)
    expect(inspected.report.visible_sessions).toBe(5)
    expect(inspected.report.checked_exercises).toBe(5)
    expect(inspected.report.issues).toEqual([])
  })


})
