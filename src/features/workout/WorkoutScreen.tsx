import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type {
  ExerciseMetrics,
  MuscleRecoveryRating,
  MuscleRecoveryStatus,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import {
  complete_live_session_exercise,
  complete_live_workout,
  correct_history_training_set,
  load_active_exercise_options,
  load_exercise_weight_unit_preferences,
  load_live_workout,
  save_live_exercise_scores,
  save_live_readiness,
  save_live_recovery,
  save_live_training_set,
  save_exercise_weight_unit_preference,
  substitute_workout_exercise,
} from '../../app/projectFreakServices'
import {
  add_rest_seconds,
  pause_rest_timer,
  reset_rest_timer,
  rest_seconds_remaining,
  resume_rest_timer,
  start_rest_timer,
  type RestTimerState,
} from '../../application/workout/restTimer'
import {
  is_rotation_exercise_lagging,
  recommended_rotation_exercise_id,
} from '../../application/workout/pairedRotation'
import { can_safely_correct_set } from '../../application/history/correctCompletedSet'
import {
  select_set_load_prefill,
  type SetLoadPrefillSource,
} from '../../application/workout/setLoadPrefill'
import {
  display_load_to_kilograms,
  load_for_display,
  load_step_for_unit,
  type WeightEntryUnit,
} from '../../application/workout/weightUnits'
import {
  is_session_exercise_completed,
  is_training_set_completed,
} from '../../domain/rules/completion'
import { format_local_date_display } from '../../utils/dateFormat'
import styles from './WorkoutScreen.module.css'

type LiveWorkout = NonNullable<
  Awaited<ReturnType<typeof load_live_workout>>
>
type LiveExercise = LiveWorkout['exercises'][number]
type PlannedSet = LiveExercise['planned_sets'][number]
type ScoreKey = 'rpe' | 'pump' | 'form'
type ComponentDraft = {
  sequence: number
  component_type: SetComponent['component_type']
  load_kg: number | null
  reps_completed_full: number | null
  reps_partial: number | null
  duration_seconds: number | null
  failed_next_rep: boolean
  counts_toward_comparable_tonnage: boolean
  notes: string | null
}

type WakeLockSentinelLike = {
  release: () => Promise<void>
  released?: boolean
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

const SCORE_DESCRIPTIONS: Record<ScoreKey, readonly string[]> = {
  rpe: [
    'Very easy · 9+ reps left',
    'Easy · about 8 reps left',
    'Easy-moderate · about 7 reps left',
    'Moderate · about 6 reps left',
    'Working · about 5 reps left',
    'Challenging · about 4 reps left',
    'Hard · about 3 good reps left',
    'Very hard · about 2 good reps left',
    'Near limit · about 1 good rep left',
    '0 RIR · no good rep left',
  ],
  pump: [
    'Nothing happening',
    'Barely noticeable',
    'Slight pump',
    'Warming up',
    'Clearly pumped',
    'Solid pump',
    'Very full',
    'Strong pump',
    'Skin-tight',
    'Sleeves considering legal action',
  ],
  form: [
    'Form has left the building',
    'Major breakdown',
    'Very compromised',
    'Poor · load is winning',
    'Technique deteriorated',
    'Noticeable compromise',
    'Some drift',
    'Good · minor technique drift',
    'Very clean · tiny deviation',
    'Textbook',
  ],
}

function score_description(key: ScoreKey, value: number): string {
  return SCORE_DESCRIPTIONS[key][Math.max(1, Math.min(10, value)) - 1]
}

function component_label(
  component_type: SetComponent['component_type'],
  sequence: number,
): string {
  if (component_type === 'drop') return `DROP ${sequence}`
  if (component_type === 'rest_pause') return `REST-PAUSE ${sequence}`
  if (component_type === 'myo_cluster') return `MYO CLUSTER ${sequence}`
  if (component_type === 'partials') return 'PARTIALS'
  return `COMPONENT ${sequence}`
}

function component_initial_load(
  planned: PlannedSet['components'][number],
  primary_load_kg: number | null,
): number | null {
  if (planned.target_load_kg !== null) return planned.target_load_kg
  if (planned.load_relation === 'same_as_primary') return primary_load_kg
  if (
    planned.load_relation === 'percentage_of_primary' &&
    planned.target_load_percent !== null &&
    primary_load_kg !== null
  ) {
    return Math.round(primary_load_kg * (planned.target_load_percent / 100) * 2) / 2
  }
  return null
}

function build_component_drafts(
  planned_set: PlannedSet | null,
  actual_components: readonly SetComponent[],
  primary_load_kg: number | null,
): ComponentDraft[] {
  if (!planned_set) return []

  return [...planned_set.components]
    .sort((a, b) => a.sequence - b.sequence)
    .map((planned) => {
      const actual = actual_components.find(
        (component) =>
          component.sequence === planned.sequence &&
          component.component_type === planned.component_type,
      )

      return {
        sequence: planned.sequence,
        component_type: planned.component_type,
        load_kg:
          actual?.load_kg ?? component_initial_load(planned, primary_load_kg),
        reps_completed_full: actual?.reps_completed_full ?? null,
        reps_partial: actual?.reps_partial ?? null,
        duration_seconds: actual?.duration_seconds ?? null,
        failed_next_rep:
          actual?.failure_status === 'attempted_next_rep_failed',
        counts_toward_comparable_tonnage:
          planned.component_type !== 'partials',
        notes: planned.notes,
      }
    })
}


type ActiveRestTimer = RestTimerState & {
  exercise_id: string
  exercise_name: string
}

type PairingPrompt = {
  source_exercise_id: string
  source_name: string
  target_exercise_id: string
  target_name: string
  target_label: string
  target_next_set: number
  catching_up: boolean
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

function exercise_label(exercise: LiveExercise['exercise']): string {
  if (exercise.rotation_group_key) {
    return `${exercise.rotation_group_key}${exercise.rotation_position ?? ''}`
  }
  return String(exercise.actual_order)
}

function format_duration(seconds: number | null): string {
  if (seconds === null) return 'Not recorded'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining_seconds = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${remaining_seconds}s`
  }
  return `${remaining_seconds}s`
}

function format_volume(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })
}

function rest_timer_storage_key(completed_session_id: string): string {
  return `project-freak:rest-timer:${completed_session_id}`
}

function load_stored_rest_timer(
  completed_session_id: string | undefined,
): ActiveRestTimer | null {
  if (!completed_session_id || typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(
      rest_timer_storage_key(completed_session_id),
    )
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ActiveRestTimer>
    if (
      typeof parsed.planned_seconds !== 'number' ||
      (typeof parsed.ends_at_ms !== 'number' && parsed.ends_at_ms !== null) ||
      (typeof parsed.paused_remaining_seconds !== 'number' &&
        parsed.paused_remaining_seconds !== null) ||
      typeof parsed.exercise_id !== 'string' ||
      typeof parsed.exercise_name !== 'string'
    ) {
      return null
    }

    return parsed as ActiveRestTimer
  } catch {
    return null
  }
}

function format_rest_time(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function numeric_value(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function PreviousComparablePanel(props: {
  previous: LiveExercise['previous_comparable']
  current_name: string
}) {
  const { previous, current_name } = props
  if (!previous) {
    return (
      <section className={styles.previousComparableEmpty}>
        <div>
          <span>PREVIOUS COMPARABLE</span>
          <strong>No comparable prior session</strong>
        </div>
        <small>Nothing reliable to compare yet.</small>
      </section>
    )
  }

  return (
    <section className={styles.previousComparable}>
      <div className={styles.previousComparableHeader}>
        <div>
          <span>PREVIOUS COMPARABLE</span>
          <strong>{format_local_date_display(previous.session_date_local)}</strong>
          {previous.source_exercise_name !== current_name && (
            <small>Recorded as {previous.source_exercise_name}</small>
          )}
        </div>

        {previous.metrics && (
          <div className={styles.previousScores}>
            <span>RPE {previous.metrics.rpe ?? '—'}</span>
            <span>PUMP {previous.metrics.pump ?? '—'}</span>
            <span>FORM {previous.metrics.form ?? '—'}</span>
          </div>
        )}
      </div>

      <div className={styles.previousSetStrip}>
        {previous.sets.map((set) => (
          <div className={styles.previousSet} key={set.set_number}>
            <span>SET {set.set_number}</span>
            <strong>
              {set.load_kg === null ? '—' : `${set.load_kg} kg`} ×{' '}
              {set.completed_reps ?? '—'}
              {set.failure_status === 'attempted_next_rep_failed' ? 'F' : ''}
            </strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function ProgressionSuggestionPanel(props: {
  suggestion: LiveExercise['progression_suggestion']
}) {
  const { suggestion } = props

  return (
    <section
      className={
        suggestion.verdict === 'consider_load_increase'
          ? styles.progressionIncrease
          : suggestion.verdict === 'hold_load'
            ? styles.progressionHold
            : suggestion.verdict === 'add_reps'
              ? styles.progressionReps
              : styles.progressionInsufficient
      }
    >
      <div>
        <span>PROGRESSION</span>
        <strong>{suggestion.label}</strong>
      </div>
      <p>{suggestion.reason}</p>
    </section>
  )
}

function ReadinessPanel(props: {
  completed_session_id: string
  readiness: LiveWorkout['readiness']
  recovery_prompt: LiveWorkout['recovery_prompt']
}) {
  const { completed_session_id, readiness, recovery_prompt } = props
  const [form, setForm] = useState(() => ({
    bodyweight_kg: readiness?.bodyweight_kg ?? null,
    sleep_duration_minutes: readiness?.sleep_duration_minutes ?? null,
    sleep_score: readiness?.sleep_score ?? null,
    energy_pre: readiness?.energy_pre ?? null,
    motivation_pre: readiness?.motivation_pre ?? null,
    soreness_score: readiness?.soreness_score ?? null,
    soreness_notes: readiness?.soreness_notes ?? '',
    muscle_recovery: readiness?.muscle_recovery ?? ([] as MuscleRecoveryRating[]),
    joint_issue_present: readiness?.joint_issue_present ?? null,
    joint_issue_notes: readiness?.joint_issue_notes ?? '',
    pre_workout_nutrition: readiness?.pre_workout_nutrition ?? '',
    intra_workout_nutrition: readiness?.intra_workout_nutrition ?? '',
    intra_hydration_ml: readiness?.intra_hydration_ml ?? null,
    notes: readiness?.notes ?? '',
  }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(Boolean(readiness))
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  function update_muscle_recovery(
    muscle: string,
    status: MuscleRecoveryStatus,
  ) {
    if (!recovery_prompt) return

    const next = form.muscle_recovery.filter(
      (rating) =>
        !(
          rating.muscle === muscle &&
          rating.source_session_id === recovery_prompt.source_session_id
        ),
    )
    next.push({
      muscle,
      status,
      source_session_id: recovery_prompt.source_session_id,
      source_session_date_local:
        recovery_prompt.source_session_date_local,
    })
    update('muscle_recovery', next)
  }

  useEffect(() => {
    if (!dirty) return

    const timer = window.setTimeout(() => {
      setSaving(true)
      setError(null)

      void save_live_readiness({
        completed_session_id,
        bodyweight_kg: form.bodyweight_kg,
        sleep_duration_minutes: form.sleep_duration_minutes,
        sleep_score: form.sleep_score,
        energy_pre: form.energy_pre,
        motivation_pre: form.motivation_pre,
        soreness_score: form.soreness_score,
        soreness_notes: form.soreness_notes || null,
        muscle_recovery: form.muscle_recovery,
        joint_issue_present: form.joint_issue_present,
        joint_issue_notes: form.joint_issue_notes || null,
        pre_workout_nutrition: form.pre_workout_nutrition || null,
        intra_workout_nutrition: form.intra_workout_nutrition || null,
        intra_hydration_ml: form.intra_hydration_ml,
        notes: form.notes || null,
      })
        .then(() => {
          setDirty(false)
          setSaved(true)
        })
        .catch((cause) => {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to save readiness.',
          )
        })
        .finally(() => setSaving(false))
    }, 400)

    return () => window.clearTimeout(timer)
  }, [completed_session_id, dirty, form])

  return (
    <details className={styles.readinessPanel}>
      <summary>
        <div>
          <span>SESSION CONTEXT</span>
          <strong>Readiness</strong>
        </div>
        <small>
          {saving ? 'AUTOSAVING…' : error ? 'SAVE ERROR' : saved ? 'SAVED ✓' : 'OPTIONAL'}
        </small>
      </summary>

      <div className={styles.readinessGrid}>
        <label>
          <span>BODYWEIGHT KG</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="20"
            max="400"
            value={form.bodyweight_kg ?? ''}
            onChange={(event) =>
              update('bodyweight_kg', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>SLEEP MINUTES</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="1440"
            value={form.sleep_duration_minutes ?? ''}
            onChange={(event) =>
              update(
                'sleep_duration_minutes',
                numeric_value(event.target.value),
              )
            }
          />
        </label>

        <label>
          <span>SLEEP SCORE /100</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            value={form.sleep_score ?? ''}
            onChange={(event) =>
              update('sleep_score', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>ENERGY 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.energy_pre ?? ''}
            onChange={(event) =>
              update('energy_pre', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>MOTIVATION 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.motivation_pre ?? ''}
            onChange={(event) =>
              update('motivation_pre', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>SORENESS 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.soreness_score ?? ''}
            onChange={(event) =>
              update('soreness_score', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>JOINT ISSUE?</span>
          <select
            value={
              form.joint_issue_present === null
                ? ''
                : form.joint_issue_present
                  ? 'yes'
                  : 'no'
            }
            onChange={(event) =>
              update(
                'joint_issue_present',
                event.target.value === ''
                  ? null
                  : event.target.value === 'yes',
              )
            }
          >
            <option value="">Not recorded</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          <span>HYDRATION ML</span>
          <input
            type="number"
            inputMode="numeric"
            step="50"
            min="0"
            max="10000"
            value={form.intra_hydration_ml ?? ''}
            onChange={(event) =>
              update(
                'intra_hydration_ml',
                numeric_value(event.target.value),
              )
            }
          />
        </label>
      </div>

      {recovery_prompt && (
        <div className={styles.muscleRecovery}>
          <div className={styles.muscleRecoveryHeader}>
            <div>
              <span>PREVIOUS SESSION RECOVERY</span>
              <strong>{recovery_prompt.source_session_name}</strong>
            </div>
            <small>
              {recovery_prompt.source_session_date_local} · tap one state per
              trained area
            </small>
          </div>

          <div className={styles.muscleRecoveryList}>
            {recovery_prompt.muscles.map((muscle) => {
              const current = form.muscle_recovery.find(
                (rating) =>
                  rating.muscle === muscle &&
                  rating.source_session_id ===
                    recovery_prompt.source_session_id,
              )?.status

              return (
                <div className={styles.muscleRecoveryRow} key={muscle}>
                  <strong>{muscle}</strong>
                  <div>
                    {(
                      [
                        ['fresh', 'FRESH'],
                        ['mild_soreness', 'MILD'],
                        ['sore', 'SORE'],
                        ['performance_affected', 'AFFECTED'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        type="button"
                        className={
                          current === value
                            ? value === 'performance_affected'
                              ? styles.recoveryAffected
                              : styles.recoverySelected
                            : undefined
                        }
                        key={value}
                        onClick={() => update_muscle_recovery(muscle, value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.readinessNotes}>
        <label>
          <span>SORENESS NOTES</span>
          <input
            type="text"
            value={form.soreness_notes}
            onChange={(event) => update('soreness_notes', event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label>
          <span>JOINT NOTES</span>
          <input
            type="text"
            value={form.joint_issue_notes}
            onChange={(event) => update('joint_issue_notes', event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label>
          <span>PRE-WORKOUT NUTRITION</span>
          <input
            type="text"
            value={form.pre_workout_nutrition}
            onChange={(event) =>
              update('pre_workout_nutrition', event.target.value)
            }
            placeholder="Optional"
          />
        </label>
        <label>
          <span>INTRA-WORKOUT</span>
          <input
            type="text"
            value={form.intra_workout_nutrition}
            onChange={(event) =>
              update('intra_workout_nutrition', event.target.value)
            }
            placeholder="Optional"
          />
        </label>
        <label className={styles.readinessNotesWide}>
          <span>SESSION NOTES</span>
          <input
            type="text"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
            placeholder="Optional"
          />
        </label>
      </div>

      {error && <div className={styles.setError}>{error}</div>}
    </details>
  )
}

function RecoveryPanel(props: {
  completed_session_id: string
  readiness: LiveWorkout['readiness']
}) {
  const { completed_session_id, readiness } = props
  const [form, setForm] = useState(() => ({
    session_fatigue: readiness?.session_fatigue ?? null,
    breathlessness: readiness?.breathlessness ?? null,
    energy_stability: readiness?.energy_stability ?? null,
    post_workout_intake: readiness?.post_workout_intake ?? '',
  }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(
    readiness != null &&
      (readiness.session_fatigue !== null ||
        readiness.breathlessness !== null ||
        readiness.energy_stability !== null ||
        Boolean(readiness.post_workout_intake)),
  )
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  useEffect(() => {
    if (!dirty) return

    const timer = window.setTimeout(() => {
      setSaving(true)
      setError(null)

      void save_live_recovery({
        completed_session_id,
        session_fatigue: form.session_fatigue,
        breathlessness: form.breathlessness,
        energy_stability: form.energy_stability,
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
              : 'Unable to save recovery.',
          )
        })
        .finally(() => setSaving(false))
    }, 400)

    return () => window.clearTimeout(timer)
  }, [completed_session_id, dirty, form])

  return (
    <section className={styles.recoveryPanel}>
      <div className={styles.recoveryHeader}>
        <div>
          <span>POST-WORKOUT</span>
          <h2>Recovery check</h2>
          <p>Optional. Record how hard the session actually cost you.</p>
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

      <div className={styles.recoveryGrid}>
        <label>
          <span>SESSION FATIGUE 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.session_fatigue ?? ''}
            onChange={(event) =>
              update('session_fatigue', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>BREATHLESSNESS 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.breathlessness ?? ''}
            onChange={(event) =>
              update('breathlessness', numeric_value(event.target.value))
            }
          />
        </label>

        <label>
          <span>ENERGY STABILITY 1–10</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={form.energy_stability ?? ''}
            onChange={(event) =>
              update('energy_stability', numeric_value(event.target.value))
            }
          />
        </label>

        <label className={styles.recoveryIntake}>
          <span>POST-WORKOUT INTAKE</span>
          <input
            type="text"
            value={form.post_workout_intake}
            onChange={(event) =>
              update('post_workout_intake', event.target.value)
            }
            placeholder="e.g. whey isolate, meal, carbs"
          />
        </label>
      </div>

      {error && <div className={styles.setError}>{error}</div>}
    </section>
  )
}

function CompletedSetCorrection(props: {
  set: TrainingSet
  load_unit: WeightEntryUnit
  on_saved: (set: TrainingSet) => Promise<void>
}) {
  const { set, load_unit, on_saved } = props
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<number | null>(set.load_kg)
  const [reps, setReps] = useState<number>(set.completed_reps ?? 0)
  const [failed, setFailed] = useState(
    set.failure_status === 'attempted_next_rep_failed',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can_safely_correct_set(set)) {
    return null
  }

  function cancel() {
    setLoad(set.load_kg)
    setReps(set.completed_reps ?? 0)
    setFailed(set.failure_status === 'attempted_next_rep_failed')
    setError(null)
    setOpen(false)
  }

  async function save_correction() {
    if (saving) return

    setSaving(true)
    setError(null)

    try {
      const corrected = await correct_history_training_set({
        set,
        load_kg: load,
        completed_reps: reps,
        failed_next_rep: failed,
      })
      await on_saved(corrected)
      setOpen(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to correct set.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.correctionArea}>
      {!open ? (
        <button
          type="button"
          className={styles.correctionToggle}
          onClick={() => setOpen(true)}
        >
          CORRECT SET
        </button>
      ) : (
        <div className={styles.correctionPanel}>
          <div className={styles.correctionHeader}>
            <div>
              <span>SAFE CORRECTION</span>
              <strong>Fix a genuine logging error</strong>
            </div>
            <small>ORIGINAL PROVENANCE PRESERVED</small>
          </div>

          <div className={styles.correctionGrid}>
            <label>
              <span>LOAD {load_unit === 'kg' ? 'KG' : 'LBS'}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={load_unit === 'kg' ? '0.5' : '1'}
                value={load_for_display(load, load_unit) ?? ''}
                onChange={(event) =>
                  setLoad(
                    display_load_to_kilograms(
                      numeric_value(event.target.value),
                      load_unit,
                    ),
                  )
                }
              />
            </label>
            <label>
              <span>REPS</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={reps}
                onChange={(event) =>
                  setReps(Math.max(0, Math.trunc(Number(event.target.value) || 0)))
                }
              />
            </label>
            <button
              type="button"
              className={failed ? styles.failureOn : styles.failureOff}
              onClick={() => setFailed((current) => !current)}
            >
              {failed ? 'FAIL ✓' : 'FAIL'}
            </button>
          </div>

          <div className={styles.correctionActions}>
            <button type="button" onClick={cancel} disabled={saving}>
              CANCEL
            </button>
            <button
              type="button"
              className={styles.correctionSave}
              onClick={() => void save_correction()}
              disabled={saving}
            >
              {saving ? 'SAVING…' : 'SAVE CORRECTION'}
            </button>
          </div>

          {error && <div className={styles.setError}>{error}</div>}
        </div>
      )}
    </div>
  )
}

function SetLoggerRow(props: {
  exercise: LiveExercise['exercise']
  set_number: number
  planned_set: PlannedSet | null
  actual_set: TrainingSet | null
  actual_components: SetComponent[]
  initial_load_kg: number | null
  load_prefill_source: SetLoadPrefillSource
  load_unit: WeightEntryUnit
  locked: boolean
  allow_correction?: boolean
  on_complete: () => Promise<void>
  on_corrected?: () => Promise<void>
}) {
  const {
    exercise,
    set_number,
    planned_set,
    actual_set,
    actual_components,
    initial_load_kg,
    load_prefill_source,
    load_unit,
    locked,
    allow_correction = false,
    on_complete,
    on_corrected,
  } = props
  const [saved_set, setSavedSet] = useState<TrainingSet | null>(actual_set)
  const [load, setLoad] = useState<number | null>(initial_load_kg)
  const [reps, setReps] = useState<number | null>(
    actual_set?.completed_reps ?? null,
  )
  const [failed, setFailed] = useState(
    actual_set?.failure_status === 'attempted_next_rep_failed',
  )
  const [components, setComponents] = useState<ComponentDraft[]>(() =>
    build_component_drafts(planned_set, actual_components, initial_load_kg),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load_ref = useRef(load)
  const reps_ref = useRef(reps)
  const failed_ref = useRef(failed)
  const components_ref = useRef(components)
  const saved_set_ref = useRef<TrainingSet | null>(saved_set)
  const autosave_timer_ref = useRef<number | null>(null)
  const save_chain_ref = useRef<Promise<void>>(Promise.resolve())
  const pending_saves_ref = useRef(0)

  const completed =
    saved_set !== null && is_training_set_completed(saved_set)
  const target = planned_set?.set

  useEffect(() => {
    return () => {
      if (autosave_timer_ref.current !== null) {
        window.clearTimeout(autosave_timer_ref.current)
      }
    }
  }, [])

  function clear_autosave_timer() {
    if (autosave_timer_ref.current !== null) {
      window.clearTimeout(autosave_timer_ref.current)
      autosave_timer_ref.current = null
    }
  }

  function queue_save(options?: {
    complete?: boolean
    load_kg?: number | null
    completed_reps?: number | null
    failed_next_rep?: boolean
    components?: ComponentDraft[]
  }) {
    if (completed) return Promise.resolve()

    const complete = options?.complete ?? false
    const load_kg =
      options && 'load_kg' in options ? options.load_kg ?? null : load_ref.current
    const completed_reps =
      options && 'completed_reps' in options
        ? options.completed_reps ?? null
        : reps_ref.current
    const failed_next_rep =
      options && 'failed_next_rep' in options
        ? options.failed_next_rep ?? false
        : failed_ref.current
    const component_values =
      options && 'components' in options
        ? options.components ?? []
        : components_ref.current

    pending_saves_ref.current += 1
    setSaving(true)
    setError(null)

    const run = async () => {
      try {
        const updated = await save_live_training_set({
          session_exercise: exercise,
          programmed_set: target ?? null,
          existing_set: saved_set_ref.current,
          set_number,
          load_kg,
          completed_reps,
          failed_next_rep,
          complete,
          components: component_values,
        })
        saved_set_ref.current = updated
        setSavedSet(updated)

        if (complete) {
          await on_complete()
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Unable to save set.',
        )
      } finally {
        pending_saves_ref.current -= 1
        if (pending_saves_ref.current === 0) {
          setSaving(false)
        }
      }
    }

    save_chain_ref.current = save_chain_ref.current.then(run, run)
    return save_chain_ref.current
  }

  function schedule_autosave() {
    clear_autosave_timer()
    autosave_timer_ref.current = window.setTimeout(() => {
      autosave_timer_ref.current = null
      void queue_save()
    }, 300)
  }

  function change_load(value: number | null) {
    load_ref.current = value
    setLoad(value)
    schedule_autosave()
  }

  function change_reps(value: number | null) {
    reps_ref.current = value
    setReps(value)
    schedule_autosave()
  }

  function adjust_load(direction: -1 | 1) {
    clear_autosave_timer()
    const current_display = load_for_display(load_ref.current, load_unit) ?? 0
    const next_display = Math.max(
      0,
      current_display + direction * load_step_for_unit(load_unit),
    )
    const next_kg = display_load_to_kilograms(next_display, load_unit)
    load_ref.current = next_kg
    setLoad(next_kg)
    void queue_save({ load_kg: next_kg })
  }

  function adjust_reps(delta: number) {
    clear_autosave_timer()
    const next = Math.max(0, (reps_ref.current ?? 0) + delta)
    reps_ref.current = next
    setReps(next)
    void queue_save({ completed_reps: next })
  }

  function toggle_failure() {
    clear_autosave_timer()
    const next = !failed_ref.current
    failed_ref.current = next
    setFailed(next)
    void queue_save({ failed_next_rep: next })
  }

  function change_component(
    index: number,
    patch: Partial<ComponentDraft>,
  ) {
    const next = components_ref.current.map((component, component_index) =>
      component_index === index ? { ...component, ...patch } : component,
    )
    components_ref.current = next
    setComponents(next)
    schedule_autosave()
  }

  function component_entries_complete(): boolean {
    return components_ref.current.every((component) =>
      component.component_type === 'partials'
        ? component.reps_partial !== null
        : component.reps_completed_full !== null,
    )
  }

  function complete_set() {
    clear_autosave_timer()
    if (!component_entries_complete()) {
      setError('Complete every programmed drop / rest-pause / myo / partial entry first.')
      return
    }
    void queue_save({ complete: true })
  }

  return (
    <div
      className={
        completed
          ? styles.setRowComplete
          : locked
            ? styles.setRowLocked
            : styles.setRow
      }
    >
      <div className={styles.setHeading}>
        <div>
          <strong>SET {set_number}</strong>
          <span>
            {target
              ? `${rep_target(target.target_rep_min, target.target_rep_max)} · ${target.structure_type.replaceAll('_', ' ')}`
              : rep_target(exercise.target_rep_min, exercise.target_rep_max)}
          </span>
        </div>
        {completed ? (
          <span className={styles.doneBadge}>DONE</span>
        ) : locked ? (
          <span className={styles.lockedBadge}>LOCKED</span>
        ) : null}
      </div>

      {locked && (
        <div className={styles.lockedSetNotice}>
          Complete Set {set_number - 1} before logging this set.
        </div>
      )}

      <div className={styles.loggerGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor={`load-${exercise.id}-${set_number}`}>
            LOAD {load_unit === 'kg' ? 'KG' : 'LBS'}
            {load_prefill_source === 'programme'
              ? ' · PROGRAMME'
              : load_prefill_source === 'previous_comparable'
                ? ' · PREVIOUS'
                : ''}
          </label>
          <div className={styles.stepper}>
            <button
              type="button"
              data-set-action="true"
              disabled={completed || locked}
              onClick={() => adjust_load(-1)}
            >
              −
            </button>
            <input
              id={`load-${exercise.id}-${set_number}`}
              type="number"
              inputMode="decimal"
              min="0"
              step={load_unit === 'kg' ? '0.5' : '1'}
              value={load_for_display(load, load_unit) ?? ''}
              disabled={completed || locked}
              onChange={(event) =>
                change_load(
                  display_load_to_kilograms(
                    numeric_value(event.target.value),
                    load_unit,
                  ),
                )
              }
              onBlur={() => {
                clear_autosave_timer()
                void queue_save()
              }}
            />
            <button
              type="button"
              data-set-action="true"
              disabled={completed || locked}
              onClick={() => adjust_load(1)}
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
              disabled={completed || locked}
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
              disabled={completed || locked}
              onChange={(event) => change_reps(numeric_value(event.target.value))}
              onBlur={() => {
                clear_autosave_timer()
                void queue_save()
              }}
            />
            <button
              type="button"
              data-set-action="true"
              disabled={completed || locked}
              onClick={() => adjust_reps(1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {planned_set && planned_set.components.length > 0 && (
        <div className={styles.advancedSetPanel}>
          <div className={styles.advancedSetHeader}>
            <div>
              <span>ADVANCED SET</span>
              <strong>{target?.structure_type.replaceAll('_', ' ').toUpperCase()}</strong>
            </div>
            <small>Log every programmed component before completing the set.</small>
          </div>

          {components.map((component, index) => {
            const planned_component = planned_set.components.find(
              (item) =>
                item.sequence === component.sequence &&
                item.component_type === component.component_type,
            )
            const rep_value =
              component.component_type === 'partials'
                ? component.reps_partial
                : component.reps_completed_full

            return (
              <div
                className={styles.advancedComponent}
                key={`${component.component_type}-${component.sequence}`}
              >
                <div className={styles.advancedComponentHeading}>
                  <div>
                    <strong>
                      {component_label(
                        component.component_type,
                        component.sequence,
                      )}
                    </strong>
                    <span>
                      {planned_component
                        ? rep_target(
                            planned_component.target_rep_min,
                            planned_component.target_rep_max,
                          )
                        : 'reps open'}
                      {planned_component?.target_load_percent !== null &&
                      planned_component?.target_load_percent !== undefined
                        ? ` · ${planned_component.target_load_percent}% primary load`
                        : ''}
                    </span>
                  </div>
                  {planned_component?.failure_target !== 'none' && (
                    <small>FAILURE {planned_component?.failure_target.toUpperCase()}</small>
                  )}
                </div>

                {planned_component?.notes && (
                  <p className={styles.advancedComponentNote}>
                    {planned_component.notes}
                  </p>
                )}

                <div className={styles.loggerGrid}>
                  <div className={styles.fieldGroup}>
                    <label
                      htmlFor={`component-load-${exercise.id}-${set_number}-${index}`}
                    >
                      LOAD {load_unit === 'kg' ? 'KG' : 'LBS'}
                    </label>
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        data-set-action="true"
                        disabled={completed || locked}
                        onClick={() => {
                          const current_display =
                            load_for_display(component.load_kg, load_unit) ?? 0
                          change_component(index, {
                            load_kg: display_load_to_kilograms(
                              Math.max(
                                0,
                                current_display - load_step_for_unit(load_unit),
                              ),
                              load_unit,
                            ),
                          })
                        }}
                      >
                        −
                      </button>
                      <input
                        id={`component-load-${exercise.id}-${set_number}-${index}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={load_unit === 'kg' ? '0.5' : '1'}
                        value={load_for_display(component.load_kg, load_unit) ?? ''}
                        disabled={completed || locked}
                        onChange={(event) =>
                          change_component(index, {
                            load_kg: display_load_to_kilograms(
                              numeric_value(event.target.value),
                              load_unit,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        data-set-action="true"
                        disabled={completed || locked}
                        onClick={() => {
                          const current_display =
                            load_for_display(component.load_kg, load_unit) ?? 0
                          change_component(index, {
                            load_kg: display_load_to_kilograms(
                              current_display + load_step_for_unit(load_unit),
                              load_unit,
                            ),
                          })
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label
                      htmlFor={`component-reps-${exercise.id}-${set_number}-${index}`}
                    >
                      {component.component_type === 'partials'
                        ? 'PARTIAL REPS'
                        : 'REPS'}
                    </label>
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        data-set-action="true"
                        disabled={completed || locked}
                        onClick={() =>
                          change_component(
                            index,
                            component.component_type === 'partials'
                              ? {
                                  reps_partial: Math.max(
                                    0,
                                    (component.reps_partial ?? 0) - 1,
                                  ),
                                }
                              : {
                                  reps_completed_full: Math.max(
                                    0,
                                    (component.reps_completed_full ?? 0) - 1,
                                  ),
                                },
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        id={`component-reps-${exercise.id}-${set_number}-${index}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={rep_value ?? ''}
                        disabled={completed || locked}
                        onChange={(event) => {
                          const next = numeric_value(event.target.value)
                          change_component(
                            index,
                            component.component_type === 'partials'
                              ? { reps_partial: next }
                              : { reps_completed_full: next },
                          )
                        }}
                      />
                      <button
                        type="button"
                        data-set-action="true"
                        disabled={completed || locked}
                        onClick={() =>
                          change_component(
                            index,
                            component.component_type === 'partials'
                              ? {
                                  reps_partial:
                                    (component.reps_partial ?? 0) + 1,
                                }
                              : {
                                  reps_completed_full:
                                    (component.reps_completed_full ?? 0) + 1,
                                },
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-set-action="true"
                  className={
                    component.failed_next_rep
                      ? styles.componentFailureOn
                      : styles.componentFailureOff
                  }
                  disabled={completed || locked || rep_value === null}
                  onClick={() =>
                    change_component(index, {
                      failed_next_rep: !component.failed_next_rep,
                    })
                  }
                >
                  {component.failed_next_rep ? 'COMPONENT FAIL ✓' : 'COMPONENT FAIL'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.setActions}>
        <button
          type="button"
          data-set-action="true"
          className={failed ? styles.failureOn : styles.failureOff}
          disabled={completed || locked || reps === null}
          onClick={toggle_failure}
        >
          {failed ? 'FAIL ✓' : 'FAIL'}
        </button>
        <button
          type="button"
          data-set-action="true"
          className={styles.completeSetButton}
          disabled={
            completed ||
            locked ||
            reps === null ||
            !components.every((component) =>
              component.component_type === 'partials'
                ? component.reps_partial !== null
                : component.reps_completed_full !== null,
            )
          }
          onClick={complete_set}
        >
          {completed ? 'SET COMPLETE' : 'COMPLETE SET'}
        </button>
      </div>

      {saving && !completed && (
        <div className={styles.autosaveStatus}>AUTOSAVING…</div>
      )}
      {error && <div className={styles.setError}>{error}</div>}

      {completed && allow_correction && saved_set && (
        <CompletedSetCorrection
          set={saved_set}
          load_unit={load_unit}
          on_saved={async (corrected) => {
            saved_set_ref.current = corrected
            setSavedSet(corrected)
            load_ref.current = corrected.load_kg
            setLoad(corrected.load_kg)
            reps_ref.current = corrected.completed_reps
            setReps(corrected.completed_reps)
            const corrected_failed =
              corrected.failure_status === 'attempted_next_rep_failed'
            failed_ref.current = corrected_failed
            setFailed(corrected_failed)
            await on_corrected?.()
          }}
        />
      )}
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
      return true
    }

    setSaving(true)
    setError(null)

    try {
      const saved = await save_live_exercise_scores(exercise.id, scores)
      setSavedMetrics(saved)
      return true
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save exercise rating.',
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  async function complete_exercise() {
    if (saving || completing) return

    setCompleting(true)
    setError(null)

    try {
      const scores_saved = await persist_score()
      if (!scores_saved) return

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
          onPointerUp={(event) =>
            void persist_score(key, Number(event.currentTarget.value))
          }
          onKeyUp={(event) =>
            void persist_score(key, Number(event.currentTarget.value))
          }
        />
        <div className={styles.scoreScale}>
          <span>1</span>
          <span>10</span>
        </div>
        <strong className={styles.scoreDescription}>
          {score_description(key, value)}
        </strong>
        <details className={styles.scoreKey}>
          <summary>VIEW {label} SCALE</summary>
          <div>
            {SCORE_DESCRIPTIONS[key].map((description, index) => (
              <span key={index + 1}>
                <b>{index + 1}</b>
                {description}
              </span>
            ))}
          </div>
          {key === 'rpe' && (
            <small>
              RPE 10 means 0 RIR. It does not require a failed rep attempt.
            </small>
          )}
        </details>
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

function RestTimerPanel(props: {
  timer: ActiveRestTimer
  now_ms: number
  on_change: (timer: ActiveRestTimer) => void
  on_skip: () => void
}) {
  const { timer, now_ms, on_change, on_skip } = props
  const remaining = rest_seconds_remaining(timer, now_ms)
  const paused = timer.ends_at_ms === null
  const ready = remaining === 0 && !paused

  return (
    <aside className={ready ? styles.restTimerReady : styles.restTimer}>
      <div className={styles.restTimerMain}>
        <div>
          <span>{ready ? 'REST COMPLETE' : paused ? 'REST PAUSED' : 'REST TIMER'}</span>
          <small>{timer.exercise_name}</small>
        </div>
        <strong>{ready ? 'GO' : format_rest_time(remaining)}</strong>
      </div>

      <div className={styles.restTimerActions}>
        <button
          type="button"
          onClick={() =>
            on_change(
              paused
                ? {
                    ...resume_rest_timer(timer, Date.now()),
                    exercise_id: timer.exercise_id,
                    exercise_name: timer.exercise_name,
                  }
                : {
                    ...pause_rest_timer(timer, Date.now()),
                    exercise_id: timer.exercise_id,
                    exercise_name: timer.exercise_name,
                  },
            )
          }
        >
          {paused ? 'RESUME' : 'PAUSE'}
        </button>
        <button
          type="button"
          onClick={() =>
            on_change({
              ...reset_rest_timer(timer, Date.now()),
              exercise_id: timer.exercise_id,
              exercise_name: timer.exercise_name,
            })
          }
        >
          RESET
        </button>
        <button
          type="button"
          onClick={() =>
            on_change({
              ...add_rest_seconds(timer, 15),
              exercise_id: timer.exercise_id,
              exercise_name: timer.exercise_name,
            })
          }
        >
          +15
        </button>
        <button
          type="button"
          onClick={() =>
            on_change({
              ...add_rest_seconds(timer, 30),
              exercise_id: timer.exercise_id,
              exercise_name: timer.exercise_name,
            })
          }
        >
          +30
        </button>
        <button type="button" onClick={on_skip}>
          SKIP
        </button>
      </div>
    </aside>
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
  const [active_exercises, setActiveExercises] = useState<
    Awaited<ReturnType<typeof load_active_exercise_options>>
  >([])
  const [substitution_open_id, setSubstitutionOpenId] = useState<string | null>(null)
  const [substitution_target_id, setSubstitutionTargetId] = useState('')
  const [substitution_scope, setSubstitutionScope] = useState<
    'today' | 'week' | 'programme'
  >('today')
  const [substituting, setSubstituting] = useState(false)
  const [load_unit_by_exercise, setLoadUnitByExercise] = useState<
    Record<string, WeightEntryUnit>
  >({})
  const [loading, setLoading] = useState(true)
  const [finishing, setFinishing] = useState(false)
  const [pairing_prompt, setPairingPrompt] = useState<PairingPrompt | null>(null)
  const [rest_timer, setRestTimer] = useState<ActiveRestTimer | null>(() =>
    load_stored_rest_timer(completed_session_id),
  )
  const [rest_now_ms, setRestNowMs] = useState(() => Date.now())
  const [wake_lock_state, setWakeLockState] = useState<
    'idle' | 'active' | 'unavailable'
  >('idle')
  const wake_lock_ref = useRef<WakeLockSentinelLike | null>(null)
  const audio_context_ref = useRef<AudioContext | null>(null)
  const last_rest_remaining_ref = useRef<number | null>(null)
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

  function change_exercise_load_unit(
    exercise_id: string,
    unit: WeightEntryUnit,
  ) {
    setLoadUnitByExercise((current) => ({
      ...current,
      [exercise_id]: unit,
    }))

    void save_exercise_weight_unit_preference(exercise_id, unit).catch(
      (cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to remember weight unit preference.',
        )
      },
    )
  }

  async function apply_exercise_substitution(session_exercise_id: string) {
    if (!substitution_target_id || substituting) return

    setSubstituting(true)
    setError(null)
    try {
      await substitute_workout_exercise(
        session_exercise_id,
        substitution_target_id,
        substitution_scope,
      )
      setSubstitutionOpenId(null)
      setSubstitutionTargetId('')
      await refresh_workout()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to substitute exercise.',
      )
    } finally {
      setSubstituting(false)
    }
  }

  function prime_rest_audio() {
    if (typeof window === 'undefined') return

    const audio_window = window as AudioWindow
    const AudioContextConstructor =
      audio_window.AudioContext ?? audio_window.webkitAudioContext
    if (!AudioContextConstructor) return

    try {
      const context =
        audio_context_ref.current ?? new AudioContextConstructor()
      audio_context_ref.current = context
      if (context.state === 'suspended') {
        void context.resume()
      }
    } catch {
      // Audio is best-effort. The visual timer remains authoritative.
    }
  }

  function play_rest_complete_beep() {
    prime_rest_audio()
    const context = audio_context_ref.current
    if (!context || context.state === 'closed') return

    const play_tone = (delay_seconds: number, frequency: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + delay_seconds
      const end = start + 0.12

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(end)
    }

    try {
      play_tone(0, 880)
      play_tone(0.18, 1046)
      if ('vibrate' in navigator) {
        navigator.vibrate?.([100, 70, 100])
      }
    } catch {
      // Some iOS audio states may still suppress sound; visual GO remains.
    }
  }

  async function finish_workout() {
    if (!completed_session_id || finishing) return

    setFinishing(true)
    setError(null)

    try {
      await complete_live_workout(completed_session_id)
      setOpenExerciseId(null)
      await refresh_workout()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to finish workout.',
      )
    } finally {
      setFinishing(false)
    }
  }

  useEffect(() => {
    let active = true

    void Promise.all([
      load_exercise_weight_unit_preferences(),
      load_active_exercise_options(),
    ])
      .then(([preferences, exercises]) => {
        if (!active) return
        setLoadUnitByExercise(preferences)
        setActiveExercises(exercises)
      })
      .catch((cause) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load saved weight unit preferences.',
        )
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (workout?.session.status !== 'in_progress') {
      setWakeLockState('idle')
      void wake_lock_ref.current?.release().catch(() => undefined)
      wake_lock_ref.current = null
      return
    }

    let cancelled = false
    const wake_lock = (navigator as NavigatorWithWakeLock).wakeLock

    if (!wake_lock) {
      setWakeLockState('unavailable')
      return
    }

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible') return
      if (wake_lock_ref.current && !wake_lock_ref.current.released) return

      try {
        wake_lock_ref.current = await wake_lock!.request('screen')
        if (!cancelled) setWakeLockState('active')
      } catch {
        if (!cancelled) setWakeLockState('unavailable')
      }
    }

    void acquire()

    const on_visibility_change = () => {
      if (document.visibilityState === 'visible') {
        void acquire()
      } else {
        wake_lock_ref.current = null
      }
    }

    document.addEventListener('visibilitychange', on_visibility_change)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', on_visibility_change)
      void wake_lock_ref.current?.release().catch(() => undefined)
      wake_lock_ref.current = null
    }
  }, [workout?.session.id, workout?.session.status])

  useEffect(() => {
    void refresh_workout()
  }, [refresh_workout])

  useEffect(() => {
    if (!rest_timer) return

    const tick = window.setInterval(() => {
      setRestNowMs(Date.now())
    }, 250)

    return () => window.clearInterval(tick)
  }, [rest_timer])

  useEffect(() => {
    if (!rest_timer) {
      last_rest_remaining_ref.current = null
      return
    }

    const remaining = rest_seconds_remaining(rest_timer, rest_now_ms)
    const previous = last_rest_remaining_ref.current

    if (
      previous !== null &&
      previous > 0 &&
      remaining === 0 &&
      rest_timer.ends_at_ms !== null
    ) {
      play_rest_complete_beep()
    }

    last_rest_remaining_ref.current = remaining
  }, [rest_now_ms, rest_timer])

  useEffect(() => {
    if (!completed_session_id) return

    const key = rest_timer_storage_key(completed_session_id)
    if (rest_timer) {
      window.localStorage.setItem(key, JSON.stringify(rest_timer))
    } else {
      window.localStorage.removeItem(key)
    }
  }, [completed_session_id, rest_timer])

  function begin_rest(exercise: LiveExercise['exercise']) {
    if (exercise.rest_seconds === null || exercise.rest_seconds <= 0) return

    const now = Date.now()
    setRestNowMs(now)
    setRestTimer({
      ...start_rest_timer(exercise.rest_seconds, now),
      exercise_id: exercise.id,
      exercise_name: exercise.exercise_name_snapshot,
    })
  }

  function pairing_recommendation(
    current_exercise_id: string,
    increment_current_completed_sets: boolean,
  ): PairingPrompt | null {
    if (!workout) return null

    const progress = workout.exercises.map((entry) => {
      const completed_sets =
        entry.sets.filter(is_training_set_completed).length +
        (increment_current_completed_sets &&
        entry.exercise.id === current_exercise_id
          ? 1
          : 0)
      const target_sets =
        entry.planned_sets.length ||
        entry.exercise.target_sets ||
        Math.max(entry.sets.length, 1)

      return {
        ...entry.exercise,
        completed_sets,
        target_sets,
      }
    })

    const target_id = recommended_rotation_exercise_id(
      progress,
      current_exercise_id,
    )
    if (!target_id) return null

    const source = workout.exercises.find(
      (entry) => entry.exercise.id === current_exercise_id,
    )
    const target = workout.exercises.find(
      (entry) => entry.exercise.id === target_id,
    )
    const target_progress = progress.find(
      (entry) => entry.id === target_id,
    )

    if (!source || !target || !target_progress) return null

    return {
      source_exercise_id: source.exercise.id,
      source_name: source.exercise.exercise_name_snapshot,
      target_exercise_id: target.exercise.id,
      target_name: target.exercise.exercise_name_snapshot,
      target_label: exercise_label(target.exercise),
      target_next_set: Math.min(
        target_progress.completed_sets + 1,
        target_progress.target_sets,
      ),
      catching_up: target.exercise.id === source.exercise.id,
    }
  }

  function follow_pairing_recommendation(prompt: PairingPrompt) {
    setOpenExerciseId(prompt.target_exercise_id)
    setPairingPrompt(prompt)
  }

  function manual_open_exercise(exercise_id: string, is_open: boolean) {
    setPairingPrompt(null)
    setOpenExerciseId(is_open ? null : exercise_id)
  }



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

  const all_exercises_complete =
    workout.exercises.length > 0 &&
    workout.exercises.every(({ exercise }) =>
      is_session_exercise_completed(exercise, workout.session),
    )

  const rotation_progress = workout.exercises.map((entry) => ({
    ...entry.exercise,
    completed_sets: entry.sets.filter(is_training_set_completed).length,
    target_sets:
      entry.planned_sets.length ||
      entry.exercise.target_sets ||
      Math.max(entry.sets.length, 1),
  }))

  return (
    <div className={styles.screen} onPointerDown={prime_rest_audio}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>WORKOUT</p>
          <h1>{workout.session.session_name}</h1>
          <p className={styles.intro}>
            Log the completed reps. FAIL means the next attempted rep did not complete.
          </p>
        </div>
        <div className={styles.workoutStatusStack}>
          <span className={styles.statusBadge}>
            {workout.session.status.replaceAll('_', ' ')}
          </span>
          {workout.session.status === 'in_progress' && (
            <small
              className={
                wake_lock_state === 'active'
                  ? styles.wakeActive
                  : styles.wakeUnavailable
              }
            >
              {wake_lock_state === 'active'
                ? 'SCREEN AWAKE ✓'
                : wake_lock_state === 'unavailable'
                  ? 'WAKE LOCK UNAVAILABLE'
                  : 'KEEPING SCREEN AWAKE…'}
            </small>
          )}
        </div>
      </section>

      <section className={styles.sessionMeta}>
        <div>
          <span>Training date</span>
          <strong>{format_local_date_display(workout.session.session_date_local)}</strong>
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
              : workout.session.source_start_text ?? 'Not recorded'}
          </strong>
        </div>
      </section>

      <ReadinessPanel
        completed_session_id={workout.session.id}
        readiness={workout.readiness}
        recovery_prompt={workout.recovery_prompt}
      />

      {pairing_prompt && workout.session.status !== 'completed' && (
        <section className={styles.pairingPrompt}>
          <div className={styles.pairingPromptCopy}>
            <span>
              {pairing_prompt.catching_up ? 'PAIR CATCH-UP' : 'PAIRED NEXT'}
            </span>
            <strong>
              {pairing_prompt.target_label} · {pairing_prompt.target_name}
            </strong>
            <small>Set {pairing_prompt.target_next_set} is recommended next</small>
          </div>

          <div className={styles.pairingPromptActions}>
            <button
              type="button"
              className={styles.pairingGo}
              onClick={() => {
                setOpenExerciseId(pairing_prompt.target_exercise_id)
                setPairingPrompt(null)
              }}
            >
              {pairing_prompt.catching_up
                ? `CONTINUE ${pairing_prompt.target_label}`
                : `GO TO ${pairing_prompt.target_label}`}
            </button>

            {!pairing_prompt.catching_up && (
              <button
                type="button"
                onClick={() => {
                  setOpenExerciseId(pairing_prompt.source_exercise_id)
                  setPairingPrompt(null)
                }}
              >
                MACHINE BUSY · STAY HERE
              </button>
            )}

            <button
              type="button"
              onClick={() => setPairingPrompt(null)}
            >
              I'LL CHOOSE
            </button>
          </div>
        </section>
      )}

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
            const completed_sets = sets.filter(is_training_set_completed).length
            const planned_count =
              planned_sets.length ||
              exercise.target_sets ||
              Math.max(sets.length, 1)
            const all_sets_complete =
              planned_count > 0 && completed_sets >= planned_count
            const exercise_complete = is_session_exercise_completed(
              exercise,
              workout.session,
            )
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
                  onClick={() => manual_open_exercise(exercise.id, is_open)}
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
                    {exercise_complete
                      ? 'COMPLETE ✓'
                      : all_sets_complete
                        ? 'RATE EXERCISE'
                        : is_rotation_exercise_lagging(
                              rotation_progress,
                              exercise.id,
                            )
                          ? `PAIR DUE · ${completed_sets}/${planned_count}`
                          : completed_sets > 0
                            ? `${completed_sets}/${planned_count} DONE`
                            : 'LOG SETS'}
                  </span>
                </button>

                {is_open && (
                  <div className={styles.loggerPanel}>
                    {workout.session.status !== 'completed' && (
                      <>
                        {entry.planned_exercise_id &&
                          entry.planned_exercise_id !== exercise.exercise_id && (
                            <div className={styles.substitutedBadge}>
                              <span>SUBSTITUTED TODAY</span>
                              <strong>
                                Planned: {entry.planned_exercise_name ?? 'Original exercise'}
                              </strong>
                            </div>
                          )}

                        {sets.length === 0 && (
                          <div className={styles.substitutionPanel}>
                            <button
                              type="button"
                              className={styles.substitutionToggle}
                              onClick={() => {
                                const opening =
                                  substitution_open_id !== exercise.id
                                setSubstitutionOpenId(
                                  opening ? exercise.id : null,
                                )
                                setSubstitutionTargetId('')
                                setSubstitutionScope('today')
                              }}
                            >
                              {substitution_open_id === exercise.id
                                ? 'CLOSE CHANGE EXERCISE'
                                : 'CHANGE EXERCISE'}
                            </button>

                            {substitution_open_id === exercise.id && (
                              <div className={styles.substitutionEditor}>
                                <label>
                                  <span>REPLACEMENT</span>
                                  <select
                                    value={substitution_target_id}
                                    onChange={(event) =>
                                      setSubstitutionTargetId(event.target.value)
                                    }
                                  >
                                    <option value="">Choose exercise…</option>
                                    {active_exercises
                                      .filter(
                                        (candidate) =>
                                          candidate.id !== exercise.exercise_id,
                                      )
                                      .map((candidate) => (
                                        <option
                                          key={candidate.id}
                                          value={candidate.id}
                                        >
                                          {candidate.canonical_name}
                                          {candidate.category
                                            ? ` · ${candidate.category}`
                                            : ''}
                                        </option>
                                      ))}
                                  </select>
                                </label>

                                <div
                                  className={styles.substitutionScopes}
                                  role="group"
                                  aria-label="Substitution scope"
                                >
                                  {(
                                    [
                                      ['today', 'TODAY'],
                                      ['week', 'THIS WEEK'],
                                      ['programme', 'PROGRAMME'],
                                    ] as const
                                  ).map(([value, label]) => (
                                    <button
                                      type="button"
                                      key={value}
                                      className={
                                        substitution_scope === value
                                          ? styles.substitutionScopeActive
                                          : undefined
                                      }
                                      onClick={() =>
                                        setSubstitutionScope(value)
                                      }
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>

                                <small>
                                  Today changes only this live workout. Week /
                                  Programme also change matching future planned
                                  exercises; the original prescription remains
                                  traceable.
                                </small>

                                <button
                                  type="button"
                                  className={styles.substitutionApply}
                                  disabled={
                                    !substitution_target_id || substituting
                                  }
                                  onClick={() =>
                                    void apply_exercise_substitution(exercise.id)
                                  }
                                >
                                  {substituting
                                    ? 'CHANGING…'
                                    : 'USE REPLACEMENT'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <PreviousComparablePanel
                          previous={entry.previous_comparable}
                          current_name={exercise.exercise_name_snapshot}
                        />
                        <ProgressionSuggestionPanel
                          suggestion={entry.progression_suggestion}
                        />
                      </>
                    )}

                    <div className={styles.loadUnitBar}>
                      <div>
                        <span>WEIGHT ENTRY</span>
                        <small>Remembered per exercise · totals stay in kg</small>
                      </div>
                      <div
                        className={styles.loadUnitToggle}
                        role="group"
                        aria-label="Weight entry unit"
                      >
                        <button
                          type="button"
                          className={
                            (load_unit_by_exercise[exercise.exercise_id] ?? 'kg') ===
                            'kg'
                              ? styles.loadUnitActive
                              : undefined
                          }
                          onClick={() =>
                            change_exercise_load_unit(exercise.exercise_id, 'kg')
                          }
                        >
                          KG
                        </button>
                        <button
                          type="button"
                          className={
                            load_unit_by_exercise[exercise.exercise_id] === 'lb'
                              ? styles.loadUnitActive
                              : undefined
                          }
                          onClick={() =>
                            change_exercise_load_unit(exercise.exercise_id, 'lb')
                          }
                        >
                          LBS
                        </button>
                      </div>
                    </div>

                    {set_numbers.map((set_number) => {
                      const planned_set =
                        planned_sets.find(
                          (detail) => detail.set.set_number === set_number,
                        ) ?? null
                      const actual_set =
                        sets.find((set) => set.set_number === set_number) ?? null
                      const previous_set =
                        set_number > 1
                          ? sets.find(
                              (set) => set.set_number === set_number - 1,
                            ) ?? null
                          : null
                      const locked =
                        set_number > 1 &&
                        (previous_set === null ||
                          !is_training_set_completed(previous_set))
                      const load_prefill = select_set_load_prefill({
                        existing_set: actual_set,
                        programmed_load_kg:
                          planned_set?.set.target_load_kg ?? null,
                        previous: entry.previous_comparable,
                        progression: entry.progression_suggestion,
                        set_number,
                      })

                      return (
                        <SetLoggerRow
                          key={set_number}
                          exercise={exercise}
                          set_number={set_number}
                          planned_set={planned_set}
                          actual_set={actual_set}
                          actual_components={
                            actual_set
                              ? entry.set_components_by_set_id[actual_set.id] ?? []
                              : []
                          }
                          initial_load_kg={load_prefill.load_kg}
                          load_prefill_source={load_prefill.source}
                          load_unit={
                            load_unit_by_exercise[exercise.exercise_id] ?? 'kg'
                          }
                          locked={locked}
                          allow_correction={
                            workout.session.status === 'completed'
                          }
                          on_corrected={refresh_workout}
                          on_complete={async () => {
                            const recommendation =
                              set_number < planned_count
                                ? pairing_recommendation(exercise.id, true)
                                : null

                            if (set_number < planned_count) {
                              begin_rest(exercise)
                            }

                            await refresh_workout()

                            if (recommendation) {
                              follow_pairing_recommendation(recommendation)
                            }
                          }}
                        />
                      )
                    })}

                    {exercise_complete ? (
                      <CompletedExerciseSummary metrics={metrics} />
                    ) : all_sets_complete ? (
                      <ExerciseScoringPanel
                        exercise={exercise}
                        metrics={metrics}
                        on_complete={async () => {
                          const recommendation =
                            pairing_recommendation(exercise.id, false)
                          await refresh_workout()

                          if (recommendation) {
                            follow_pairing_recommendation(recommendation)
                          }
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {rest_timer && workout.session.status !== 'completed' && (
        <RestTimerPanel
          timer={rest_timer}
          now_ms={rest_now_ms}
          on_change={(timer) => {
            setRestNowMs(Date.now())
            setRestTimer(timer)
          }}
          on_skip={() => setRestTimer(null)}
        />
      )}

      {workout.session.status === 'completed' ? (
        <section className={styles.workoutSummary}>
          <div className={styles.summaryHeader}>
            <div>
              <span>WORKOUT COMPLETE</span>
              <h2>Session summary</h2>
            </div>
            <strong>✓</strong>
          </div>

          <div className={styles.summaryGrid}>
            <div className={styles.volumeSummary}>
              <span>TOTAL VOLUME</span>
              <strong>{format_volume(workout.summary.total_volume_kg)} kg</strong>
              <small>Comparable completed resistance work</small>
            </div>
            <div>
              <span>DURATION</span>
              <strong>{format_duration(workout.summary.duration_seconds)}</strong>
            </div>
            <div>
              <span>COMPLETED SETS</span>
              <strong>{workout.summary.completed_sets}</strong>
            </div>
            <div>
              <span>EXERCISES</span>
              <strong>{workout.summary.exercise_count}</strong>
            </div>
          </div>
        </section>
      ) : all_exercises_complete ? (
        <section className={styles.finishPanel}>
          <div>
            <span>ALL EXERCISES COMPLETE</span>
            <h2>Finish this workout</h2>
            <p>
              This locks the session finish time and calculates the final
              comparable training volume.
            </p>
          </div>
          <button
            type="button"
            disabled={finishing}
            onClick={() => void finish_workout()}
          >
            {finishing ? 'FINISHING…' : 'FINISH WORKOUT'}
          </button>
        </section>
      ) : null}

      {workout.session.status === 'completed' && (
        <RecoveryPanel
          completed_session_id={workout.session.id}
          readiness={workout.readiness}
        />
      )}
    </div>
  )
}
