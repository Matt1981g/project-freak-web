import { liveQuery } from 'dexie'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import {
  load_live_workout,
  save_live_recovery,
} from '../../app/projectFreakServices'
import styles from './PostWorkoutFeedbackPanel.module.css'
import { track_workout_write } from '../../application/workout/workoutDraftJournal'
import {
  clear_workout_form_draft,
  form_draft_is_current,
  read_workout_form_draft,
  workout_form_key,
  write_workout_form_draft,
  type WorkoutFormDraft,
} from '../../application/workout/workoutFormJournal'

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
  const draft_key = completed_session_id
    ? workout_form_key('recovery', completed_session_id) : null
  const [initial_draft] = useState(() =>
    draft_key ? read_workout_form_draft<FeedbackForm>(draft_key) : null,
  )
  const [status, setStatus] = useState<'in_progress' | 'completed' | 'abandoned' | null>(null)
  const [form, setForm] = useState<FeedbackForm>(EMPTY_FORM)
  const form_ref = useRef<FeedbackForm>(EMPTY_FORM)
  const saved_revision_ref = useRef(0)
  const edit_sequence_ref = useRef(initial_draft?.edit_sequence ?? 0)
  const save_chain_ref = useRef<Promise<void>>(Promise.resolve())
  const [recoverable_draft, setRecoverableDraft] =
    useState<WorkoutFormDraft<FeedbackForm> | null>(null)
  const [draft_failed, setDraftFailed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialised = useRef(false)

  useEffect(() => {
    let active = true
    initialised.current = false
    // Schedule state reinitialisation after the effect; do not flush a dirty
    // editor in the render/effect phase. The subscription delivers saved data.
    queueMicrotask(() => {
      if (!active) return
      setForm(EMPTY_FORM)
      setDirty(false)
      setSaved(false)
      setError(null)
    })

    if (!completed_session_id) {
      queueMicrotask(() => { if (active) setStatus(null) })
      return () => { active = false }
    }

    const subscription = liveQuery(() =>
      load_live_workout(completed_session_id),
    ).subscribe({
      next: (workout) => {
        setStatus(workout?.session.status ?? null)
        if (!workout || initialised.current) return

        const readiness = workout.readiness
        const saved_form: FeedbackForm = {
          session_quality: readiness?.session_quality ?? null,
          session_fatigue: readiness?.session_fatigue ?? null,
          energy_stability: readiness?.energy_stability ?? null,
          breathlessness: readiness?.breathlessness ?? null,
          coach_note: readiness?.coach_note ?? '',
          post_workout_intake: readiness?.post_workout_intake ?? '',
        }
        saved_revision_ref.current = readiness?.revision ?? 0
        const resume = form_draft_is_current(
          initial_draft, 'recovery', completed_session_id,
          saved_revision_ref.current,
        )
        const restored = resume && initial_draft
          ? initial_draft.form : saved_form
        form_ref.current = restored
        setForm(restored)
        setDirty(Boolean(resume))
        setRecoverableDraft(initial_draft && !resume ? initial_draft : null)
        setSaved(!resume &&
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

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [completed_session_id])

  function write_form(next: FeedbackForm) {
    form_ref.current = next
    setForm(next)
    const sequence = ++edit_sequence_ref.current
    if (draft_key && completed_session_id) {
      setDraftFailed(!write_workout_form_draft(draft_key, {
        version: 1, kind: 'recovery', session_id: completed_session_id,
        base_revision: saved_revision_ref.current,
        edit_sequence: sequence, changed_at: 0, form: next,
      }))
    }
    setDirty(true)
    setSaved(false)
  }

  function update<K extends keyof FeedbackForm>(
    key: K, value: FeedbackForm[K],
  ) {
    write_form({ ...form_ref.current, [key]: value })
  }

  useEffect(() => {
    if (!dirty || !completed_session_id || status !== 'completed') return
    const sequence = edit_sequence_ref.current
    const snapshot = form
    const timer = window.setTimeout(() => {
      setSaving(true)
      setError(null)
      save_chain_ref.current = save_chain_ref.current
        .then(() => track_workout_write(save_live_recovery({
          completed_session_id,
          session_quality: snapshot.session_quality,
          session_fatigue: snapshot.session_fatigue,
          energy_stability: snapshot.energy_stability,
          breathlessness: snapshot.breathlessness,
          coach_note: snapshot.coach_note || null,
          post_workout_intake: snapshot.post_workout_intake || null,
        })))
        .then((saved) => {
          saved_revision_ref.current = saved.revision
          if (draft_key) clear_workout_form_draft(draft_key, sequence)
          if (sequence === edit_sequence_ref.current) {
            setDirty(false)
            setSaved(true)
          }
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause.message : 'Unable to save post-workout feedback.')
        })
        .finally(() => {
          if (sequence === edit_sequence_ref.current) setSaving(false)
        })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [completed_session_id, dirty, form, status, draft_key])

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

      {recoverable_draft && (
        <div className={styles.error} role="status">
          An interrupted feedback draft is available, but the saved record has
          since changed. Choose which version to use.
          <div className={styles.draftRecoveryActions}>
            <button type="button" onClick={() => {
              write_form(recoverable_draft.form)
              setRecoverableDraft(null)
            }}>RESTORE DRAFT</button>
            <button type="button" onClick={() => {
              if (draft_key) clear_workout_form_draft(draft_key)
              setRecoverableDraft(null)
            }}>KEEP SAVED</button>
          </div>
        </div>
      )}
      {draft_failed && (
        <div className={styles.error} role="alert">
          Emergency feedback storage is unavailable. Confirm SAVED before closing.
        </div>
      )}
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
