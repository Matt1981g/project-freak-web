import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { CompletedSession, SessionExercise } from '../../domain/models'
import { load_live_workout } from '../../app/projectFreakServices'
import styles from './WorkoutScreen.module.css'

interface LiveWorkout {
  session: CompletedSession
  exercises: SessionExercise[]
}

function rep_target(
  minimum: number | null,
  maximum: number | null,
): string {
  if (minimum === null) {
    return maximum === null ? 'reps open' : `≤${maximum} reps`
  }
  if (maximum === null) {
    return `≥${minimum} reps`
  }
  if (minimum === maximum) {
    return `${minimum} reps`
  }
  return `${minimum}–${maximum} reps`
}

function exercise_label(exercise: SessionExercise): string {
  if (exercise.rotation_group_key) {
    return `${exercise.rotation_group_key}${exercise.rotation_position ?? ''}`
  }
  return String(exercise.actual_order)
}

export function WorkoutScreen() {
  const { completed_session_id } = useParams()
  const [workout, setWorkout] = useState<LiveWorkout | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      if (!completed_session_id) {
        setError('Workout session ID is missing.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const result = await load_live_workout(completed_session_id)
        if (!active) return

        if (!result) {
          setError('Workout session was not found.')
          setWorkout(undefined)
        } else {
          setWorkout(result)
        }
      } catch (cause) {
        if (!active) return
        setError(
          cause instanceof Error ? cause.message : 'Unable to load workout.',
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [completed_session_id])

  if (loading) {
    return <div className={styles.state}>Loading workout…</div>
  }

  if (error || !workout) {
    return (
      <div className={styles.state}>
        <strong>{error ?? 'Workout unavailable.'}</strong>
        <Link to="/plan">Back to Plan</Link>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>WORKOUT</p>
          <h1>{workout.session.session_name}</h1>
          <p className={styles.intro}>
            Actual session created from the fixed programmed snapshot.
          </p>
        </div>
        <span className={styles.statusBadge}>
          {workout.session.status.replaceAll('_', ' ')}
        </span>
      </section>

      <section className={styles.sessionMeta}>
        <div>
          <span>Training date</span>
          <strong>{workout.session.session_date_local}</strong>
        </div>
        <div>
          <span>Exercises</span>
          <strong>{workout.exercises.length}</strong>
        </div>
        <div>
          <span>Started</span>
          <strong>
            {workout.session.started_at
              ? new Date(workout.session.started_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Not recorded'}
          </strong>
        </div>
      </section>

      <section className={styles.sequence}>
        <div className={styles.sequenceHeader}>
          <div>
            <span>LIVE EXERCISE SEQUENCE</span>
            <h2>Today’s workout</h2>
          </div>
          <Link to="/plan">Back to Plan</Link>
        </div>

        <div className={styles.exerciseList}>
          {workout.exercises.map((exercise) => (
            <article className={styles.exerciseCard} key={exercise.id}>
              <div className={styles.exerciseNumber}>
                {exercise_label(exercise)}
              </div>
              <div className={styles.exerciseBody}>
                <h3>{exercise.exercise_name_snapshot}</h3>
                <div className={styles.exerciseMeta}>
                  <span>
                    {exercise.target_sets ?? 'Open'} sets
                  </span>
                  <span>
                    {rep_target(
                      exercise.target_rep_min,
                      exercise.target_rep_max,
                    )}
                  </span>
                  {exercise.rest_seconds !== null && (
                    <span>{exercise.rest_seconds}s rest</span>
                  )}
                  {exercise.tempo && <span>tempo {exercise.tempo}</span>}
                </div>
                {exercise.technique_cue && (
                  <p>{exercise.technique_cue}</p>
                )}
                {exercise.programme_notes && (
                  <small>{exercise.programme_notes}</small>
                )}
              </div>
              <span className={styles.exerciseStatus}>READY</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
