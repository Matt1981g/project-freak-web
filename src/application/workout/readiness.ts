import type { ReadinessEntry } from '../../domain/models'
import type { ReadinessRepository } from '../../data/repositories/contracts'

export interface SaveReadinessInput {
  completed_session_id: string
  bodyweight_kg: number | null
  sleep_duration_minutes: number | null
  sleep_score: number | null
  energy_pre: number | null
  motivation_pre: number | null
  soreness_score: number | null
  soreness_notes: string | null
  joint_issue_present: boolean | null
  joint_issue_notes: string | null
  pre_workout_nutrition: string | null
  intra_workout_nutrition: string | null
  intra_hydration_ml: number | null
  notes: string | null
}

export interface SaveReadinessContext {
  device_id: string
  now_iso: string
  id_factory?: () => string
}

function validate_range(
  value: number | null,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (value === null) return
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  }
}

function clean_text(value: string | null): string | null {
  const cleaned = value?.trim() ?? ''
  return cleaned === '' ? null : cleaned
}

export async function save_session_readiness(
  input: SaveReadinessInput,
  repository: ReadinessRepository,
  context: SaveReadinessContext,
): Promise<ReadinessEntry> {
  validate_range(input.bodyweight_kg, 20, 400, 'Bodyweight')
  validate_range(input.sleep_duration_minutes, 0, 1440, 'Sleep duration')
  validate_range(input.sleep_score, 0, 100, 'Sleep score')
  validate_range(input.energy_pre, 1, 10, 'Energy')
  validate_range(input.motivation_pre, 1, 10, 'Motivation')
  validate_range(input.soreness_score, 1, 10, 'Soreness')
  validate_range(input.intra_hydration_ml, 0, 10000, 'Hydration')

  const existing = await repository.get_by_session_id(
    input.completed_session_id,
  )
  const make_id = context.id_factory ?? (() => crypto.randomUUID())

  const entry: ReadinessEntry = {
    id: existing?.id ?? make_id(),
    created_at: existing?.created_at ?? context.now_iso,
    updated_at: context.now_iso,
    deleted_at: null,
    revision: existing ? existing.revision + 1 : 1,
    device_id: context.device_id,
    source_kind: 'user',
    source_id: null,
    completed_session_id: input.completed_session_id,
    bodyweight_kg: input.bodyweight_kg,
    sleep_duration_minutes: input.sleep_duration_minutes,
    sleep_score: input.sleep_score,
    energy_pre: input.energy_pre,
    motivation_pre: input.motivation_pre,
    soreness_score: input.soreness_score,
    soreness_notes: clean_text(input.soreness_notes),
    joint_issue_present: input.joint_issue_present,
    joint_issue_notes: clean_text(input.joint_issue_notes),
    pre_workout_nutrition: clean_text(input.pre_workout_nutrition),
    intra_workout_nutrition: clean_text(input.intra_workout_nutrition),
    intra_hydration_ml: input.intra_hydration_ml,
    post_workout_intake: existing?.post_workout_intake ?? null,
    session_fatigue: existing?.session_fatigue ?? null,
    breathlessness: existing?.breathlessness ?? null,
    energy_stability: existing?.energy_stability ?? null,
    notes: clean_text(input.notes),
  }

  await repository.put(entry)
  return entry
}
