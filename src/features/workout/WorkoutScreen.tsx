import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { ExerciseMetrics, TrainingSet } from '../../domain/models'
import {
  complete_live_session_exercise,
  load_live_workout,
  save_live_exercise_scores,
  save_live_training_set,
} from '../../app/projectFreakServices'
import styles from './WorkoutScreen.module.css'

type LiveWorkout = NonNullable<
  Awaited<ReturnType<typeof load_live_workout>>
>
type LiveExercise = LiveWorkout['exercises'][number]
type PlannedSet = LiveExercise['planned_sets'][number]
type ScoreKey = 'rpe' | 'pump' | 'form'

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

function exercise_label(exercise: LiveExercise['exercise']): string {
  if (exercise.rotation_group_key) {
    return `${exercise.rotation_group_key}${exercise.rotation_position ?? ''}`
  }
  return String(exercise.actual_order)
}

function numeric_value(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function SetLoggerRow(props: {
  exercise: LiveExercise['exercise']
  set_number: number
  planned_set: PlannedSet | null
  actual_set: TrainingSet | null
  on_complete: () => Promise<void>
}) {
  const { exercise, set_number, planned_set, actual_set, on_complete } = props
  const [saved_set, setSavedSet] = useState<TrainingSet | null>(actual_set)
  const [load, setLoad] = useState<number | null>(
    actual_set?.load_kg ?? planned_set?.set.target_load_kg ?? null,
  )
  const [reps, setReps] = useState<number | null>(
    actual_set?.completed_reps ?? null,
  )
  const [failed, setFailed] = useState(
    actual_set?.failure_status === 'attempted_next_rep_failed',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completed =
    saved_set?.completed_at !== null && saved_set?.completed_at !== undefined
  const target = planned_set?.set

  async function save(complete: boolean, failed_override = failed) {
    if (saving || completed) return

    setSaving(true)
    setError(null)

    try {
      const updated = await save_live_training_set({
        session_exercise: exercise,
        programmed_set: target ?? null,
        existing_set: saved_set,
        set_number,
        load_kg: load,
        completed_reps: reps,
        failed_next_rep: failed_override,
        complete,
      })
      setSavedSet(updated)

      if (complete) {
        await on_complete()
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save set.',
      )
    } finally {
      setSaving(false)
    }
  }

  function adjust_load(delta: number) {
    setLoad((current) => Math.max(0, (current ?? 0) + delta))
  }

  function adjust_reps(delta: number) {
    setReps((current) => Math.max(0, (current ?? 0) + delta))
  }

  return (
    <div className={completed ? styles.setRowComplete : styles.setRow}>
      <div className={styles.setHeading}>
        <div>
          <strong>SET {set_number}</strong>
          <span>
            {target
              ? `${rep_target(target.target_rep_min, target.target_rep_max)} · ${target.structure_type.replaceAll('_', ' ')}`
              : rep_target(exercise.target_rep_min, exercise.target_rep_max)}
          </span>
        </div>
        {completed && <span className={styles.doneBadge}>DONE</span>}
      </div>

      <div className={styles.loggerGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor={`load-${exercise.id}-${set_number}`}>LOAD KG</label>
          <div className={styles.stepper}>
            <button
              type="button"
              data-set-action="true"
              disabled={completed || saving}
              onClick={() => adjust_load(-2.5)}
            >
              −
            </button>
            <input
              id={`load-${exercise.id}-${set_number}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={load ?? ''}
              disabled={completed}
              onChange={(event) => setLoad(numeric_value(event.target.value))}
              onBlur={(event) => {
                if (
                  event.relatedTarget instanceof HTMLElement &&
                  event.relatedTarget.dataset.setAction === 'true'
                ) {
                  return
                }
                void save(false)
              }}
            />
            <button
              type="button"
              data-set-action="true"
              disabled={completed || saving}
              onClick={() => adjust_load(2.5)}
            >
              +
            </button>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor={`reps-${exercise.id}-${set_number}`}>REPS</label>
          <div className={styles.stepper}>
            <button
              type="button"
              data-set-action="true"
              disabled={completed || saving}
              onClick={() => adjust_reps(-1)}
            >
              −
            </button>
            <input
              id={`reps-${exercise.id}-${set_number}`}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={reps ?? ''}
              disabled={completed}
              onChange={(event) => setReps(numeric_value(event.target.value))}
              onBlur={(event) => {
                if (
                  event.relatedTarget instanceof HTMLElement &&
                  event.relatedTarget.dataset.setAction === 'true'
                ) {
                  return
                }
                void save(false)
              }}
            />
            <button
              type="button"
              data-set-action="true"
              disabled={completed || saving}
              onClick={() => adjust_reps(1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className={styles.setActions}>
        <button
          type="button"
          data-set-action="true"
          className={failed ? styles.failureOn : styles.failureOff}
          disabled={completed || saving || reps === null}
          onClick={() => {
            const next_failed = !failed
            setFailed(next_failed)
            void save(false, next_failed)
          }}
        >
          {failed ? 'FAIL ✓' : 'FAIL'}
        </button>
        <button
          type="button"
          data-set-action="true"
          className={styles.completeSetButton}
          disabled={completed || saving || reps === null}
          onClick={() => void save(true)}
        >
          {completed ? 'SET COMPLETE' : saving ? 'SAVING…' : 'COMPLETE SET'}
        </button>
      </div>

      {error && <div className={styles.setError}>{error}</div>}
    </div>
  )
}

function ExerciseScoringPanel(props: {
  exercise: LiveExercise['exercise']
  metrics: ExerciseMetrics | undefined
  on_complete: () => Promise<void>
}) {
  const { exercise, metrics, on_complete } = props
  const [rpe, setRpe] = useState(metrics?.rpe ?? 5)
  const [pump, setPump] = useState(metrics?.pump ?? 5)
  const [form, setForm] = useState(metrics?.form ?? 5)
  const [rpe_touched, setRpeTouched] = useState(metrics?.rpe != null)
  const [pump_touched, setPumpTouched] = useState(metrics?.pump != null)
  const [form_touched, setFormTouched] = useState(metrics?.form != null)
  const [saved_metrics, setSavedMetrics] = useState<ExerciseMetrics | null>(
    metrics ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function score_payload(
    override_key?: ScoreKey,
    override_value?: number,
  ) {
    return {
      rpe:
        override_key === 'rpe'
          ? (override_value ?? rpe)
          : rpe_touched
            ? rpe
            : null,
      pump:
        override_key === 'pump'
          ? (override_value ?? pump)
          : pump_touched
            ? pump
            : null,
      form:
        override_key === 'form'
          ? (override_value ?? form)
          : form_touched
            ? form
            : null,
    }
  }

  async function persist_score(key?: ScoreKey, value?: number) {
    const scores = score_payload(key, value)

    if (
      saved_metrics?.rpe === scores.rpe &&
      saved_metrics?.pump === scores.pump &&
      saved_metrics?.form === scores.form
    ) {
      return saved_metrics
    }

    setSaving(true)
    setError(null)

    try {
      const saved = await save_live_exercise_scores(exercise.id, scores)
      setSavedMetrics(saved)
      return saved
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save exercise rating.',
      )
      return null
    } finally {
      setSaving(false)
    }
  }

  async function complete_exercise() {
    if (saving || completing) return

    setCompleting(true)
    setError(null)

    try {
      await persist_score()
      await complete_live_session_exercise(exercise)
      await on_complete()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to complete exercise.',
      )
    } finally {
      setCompleting(false)
    }
  }

  function slider(
    key: ScoreKey,
    label: string,
    value: number,
    touched: boolean,
    set_value: (value: number) => void,
    set_touched: (value: boolean) => void,
  ) {
    return (
      <div className={styles.scoreRow}>
        <div className={styles.scoreHeading}>
          <strong>{label}</strong>
          <div>
            {!touched && <span>UNRATED</span>}
            <b>{value}</b>
          </div>
        </div>
        <input
          className={styles.scoreSlider}
          type="range"
          min="1"
          max="10"
          step="1"
          value={value}
          aria-label={label}
          disabled={saving || completing}
          onPointerDown={() => set_touched(true)}
          onChange={(event) => {
            set_touched(true)
            set_value(Number(event.target.value))
          }}
          onPointerUp={() => void persist_score(key, value)}
          onKeyUp={() => void persist_score(key, value)}
          onBlur={() => {
            if (touched) void persist_score()
          }}
        />
        <div className={styles.scoreScale}>
          <span>1</span>
          <span>10</span>
        </div>
      </div>
    )
  }

  return (
    <section className={styles.scoringPanel}>
      <div className={styles.scoringHeader}>
        <div>
          <span>EXERCISE COMPLETE</span>
          <h4>Rate the stimulus</h4>
        </div>
        <small>Untouched sliders are not recorded.</small>
      </div>

      {slider('rpe', 'RPE', rpe, rpe_touched, setRpe, setRpeTouched)}
      {slider('pump', 'PUMP', pump, pump_touched, setPump, setPumpTouched)}
      {slider('form', 'FORM', form, form_touched, setForm, setFormTouched)}

      <button
        type="button"
        className={styles.completeExerciseButton}
        disabled={saving || completing}
        onClick={() => void complete_exercise()}
      >
        {completing
          ? 'COMPLETING…'
          : saving
            ? 'SAVING RATINGS…'
            : 'COMPLETE EXERCISE'}
      </button>

      {error && <div className={styles.setError}>{error}</div>}
    </section>
  )
}

function CompletedExerciseSummary(props: {
  metrics: ExerciseMetrics | undefined
}) {
  const { metrics } = props

  return (
    <div className={styles.completedExerciseSummary}>
      <strong>EXERCISE COMPLETE ✓</strong>
      <div>
        <span>RPE {metrics?.rpe ?? '—'}</span>
        <span>PUMP {metrics?.pump ?? '—'}</span>
        <span>FORM {metrics?.form ?? '—'}</span>
      </div>
    </div>
  )
}

export function WorkoutScreen() {
  const { completed_session_id } = useParams()
  const [workout, setWorkout] = useState<LiveWorkout | undefined>()
  const [open_exercise_id, setOpenExerciseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh_workout = useCallback(async () => {
    if (!completed_session_id) {
      setError('Workout session ID is missing.')
      setLoading(false)
      return
    }

    try {
      const result = await load_live_workout(completed_session_id)
      if (!result) {
        setError('Workout session was not found.')
        setWorkout(undefined)
      } else {
        setWorkout(result)
        setError(null)
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load workout.',
      )
    } finally {
      setLoading(false)
    }
  }, [completed_session_id])

  useEffect(() => {
    void refresh_workout()
  }, [refresh_workout])

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
            Log the completed reps. FAIL means the next attempted rep did not complete.
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
          {workout.exercises.map((entry) => {
            const { exercise, sets, metrics, planned_sets } = entry
            const is_open = open_exercise_id === exercise.id
            const completed_sets = sets.filter(
              (set) => set.completed_at !== null,
            ).length
            const planned_count =
              planned_sets.length ||
              exercise.target_sets ||
              Math.max(sets.length, 1)
            const all_sets_complete =
              planned_count > 0 && completed_sets >= planned_count
            const set_numbers = Array.from(
              { length: planned_count },
              (_, index) => index + 1,
            )

            return (
              <article
                className={
                  is_open ? styles.exerciseCardOpen : styles.exerciseCard
                }
                key={exercise.id}
              >
                <button
                  type="button"
                  className={styles.exerciseToggle}
                  onClick={() =>
                    setOpenExerciseId(is_open ? null : exercise.id)
                  }
                >
                  <div className={styles.exerciseNumber}>
                    {exercise_label(exercise)}
                  </div>
                  <div className={styles.exerciseBody}>
                    <h3>{exercise.exercise_name_snapshot}</h3>
                    <div className={styles.exerciseMeta}>
                      <span>{planned_count} sets</span>
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
                    {exercise.technique_cue && <p>{exercise.technique_cue}</p>}
                  </div>
                  <span className={styles.exerciseStatus}>
                    {exercise.completed_at !== null
                      ? 'COMPLETE ✓'
                      : all_sets_complete
                        ? 'RATE EXERCISE'
                        : completed_sets > 0
                          ? `${completed_sets}/${planned_count} DONE`
                          : 'LOG SETS'}
                  </span>
                </button>

                {is_open && (
                  <div className={styles.loggerPanel}>
                    {set_numbers.map((set_number) => {
                      const planned_set =
                        planned_sets.find(
                          (detail) => detail.set.set_number === set_number,
                        ) ?? null
                      const actual_set =
                        sets.find((set) => set.set_number === set_number) ?? null

                      return (
                        <SetLoggerRow
                          key={set_number}
                          exercise={exercise}
                          set_number={set_number}
                          planned_set={planned_set}
                          actual_set={actual_set}
                          on_complete={refresh_workout}
                        />
                      )
                    })}

                    {exercise.completed_at !== null ? (
                      <CompletedExerciseSummary metrics={metrics} />
                    ) : all_sets_complete ? (
                      <ExerciseScoringPanel
                        exercise={exercise}
                        metrics={metrics}
                        on_complete={refresh_workout}
                      />
                    ) : null}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
