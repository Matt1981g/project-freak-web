import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveQuery } from 'dexie'
import type { CompletedSession, ProgrammeBlock, ProgrammedSession } from '../domain/models'
import { projectFreakDb as db } from '../data/db/projectFreakDb'
import { load_today_programmed_sessions } from './projectFreakServices'

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


beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
  await db.open()
  await db.programme_blocks.put(block('week'))
  await db.programmed_sessions.put(planned('monday', 'week'))
})

afterEach(async () => {
  await db.delete()
  vi.useRealTimers()
})

function workout(id: string, status: CompletedSession['status']) {
  return actual(id, 'monday', 'week', '2026-09-07', '2026-09-07T08:00:00Z', status)
}

describe('daily launch prompt', () => {
  it('offers Start for an unstarted scheduled session', async () => {
    expect(await load_today_programmed_sessions()).toMatchObject([
      { programmed_session: { id: 'monday' }, resume: false, existing_session_id: null },
    ])
  })

  it('offers Resume with the existing workout ID', async () => {
    await db.completed_sessions.put(workout('active', 'in_progress'))
    expect(await load_today_programmed_sessions()).toMatchObject([
      { resume: true, existing_session_id: 'active' },
    ])
  })

  it('does not prompt after completion even when the schedule still says planned', async () => {
    await db.completed_sessions.put(workout('done', 'completed'))
    expect(await load_today_programmed_sessions()).toEqual([])
  })

  it('does not let a stale in-progress duplicate mask completion', async () => {
    await db.completed_sessions.bulkPut([
      workout('stale', 'in_progress'), workout('done', 'completed'),
    ])
    expect(await load_today_programmed_sessions()).toEqual([])
  })

  it('ignores soft-deleted completion records', async () => {
    await db.completed_sessions.put({ ...workout('deleted', 'completed'), deleted_at: base.updated_at })
    expect(await load_today_programmed_sessions()).toHaveLength(1)
  })

  it('does not prompt when nothing is scheduled today', async () => {
    await db.programmed_sessions.update('monday', { scheduled_date_local: '2026-09-08' })
    expect(await load_today_programmed_sessions()).toEqual([])
  })

  it('does not prompt for a replaced programme after finishing its replacement', async () => {
    await db.programme_blocks.put(block('replacement', '2026-09-07', '2026-09-12', '2026-09-06T12:00:00Z'))
    await db.programmed_sessions.put(planned('replacement-monday', 'replacement'))
    await db.completed_sessions.put({ ...workout('done', 'completed'), programmed_session_id: 'replacement-monday', programme_block_id: 'replacement' })
    expect(await load_today_programmed_sessions()).toEqual([])
  })

  it('does not prompt for an archived block', async () => {
    await db.programme_blocks.update('week', { status: 'archived' })
    expect(await load_today_programmed_sessions()).toEqual([])
  })

  it('refreshes an open prompt when completion arrives in the database', async () => {
    const results: Awaited<ReturnType<typeof load_today_programmed_sessions>>[] = []
    const subscription = liveQuery(load_today_programmed_sessions).subscribe(value => results.push(value))
    try {
      await vi.waitFor(() => expect(results.at(-1)).toHaveLength(1))
      await db.completed_sessions.put(workout('done', 'completed'))
      await vi.waitFor(() => expect(results.at(-1)).toEqual([]))
    } finally {
      subscription.unsubscribe()
    }
  })
})
