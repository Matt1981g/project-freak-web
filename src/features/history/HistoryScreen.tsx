import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  discard_live_workout,
  load_coach_exclusions,
  load_history_entries,
  set_coach_session_excluded,
} from '../../app/projectFreakServices'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './HistoryScreen.module.css'

type HistoryEntry = Awaited<ReturnType<typeof load_history_entries>>[number]

function format_duration(seconds: number | null): string {
  if (seconds === null) return '—'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function format_volume(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })
}

function session_source(entry: HistoryEntry): string {
  if (entry.session.source_kind === 'historical_import') return 'HISTORICAL'
  if (entry.session.programmed_session_id) return 'PROGRAMMED'
  return 'MANUAL'
}

export function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coachExcludedIds, setCoachExcludedIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [coachSavingId, setCoachSavingId] = useState<string | null>(null)
  const [discardingId, setDiscardingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void Promise.all([load_history_entries(), load_coach_exclusions()])
      .then(([result, exclusions]) => {
        if (cancelled) return
        setEntries(result)
        setCoachExcludedIds(new Set(exclusions.session_ids))
        setError(null)
      })
      .catch((cause) => {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load workout history.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>HISTORY</p>
          <h1>Workout History</h1>
          <p className={styles.intro}>
            Every actual training session, newest first. Historical imports and
            new PROJECT FREAK sessions live together without rewriting either.
          </p>
        </div>
        <div className={styles.countCard}>
          <strong>{loading ? '…' : entries.length}</strong>
          <span>sessions</span>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Loading workout history…</div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>No workout sessions recorded yet.</div>
      ) : (
        <section className={styles.list}>
          {entries.map((entry) => {
            const coach_excluded = coachExcludedIds.has(entry.session.id)

            return (
            <article
              className={
                coach_excluded ? styles.cardCoachExcluded : styles.card
              }
              key={entry.session.id}
            >
              <div className={styles.cardHeader}>
                <div>
                  <span>{session_source(entry)}</span>
                  <h2>{entry.session.session_name}</h2>
                  <small>{format_local_date_display(entry.session.session_date_local)}</small>
                </div>
                <div className={styles.statusGroup}>
                  {coach_excluded && (
                    <span className={styles.statusCoachExcluded}>
                      COACH EXCLUDED
                    </span>
                  )}
                  <span
                    className={
                      entry.session.status === 'completed'
                        ? styles.statusComplete
                        : entry.session.status === 'in_progress'
                          ? styles.statusActive
                          : styles.statusAbandoned
                    }
                  >
                    {entry.session.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </div>

              <div className={styles.metrics}>
                <div>
                  <span>VOLUME</span>
                  <strong>
                    {format_volume(entry.summary.total_volume_kg)} kg
                  </strong>
                </div>
                <div>
                  <span>SETS</span>
                  <strong>{entry.summary.completed_sets}</strong>
                </div>
                <div>
                  <span>EXERCISES</span>
                  <strong>{entry.summary.exercise_count}</strong>
                </div>
                <div>
                  <span>DURATION</span>
                  <strong>
                    {format_duration(entry.summary.duration_seconds)}
                  </strong>
                </div>
              </div>

              <div className={styles.cardActions}>
                <Link
                  className={styles.openButton}
                  to={`/workout/${entry.session.id}`}
                >
                  {entry.session.status === 'completed'
                    ? 'VIEW WORKOUT'
                    : 'RESUME WORKOUT'}
                </Link>

                {entry.session.status === 'in_progress' &&
                  entry.session.source_kind !== 'historical_import' && (
                    <button
                      type="button"
                      className={styles.discardButton}
                      disabled={discardingId === entry.session.id}
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Discard "${entry.session.session_name}"?\n\nThis will remove the in-progress workout, its sets, advanced-set components, ratings and readiness data from PROJECT FREAK and sync that deletion to your other devices.\n\nCompleted workout history is protected and cannot be discarded here.`,
                        )
                        if (!confirmed) return

                        setDiscardingId(entry.session.id)
                        setError(null)

                        void discard_live_workout(entry.session.id)
                          .then((discarded) => {
                            if (!discarded) {
                              throw new Error(
                                'Workout was already discarded or could not be found.',
                              )
                            }
                            setEntries((current) =>
                              current.filter(
                                (candidate) =>
                                  candidate.session.id !== entry.session.id,
                              ),
                            )
                          })
                          .catch((cause) => {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Unable to discard workout.',
                            )
                          })
                          .finally(() => setDiscardingId(null))
                      }}
                    >
                      {discardingId === entry.session.id
                        ? 'DISCARDING…'
                        : 'DISCARD WORKOUT'}
                    </button>
                  )}

                {entry.session.status === 'completed' &&
                  entry.session.source_kind !== 'historical_import' && (
                    <button
                      type="button"
                      className={
                        coach_excluded
                          ? styles.coachIncludeButton
                          : styles.coachExcludeButton
                      }
                      disabled={coachSavingId === entry.session.id}
                      onClick={() => {
                        const next_excluded = !coach_excluded
                        setCoachSavingId(entry.session.id)
                        setError(null)

                        void set_coach_session_excluded(
                          entry.session.id,
                          next_excluded,
                        )
                          .then((state) => {
                            setCoachExcludedIds(new Set(state.session_ids))
                          })
                          .catch((cause) => {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : 'Unable to update Coach inclusion.',
                            )
                          })
                          .finally(() => setCoachSavingId(null))
                      }}
                    >
                      {coachSavingId === entry.session.id
                        ? 'SAVING…'
                        : coach_excluded
                          ? 'INCLUDE IN COACH'
                          : 'EXCLUDE FROM COACH'}
                    </button>
                  )}
              </div>
            </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
