import { describe, expect, it } from 'vitest'
import type {
  ProgrammeBlock,
  ProgrammedSession,
} from '../../domain/models'
import type {
  ProgrammeImportEntities,
  ProgrammeRepository,
  SessionRepository,
} from '../../data/repositories/contracts'
import type { ProgrammeImportPreview } from './programmeImport'
import { commit_programme_import_with_replacement } from './programmeImportReplacement'

const NOW = '2026-09-17T18:00:00.000Z'
const DEVICE_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ID = 'programme-json:replacement-test'

function block(
  id: string,
  source_id: string | null,
  created_at: string,
): ProgrammeBlock {
  return {
    id,
    created_at,
    updated_at: created_at,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: source_id ? 'programme_import' : 'user',
    source_id,
    name: id,
    block_type: 'custom',
    start_date_local: '2026-09-18',
    end_date_local: '2026-09-18',
    status: 'draft',
    supersedes_programme_block_id: null,
    goal: null,
    notes: null,
  }
}

function session(
  id: string,
  programme_block_id: string,
  status: ProgrammedSession['status'],
): ProgrammedSession {
  return {
    id,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    revision: 1,
    device_id: DEVICE_ID,
    source_kind: 'programme_import',
    source_id: null,
    programme_block_id,
    workout_template_id: null,
    scheduled_date_local: '2026-09-18',
    name_snapshot: id,
    status,
    notes: null,
  }
}

function preview(): ProgrammeImportPreview {
  return {
    source_id: SOURCE_ID,
    document_hash: 'replacement-test',
    document: {
      format: 'project-freak-programme',
      schema_version: '1.0.0',
      generated_at: NOW,
      source: 'test',
      programme: {
        external_id: 'replacement-test',
        name: 'Replacement test',
        block_type: 'custom',
        start_date_local: '2026-09-18',
        end_date_local: '2026-09-18',
        goal: null,
        notes: null,
        sessions: [
          {
            external_id: 'replacement-friday',
            name: 'Friday replacement',
            scheduled_date_local: '2026-09-18',
            day_label: 'Friday',
            notes: null,
            exercises: [],
          },
        ],
      },
    },
    issues: [],
    exercise_resolutions: [],
    counts: { sessions: 1, exercises: 0, sets: 0, components: 0 },
    can_commit: true,
  }
}

function fake_programme_repository(
  blocks: ProgrammeBlock[],
  sessions: ProgrammedSession[],
): ProgrammeRepository {
  return {
    list_blocks: async () => blocks,
    list_templates_for_block: async () => [],
    list_programmed_sessions_for_block: async (programme_block_id) =>
      sessions.filter(
        (entry) => entry.programme_block_id === programme_block_id,
      ),
    get_programmed_session_detail: async () => undefined,
    put_programmed_session: async (updated) => {
      const index = sessions.findIndex((entry) => entry.id === updated.id)
      if (index >= 0) sessions[index] = updated
      else sessions.push(updated)
      return updated.id
    },
    get_latest_template_version: async () => 0,
    commit_import: async (
      entities: ProgrammeImportEntities,
    ): Promise<'committed' | 'duplicate_noop'> => {
      const duplicate = blocks.find(
        (entry) =>
          entry.deleted_at === null &&
          entry.source_kind === 'programme_import' &&
          entry.source_id === entities.block.source_id,
      )
      if (duplicate) return 'duplicate_noop'

      blocks.push(entities.block)
      sessions.push(...entities.programmed_sessions)
      return 'committed'
    },
  }
}

function fake_session_repository(
  actual_programmed_session_ids: ReadonlySet<string> = new Set(),
): SessionRepository {
  return {
    get_by_programmed_session_id: async (programmed_session_id) =>
      actual_programmed_session_ids.has(programmed_session_id)
        ? ({ deleted_at: null } as Awaited<
            ReturnType<SessionRepository['get_by_programmed_session_id']>
          >)
        : undefined,
  } as SessionRepository
}

describe('programme import replacement', () => {
  it('reuses an identical imported block, reactivates its skipped session and cancels the old prescription', async () => {
    const blocks = [
      block('old-block', null, '2026-09-17T10:00:00.000Z'),
      block('replacement-block', SOURCE_ID, '2026-09-17T18:00:00.000Z'),
    ]
    const sessions = [
      session('old-friday', 'old-block', 'planned'),
      session('replacement-friday', 'replacement-block', 'skipped'),
    ]

    const result = await commit_programme_import_with_replacement(
      preview(),
      fake_programme_repository(blocks, sessions),
      fake_session_repository(),
      DEVICE_ID,
      {
        replace_existing_on_matching_dates: true,
        now_iso: NOW,
      },
    )

    expect(result.import_result).toBe('duplicate_noop')
    expect(result.replaced_sessions).toBe(1)
    expect(result.reactivated_sessions).toBe(1)
    expect(sessions.find((entry) => entry.id === 'old-friday')?.status).toBe(
      'cancelled',
    )
    expect(
      sessions.find((entry) => entry.id === 'replacement-friday')?.status,
    ).toBe('planned')
  })

  it('imports a new replacement and leaves exactly one planned session on the date', async () => {
    const blocks = [block('old-block', null, '2026-09-17T10:00:00.000Z')]
    const sessions = [session('old-friday', 'old-block', 'planned')]

    const result = await commit_programme_import_with_replacement(
      preview(),
      fake_programme_repository(blocks, sessions),
      fake_session_repository(),
      DEVICE_ID,
      {
        replace_existing_on_matching_dates: true,
        now_iso: NOW,
      },
    )

    expect(result.import_result).toBe('committed')
    expect(result.replaced_sessions).toBe(1)
    expect(
      sessions.filter(
        (entry) =>
          entry.scheduled_date_local === '2026-09-18' &&
          entry.status === 'planned',
      ),
    ).toHaveLength(1)
  })

  it('refuses to replace a workout that has already started', async () => {
    const blocks = [block('old-block', null, '2026-09-17T10:00:00.000Z')]
    const sessions = [session('old-friday', 'old-block', 'started')]

    await expect(
      commit_programme_import_with_replacement(
        preview(),
        fake_programme_repository(blocks, sessions),
        fake_session_repository(),
        DEVICE_ID,
        { replace_existing_on_matching_dates: true, now_iso: NOW },
      ),
    ).rejects.toThrow('already started')

    expect(sessions[0].status).toBe('started')
  })

  it('refuses to replace a planned prescription that already has workout history', async () => {
    const blocks = [block('old-block', null, '2026-09-17T10:00:00.000Z')]
    const sessions = [session('old-friday', 'old-block', 'planned')]

    await expect(
      commit_programme_import_with_replacement(
        preview(),
        fake_programme_repository(blocks, sessions),
        fake_session_repository(new Set(['old-friday'])),
        DEVICE_ID,
        { replace_existing_on_matching_dates: true, now_iso: NOW },
      ),
    ).rejects.toThrow('workout history already exists')

    expect(sessions[0].status).toBe('planned')
  })
})
