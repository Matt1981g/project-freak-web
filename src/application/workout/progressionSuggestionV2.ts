import type { EquipmentSnapshot } from '../../domain/models'
import type { ExerciseHistoryResult } from '../history/exerciseHistory'
import { is_training_set_completed } from '../../domain/rules/completion'
import type { PreviousComparablePerformance } from './previousComparable'
import {
  assess_poor_machine_response,
  build_machine_response_profiles,
  equipment_progression_key,
  infer_progression_class,
  progression_fatigue_indicators,
  progression_rep_range,
  run_progress_engine_v2,
  type CurrentProgressionContext,
  type FatigueSessionEvidence,
  type ProgressEngineDecision,
  type ProgressionAdjustment,
  type ProgressionExposure,
  type ProgressionTarget,
} from './progressEngineV2'

export type ProgressionVerdict =
  | 'calibrate'
  | 'reset'
  | 'hold_load'
  | 'add_reps'
  | 'increase_load'
  | 'reduce_load'
  | 'deload_hold'
  | 'review'

export interface ProgressionSuggestion {
  verdict: ProgressionVerdict
  state: ProgressEngineDecision['state']
  label:
    | 'CALIBRATE'
    | 'RESET'
    | 'HOLD'
    | 'REPS UP'
    | 'LOAD UP'
    | 'LOAD DOWN'
    | 'DELOAD HOLD'
    | 'REVIEW'
  reason: string
  response_score: number | null
  quality_qualified: boolean
  high_quality: boolean
  adjustment: ProgressionAdjustment
  flags: string[]
}

export interface ProgressionSuggestionContext {
  history?: ExerciseHistoryResult | null
  current_session_id?: string
  current_session_date_local?: string
  exercise_id?: string
  exercise_name?: string
  exercise_category?: string | null
  exercise_equipment?: string | null
  gym_profile_id?: string | null
  equipment_snapshot?: EquipmentSnapshot | null
  rotation_group_key?: string | null
  programmed_session_exercise_id?: string | null
  deload_active?: boolean
}

function label_for_state(
  state: ProgressEngineDecision['state'],
): ProgressionSuggestion['label'] {
  switch (state) {
    case 'CALIBRATE':
      return 'CALIBRATE'
    case 'RESET':
      return 'RESET'
    case 'HOLD':
      return 'HOLD'
    case 'REPS_UP':
      return 'REPS UP'
    case 'LOAD_UP':
      return 'LOAD UP'
    case 'LOAD_DOWN':
      return 'LOAD DOWN'
    case 'DELOAD_HOLD':
      return 'DELOAD HOLD'
    case 'REVIEW':
      return 'REVIEW'
  }
}

function verdict_for_state(
  state: ProgressEngineDecision['state'],
): ProgressionVerdict {
  switch (state) {
    case 'CALIBRATE':
      return 'calibrate'
    case 'RESET':
      return 'reset'
    case 'HOLD':
      return 'hold_load'
    case 'REPS_UP':
      return 'add_reps'
    case 'LOAD_UP':
      return 'increase_load'
    case 'LOAD_DOWN':
      return 'reduce_load'
    case 'DELOAD_HOLD':
      return 'deload_hold'
    case 'REVIEW':
      return 'review'
  }
}

function default_context_name(
  previous: PreviousComparablePerformance | null,
  context: ProgressionSuggestionContext,
): string {
  return context.exercise_name ?? previous?.source_exercise_name ?? 'Exercise'
}

