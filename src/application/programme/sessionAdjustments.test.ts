import { describe, expect, it, vi } from 'vitest'
import type {
  Exercise,
  ProgrammedSession,
  ProgrammedSessionExercise,
  SessionExercise,
} from '../../domain/models'
import type {
  ExerciseRepository,
  ProgrammeRepository,
  SessionRepository,
} from '../../data/repositories/contracts'
import {
  reschedule_programmed_session,
  set_programmed_session_skipped,
  substitute_live_exercise,
} from './sessionAdjustments'

const NOW = '2026-09-05T12:00:00.000Z'
const DEVICE = 'device-1'

const programmed_session: ProgrammedSession = {
  id: 'ps-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: DEVICE,
  source_kind: 'programme_import',
  source_id: null,
  programme_block_id: 'block-1',
  workout_template_id: 'template-1',
  scheduled_date_local: '2026-09-07',
  name_snapshot: 'Monday',
  status: 'planned',
  notes: null,
}

const planned_exercise: ProgrammedSessionExercise = {
  id: 'pe-1',
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
  revision: 1,
  device_id: DEVICE,
  source_kind: 'programme_import',
  source_id: null,
  programmed_session_id: programmed_session.id,
  exercise_id: 'exercise-old',
  exercise_name_snapshot: 'Old Exercise',
  planned_order: 1,
  rotation_group_key: null,
  rotation_position: null,
  target_sets: 3,
  target_rep_min: 8,
  target_rep_max: 12,
  rest_seconds: 90,
  tempo: null,
  technique_cue: null,
  notes: null,
}

function programme_repo() {
  const put_programmed_session = vi.fn(async (session: ProgrammedSession) => session.id)
  const put_programmed_session_exercise = vi.fn(
    async (exercise: ProgrammedSessionExercise) => exercise.id,
  )
  const repository = {
    list_blocks: async () => [],
    list_templates_for_block: async () => [],
    list_programmed_sessions_for_block: async () => [programmed_session],
    get_programmed_session_detail: async () => ({
      session: programmed_session,
      exercises: [{ exercise: planned_exercise, sets: [] }],
    }),
    put_programmed_session,
    put_programmed_session_exercise,
    get_latest_template_version: async () => 1,
    commit_import: async () => 'ok',
  } as unknown as ProgrammeRepository

  return { repository, put_programmed_session, put_programmed_session_exercise }
}

describe('programme session adjustments', () => {
  it('moves only a planned session and retains an audit-friendly note', async () => {
    const fixture = programme_repo()
    const updated = await reschedule_programmed_session(
      programmed_session.id,
      '2026-09-09',
      fixture.repository,
      { device_id: DEVICE, now_iso: '2026-09-05T13:00:00.000Z' },
    )

    expect(updated.scheduled_date_local).toBe('2026-09-09')
    expect(updated.revision).toBe(2)
    expect(updated.notes).toContain('Rescheduled to 2026-09-09')
    expect(fixture.put_programmed_session).toHaveBeenCalledOnce()
  })

  it('marks a planned session intentionally skipped without deleting it', async () => {
    const fixture = programme_repo()
    const updated = await set_programmed_session_skipped(
      programmed_session.id,
      true,
      fixture.repository,
      { device_id: DEVICE, now_iso: '2026-09-05T13:00:00.000Z' },
    )

    expect(updated.status).toBe('skipped')
    expect(updated.deleted_at).toBeNull()
    expect(fixture.put_programmed_session).toHaveBeenCalledOnce()
  })

  it('refuses substitution after set data exists', async () => {
    const appearance = {
      id: 'se-1',
      deleted_at: null,
      completed_session_id: 'session-1',
      exercise_id: 'exercise-old',
      exercise_name_snapshot: 'Old Exercise',
    } as SessionExercise

    const replacement = {
      id: 'exercise-new',
      deleted_at: null,
      archived_at: null,
      canonical_name: 'New Exercise',
    } as Exercise

    const session_repository = {
      get_session_exercise: async () => appearance,
      get_session: async () => ({
        id: 'session-1',
        deleted_at: null,
        status: 'in_progress',
      }),
      list_sets_for_session_exercise: async () => [
        { id: 'draft-set', deleted_at: null },
      ],
    } as unknown as SessionRepository

    const exercise_repository = {
      get_by_id: async () => replacement,
    } as unknown as ExerciseRepository

    const fixture = programme_repo()

    await expect(
      substitute_live_exercise(
        {
          session_exercise_id: appearance.id,
          replacement_exercise_id: replacement.id,
          scope: 'today',
        },
        {
          exercises: exercise_repository,
          programme: fixture.repository,
          sessions: session_repository,
        },
        { device_id: DEVICE, now_iso: NOW },
      ),
    ).rejects.toThrow('before logging any set data')

    expect(fixture.put_programmed_session_exercise).not.toHaveBeenCalled()
  })

  it('replaces equipment provenance when substituting and does not inherit the old machine', async () => {
    const old = { profile_id: 'old', gym_profile_id: 'gym', label: 'Old', comparable: true, setup_notes: null }
    const appearance = { id: 'se', deleted_at: null, completed_session_id: 's', exercise_id: 'old-exercise',
      exercise_name_snapshot: 'Old', revision: 1, notes: null, equipment_snapshot: old } as SessionExercise
    const put = vi.fn(async (row: SessionExercise) => row.id)
    const sessions = { get_session_exercise: async () => appearance,
      get_session: async () => ({ id: 's', deleted_at: null, status: 'in_progress' }),
      list_sets_for_session_exercise: async () => [], put_session_exercise: put } as unknown as SessionRepository
    const exercises = { get_by_id: async () => ({ id: 'new', canonical_name: 'New', deleted_at: null, archived_at: null }) } as unknown as ExerciseRepository
    const equipment = { ...old, profile_id: 'new-machine', label: 'New machine' }
    const run = (replacement_equipment_snapshot?: typeof old) => substitute_live_exercise({ session_exercise_id: 'se',
      replacement_exercise_id: 'new', scope: 'today', replacement_equipment_snapshot },
    { exercises, sessions, programme: programme_repo().repository }, { device_id: DEVICE, now_iso: NOW })
    expect((await run(equipment)).session_exercise.equipment_snapshot).toEqual(equipment)
    expect((await run()).session_exercise.equipment_snapshot).toBeNull()
    expect(appearance.equipment_snapshot).toEqual(old)
  })
})
