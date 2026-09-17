import { useCallback, useEffect, useRef, useState } from 'react'
import {
  load_active_exercise_options,
  load_active_plan_programmes,
  load_programme_blocks,
  load_programme_sessions,
  load_programmed_session_detail,
} from '../../app/projectFreakServices'
import {
  AUTO_SYNC_COMPLETE_EVENT,
  AUTO_SYNC_REQUEST_EVENT,
  type AutoSyncRequestDetail,
} from '../../application/sync/autoSyncEvents'
import {
  inspect_plan_health,
  type PlanHealthInspection,
} from '../../application/programme/planHealth'
import styles from './PlanHealthGuard.module.css'

const RECHECK_REASONS = new Set([
  'programme_imported',
  'programme_changed',
  'setting_changed',
  'workout_completed',
  'workout_discarded',
])

export function PlanHealthGuard() {
  const [inspection, setInspection] = useState<PlanHealthInspection | null>(null)
  const [checking, setChecking] = useState(false)
  const [runtime_error, setRuntimeError] = useState<string | null>(null)
  const timer_ref = useRef<number | null>(null)

  const run_check = useCallback(async () => {
    setChecking(true)
    setRuntimeError(null)

    try {
      const result = await inspect_plan_health({
        list_blocks: load_programme_blocks,
        list_sessions: load_programme_sessions,
        list_active_plan: load_active_plan_programmes,
        get_session_detail: load_programmed_session_detail,
        list_active_exercises: load_active_exercise_options,
      })
      setInspection(result)
    } catch (cause) {
      setRuntimeError(
        cause instanceof Error
          ? cause.message
          : 'Plan Health could not inspect the programme data.',
      )
    } finally {
      setChecking(false)
    }
  }, [])

  const schedule_check = useCallback(() => {
    if (timer_ref.current !== null) window.clearTimeout(timer_ref.current)
    timer_ref.current = window.setTimeout(() => {
      timer_ref.current = null
      void run_check()
    }, 120)
  }, [run_check])

  useEffect(() => {
    void run_check()

    function on_sync_request(event: Event) {
      const detail = (event as CustomEvent<AutoSyncRequestDetail>).detail
      if (detail?.reason && RECHECK_REASONS.has(detail.reason)) schedule_check()
    }

    function on_sync_complete() {
      schedule_check()
    }

    function on_visibility_change() {
      if (document.visibilityState === 'visible') schedule_check()
    }

    window.addEventListener(AUTO_SYNC_REQUEST_EVENT, on_sync_request)
    window.addEventListener(AUTO_SYNC_COMPLETE_EVENT, on_sync_complete)
    document.addEventListener('visibilitychange', on_visibility_change)

    return () => {
      if (timer_ref.current !== null) window.clearTimeout(timer_ref.current)
      window.removeEventListener(AUTO_SYNC_REQUEST_EVENT, on_sync_request)
      window.removeEventListener(AUTO_SYNC_COMPLETE_EVENT, on_sync_complete)
      document.removeEventListener('visibilitychange', on_visibility_change)
    }
  }, [run_check, schedule_check])

  if (runtime_error) {
    return (
      <aside className={`${styles.guard} ${styles.runtimeError}`} aria-live="polite">
        <div className={styles.header}>
          <div>
            <strong>PLAN HEALTH FAILED</strong>
            <span>Diagnostic check could not run.</span>
          </div>
          <button
            type="button"
            className={styles.recheck}
            disabled={checking}
            onClick={() => void run_check()}
          >
            {checking ? 'CHECKING…' : 'RECHECK'}
          </button>
        </div>
        <div className={styles.runtimeMessage}>{runtime_error}</div>
      </aside>
    )
  }

  if (!inspection) {
    return (
      <aside className={`${styles.guard} ${styles.checking}`} aria-live="polite">
        PLAN HEALTH · CHECKING…
      </aside>
    )
  }

  const { report } = inspection

  if (report.status === 'ok') {
    return (
      <aside className={`${styles.guard} ${styles.ok}`} aria-live="polite">
        PLAN OK ✓ · {report.visible_sessions} SESSION
        {report.visible_sessions === 1 ? '' : 'S'} · {report.checked_exercises} EXERCISES
      </aside>
    )
  }

  const title = report.status === 'failed' ? 'PLAN HEALTH FAILED' : 'PLAN WARNING'
  const container_class =
    report.status === 'failed' ? styles.failed : styles.warning

  return (
    <aside className={`${styles.guard} ${container_class}`} aria-live="polite">
      <div className={styles.header}>
        <div>
          <strong>{title}</strong>
          <span>
            {report.candidate_sessions} actionable · {report.visible_sessions} visible ·{' '}
            {report.checked_exercises} exercises checked
          </span>
        </div>
        <button
          type="button"
          className={styles.recheck}
          disabled={checking}
          onClick={() => void run_check()}
        >
          {checking ? 'CHECKING…' : 'RECHECK'}
        </button>
      </div>

      {report.issues.length > 0 && (
        <details className={styles.issues} open={report.status === 'failed'}>
          <summary>
            {report.issues.length} ISSUE{report.issues.length === 1 ? '' : 'S'}
          </summary>
          <div className={styles.issueList}>
            {report.issues.map((entry, index) => (
              <div
                key={`${entry.code}-${entry.programmed_session_id ?? 'plan'}-${index}`}
                className={
                  entry.severity === 'error'
                    ? styles.issueError
                    : styles.issueWarning
                }
              >
                <strong>{entry.code.replaceAll('_', ' ')}</strong>
                <span>{entry.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </aside>
  )
}
