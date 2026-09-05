import type {
  ProgrammedSession,
  ProgrammedSessionExercise,
  SessionExercise,
} from '../../domain/models'
import type {
  ExerciseRepository,
  ProgrammeRepository,
  SessionRepository,
} from '../../data/repositories/contracts'

export type ExerciseSubstitutionScope = 'today' | 'week' | 'programme'

export interface AdjustmentContext {
  device_id: string
  now_iso: string
}

function append_note(existing: string | null, note: string): string {
  return existing?.trim() ? `${existing.trim()}\n${note}` : note
}

function week_end_local(date_local: string): string {
  const date = new Date(`${date_local}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return date_local
  const day = date.getUTCDay()
  const until_sunday = (7 - day) % 7
  date.setUTCDate(date.getUTCDate() + until_sunday)
  return date.toISOString().slice(0, 10)
}

function updated_programmed_session(
  session: ProgrammedSession,
  context: AdjustmentContext,
  patch: Partial<ProgrammedSession>,
): ProgrammedSession {
  return {
    ...session,
    ...patch,
    updated_at: context.now_iso,
    revision: session.revision + 1,
    device_id: context.device_id,
    source_kind: 'user',
  }
}

function updated_programmed_exercise(
  exercise: ProgrammedSessionExercise,
  context: AdjustmentContext,
  patch: Partial<ProgrammedSessionExercise>,
): ProgrammedSessionExercise {
  return {
    ...exercise,
    ...patch,
    updated_at: context.now_iso,
    revision: exercise.revision + 1,
    device_id: context.device_id,
    source_kind: 'user',
  }
}

export async function reschedule_programmed_session(
  programmed_session_id: string,
  scheduled_date_local: string,
  programme: ProgrammeRepository,
  context: AdjustmentContext,
): Promise<ProgrammedSession> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date_local)) {
    throw new Error('Choose a valid session date.')
  }

  const detail = await programme.get_programmed_session_detail(
    programmed_session_id,
  )
  if (!detail) throw new Error('Programmed session was not found.')
  if (detail.session.status !== 'planned') {
    throw new Error('Only planned sessions can be moved.')
  }

  const updated = updated_programmed_session(detail.session, context, {
    scheduled_date_local,
    notes: append_note(
      detail.session.notes,
      `Rescheduled to ${scheduled_date_local}.`,
    ),
  })
  await programme.put_programmed_session(updated)
  return updated
}

export async function set_programmed_session_skipped(
  programmed_session_id: string,
  skipped: boolean,
  programme: ProgrammeRepository,
  context: AdjustmentContext,
): Promise<ProgrammedSession> {
  const detail = await programme.get_programmed_session_detail(
    programmed_session_id,
  )
  if (!detail) throw new Error('Programmed session was not found.')

  if (skipped && detail.session.status !== 'planned') {
    throw new Error('Only planned sessions can be skipped.')
  }
  if (!skipped && detail.session.status !== 'skipped') {
    throw new Error('Only skipped sessions can be restored to the plan.')
  }

  const updated = updated_programmed_session(detail.session, context, {
    status: skipped ? 'skipped' : 'planned',
    notes: append_note(
      detail.session.notes,
      skipped ? 'Session intentionally skipped.' : 'Skipped session restored to plan.',
    ),
  })
  await programme.put_programmed_session(updated)
  return updated
}

export async function substitute_live_exercise(
  input: {
    session_exercise_id: string
    replacement_exercise_id: string
    scope: ExerciseSubstitutionScope
  },
  repositories: {
    exercises: ExerciseRepository
    programme: ProgrammeRepository
    sessions: SessionRepository
  },
  context: AdjustmentContext,
): Promise<{
  session_exercise: SessionExercise
  future_programmed_exercises_changed: number
}> {
  const appearance = await repositories.sessions.get_session_exercise(
    input.session_exercise_id,
  )
  if (!appearance || appearance.deleted_at !== null) {
    throw new Error('Workout exercise was not found.')
  }

  const session = await repositories.sessions.get_session(
    appearance.completed_session_id,
  )
  if (!session || session.deleted_at !== null) {
    throw new Error('Workout session was not found.')
  }
  if (session.status !== 'in_progress') {
    throw new Error('Exercises can only be substituted during an active workout.')
  }

  const existing_sets =
    await repositories.sessions.list_sets_for_session_exercise(appearance.id)
  if (existing_sets.some((set) => set.deleted_at === null)) {
    throw new Error(
      'Change the exercise before logging any set data. Existing set data was preserved.',
    )
  }

  if (appearance.exercise_id === input.replacement_exercise_id) {
    throw new Error('Choose a different exercise.')
  }

  const replacement = await repositories.exercises.get_by_id(
    input.replacement_exercise_id,
  )
  if (
    !replacement ||
    replacement.deleted_at !== null ||
    replacement.archived_at !== null
  ) {
    throw new Error('Replacement exercise is not active in the library.')
  }

  const original_exercise_id = appearance.exercise_id
  const original_name = appearance.exercise_name_snapshot
  const updated: SessionExercise = {
    ...appearance,
    exercise_id: replacement.id,
    exercise_name_snapshot: replacement.canonical_name,
    notes: append_note(
      appearance.notes,
      `Substituted from ${original_name} to ${replacement.canonical_name} (${input.scope}).`,
    ),
    updated_at: context.now_iso,
    revision: appearance.revision + 1,
    device_id: context.device_id,
    source_kind: 'user',
  }
  await repositories.sessions.put_session_exercise(updated)

  let future_programmed_exercises_changed = 0
  if (
    input.scope !== 'today' &&
    session.programme_block_id &&
    session.session_date_local
  ) {
    const end_date =
      input.scope === 'week'
        ? week_end_local(session.session_date_local)
        : '9999-12-31'
    const programmed_sessions =
      await repositories.programme.list_programmed_sessions_for_block(
        session.programme_block_id,
      )

    for (const future of programmed_sessions) {
      if (
        future.status !== 'planned' ||
        !future.scheduled_date_local ||
        future.scheduled_date_local <= session.session_date_local ||
        future.scheduled_date_local > end_date
      ) {
        continue
      }

      const detail =
        await repositories.programme.get_programmed_session_detail(future.id)
      if (!detail) continue

      for (const planned of detail.exercises) {
        if (planned.exercise.exercise_id !== original_exercise_id) continue

        const changed = updated_programmed_exercise(
          planned.exercise,
          context,
          {
            exercise_id: replacement.id,
            exercise_name_snapshot: replacement.canonical_name,
            notes: append_note(
              planned.exercise.notes,
              `Substituted from ${original_name} to ${replacement.canonical_name} from ${session.session_date_local} (${input.scope}).`,
            ),
          },
        )
        await repositories.programme.put_programmed_session_exercise(changed)
        future_programmed_exercises_changed += 1
      }
    }
  }

  return { session_exercise: updated, future_programmed_exercises_changed }
}
