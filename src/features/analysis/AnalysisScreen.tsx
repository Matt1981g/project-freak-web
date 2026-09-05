import { useEffect, useMemo, useState } from 'react'
import type {
  AnalysisDashboard,
  DeloadRecommendation,
  WeeklyTrainingAnalysis,
} from '../../application/analysis/analysisTypes'
import { load_analysis_dashboard } from '../../app/analysisServices'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './AnalysisScreen.module.css'

function format_tonnage(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`
  return `${Math.round(value)} kg`
}

function format_average(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function format_week_label(week: WeeklyTrainingAnalysis): string {
  return `${format_local_date_display(week.week_start_local)} → ${format_local_date_display(week.week_end_local)}`
}

function delta(current: number, previous: number | undefined): string | null {
  if (previous === undefined) return null
  const difference = current - previous
  if (difference === 0) return 'NO CHANGE'
  return `${difference > 0 ? '+' : ''}${difference.toLocaleString('en-GB')}`
}

function deload_label(value: DeloadRecommendation): string {
  switch (value) {
    case 'continue':
      return 'CONTINUE'
    case 'reduce_fatigue':
      return 'REDUCE FATIGUE'
    case 'reduce_volume':
      return 'REDUCE VOLUME'
    case 'deload':
      return 'DELOAD'
    case 'insufficient_evidence':
      return 'MORE EVIDENCE NEEDED'
  }
}

function recovery_label(value: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').toUpperCase()
}

export function AnalysisScreen() {
  const [dashboard, setDashboard] = useState<AnalysisDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void load_analysis_dashboard()
      .then((result) => {
        if (!active) return
        setDashboard(result)
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

  const weeks = dashboard?.weeks ?? []
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
            previous ? Math.round(previous.comparable_tonnage_kg) : undefined,
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
          <p className={styles.eyebrow}>PHASE 15.3</p>
          <h1>Analysis</h1>
          <p className={styles.intro}>
            Weekly output, muscle exposure, recovery and performance signals.
            Missing evidence stays missing rather than becoming suspiciously
            confident zeroes.
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

      {current && dashboard && (
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
                <small>{current.rpe.samples} scored exercises</small>
              </article>
              <article>
                <span>AVG PUMP</span>
                <strong>{format_average(current.pump.value)}</strong>
                <small>{current.pump.samples} scored exercises</small>
              </article>
              <article>
                <span>AVG FORM</span>
                <strong>{format_average(current.form.value)}</strong>
                <small>{current.form.samples} scored exercises</small>
              </article>
            </div>
          </section>

          <section className={styles.decisionGrid}>
            <article
              className={
                dashboard.underperformance.status === 'flagged'
                  ? styles.warningPanel
                  : styles.decisionPanel
              }
            >
              <span>UNDERPERFORMANCE</span>
              <strong>{dashboard.underperformance.status.toUpperCase()}</strong>
              <small>
                {dashboard.underperformance.regressed_exercises} regressed exercise
                {dashboard.underperformance.regressed_exercises === 1 ? '' : 's'} ·{' '}
                {dashboard.underperformance.performance_affected_recoveries} recovery
                issue{dashboard.underperformance.performance_affected_recoveries === 1 ? '' : 's'}
              </small>
            </article>

            <article
              className={
                dashboard.deload.recommendation === 'deload'
                  ? styles.warningPanel
                  : styles.decisionPanel
              }
            >
              <span>ADAPTIVE DELOAD</span>
              <strong>{deload_label(dashboard.deload.recommendation)}</strong>
              <small>
                evidence score {dashboard.deload.score} · {dashboard.deload.confidence} confidence
              </small>
            </article>
          </section>

          {(dashboard.underperformance.signals.length > 0 ||
            dashboard.deload.reasons.length > 0) && (
            <section className={styles.evidencePanel}>
              <div className={styles.panelHeading}>
                <div>
                  <span>COACHING SIGNALS</span>
                  <h2>Why the app is saying that</h2>
                </div>
                <small>Signals inform Coach Bridge; they do not rewrite your programme by themselves.</small>
              </div>

              <div className={styles.signalList}>
                {dashboard.underperformance.signals.map((signal, index) => (
                  <article key={`${signal.code}-${signal.exercise_id ?? index}`}>
                    <span>{signal.severity.toUpperCase()}</span>
                    <strong>{signal.label}</strong>
                    <small>{signal.detail}</small>
                  </article>
                ))}
                {dashboard.underperformance.signals.length === 0 && (
                  <article>
                    <span>CLEAR</span>
                    <strong>No underperformance pattern detected</strong>
                    <small>{dashboard.deload.reasons[0]}</small>
                  </article>
                )}
              </div>
            </section>
          )}

          <section className={styles.musclePanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>MUSCLE ANALYSIS</span>
                <h2>Where the work actually went</h2>
              </div>
              <small>
                Direct = primary target. Secondary exposure uses explicit muscle
                mappings where available, then conservative category fallbacks.
              </small>
            </div>

            <div className={styles.mappingCoverage}>
              <span>EXPLICIT {dashboard.mapping_coverage.explicit_exercises}</span>
              <span>FALLBACK {dashboard.mapping_coverage.category_fallback_exercises}</span>
              <span>UNMAPPED {dashboard.mapping_coverage.unmapped_exercises}</span>
            </div>

            <div className={styles.muscleTable}>
              <div className={styles.muscleHeader}>
                <span>MUSCLE</span>
                <span>INTENT</span>
                <span>DIRECT</span>
                <span>SECONDARY</span>
                <span>FREQ</span>
                <span>FAIL</span>
                <span>RPE</span>
                <span>PUMP</span>
                <span>FORM</span>
                <span>RECOVERY</span>
                <span>REGRESS</span>
              </div>

              {dashboard.muscles.map((muscle) => (
                <div className={styles.muscleRow} key={muscle.muscle}>
                  <div>
                    <b>#{muscle.priority}</b>
                    <strong>{muscle.muscle}</strong>
                  </div>
                  <span className={muscle.intent === 'grow' ? styles.intentGrow : styles.intentMaintain}>
                    {muscle.intent.toUpperCase()}
                  </span>
                  <strong>{muscle.direct_sets}</strong>
                  <strong>{muscle.secondary_sets}</strong>
                  <strong>{muscle.frequency}</strong>
                  <strong>{muscle.failure_exposure_sets}</strong>
                  <strong>{format_average(muscle.rpe.value)}</strong>
                  <strong>{format_average(muscle.pump.value)}</strong>
                  <strong>{format_average(muscle.form.value)}</strong>
                  <span>{recovery_label(muscle.recovery_status)}</span>
                  <strong>{muscle.underperformance_exercises || '—'}</strong>
                </div>
              ))}
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
                    <strong>{format_local_date_display(week.week_start_local)}</strong>
                    <span>to {format_local_date_display(week.week_end_local)}</span>
                  </div>
                  <div><span>SESSIONS</span><strong>{week.completed_sessions}</strong></div>
                  <div><span>SETS</span><strong>{week.working_sets}</strong></div>
                  <div><span>TONNAGE</span><strong>{format_tonnage(week.comparable_tonnage_kg)}</strong></div>
                  <div><span>FAIL</span><strong>{week.failure_sets}</strong></div>
                  <div><span>RPE</span><strong>{format_average(week.rpe.value)}</strong></div>
                  <div><span>FORM</span><strong>{format_average(week.form.value)}</strong></div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
