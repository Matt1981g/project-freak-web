import { useCallback, useEffect, useMemo, useState } from 'react'
import { build_last_7_days_coach_export } from '../../app/projectFreakServices'
import type { TrainingExport } from '../../application/coach/trainingExport'
import styles from './CoachScreen.module.css'

function export_filename(payload: TrainingExport): string {
  return `PROJECT_FREAK_Coach_Bridge_${payload.scope.from_date}_to_${payload.scope.to_date}.json`
}

function count_sets(payload: TrainingExport): number {
  return payload.sessions.reduce(
    (session_total, session) =>
      session_total +
      session.exercises.reduce(
        (exercise_total, exercise) => exercise_total + exercise.sets.length,
        0,
      ),
    0,
  )
}

export function CoachScreen() {
  const [payload, setPayload] = useState<TrainingExport | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    setError(null)

    try {
      setPayload(await build_last_7_days_coach_export())
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to build the Coach Bridge export.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void generate()
  }, [generate])

  const json = useMemo(
    () => (payload ? JSON.stringify(payload, null, 2) : ''),
    [payload],
  )

  async function copy_json() {
    if (!json) return

    try {
      await navigator.clipboard.writeText(json)
      setStatus('JSON copied to clipboard.')
      setError(null)
    } catch {
      setError('Clipboard copy failed. Use Download JSON instead.')
    }
  }

  function download_json() {
    if (!payload || !json) return

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = export_filename(payload)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setStatus('Coach Bridge JSON downloaded.')
    setError(null)
  }

  if (loading && !payload) {
    return <div className={styles.state}>Building Coach Bridge export…</div>
  }

  if (error && !payload) {
    return (
      <div className={styles.state}>
        <strong>{error}</strong>
        <button type="button" onClick={() => void generate()}>
          TRY AGAIN
        </button>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>COACH BRIDGE</p>
          <h1>Weekly coaching export</h1>
          <p>
            Actual training, programmed targets, readiness, exercise scores,
            priorities and valid exercise IDs in one local JSON package.
          </p>
        </div>
        <span>PHASE 11</span>
      </section>

      {payload && (
        <>
          <section className={styles.summary}>
            <div>
              <span>WINDOW</span>
              <strong>
                {payload.scope.from_date} → {payload.scope.to_date}
              </strong>
            </div>
            <div>
              <span>SESSIONS</span>
              <strong>{payload.sessions.length}</strong>
            </div>
            <div>
              <span>SETS</span>
              <strong>{count_sets(payload)}</strong>
            </div>
            <div>
              <span>ACTIVE EXERCISES</span>
              <strong>{payload.coach_context.exercise_catalogue.length}</strong>
            </div>
          </section>

          <section className={styles.context}>
            <div>
              <span>COACH CONTEXT</span>
              <h2>Prescription-ready data</h2>
            </div>
            <p>
              Training priorities are included in rank order. Historical aliases
              are mapped to canonical definitions, while original session labels
              remain untouched.
            </p>
            <ol>
              {payload.coach_context.training_priorities.current.map(
                (priority, index) => (
                  <li key={priority}>
                    <span>{index + 1}</span>
                    <strong>{priority}</strong>
                  </li>
                ),
              )}
            </ol>
          </section>

          <section className={styles.actions}>
            <button type="button" onClick={() => void copy_json()}>
              COPY JSON
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={download_json}
            >
              DOWNLOAD JSON
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
            >
              {loading ? 'REFRESHING…' : 'REFRESH EXPORT'}
            </button>
          </section>

          <section className={styles.instructions}>
            <span>WORKFLOW</span>
            <strong>
              Finish the training week → export → give JSON to ChatGPT → import
              the returned programme JSON.
            </strong>
            <p>
              The exported file is evidence. The programme JSON returned after
              coaching review is the next prescription.
            </p>
          </section>

          {status && <div className={styles.status}>{status}</div>}
          {error && <div className={styles.error}>{error}</div>}
        </>
      )}
    </div>
  )
}
