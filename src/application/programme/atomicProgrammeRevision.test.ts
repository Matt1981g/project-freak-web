import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { create_repositories } from '../../data/repositories'
import type { ProgrammeBlock, ProgrammedSession, CompletedSession } from '../../domain/models'
import type { ProgrammeImportPreview } from './programmeImport'
import { commit_programme_revision_atomically } from './atomicProgrammeRevision'
import { select_active_plan_programmes } from './activePlan'

const DB_NAME = 'pf-atomic-programme-revision-tests'
const NOW = '2026-10-11T17:00:00.000Z'
const DEVICE = '11111111-1111-4111-8111-111111111111'
const DAY = '2026-10-12'
const SOURCE = 'programme-json:new-week'

function meta(id: string, source_id: string | null = null) {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE,
    source_kind: source_id ? 'programme_import' as const : 'user' as const,
    source_id,
  }
}

function block(id: string, source_id: string | null = null): ProgrammeBlock {
  return {
    ...meta(id, source_id),
    name: id,
    block_type: 'microcycle',
    start_date_local: DAY,
    end_date_local: DAY,
    status: 'active',
    supersedes_programme_block_id: null,
    goal: null,
    notes: null,
  }
}

function session(
  id: string,
  programme_block_id: string,
  status: ProgrammedSession['status'] = 'planned',
  date = DAY,
): ProgrammedSession {
  return {
    ...meta(id),
    programme_block_id,
    workout_template_id: null,
    scheduled_date_local: date,
    name_snapshot: id,
    status,
    notes: null,
  }
}

function preview(
  source_id = SOURCE,
  dates: string[] = [DAY],
): ProgrammeImportPreview {
  return {
    source_id,
    document_hash: source_id,
    document: {
      format: 'project-freak-programme',
      schema_version: '1.0.0',
      generated_at: NOW,
      source: 'test',
      programme: {
        external_id: source_id,
        name: 'Atomic publication',
        block_type: 'microcycle',
        start_date_local: dates[0] ?? DAY,
        end_date_local: dates[dates.length - 1] ?? DAY,
        goal: null,
        notes: null,
        sessions: dates.map((date, index) => ({
          external_id: 'day-' + index,
          name: 'Day ' + index,
          scheduled_date_local: date,
          day_label: 'Monday',
          notes: null,
          exercises: [],
        })),
      },
    },
    issues: [],
    exercise_resolutions: [],
    counts: { sessions: dates.length, exercises: 0, sets: 0, components: 0 },
    can_commit: true,
  }
}

function history(programmed_session_id: string): CompletedSession {
  return {
    ...meta('actual-' + programmed_session_id),
    programmed_session_id,
    programme_block_id: 'old',
    workout_template_id_snapshot: null,
    legacy_workout_id: null,
    session_name: 'Old session',
    session_date_local: DAY,
    timezone: 'Europe/London',
    status: 'in_progress',
    started_at: NOW,
    completed_at: null,
    source_start_text: null,
    source_finish_text: null,
    duration_seconds: null,
    notes: null,
  }
}

