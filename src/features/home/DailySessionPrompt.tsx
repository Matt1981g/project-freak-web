import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  load_today_programmed_sessions,
  start_programmed_session_workout,
  type TodayProgrammedSession,
} from '../../app/projectFreakServices'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './DailySessionPrompt.module.css'

export function DailySessionPrompt() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sessions, setSessions] = useState<TodayProgrammedSession[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (location.pathname.startsWith('/workout/')) return

    let active = true
    void load_today_programmed_sessions()
      .then((result) => {
        if (active) setSessions(result)
      })
      .catch((cause) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to check today’s programmed session.',
        )
      })

    return () => {
      active = false
    }
  }, [])

  if (
    dismissed ||
    sessions.length === 0 ||
    location.pathname.startsWith('/workout/')
  ) {
    return null
  }

  const session = sessions[0]
  const programmed = session.programmed_session

  async function start() {
    if (startingId) return
    setStartingId(programmed.id)
    setError(null)

    try {
      const result = await start_programmed_session_workout(programmed.id)
      setDismissed(true)
      navigate(`/workout/${result.session_id}`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to start today’s session.',
      )
    } finally {
      setStartingId(null)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.prompt}
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-session-title"
      >
        <span className={styles.kicker}>TODAY’S PROGRAMMED SESSION</span>
        <h2 id="today-session-title">{programmed.name_snapshot}</h2>
        <p>
          {format_local_date_display(programmed.scheduled_date_local)}
          {sessions.length > 1
            ? ` · ${sessions.length} sessions programmed today`
            : ''}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.start}
            disabled={Boolean(startingId)}
            onClick={() => void start()}
          >
            {startingId
              ? 'OPENING…'
              : session.resume
                ? 'RESUME SESSION'
                : 'START SESSION'}
          </button>
          <button
            type="button"
            className={styles.later}
            disabled={Boolean(startingId)}
            onClick={() => setDismissed(true)}
          >
            NOT NOW
          </button>
        </div>
      </section>
    </div>
  )
}
