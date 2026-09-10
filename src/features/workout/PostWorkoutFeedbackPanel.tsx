import { liveQuery } from 'dexie'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import {
  load_live_workout,
  save_live_recovery,
} from '../../app/projectFreakServices'
import styles from './PostWorkoutFeedbackPanel.module.css'

type FeedbackKey =
  | 'session_quality'
  | 'session_fatigue'
  | 'energy_stability'
  | 'breathlessness'

type FeedbackForm = {
  session_quality: number | null
  session_fatigue: number | null
  energy_stability: number | null
  breathlessness: number | null
  coach_note: string
  post_workout_intake: string
}

const EMPTY_FORM: FeedbackForm = {
  session_quality: null,
  session_fatigue: null,
  energy_stability: null,
  breathlessness: null,
  coach_note: '',
  post_workout_intake: '',
}

function feedback_description(key: FeedbackKey, value: number | null): string {
  if (value === null) return 'Move slider to record'

  if (key === 'session_quality') {
    if (value <= 2) return 'Poor session'
    if (value <= 4) return 'Below par'
    if (value <= 6) return 'Solid / average'
    if (value <= 8) return 'Very good session'
    return 'Exceptional session'
  }

  if (key === 'session_fatigue') {
    if (value <= 2) return 'Very fresh'
    if (value <= 4) return 'Low fatigue'
    if (value <= 6) return 'Moderate fatigue'
    if (value <= 8) return 'High fatigue'
    return 'Extremely fatigued'
  }

  if (key === 'energy_stability') {
    if (value <= 2) return 'Major energy crash'
    if (value <= 4) return 'Energy faded badly'
    if (value <= 6) return 'Some drop-off'
    if (value <= 8) return 'Energy held well'
    return 'Rock-solid energy'
  }

  if (value <= 2) return 'Breathing not limiting'
  if (value <= 4) return 'Minor breathlessness'
  if (value <= 6) return 'Noticeable limitation'
  if (value <= 8) return 'Strong cardio limitation'
  return 'Breathing severely limiting'
}

