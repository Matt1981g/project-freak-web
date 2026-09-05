import { create_uuid } from '../../domain/ids/uuid'
import type {
  MuscleRecoveryRating,
  ReadinessEntry,
} from '../../domain/models'
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
  muscle_recovery?: MuscleRecoveryRating[]
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

export interface SaveRecoveryInput {
  completed_session_id: string
  post_workout_intake: string | null
  session_fatigue: number | null
  breathlessness: number | null
  energy_stability: number | null
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
  const make_id = context.id_factory ?? (() => create_uuid())

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
    muscle_recovery: input.muscle_recovery ?? existing?.muscle_recovery ?? [],
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


export async function save_session_recovery(
  input: SaveRecoveryInput,
  repository: ReadinessRepository,
  context: SaveReadinessContext,
): Promise<ReadinessEntry> {
  validate_range(input.session_fatigue, 1, 10, 'Session fatigue')
  validate_range(input.breathlessness, 1, 10, 'Breathlessness')
  validate_range(input.energy_stability, 1, 10, 'Energy stability')

  const existing = await repository.get_by_session_id(
    input.completed_session_id,
  )
  const make_id = context.id_factory ?? (() => create_uuid())

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
    bodyweight_kg: existing?.bodyweight_kg ?? null,
    sleep_duration_minutes: existing?.sleep_duration_minutes ?? null,
    sleep_score: existing?.sleep_score ?? null,
    energy_pre: existing?.energy_pre ?? null,
    motivation_pre: existing?.motivation_pre ?? null,
    soreness_score: existing?.soreness_score ?? null,
    soreness_notes: existing?.soreness_notes ?? null,
    muscle_recovery: existing?.muscle_recovery ?? [],
    joint_issue_present: existing?.joint_issue_present ?? null,
    joint_issue_notes: existing?.joint_issue_notes ?? null,
    pre_workout_nutrition: existing?.pre_workout_nutrition ?? null,
    intra_workout_nutrition: existing?.intra_workout_nutrition ?? null,
    intra_hydration_ml: existing?.intra_hydration_ml ?? null,
    post_workout_intake: clean_text(input.post_workout_intake),
    session_fatigue: input.session_fatigue,
    breathlessness: input.breathlessness,
    energy_stability: input.energy_stability,
    notes: existing?.notes ?? null,
  }

  await repository.put(entry)
  return entry
}
