import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { load_exercise_history_entries } from '../../app/projectFreakServices'
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
                  <span>{entry.session.session_date_local}</span>
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
