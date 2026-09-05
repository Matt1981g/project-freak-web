import { describe, expect, it } from 'vitest'
import type {
  CompletedSession,
  ProgrammeBlock,
  ProgrammedSession,
} from '../../domain/models'
import { select_active_plan_programmes } from './activePlan'

const base = {
  created_at: '2026-09-04T12:00:00.000Z',
  updated_at: '2026-09-04T12:00:00.000Z',
  deleted_at: null,
  revision: 1,
  device_id: 'device',
  source_kind: 'programme_import' as const,
  source_id: null,
}

function block(
  id: string,
  start = '2026-09-07',
  end = '2026-09-12',
  created_at = base.created_at,
): ProgrammeBlock {
  return {
    ...base,
    id,
    created_at,
    updated_at: created_at,
    name: id,
    block_type: 'microcycle',
    start_date_local: start,
    end_date_local: end,
    status: 'draft',
    goal: null,
    notes: null,
  }
}

function planned(
  id: string,
  programme_block_id: string,
  date = '2026-09-07',
): ProgrammedSession {
  return {
    ...base,
    id,
    programme_block_id,
    workout_template_id: null,
    scheduled_date_local: date,
    name_snapshot: id,
    status: 'planned',
    notes: null,
  }
}

function actual(
  id: string,
  programmed_session_id: string | null,
  programme_block_id: string | null,
  date: string,
  updated_at: string,
  status: CompletedSession['status'] = 'completed',
): CompletedSession {
  return {
    ...base,
    id,
    updated_at,
    programmed_session_id,
    programme_block_id,
    workout_template_id_snapshot: null,
    legacy_workout_id: null,
    session_name: id,
    session_date_local: date,
    timezone: 'Europe/London',
    status,
    started_at: updated_at,
    completed_at: status === 'completed' ? updated_at : null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: null,
    notes: null,
  }
}

describe('active plan selection', () => {
  it('removes completed actual sessions and hides an empty block', () => {
    const b = block('week')
    const s = planned('monday', b.id)
    const result = select_active_plan_programmes(
      [b],
      new Map([[b.id, [s]]]),
      [actual('done', s.id, b.id, '2026-09-07', '2026-09-07T08:00:00.000Z')],
      { today_local: '2026-09-07', latest_programming_input_at: null },
    )

    expect(result.programmes).toHaveLength(0)
    expect(result.hidden_blocks).toBe(1)
  })

  it('hides a future block when new completed evidence arrived before it started', () => {
    const b = block('week', '2026-09-07', '2026-09-12', '2026-09-04T12:00:00.000Z')
    const s = planned('monday', b.id)
    const result = select_active_plan_programmes(
      [b],
      new Map([[b.id, [s]]]),
      [actual('saturday', null, null, '2026-09-05', '2026-09-05T09:00:00.000Z')],
      { today_local: '2026-09-05', latest_programming_input_at: null },
    )

    expect(result.programmes).toHaveLength(0)
  })

  it('hides a not-yet-started block when priorities or mappings changed after generation', () => {
    const b = block('week')
    const s = planned('monday', b.id)
    const result = select_active_plan_programmes(
      [b],
      new Map([[b.id, [s]]]),
      [],
      {
        today_local: '2026-09-05',
        latest_programming_input_at: '2026-09-05T13:00:00.000Z',
      },
    )

    expect(result.programmes).toHaveLength(0)
  })

  it('does not invalidate the rest of a week after that block has started', () => {
    const b = block('week')
    const mon = planned('monday', b.id, '2026-09-07')
    const tue = planned('tuesday', b.id, '2026-09-08')
    const result = select_active_plan_programmes(
      [b],
      new Map([[b.id, [mon, tue]]]),
      [actual('mon actual', mon.id, b.id, '2026-09-07', '2026-09-07T08:00:00.000Z')],
      {
        today_local: '2026-09-07',
        latest_programming_input_at: '2026-09-07T10:00:00.000Z',
      },
    )

    expect(result.programmes).toHaveLength(1)
    expect(result.programmes[0].sessions.map((session) => session.id)).toEqual([
      'tuesday',
    ])
  })

  it('keeps only the newer microcycle when the same date window is replaced', () => {
    const oldBlock = block('old', '2026-09-07', '2026-09-12', '2026-09-04T12:00:00.000Z')
    const newBlock = block('new', '2026-09-07', '2026-09-12', '2026-09-06T12:00:00.000Z')
    const result = select_active_plan_programmes(
      [oldBlock, newBlock],
      new Map([
        [oldBlock.id, [planned('old-mon', oldBlock.id)]],
        [newBlock.id, [planned('new-mon', newBlock.id)]],
      ]),
      [],
      { today_local: '2026-09-06', latest_programming_input_at: null },
    )

    expect(result.programmes).toHaveLength(1)
    expect(result.programmes[0].block.id).toBe('new')
  })

  it('treats an overlapping newer microcycle as the replacement even when its end date differs', () => {
    const oldBlock = block(
      'old-week',
      '2026-09-07',
      '2026-09-12',
      '2026-09-04T12:00:00.000Z',
    )
    const replacement = block(
      'replacement',
      '2026-09-07',
      '2026-09-13',
      '2026-09-05T15:00:00.000Z',
    )

    const result = select_active_plan_programmes(
      [oldBlock, replacement],
      new Map([
        [oldBlock.id, [planned('old-mon', oldBlock.id)]],
        [replacement.id, [planned('new-mon', replacement.id)]],
      ]),
      [],
      { today_local: '2026-09-05', latest_programming_input_at: null },
    )

    expect(result.programmes).toHaveLength(1)
    expect(result.programmes[0].block.id).toBe('replacement')
  })

  it('does not hide an overlapping older microcycle after that older block has actually started', () => {
    const oldBlock = block(
      'old-week',
      '2026-09-07',
      '2026-09-12',
      '2026-09-04T12:00:00.000Z',
    )
    const replacement = block(
      'replacement',
      '2026-09-07',
      '2026-09-13',
      '2026-09-07T10:00:00.000Z',
    )
    const mon = planned('old-mon', oldBlock.id)

    const result = select_active_plan_programmes(
      [oldBlock, replacement],
      new Map([
        [oldBlock.id, [mon, planned('old-tue', oldBlock.id, '2026-09-08')]],
        [replacement.id, [planned('new-tue', replacement.id, '2026-09-08')]],
      ]),
      [
        actual(
          'old-mon-actual',
          mon.id,
          oldBlock.id,
          '2026-09-07',
          '2026-09-07T08:00:00.000Z',
        ),
      ],
      { today_local: '2026-09-07', latest_programming_input_at: null },
    )

    expect(result.programmes.map((entry) => entry.block.id)).toContain('old-week')
  })
})
