import { useEffect, useMemo, useState } from 'react'
import type { WeeklyTrainingAnalysis } from '../../application/analysis/analysisTypes'
import { load_analysis_dashboard } from '../../app/analysisServices'
import styles from './AnalysisScreen.module.css'

function format_tonnage(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`
  return `${Math.round(value)} kg`
}

function format_average(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function format_week_label(week: WeeklyTrainingAnalysis): string {
  return `${week.week_start_local} → ${week.week_end_local}`
}

function delta(current: number, previous: number | undefined): string | null {
  if (previous === undefined) return null
  const difference = current - previous
  if (difference === 0) return 'NO CHANGE'
  return `${difference > 0 ? '+' : ''}${difference.toLocaleString('en-GB')}`
}

export function AnalysisScreen() {
  const [weeks, setWeeks] = useState<WeeklyTrainingAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void load_analysis_dashboard()
      .then((result) => {
        if (!active) return
        setWeeks(result)
      })
      .catch((cause) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to build training analysis.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const current = weeks[0]
  const previous = weeks[1]

  const current_deltas = useMemo(
    () => ({
      sessions: current
        ? delta(current.completed_sessions, previous?.completed_sessions)
        : null,
      sets: current ? delta(current.working_sets, previous?.working_sets) : null,
      tonnage: current
        ? delta(
            Math.round(current.comparable_tonnage_kg),
            previous
              ? Math.round(previous.comparable_tonnage_kg)
              : undefined,
          )
        : null,
      failures: current
        ? delta(current.failure_sets, previous?.failure_sets)
        : null,
    }),
    [current, previous],
  )

  if (loading) {
    return <div className={styles.state}>Building analysis…</div>
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PHASE 15</p>
          <h1>Analysis</h1>
          <p className={styles.intro}>
            Weekly training output from completed working sets only. Missing
            evidence stays missing rather than being converted into reassuring
            little zeroes.
          </p>
        </div>
        <div className={styles.status}>
          {weeks.length} WEEK{weeks.length === 1 ? '' : 'S'}
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      {!error && !current && (
        <section className={styles.empty}>
          Complete a training session and it will appear here.
        </section>
      )}

      {current && (
        <>
          <section className={styles.currentPanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>CURRENT TRAINING WEEK</span>
                <h2>{format_week_label(current)}</h2>
              </div>
              <small>
                Compared with {previous ? format_week_label(previous) : 'no prior week'}
              </small>
            </div>

            <div className={styles.primaryGrid}>
              <article>
                <span>SESSIONS</span>
                <strong>{current.completed_sessions}</strong>
                <small>{current_deltas.sessions ?? 'BASELINE'}</small>
              </article>
              <article>
                <span>WORK SETS</span>
                <strong>{current.working_sets}</strong>
                <small>{current_deltas.sets ?? 'BASELINE'}</small>
              </article>
              <article>
                <span>TONNAGE</span>
                <strong>{format_tonnage(current.comparable_tonnage_kg)}</strong>
                <small>{current_deltas.tonnage ?? 'BASELINE'}</small>
              </article>
              <article>
                <span>FAILURE SETS</span>
                <strong>{current.failure_sets}</strong>
                <small>{current_deltas.failures ?? 'BASELINE'}</small>
              </article>
            </div>

            <div className={styles.scoreGrid}>
              <article>
                <span>AVG RPE</span>
                <strong>{format_average(current.rpe.value)}</strong>
                <small>{current.rpe.samples} scored exercise{current.rpe.samples === 1 ? '' : 's'}</small>
              </article>
              <article>
                <span>AVG PUMP</span>
                <strong>{format_average(current.pump.value)}</strong>
                <small>{current.pump.samples} scored exercise{current.pump.samples === 1 ? '' : 's'}</small>
              </article>
              <article>
                <span>AVG FORM</span>
                <strong>{format_average(current.form.value)}</strong>
                <small>{current.form.samples} scored exercise{current.form.samples === 1 ? '' : 's'}</small>
              </article>
            </div>
          </section>

          <section className={styles.historyPanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>WEEKLY HISTORY</span>
                <h2>Training trend</h2>
              </div>
              <small>Newest first</small>
            </div>

            <div className={styles.weekList}>
              {weeks.slice(0, 12).map((week) => (
                <article className={styles.weekRow} key={week.week_start_local}>
                  <div className={styles.weekDate}>
                    <strong>{week.week_start_local}</strong>
                    <span>to {week.week_end_local}</span>
                  </div>
                  <div>
                    <span>SESSIONS</span>
                    <strong>{week.completed_sessions}</strong>
                  </div>
                  <div>
                    <span>SETS</span>
                    <strong>{week.working_sets}</strong>
                  </div>
                  <div>
                    <span>TONNAGE</span>
                    <strong>{format_tonnage(week.comparable_tonnage_kg)}</strong>
                  </div>
                  <div>
                    <span>FAIL</span>
                    <strong>{week.failure_sets}</strong>
                  </div>
                  <div>
                    <span>RPE</span>
                    <strong>{format_average(week.rpe.value)}</strong>
                  </div>
                  <div>
                    <span>FORM</span>
                    <strong>{format_average(week.form.value)}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
