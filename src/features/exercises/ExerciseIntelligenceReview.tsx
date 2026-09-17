import { useMemo, useState } from 'react'
import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import { save_confirmed_exercise_intelligence } from '../../app/exerciseIntelligenceReviewService'
import styles from './ExerciseIntelligenceReview.module.css'
import { exercise_intelligence_schema, validate_exercise_intelligence } from '../../domain/rules/exerciseIntelligenceValidation'

const MECHANICS: ExerciseIntelligence['mechanic'][] = ['compound', 'isolation', 'isometric', 'mixed']
const LATERALITY: ExerciseIntelligence['laterality'][] = ['bilateral', 'unilateral', 'alternating', 'either']
const LENGTH_BIAS: ExerciseIntelligence['muscle_length_bias'][] = ['lengthened', 'midrange', 'shortened', 'mixed', 'variable', 'unknown']
const STABILITY: ExerciseIntelligence['stability_support'][] = ['low', 'moderate', 'high']
const DEMAND: ExerciseIntelligence['systemic_fatigue'][] = ['very_low', 'low', 'moderate', 'high', 'very_high']
const LOADING: ExerciseIntelligence['loading_potential'][] = ['low', 'moderate', 'high']
const PROGRESSION: ExerciseIntelligence['progression_reliability'][] = ['poor', 'good', 'excellent']
const ROLES: ExerciseIntelligence['hypertrophy_role'][] = ['primary', 'secondary', 'finisher', 'specialised']

function csv(values: readonly string[]): string {
  return values.join(', ')
}