function build_current_context(
  previous: PreviousComparablePerformance | null,
  targets: readonly ProgressionTarget[],
  context: ProgressionSuggestionContext,
): CurrentProgressionContext {
  const exercise_name = default_context_name(previous, context)
  const target_rep_max =
    targets
      .map((target) => target.target_rep_max)
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? null
  const progression_class = infer_progression_class({
    exercise_name,
    category: context.exercise_category,
    equipment: context.exercise_equipment,
    target_rep_max,
  })
  const text =
    `${exercise_name} ${context.exercise_category ?? ''} ${context.exercise_equipment ?? ''}`.toLowerCase()

  return {
    exercise_id: context.exercise_id ?? 'legacy-exercise',
    exercise_name,
    progression_class,
    gym_profile_id:
      context.equipment_snapshot?.gym_profile_id ??
      context.gym_profile_id ??
      null,
    equipment_profile_id: context.equipment_snapshot?.profile_id ?? null,
    equipment_label: context.equipment_snapshot?.label ?? null,
    setup_notes: context.equipment_snapshot?.setup_notes ?? null,
    equipment_comparable:
      context.equipment_snapshot?.comparable ??
      (context.gym_profile_id !== undefined && context.gym_profile_id !== null),
    is_superset:
      context.rotation_group_key !== null &&
      context.rotation_group_key !== undefined,
    is_substitution: context.programmed_session_exercise_id === null,
    is_dumbbell: /dumbbell|db/.test(text),
    is_lower_body:
      /quad|hamstring|leg|squat|calf|glute|hip thrust|adductor|abductor/.test(
        text,
      ),
  }
}

function normalised_targets(
  targets: readonly ProgressionTarget[],
  current: CurrentProgressionContext,
  previous: PreviousComparablePerformance | null,
): ProgressionTarget[] {
  const fallback = progression_rep_range(current.progression_class).primary
  const source =
    targets.length > 0
      ? targets
      : (previous?.sets ?? []).map((set) => ({
          set_number: set.set_number,
          target_rep_min: null,
          target_rep_max: null,
        }))

  return source.map((target) => ({
    set_number: target.set_number,
    target_rep_min: target.target_rep_min ?? fallback[0],
    target_rep_max: target.target_rep_max ?? fallback[1],
  }))
}

function legacy_exposure(
  previous: PreviousComparablePerformance,
  current: CurrentProgressionContext,
): ProgressionExposure {
  return {
    id: `legacy:${previous.session_id}`,
    session_id: previous.session_id,
    session_date_local: previous.session_date_local,
    exercise_id: current.exercise_id,
    gym_profile_id: current.gym_profile_id,
    equipment_profile_id: current.equipment_profile_id,
    equipment_label: current.equipment_label,
    setup_notes: current.setup_notes,
    equipment_comparable: current.equipment_comparable,
    progression_class: current.progression_class,
    is_superset: current.is_superset,
    is_deload: false,
    is_substitution: false,
    sets: previous.sets.map((set) => ({
      set_number: set.set_number,
      load_kg: set.load_kg,
      completed_reps: set.completed_reps,
      failure_status: set.failure_status,
    })),
    metrics: {
      rpe: previous.metrics?.rpe ?? null,
      pump: previous.metrics?.pump ?? previous.metrics?.legacy_mmc ?? null,
      form: previous.metrics?.form ?? null,
    },
  }
}