function FeedbackSlider(props: {
  feedbackKey: FeedbackKey
  label: string
  value: number | null
  lowLabel: string
  highLabel: string
  onChange: (value: number) => void
}) {
  const { feedbackKey, label, value, lowLabel, highLabel, onChange } = props

  return (
    <div className={styles.scoreRow}>
      <div className={styles.scoreHeading}>
        <strong>{label}</strong>
        <div>
          <span>1–10</span>
          <b>{value ?? '—'}</b>
        </div>
      </div>
      <input
        className={styles.slider}
        type="range"
        min="1"
        max="10"
        step="1"
        value={value ?? 5}
        aria-label={`${label} 1 to 10`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className={styles.scale}>
        <span>1 · {lowLabel}</span>
        <span>10 · {highLabel}</span>
      </div>
      <small className={styles.description}>
        {feedback_description(feedbackKey, value)}
      </small>
    </div>
  )
}

export function PostWorkoutFeedbackPanel() {
  const { completed_session_id } = useParams()
  const [status, setStatus] = useState<'in_progress' | 'completed' | 'abandoned' | null>(null)
  const [form, setForm] = useState<FeedbackForm>(EMPTY_FORM)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialised = useRef(false)

  useEffect(() => {
    initialised.current = false
    setForm(EMPTY_FORM)
    setDirty(false)
    setSaved(false)
    setError(null)

    if (!completed_session_id) {
      setStatus(null)
      return
    }

    const subscription = liveQuery(() =>
      load_live_workout(completed_session_id),
    ).subscribe({
      next: (workout) => {
        setStatus(workout?.session.status ?? null)
        if (!workout || initialised.current) return

        const readiness = workout.readiness
        setForm({
          session_quality: readiness?.session_quality ?? null,
          session_fatigue: readiness?.session_fatigue ?? null,
          energy_stability: readiness?.energy_stability ?? null,
          breathlessness: readiness?.breathlessness ?? null,
          coach_note: readiness?.coach_note ?? '',
          post_workout_intake: readiness?.post_workout_intake ?? '',
        })
        setSaved(
          Boolean(
            readiness &&
              (readiness.session_quality != null ||
                readiness.session_fatigue != null ||
                readiness.energy_stability != null ||
                readiness.breathlessness != null ||
                readiness.coach_note),
          ),
        )
        initialised.current = true
      },
      error: (cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load post-workout feedback.',
        )
      },
    })

    return () => subscription.unsubscribe()
  }, [completed_session_id])

  function update<K extends keyof FeedbackForm>(
    key: K,
    value: FeedbackForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  useEffect(() => {
    if (!dirty || !completed_session_id || status !== 'completed') return

    const timer = window.setTimeout(() => {
      setSaving(true)
      setError(null)

      void save_live_recovery({
        completed_session_id,
        session_quality: form.session_quality,
        session_fatigue: form.session_fatigue,
        energy_stability: form.energy_stability,
        breathlessness: form.breathlessness,
        coach_note: form.coach_note || null,
        post_workout_intake: form.post_workout_intake || null,
      })
        .then(() => {
          setDirty(false)
          setSaved(true)
        })
        .catch((cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to save post-workout feedback.',
          )
        })
        .finally(() => setSaving(false))
    }, 400)

    return () => window.clearTimeout(timer)
  }, [completed_session_id, dirty, form, status])

  if (status !== 'completed') return null

  return (
    <section className={styles.panel} data-pf-post-workout-feedback="v1">
      <div className={styles.header}>
        <div>
          <span>POST-WORKOUT · COACH FEEDBACK</span>
          <h2>How did that session go?</h2>
          <p>Four quick sliders plus one coach note. Autosaves to Coach Bridge.</p>
        </div>
        <small>
          {saving
            ? 'AUTOSAVING…'
            : error
              ? 'SAVE ERROR'
              : saved
                ? 'SAVED ✓'
                : 'OPTIONAL'}
        </small>
      </div>

      <div className={styles.sliderGrid}>
        <FeedbackSlider
          feedbackKey="session_quality"
          label="SESSION QUALITY"
          value={form.session_quality}
          lowLabel="poor"
          highLabel="exceptional"
          onChange={(value) => update('session_quality', value)}
        />
        <FeedbackSlider
          feedbackKey="session_fatigue"
          label="SESSION FATIGUE"
          value={form.session_fatigue}
          lowLabel="fresh"
          highLabel="wrecked"
          onChange={(value) => update('session_fatigue', value)}
        />
        <FeedbackSlider
          feedbackKey="energy_stability"
          label="ENERGY STABILITY"
          value={form.energy_stability}
          lowLabel="crashed"
          highLabel="rock solid"
          onChange={(value) => update('energy_stability', value)}
        />
        <FeedbackSlider
          feedbackKey="breathlessness"
          label="BREATHLESSNESS / CARDIO LIMIT"
          value={form.breathlessness}
          lowLabel="none"
          highLabel="severe"
          onChange={(value) => update('breathlessness', value)}
        />
      </div>

      <label className={styles.coachNote}>
        <span>COACH NOTE · QUESTION 5</span>
        <textarea
          rows={3}
          value={form.coach_note}
          onChange={(event) => update('coach_note', event.target.value)}
          placeholder="Anything the coach should know about this session? Stimulus, performance, pain, exercise preference, anything unusual…"
        />
      </label>

      <details className={styles.optionalData}>
        <summary>OPTIONAL FACTUAL DATA</summary>
        <label>
          <span>POST-WORKOUT INTAKE</span>
          <input
            type="text"
            value={form.post_workout_intake}
            onChange={(event) => update('post_workout_intake', event.target.value)}
            placeholder="e.g. whey isolate, meal, carbs"
          />
        </label>
      </details>

      {error && <div className={styles.error}>{error}</div>}
    </section>
  )
}