function from_csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function pretty(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

interface ReviewCardProps {
  exercise: Exercise
  on_confirmed: () => Promise<void>
}

function ReviewCard({ exercise, on_confirmed }: ReviewCardProps) {
  const intelligence = exercise.exercise_intelligence
  const [draft, setDraft] = useState<ExerciseIntelligence | null>(intelligence ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!draft) return null

  function update<K extends keyof ExerciseIntelligence>(key: K, value: ExerciseIntelligence[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }

  async function confirm() {
    const candidate = draft
    if (!candidate) return

    setSaving(true)
    setError(null)
    try {
      await save_confirmed_exercise_intelligence(exercise.id, candidate)
      await on_confirmed()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm exercise intelligence.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className={styles.card}>
      <summary>
        <div>
          <strong>{exercise.canonical_name}</strong>
          <span>
            {Math.round(draft.metadata_confidence * 100)}% confidence · {draft.primary_muscles.join(', ') || 'No primary muscle'}
          </span>
        </div>
        <span className={styles.reviewBadge}>REVIEW</span>
      </summary>

      <div className={styles.proposal}>
        <div><span>Movement</span><strong>{draft.movement_pattern}</strong></div>
        <div><span>Family</span><strong>{draft.exercise_family}</strong></div>
        <div><span>Role</span><strong>{pretty(draft.hypertrophy_role)}</strong></div>
        <div><span>Grip / handle</span><strong>{draft.grip_or_handle || 'Not specified'}</strong></div>
      </div>

      <p className={styles.help}>
        PF has filled what it can. Correct anything that is wrong, then confirm it. If you need to inspect the machine first, close this card and leave it pending.
      </p>

      <div className={styles.formGrid}>
        <label className={styles.wideField}>
          <span>PRIMARY MUSCLES</span>
          <input
            value={csv(draft.primary_muscles)}
            onChange={(event) => update('primary_muscles', from_csv(event.target.value))}
            placeholder="e.g. Shoulders"
          />
        </label>
        <label className={styles.wideField}>
          <span>SECONDARY MUSCLES</span>
          <input
            value={csv(draft.secondary_muscles)}
            onChange={(event) => update('secondary_muscles', from_csv(event.target.value))}
            placeholder="e.g. Triceps, Traps"
          />
        </label>
        <label>
          <span>MOVEMENT PATTERN</span>
          <input value={draft.movement_pattern} onChange={(event) => update('movement_pattern', event.target.value)} />
        </label>
        <label>
          <span>EXERCISE FAMILY</span>
          <input value={draft.exercise_family} onChange={(event) => update('exercise_family', event.target.value)} />
        </label>
        <label>
          <span>GRIP / HANDLE</span>
          <input value={draft.grip_or_handle ?? ''} onChange={(event) => update('grip_or_handle', event.target.value || null)} placeholder="Optional" />
        </label>
        <label>
          <span>MECHANIC</span>
          <select value={draft.mechanic} onChange={(event) => update('mechanic', event.target.value as ExerciseIntelligence['mechanic'])}>
            {MECHANICS.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>LATERALITY</span>
          <select value={draft.laterality} onChange={(event) => update('laterality', event.target.value as ExerciseIntelligence['laterality'])}>
            {LATERALITY.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>MUSCLE-LENGTH BIAS</span>
          <select value={draft.muscle_length_bias} onChange={(event) => update('muscle_length_bias', event.target.value as ExerciseIntelligence['muscle_length_bias'])}>
            {LENGTH_BIAS.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>STABILITY SUPPORT</span>
          <select value={draft.stability_support} onChange={(event) => update('stability_support', event.target.value as ExerciseIntelligence['stability_support'])}>
            {STABILITY.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>SYSTEMIC FATIGUE</span>
          <select value={draft.systemic_fatigue} onChange={(event) => update('systemic_fatigue', event.target.value as ExerciseIntelligence['systemic_fatigue'])}>
            {DEMAND.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>LOCAL FATIGUE</span>
          <select value={draft.local_fatigue} onChange={(event) => update('local_fatigue', event.target.value as ExerciseIntelligence['local_fatigue'])}>
            {DEMAND.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>LOADING POTENTIAL</span>
          <select value={draft.loading_potential} onChange={(event) => update('loading_potential', event.target.value as ExerciseIntelligence['loading_potential'])}>
            {LOADING.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>PROGRESSION RELIABILITY</span>
          <select value={draft.progression_reliability} onChange={(event) => update('progression_reliability', event.target.value as ExerciseIntelligence['progression_reliability'])}>
            {PROGRESSION.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
        <label>
          <span>HYPERTROPHY ROLE</span>
          <select value={draft.hypertrophy_role} onChange={(event) => update('hypertrophy_role', event.target.value as ExerciseIntelligence['hypertrophy_role'])}>
            {ROLES.map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
        </label>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <span>Close the card to check later.</span>
        <button type="button" disabled={saving} onClick={() => void confirm()}>
          {saving ? 'CONFIRMING…' : 'CONFIRM INTELLIGENCE'}
        </button>
      </div>
    </details>
  )
}

interface Props {
  exercises: Exercise[]
  on_confirmed: () => Promise<void>
  validation_findings?: number
}

export function ExerciseIntelligenceReview({ exercises, on_confirmed, validation_findings = 0 }: Props) {
  const review = useMemo(
    () => exercises.filter((exercise) =>
      exercise.archived_at === null &&
      exercise.deleted_at === null &&
      exercise_intelligence_schema.safeParse(exercise.exercise_intelligence).success &&
      (exercise.exercise_intelligence?.metadata_status === 'needs_review' ||
       validate_exercise_intelligence(exercise.exercise_intelligence).length > 0),
    ),
    [exercises],
  )

  if (review.length === 0) {
    if (validation_findings > 0) return (
      <section className={styles.panel}>
        <strong>Exercise intelligence needs attention</strong>
        <p>See the validation findings in Library Integrity above. Existing confirmations are preserved.</p>
      </section>
    )
    return (
      <section className={styles.complete}>
        <div>
          <span className={styles.kicker}>🧬 EXERCISE INTELLIGENCE</span>
          <strong>Intelligence review complete</strong>
          <p>No active exercise currently needs manual intelligence review.</p>
        </div>
        <span className={styles.completeBadge}>0 REVIEW</span>
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>🧬 EXERCISE INTELLIGENCE REVIEW</span>
          <h2>{review.length} exercise{review.length === 1 ? '' : 's'} need your confirmation</h2>
          <p>Only uncertain records appear here. Confirmed records disappear from this queue and are protected from automatic replacement.</p>
        </div>
        <span className={styles.queueBadge}>{review.length} REVIEW</span>
      </div>
      <div className={styles.cards}>
        {review.map((exercise) => (
          <ReviewCard key={exercise.id} exercise={exercise} on_confirmed={on_confirmed} />
        ))}
      </div>
    </section>
  )
}
