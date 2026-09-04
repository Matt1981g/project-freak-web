import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { load_exercise_history_entries } from '../../app/projectFreakServices'
import { build_exercise_progression } from '../../application/analysis/exerciseProgression'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './ExerciseHistoryScreen.module.css'

type ExerciseHistory = NonNullable<
  Awaited<ReturnType<typeof load_exercise_history_entries>>
>

function format_volume(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })
}

function format_set_reps(reps: number | null, failed: boolean): string {
  if (reps === null) return '—'
  return `${reps}${failed ? 'F' : ''}`
}

function format_score(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function progression_label(verdict: ReturnType<typeof build_exercise_progression>['rows'][number]['verdict']): string {
  if (verdict === 'improved') return 'UP'
  if (verdict === 'held') return 'HOLD'
  if (verdict === 'regressed') return 'DOWN'
  if (verdict === 'baseline') return 'BASELINE'
  return 'NOT COMPARABLE'
}

export function ExerciseHistoryScreen() {
  const { exercise_id } = useParams()
  const [history, setHistory] = useState<ExerciseHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!exercise_id) {
      setError('Exercise ID is missing.')
      setLoading(false)
      return
    }

    setLoading(true)
    void load_exercise_history_entries(exercise_id)
      .then((result) => {
        if (cancelled) return

        if (!result) {
          setHistory(null)
          setError('Exercise history was not found.')
        } else {
          setHistory(result)
          setError(null)
        }
      })
      .catch((cause) => {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load exercise history.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [exercise_id])

  const progression = useMemo(
    () => (history ? build_exercise_progression(history) : null),
    [history],
  )

  if (loading) {
    return <div className={styles.state}>Loading exercise history…</div>
  }

  if (error || !history) {
    return (
      <div className={styles.state}>
        <strong>{error ?? 'Exercise history unavailable.'}</strong>
        <Link to="/exercises">Back to Exercises</Link>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>EXERCISE HISTORY</p>
          <h1>{history.exercise.canonical_name}</h1>
          <p className={styles.intro}>
            Historical aliases are resolved into this canonical exercise without
            rewriting the original workout records.
          </p>
        </div>
        <div className={styles.countCard}>
          <strong>{history.entries.length}</strong>
          <span>sessions</span>
        </div>
      </section>

      <div className={styles.toolbar}>
        <Link to="/exercises">← EXERCISES</Link>
        <span>
          {history.resolved_exercise_ids.length} linked definition
          {history.resolved_exercise_ids.length === 1 ? '' : 's'}
        </span>
      </div>

      {progression && progression.latest && (
        <section className={styles.progressionPanel}>
          <div className={styles.progressionHeader}>
            <div>
              <span>PHASE 15 · EXERCISE PROGRESSION</span>
              <h2>Comparable performance</h2>
              <p>
                Working sets only. Load/reps verdicts require straight, normal-load
                sets and progression-valid Form, so heavier is not automatically better.
              </p>
            </div>
            <strong>{progression.completed_sessions} completed</strong>
          </div>

          <div className={styles.latestGrid}>
            <div>
              <span>LATEST</span>
              <strong>{format_local_date_display(progression.latest.session_date_local)}</strong>
            </div>
            <div>
              <span>BEST LOAD</span>
              <strong>{progression.latest.best_load_kg === null ? '—' : `${progression.latest.best_load_kg} kg`}</strong>
            </div>
            <div>
              <span>REPS @ BEST</span>
              <strong>{progression.latest.best_reps_at_load ?? '—'}</strong>
            </div>
            <div>
              <span>WORK SETS</span>
              <strong>{progression.latest.working_sets}</strong>
            </div>
            <div>
              <span>TONNAGE</span>
              <strong>{format_volume(progression.latest.comparable_tonnage_kg)} kg</strong>
            </div>
            <div>
              <span>FAIL SETS</span>
              <strong>{progression.latest.failure_sets}</strong>
            </div>
            <div>
              <span>RPE</span>
              <strong>{format_score(progression.latest.rpe)}</strong>
            </div>
            <div>
              <span>PUMP</span>
              <strong>{format_score(progression.latest.pump)}</strong>
            </div>
            <div>
              <span>FORM</span>
              <strong>{format_score(progression.latest.form)}</strong>
            </div>
          </div>

          <div className={styles.progressionTableWrap}>
            <div className={styles.progressionTable}>
              <div className={styles.progressionTableHeader}>
                <span>DATE</span>
                <span>BEST</span>
                <span>SETS</span>
                <span>TONNAGE</span>
                <span>RPE</span>
                <span>PUMP</span>
                <span>FORM</span>
                <span>FAIL</span>
                <span>VS PREVIOUS</span>
              </div>
              {progression.rows.slice(0, 16).map((row) => (
                <div className={styles.progressionRow} key={row.session_id} title={row.reason}>
                  <strong>{format_local_date_display(row.session_date_local)}</strong>
                  <span>
                    {row.best_load_kg === null || row.best_reps_at_load === null
                      ? '—'
                      : `${row.best_load_kg} × ${row.best_reps_at_load}`}
                  </span>
                  <span>{row.working_sets}</span>
                  <span>{format_volume(row.comparable_tonnage_kg)} kg</span>
                  <span>{format_score(row.rpe)}</span>
                  <span>{format_score(row.pump)}</span>
                  <span>{format_score(row.form)}</span>
                  <span>{row.failure_sets}</span>
                  <span className={styles[`verdict_${row.verdict}`]}>
                    {progression_label(row.verdict)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <small className={styles.progressionNote}>
            Tap-and-hold or hover a verdict for the comparison reason.
          </small>
        </section>
      )}

      {history.entries.length === 0 ? (
        <section className={styles.empty}>
          No recorded sessions contain this exercise yet.
        </section>
      ) : (
        <section className={styles.historyList}>
          {history.entries.map((entry) => (
            <article className={styles.sessionCard} key={entry.session.id}>
              <div className={styles.sessionHeader}>
                <div>
                  <span>{format_local_date_display(entry.session.session_date_local)}</span>
                  <h2>{entry.session.session_name}</h2>
                </div>
                <Link to={`/workout/${entry.session.id}`}>VIEW SESSION</Link>
              </div>

              <div className={styles.sessionStats}>
                <div>
                  <span>SETS</span>
                  <strong>{entry.completed_sets}</strong>
                </div>
                <div>
                  <span>VOLUME</span>
                  <strong>{format_volume(entry.total_volume_kg)} kg</strong>
                </div>
                <div>
                  <span>STATUS</span>
                  <strong>{entry.session.status.replaceAll('_', ' ')}</strong>
                </div>
              </div>

              <div className={styles.appearanceList}>
                {entry.appearances.map((appearance) => (
                  <section
                    className={styles.appearance}
                    key={appearance.session_exercise.id}
                  >
                    <div className={styles.appearanceHeader}>
                      <div>
                        <span>SOURCE LABEL</span>
                        <strong>
                          {appearance.session_exercise.exercise_name_snapshot}
                        </strong>
                      </div>

                      {appearance.metrics && (
                        <div className={styles.scores}>
                          <span>
                            RPE {appearance.metrics.rpe ?? '—'}
                          </span>
                          <span>
                            Pump {appearance.metrics.pump ?? '—'}
                          </span>
                          <span>
                            Form {appearance.metrics.form ?? '—'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className={styles.setTable}>
                      <div className={styles.setTableHeader}>
                        <span>SET</span>
                        <span>LOAD</span>
                        <span>REPS</span>
                        <span>VOLUME</span>
                      </div>

                      {appearance.sets.map((set) => (
                        <div className={styles.setRow} key={set.id}>
                          <strong>{set.set_number}</strong>
                          <span>
                            {set.load_kg === null ? '—' : `${set.load_kg} kg`}
                          </span>
                          <span>
                            {format_set_reps(
                              set.completed_reps,
                              set.failure_status ===
                                'attempted_next_rep_failed',
                            )}
                          </span>
                          <span>
                            {set.set_load_kg_reps === null
                              ? '—'
                              : `${format_volume(set.set_load_kg_reps)} kg`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