function history_exposures(
  history: ExerciseHistoryResult,
  current: CurrentProgressionContext,
  context: ProgressionSuggestionContext,
): ProgressionExposure[] {
  const exposures: ProgressionExposure[] = []

  for (const entry of history.entries) {
    if (
      entry.session.deleted_at !== null ||
      entry.session.status !== 'completed'
    ) {
      continue
    }
    if (entry.session.id === context.current_session_id) continue
    if (
      context.current_session_date_local &&
      entry.session.session_date_local > context.current_session_date_local
    ) {
      continue
    }

    for (const appearance of entry.appearances) {
      const sets = appearance.sets
        .filter(
          (set) =>
            is_training_set_completed(set) &&
            set.set_role === 'work' &&
            set.structure_type === 'straight' &&
            set.rep_mode === 'total' &&
            set.load_type === 'normal',
        )
        .sort((left, right) => left.set_number - right.set_number)
        .map((set) => ({
          set_number: set.set_number,
          load_kg: set.load_kg,
          completed_reps: set.completed_reps,
          failure_status: set.failure_status,
        }))

      if (sets.length === 0) continue

      const snapshot = appearance.session_exercise.equipment_snapshot ?? null
      const note_text = [
        entry.session.notes,
        appearance.session_exercise.programme_notes,
        appearance.session_exercise.notes,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')

      exposures.push({
        id: appearance.session_exercise.id,
        session_id: entry.session.id,
        session_date_local: entry.session.session_date_local,
        exercise_id: appearance.session_exercise.exercise_id,
        gym_profile_id:
          snapshot?.gym_profile_id ?? entry.session.gym_profile_id ?? null,
        equipment_profile_id: snapshot?.profile_id ?? null,
        equipment_label: snapshot?.label ?? null,
        setup_notes: snapshot?.setup_notes ?? null,
        equipment_comparable: snapshot?.comparable ?? false,
        progression_class: current.progression_class,
        is_superset: appearance.session_exercise.rotation_group_key !== null,
        is_deload: /deload/i.test(note_text),
        is_substitution:
          appearance.session_exercise.programmed_session_exercise_id === null,
        sets,
        metrics: {
          rpe: appearance.metrics?.rpe ?? null,
          pump:
            appearance.metrics?.pump ??
            appearance.metrics?.legacy_mmc ??
            null,
          form: appearance.metrics?.form ?? null,
        },
      })
    }
  }

  return exposures
}

function fatigue_sessions(
  exposures: readonly ProgressionExposure[],
  targets: readonly ProgressionTarget[],
): FatigueSessionEvidence[] {
  const by_session = new Map<
    string,
    { session_date_local: string; indicators: Set<string> }
  >()

  for (const exposure of exposures) {
    if (exposure.is_deload) continue
    const current =
      by_session.get(exposure.session_id) ?? {
        session_date_local: exposure.session_date_local,
        indicators: new Set<string>(),
      }

    for (const indicator of progression_fatigue_indicators(exposure, targets)) {
      current.indicators.add(indicator)
    }
    by_session.set(exposure.session_id, current)
  }

  return [...by_session.entries()]
    .map(([session_id, value]) => ({
      session_id,
      session_date_local: value.session_date_local,
      indicators: [...value.indicators],
    }))
    .sort((left, right) =>
      left.session_date_local.localeCompare(right.session_date_local),
    )
}

export function build_progression_suggestion(
  previous: PreviousComparablePerformance | null,
  targets: readonly ProgressionTarget[],
  context: ProgressionSuggestionContext = {},
): ProgressionSuggestion {
  const current = build_current_context(previous, targets, context)
  const resolved_targets = normalised_targets(targets, current, previous)
  const exposures =
    context.history !== undefined && context.history !== null
      ? history_exposures(context.history, current, context)
      : previous
        ? [legacy_exposure(previous, current)]
        : []

  const result = run_progress_engine_v2({
    current,
    targets: resolved_targets,
    exposures,
    fatigue_sessions: fatigue_sessions(exposures, resolved_targets),
    deload_active: context.deload_active,
  })

  const profiles = build_machine_response_profiles(exposures, resolved_targets)
  const current_profile_key = equipment_progression_key({
    gym_profile_id: current.gym_profile_id,
    equipment_profile_id: current.equipment_profile_id,
    equipment_label: current.equipment_label,
    setup_notes: current.setup_notes,
  })
  const current_profile = profiles.find(
    (profile) => profile.key === current_profile_key,
  )
  const machine_assessment = current_profile
    ? assess_poor_machine_response(current_profile, profiles)
    : null
  const low_response = machine_assessment?.low_response === true

  return {
    verdict: verdict_for_state(result.state),
    state: result.state,
    label: label_for_state(result.state),
    reason: low_response
      ? `${result.reason} ${machine_assessment.reason}`
      : result.reason,
    response_score: result.response_score,
    quality_qualified: result.quality_qualified,
    high_quality: result.high_quality,
    adjustment: result.adjustment,
    flags: low_response
      ? [...result.flags, 'low_response_machine']
      : result.flags,
  }
}