describe('atomic programme revision publication', () => {
  let db: ProjectFreakDatabase
  let repositories: ReturnType<typeof create_repositories>

  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
    db = new ProjectFreakDatabase(DB_NAME)
    await db.open()
    repositories = create_repositories(db)
  })

  afterEach(async () => {
    db.close()
    await Dexie.delete(DB_NAME)
  })

  async function publish(
    input = preview(),
    replace_existing_on_matching_dates = true,
  ) {
    return commit_programme_revision_atomically(
      db,
      input,
      repositories.programme,
      DEVICE,
      { replace_existing_on_matching_dates, now_iso: NOW },
    )
  }

  it('publishes one authoritative session, cancels a previous one and archives the fully superseded block', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))

    const result = await publish()
    expect(result.import_result).toBe('committed')
    expect(result.replaced_sessions).toBe(1)
    expect(await db.programme_blocks.count()).toBe(2)
    expect((await db.programme_blocks.get('old'))?.status).toBe('archived')
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('cancelled')

    const authoritative = (await db.programmed_sessions.toArray()).filter(
      (row) => row.status === 'planned' && row.scheduled_date_local === DAY,
    )
    expect(authoritative).toHaveLength(1)
    const published_block = await db.programme_blocks.get(
      authoritative[0].programme_block_id as string,
    )
    expect(published_block?.status).toBe('active')
    expect(await db.audit_events.count()).toBeGreaterThan(0)
    expect(await db.sync_outbox.count()).toBe(await db.audit_events.count())
  })

  it('retries the exact same source idempotently without increasing audit, outbox or entity counts', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))
    await publish()
    const before = {
      blocks: await db.programme_blocks.count(),
      sessions: await db.programmed_sessions.count(),
      audit: await db.audit_events.count(),
      outbox: await db.sync_outbox.count(),
    }
    const result = await publish()
    expect(result.import_result).toBe('duplicate_noop')
    expect(result.replaced_sessions).toBe(0)
    expect(result.reactivated_sessions).toBe(0)
    expect({
      blocks: await db.programme_blocks.count(),
      sessions: await db.programmed_sessions.count(),
      audit: await db.audit_events.count(),
      outbox: await db.sync_outbox.count(),
    }).toEqual(before)
  })

  it('reactivates an existing cancelled import without duplicating its block', async () => {
    await db.programme_blocks.add(block('target', SOURCE))
    await db.programmed_sessions.add(session('target-session', 'target', 'cancelled'))
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))
    const result = await publish()
    expect(result.import_result).toBe('duplicate_noop')
    expect(result.reactivated_sessions).toBe(1)
    expect(result.replaced_sessions).toBe(1)
    expect((await db.programmed_sessions.get('target-session'))?.status).toBe('planned')
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('cancelled')
    expect(await db.programme_blocks.count()).toBe(2)
  })

  it('refuses started competing workouts before adding any new block or audit writes', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old', 'started'))
    await expect(publish()).rejects.toThrow('started')
    expect(await db.programme_blocks.count()).toBe(1)
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('started')
    expect(await db.audit_events.count()).toBe(0)
  })

  it('refuses a planned competitor with a real workout history link', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))
    await db.completed_sessions.add(history('old-session'))
    await expect(publish()).rejects.toThrow('workout history exists')
    expect(await db.programme_blocks.count()).toBe(1)
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('planned')
  })

  it('preserves a prior programme with other scheduled sessions and does not archive it', async () => {
    await db.programme_blocks.add({
      ...block('old'),
      end_date_local: '2026-10-15',
    })
    await db.programmed_sessions.bulkAdd([
      session('old-day', 'old'),
      session('old-future', 'old', 'planned', '2026-10-15'),
    ])
    await publish()
    expect((await db.programme_blocks.get('old'))?.status).toBe('active')
    expect((await db.programmed_sessions.get('old-future'))?.status).toBe('planned')
    const blocks = await db.programme_blocks.toArray()
    const rows = await db.programmed_sessions.toArray()
    const visible = select_active_plan_programmes(
      blocks,
      new Map(blocks.map((entry) => [
        entry.id,
        rows.filter((row) => row.programme_block_id === entry.id),
      ] as const)),
      [],
      { today_local: '2026-10-11', latest_programming_input_at: null },
    )
    expect(visible.programmes.flatMap((entry) => entry.sessions)
      .map((entry) => entry.id)).toContain('old-future')
    expect(visible.programmes).toHaveLength(2)
  })

  it('refuses a duplicate or undated incoming session before changing storage', async () => {
    await expect(publish(preview(SOURCE, [DAY, DAY]))).rejects.toThrow(
      'exactly one imported session per date',
    )
    await expect(publish(preview(SOURCE, ['']))).rejects.toThrow(
      'requires a scheduled date',
    )
    expect(await db.programme_blocks.count()).toBe(0)
  })

  it('rolls back imported graph, cancellations, audit and outbox on an injected database error', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))
    db.sync_outbox.hook('creating', () => {
      throw new Error('Simulated storage interruption')
    })
    await expect(publish()).rejects.toThrow('Simulated storage interruption')
    expect(await db.programme_blocks.count()).toBe(1)
    expect(await db.programmed_sessions.count()).toBe(1)
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('planned')
    expect(await db.audit_events.count()).toBe(0)
    expect(await db.sync_outbox.count()).toBe(0)
  })

  it('keeps normal nonreplacement imports non-destructive', async () => {
    await db.programme_blocks.add(block('old'))
    await db.programmed_sessions.add(session('old-session', 'old'))
    const result = await publish(preview(), false)
    expect(result.replaced_sessions).toBe(0)
    expect((await db.programmed_sessions.get('old-session'))?.status).toBe('planned')
  })

  it('serializes simultaneous commits of an identical source without duplicate blocks', async () => {
    const [first, second] = await Promise.all([publish(), publish()])
    expect([first.import_result, second.import_result].sort()).toEqual(
      ['committed', 'duplicate_noop'],
    )
    expect(await db.programme_blocks.count()).toBe(1)
    expect(await db.programmed_sessions.count()).toBe(1)
  })
})
