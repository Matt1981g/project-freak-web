import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ProgrammeBlock, ProgrammedSession } from '../../domain/models'
import {
  load_programme_blocks,
  load_programme_sessions,
  load_programmed_session_detail,
  reschedule_plan_session,
  restore_plan_session,
  skip_plan_session,
  start_programmed_session_workout,
} from '../../app/projectFreakServices'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './PlanScreen.module.css'

interface StoredProgrammeSummary {
  block: ProgrammeBlock
  sessions: ProgrammedSession[]
}

function rep_target(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
): string {
  if (minimum === null || minimum === undefined) {
    return maximum === null || maximum === undefined ? 'reps open' : `≤${maximum}`
  }
  if (maximum === null || maximum === undefined) {
    return `≥${minimum}`
  }
  if (minimum === maximum) {
    return `${minimum} reps`
  }
  return `${minimum}–${maximum} reps`
}

function date_span(block: ProgrammeBlock): string {
  if (block.start_date_local && block.end_date_local) {
    return `${format_local_date_display(block.start_date_local)} → ${format_local_date_display(block.end_date_local)}`
  }
  return format_local_date_display(
    block.start_date_local ?? block.end_date_local,
    'Dates not fixed',
  )
}

export function PlanScreen() {
  const navigate = useNavigate()
  const [stored, setStored] = useState<StoredProgrammeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [open_session_id, setOpenSessionId] = useState<string | null>(null)
  const [session_detail, setSessionDetail] = useState<
    Awaited<ReturnType<typeof load_programmed_session_detail>>
  >(undefined)
  const [session_detail_loading, setSessionDetailLoading] = useState(false)
  const [starting_session_id, setStartingSessionId] = useState<string | null>(null)
  const [session_action_id, setSessionActionId] = useState<string | null>(null)
  const [move_date_by_session, setMoveDateBySession] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh_programmes = useCallback(async () => {
    setLoading(true)
    try {
      const blocks = await load_programme_blocks()
      const summaries = await Promise.all(
        blocks.map(async (block) => ({
          block,
          sessions: await load_programme_sessions(block.id),
        })),
      )
      setStored(summaries)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load programmes.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh_programmes()
  }, [refresh_programmes])

  async function toggle_stored_session(session_id: string) {
    if (open_session_id === session_id) {
      setOpenSessionId(null)
      setSessionDetail(undefined)
      return
    }

    setOpenSessionId(session_id)
    setSessionDetail(undefined)
    setSessionDetailLoading(true)
    setError(null)

    try {
      setSessionDetail(await load_programmed_session_detail(session_id))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to load programmed session detail.',
      )
    } finally {
      setSessionDetailLoading(false)
    }
  }

  async function start_session(programmed_session_id: string) {
    setStartingSessionId(programmed_session_id)
    setError(null)

    try {
      const result = await start_programmed_session_workout(
        programmed_session_id,
      )
      navigate(`/workout/${result.session_id}`)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to start workout.',
      )
    } finally {
      setStartingSessionId(null)
    }
  }


  async function refresh_open_session(session_id: string) {
    await refresh_programmes()
    setSessionDetail(await load_programmed_session_detail(session_id))
  }

  async function move_session(session: ProgrammedSession) {
    const date =
      move_date_by_session[session.id] ?? session.scheduled_date_local ?? ''
    if (!date) {
      setError('Choose the new session date first.')
      return
    }

    setSessionActionId(session.id)
    setError(null)
    try {
      await reschedule_plan_session(session.id, date)
      await refresh_open_session(session.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to move session.')
    } finally {
      setSessionActionId(null)
    }
  }

  async function change_skip_state(session: ProgrammedSession, skipped: boolean) {
    setSessionActionId(session.id)
    setError(null)
    try {
      if (skipped) await skip_plan_session(session.id)
      else await restore_plan_session(session.id)
      await refresh_open_session(session.id)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to update session status.',
      )
    } finally {
      setSessionActionId(null)
    }
  }


  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PLAN</p>
          <h1>Programme</h1>
          <p className={styles.intro}>
            Review the programme blocks stored on this device, open each session
            prescription and start training from the plan you have already approved.
          </p>
        </div>
        <div className={styles.countCard}>
          <strong>{loading ? '…' : stored.length}</strong>
          <span>blocks</span>
        </div>
      </section>

      <section className={styles.storedSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>LOCAL DATABASE</span>
            <h2>Programme blocks</h2>
          </div>
          <span>{loading ? 'Loading…' : `${stored.length} stored`}</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading programmes…</div>
        ) : stored.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No programme imported yet.</strong>
            <span>
              The historical training database is safe. Programme data lives in
              separate versioned stores.
            </span>
          </div>
        ) : (
          <div className={styles.blockList}>
            {stored.map(({ block, sessions }) => (
              <article className={styles.blockCard} key={block.id}>
                <div className={styles.blockHeader}>
                  <div>
                    <span>{block.block_type}</span>
                    <h3>{block.name}</h3>
                  </div>
                  <span className={styles.statusBadge}>{block.status}</span>
                </div>
                <p>{block.goal ?? 'No block goal recorded.'}</p>
                <div className={styles.blockMeta}>
                  <span>{date_span(block)}</span>
                  <strong>{sessions.length} sessions</strong>
                </div>
                {sessions.length > 0 && (
                  <div className={styles.storedSessions}>
                    {sessions.map((session) => {
                      const is_open = open_session_id === session.id

                      return (
                        <div className={styles.storedSession} key={session.id}>
                          <button
                            type="button"
                            className={
                              is_open
                                ? styles.storedSessionButtonOpen
                                : styles.storedSessionButton
                            }
                            onClick={() => void toggle_stored_session(session.id)}
                          >
                            <span>
                              {format_local_date_display(session.scheduled_date_local, 'TBC')} ·{' '}
                              {session.name_snapshot} · {session.status.toUpperCase()}
                            </span>
                            <strong>{is_open ? 'Hide' : 'View session'}</strong>
                          </button>

                          {is_open && (
                            <div className={styles.storedSessionDetail}>
                              {session_detail_loading ? (
                                <div className={styles.sessionDetailLoading}>
                                  Loading prescription…
                                </div>
                              ) : !session_detail ? (
                                <div className={styles.sessionDetailLoading}>
                                  Session prescription was not found.
                                </div>
                              ) : (
                                <>
                                  {session_detail.session.notes && (
                                    <p className={styles.sessionNotes}>
                                      {session_detail.session.notes}
                                    </p>
                                  )}

                                  {session_detail.session.status === 'planned' && (
                                    <div className={styles.scheduleActions}>
                                      <label>
                                        <span>MOVE SESSION</span>
                                        <input
                                          type="date"
                                          value={
                                            move_date_by_session[session_detail.session.id] ??
                                            session_detail.session.scheduled_date_local ??
                                            ''
                                          }
                                          onChange={(event) =>
                                            setMoveDateBySession((current) => ({
                                              ...current,
                                              [session_detail.session.id]:
                                                event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        disabled={session_action_id === session_detail.session.id}
                                        onClick={() => void move_session(session_detail.session)}
                                      >
                                        MOVE DATE
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.skipButton}
                                        disabled={session_action_id === session_detail.session.id}
                                        onClick={() =>
                                          void change_skip_state(
                                            session_detail.session,
                                            true,
                                          )
                                        }
                                      >
                                        SKIP SESSION
                                      </button>
                                    </div>
                                  )}

                                  {session_detail.session.status === 'skipped' && (
                                    <button
                                      type="button"
                                      className={styles.restoreSessionButton}
                                      disabled={session_action_id === session_detail.session.id}
                                      onClick={() =>
                                        void change_skip_state(
                                          session_detail.session,
                                          false,
                                        )
                                      }
                                    >
                                      RESTORE TO PLAN
                                    </button>
                                  )}

                                  {(session_detail.session.status === 'planned' ||
                                    session_detail.session.status === 'started') && (
                                                                      <button
                                                                        type="button"
                                                                        className={styles.startWorkoutButton}
                                                                        disabled={
                                                                          starting_session_id ===
                                                                          session_detail.session.id
                                                                        }
                                                                        onClick={() =>
                                                                          void start_session(
                                                                            session_detail.session.id,
                                                                          )
                                                                        }
                                                                      >
                                                                        {starting_session_id ===
                                                                        session_detail.session.id
                                                                          ? 'Starting workout…'
                                                                          : 'Start workout'}
                                                                      </button>
                                    
                                  )}

                                  <div className={styles.storedExerciseList}>
                                    {session_detail.exercises.map(
                                      ({ exercise, sets }) => (
                                        <article
                                          className={styles.storedExercise}
                                          key={exercise.id}
                                        >
                                          <div className={styles.storedExerciseHeader}>
                                            <div className={styles.exerciseNumber}>
                                              {exercise.rotation_group_key
                                                ? `${exercise.rotation_group_key}${exercise.rotation_position ?? ''}`
                                                : exercise.planned_order}
                                            </div>
                                            <div>
                                              <h4>
                                                {exercise.exercise_name_snapshot}
                                              </h4>
                                              <span>
                                                {sets.length} sets
                                                {exercise.rest_seconds !== null
                                                  ? ` · ${exercise.rest_seconds}s rest`
                                                  : ''}
                                                {exercise.tempo
                                                  ? ` · tempo ${exercise.tempo}`
                                                  : ''}
                                              </span>
                                              {exercise.technique_cue && (
                                                <p>
                                                  {exercise.technique_cue}
                                                </p>
                                              )}
                                            </div>
                                          </div>

                                          <div className={styles.storedSetList}>
                                            <div
                                              className={styles.storedSetLabels}
                                              aria-hidden="true"
                                            >
                                              <span>Set</span>
                                              <span>Reps</span>
                                              <span>Load</span>
                                              <span>Type</span>
                                              <span>Failure</span>
                                            </div>
                                            {sets.map(({ set, components }) => (
                                              <div
                                                className={styles.storedSetRow}
                                                key={set.id}
                                              >
                                                <strong>S{set.set_number}</strong>
                                                <span>
                                                  {rep_target(
                                                    set.target_rep_min,
                                                    set.target_rep_max,
                                                  )}
                                                </span>
                                                <span>
                                                  {set.target_load_kg !== null
                                                    ? `${set.target_load_kg} kg`
                                                    : 'load open'}
                                                </span>
                                                <span>
                                                  {set.structure_type.replaceAll(
                                                    '_',
                                                    ' ',
                                                  )}
                                                </span>
                                                <span>
                                                  {set.failure_target === 'none'
                                                    ? 'no failure target'
                                                    : `failure ${set.failure_target}`}
                                                </span>
                                                {components.length > 0 && (
                                                  <small>
                                                    {components
                                                      .map(
                                                        (component) =>
                                                          `${component.sequence}. ${component.component_type.replaceAll('_', ' ')}`,
                                                      )
                                                      .join(' · ')}
                                                  </small>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </article>
                                      ),
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {error && <div className={styles.errorNotice}>{error}</div>}
    </div>
  )
}
