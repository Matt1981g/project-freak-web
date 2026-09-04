import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { load_history_entries } from '../../app/projectFreakServices'
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

  useEffect(() => {
    let cancelled = false

    void load_history_entries()
      .then((result) => {
        if (cancelled) return
        setEntries(result)
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
          {entries.map((entry) => (
            <article className={styles.card} key={entry.session.id}>
              <div className={styles.cardHeader}>
                <div>
                  <span>{session_source(entry)}</span>
                  <h2>{entry.session.session_name}</h2>
                  <small>{entry.session.session_date_local}</small>
                </div>
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

              <Link
                className={styles.openButton}
                to={`/workout/${entry.session.id}`}
              >
                {entry.session.status === 'completed'
                  ? 'VIEW WORKOUT'
                  : 'RESUME WORKOUT'}
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
