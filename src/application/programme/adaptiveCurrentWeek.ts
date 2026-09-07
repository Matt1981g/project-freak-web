import type {
  CompletedSession,
  ExerciseMetrics,
  ProgrammedSessionSet,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
import type { RepositoryBundle } from '../../data/repositories/contracts'
import {
  kilograms_to_pounds,
  load_step_for_unit,
  pounds_to_kilograms,
  type WeightEntryUnit,
} from '../workout/weightUnits'
import { load_exercise_weight_unit_preferences } from '../workout/weightUnitPreferences'
import { is_training_set_completed } from '../../domain/rules/completion'

export type AdaptiveCurrentWeekVerdict =
  | 'increase_load'
  | 'add_reps'
  | 'hold_load'
  | 'insufficient_data'

export interface AdaptiveSetEvidence {
  set_number: number
  load_kg: number | null
  completed_reps: number | null
  target_rep_min: number | null
  target_rep_max: number | null
}

export interface AdaptiveCurrentWeekDecision {
  verdict: AdaptiveCurrentWeekVerdict
  label: 'INCREASE LOAD' | 'ADD REPS' | 'HOLD LOAD' | 'INSUFFICIENT DATA'
  reason: string
}

export interface AdaptiveCurrentWeekChange {
  programmed_session_id: string
  scheduled_date_local: string
  session_name: string
  exercise_id: string
  exercise_name: string
  set_number: number
  previous_load_kg: number | null
  target_load_kg: number
  verdict: Exclude<AdaptiveCurrentWeekVerdict, 'insufficient_data'>
  reason: string
}

export interface AdaptiveCurrentWeekResult {
  status: 'updated' | 'no_changes' | 'skipped' | 'error'
  source_session_id: string
  source_session_date_local: string
  reviewed_exercises: number
  reviewed_future_sessions: number
  changes: AdaptiveCurrentWeekChange[]
  message: string
}

export interface AdaptiveCurrentWeekContext {
  device_id: string
  now_iso: string
}

function week_end_local(date_local: string): string {
  const date = new Date(`${date_local}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return date_local
  const day = date.getUTCDay()
  const until_sunday = (7 - day) % 7
  date.setUTCDate(date.getUTCDate() + until_sunday)
  return date.toISOString().slice(0, 10)
}

function append_note(existing: string | null, note: string): string {
  return existing?.trim() ? `${existing.trim()}\n${note}` : note
}

function progression_marker(source_session_id: string): string {
  return `PF_ADAPTIVE_SOURCE:${source_session_id}`
}

function usable_target(set: AdaptiveSetEvidence): boolean {
  return set.target_rep_min !== null || set.target_rep_max !== null
}

export function decide_current_week_progression(
  metrics: Pick<ExerciseMetrics, 'form' | 'pump' | 'legacy_mmc'> | null,
  sets: readonly AdaptiveSetEvidence[],
): AdaptiveCurrentWeekDecision {
  if (!metrics || metrics.form === null) {
    return {
      verdict: 'insufficient_data',
      label: 'INSUFFICIENT DATA',
      reason: 'Form was not recorded, so the current week is not progressed automatically.',
    }
  }

  if (metrics.form <= 8) {
    return {
      verdict: 'hold_load',
      label: 'HOLD LOAD',
      reason:
        metrics.form === 8
          ? 'Form was 8/10. Keep the achieved load and improve execution before progressing.'
          : `Form was ${metrics.form}/10. Keep the achieved load and restore execution first.`,
    }
  }

  const sensation = metrics.pump ?? metrics.legacy_mmc
  if (sensation !== null && sensation <= 6) {
    return {
      verdict: 'hold_load',
      label: 'HOLD LOAD',
      reason: `Target-muscle sensation was ${sensation}/10. Keep load stable and improve stimulus first.`,
    }
  }

  const comparable = sets.filter(
    (set) =>
      set.load_kg !== null &&
      set.completed_reps !== null &&
      usable_target(set),
  )

  if (comparable.length === 0) {
    return {
      verdict: 'insufficient_data',
      label: 'INSUFFICIENT DATA',
      reason: 'No completed straight working sets have usable rep targets and load data.',
    }
  }

  if (
    comparable.some(
      (set) =>
        set.target_rep_min !== null &&
        set.completed_reps! < set.target_rep_min,
    )
  ) {
    return {
      verdict: 'add_reps',
      label: 'ADD REPS',
      reason: 'At least one comparable set was below the programmed rep range. Keep the achieved load and add reps first.',
    }
  }

  const all_have_upper = comparable.every(
    (set) => set.target_rep_max !== null,
  )
  const all_at_top =
    all_have_upper &&
    comparable.every(
      (set) => set.completed_reps! >= set.target_rep_max!,
    )

  if (all_at_top) {
    if (sensation === null) {
      return {
        verdict: 'hold_load',
        label: 'HOLD LOAD',
        reason: 'Top-of-range reps were achieved, but target-muscle sensation was not recorded. Hold load rather than guessing.',
      }
    }

    return {
      verdict: 'increase_load',
      label: 'INCREASE LOAD',
      reason: 'Form and target-muscle sensation were progression-valid and every comparable set reached the top of its rep range.',
    }
  }

  return {
    verdict: 'add_reps',
    label: 'ADD REPS',
    reason: 'Execution and stimulus are progression-valid. Keep the achieved load and add reps within the programmed range.',
  }
}

export function progressed_load_kg(
  load_kg: number,
  unit: WeightEntryUnit,
): number {
  if (unit === 'kg') {
    return Math.round((load_kg + load_step_for_unit('kg')) * 10000) / 10000
  }

  return pounds_to_kilograms(
    kilograms_to_pounds(load_kg) + load_step_for_unit('lb'),
  )
}

function actual_set_evidence(
  sets: readonly TrainingSet[],
  source_exercise: SessionExercise,
  programmed_sets: readonly ProgrammedSessionSet[],
): AdaptiveSetEvidence[] {
  const target_by_number = new Map(
    programmed_sets.map((set) => [set.set_number, set]),
  )

  return sets
    .filter(
      (set) =>
        set.deleted_at === null &&
        set.set_role === 'work' &&
        set.structure_type === 'straight' &&
        set.rep_mode === 'total' &&
        set.load_type === 'normal' &&
        is_training_set_completed(set),
    )
    .map((set) => {
      const target = target_by_number.get(set.set_number)
      return {
        set_number: set.set_number,
        load_kg: set.load_kg,
        completed_reps: set.completed_reps,
        target_rep_min:
          target?.target_rep_min ?? source_exercise.target_rep_min,
        target_rep_max:
          target?.target_rep_max ?? source_exercise.target_rep_max,
      }
    })
}

function source_actual_loads(
  sets: readonly TrainingSet[],
): Map<number, number> {
  return new Map(
    sets
      .filter(
        (set) =>
          set.deleted_at === null &&
          set.set_role === 'work' &&
          set.structure_type === 'straight' &&
          set.rep_mode === 'total' &&
          set.load_type === 'normal' &&
          is_training_set_completed(set) &&
          set.load_kg !== null,
      )
      .map((set) => [set.set_number, set.load_kg!] as const),
  )
}

function same_load(left: number | null, right: number): boolean {
  return left !== null && Math.abs(left - right) < 0.0001
}

export async function adapt_current_week_after_session(
  session: CompletedSession,
  repositories: RepositoryBundle,
  context: AdaptiveCurrentWeekContext,
): Promise<AdaptiveCurrentWeekResult> {
  const base: Omit<AdaptiveCurrentWeekResult, 'status' | 'message'> = {
    source_session_id: session.id,
    source_session_date_local: session.session_date_local,
    reviewed_exercises: 0,
    reviewed_future_sessions: 0,
    changes: [],
  }

  if (
    session.status !== 'completed' ||
    !session.programme_block_id ||
    !session.programmed_session_id
  ) {
    return {
      ...base,
      status: 'skipped',
      message: 'Adaptive current week only runs for completed programmed workouts.',
    }
  }

  if (!repositories.programme.put_programmed_session_set) {
    return {
      ...base,
      status: 'error',
      message: 'Programme set editing is not available in this database.',
    }
  }

  const end_date = week_end_local(session.session_date_local)
  const programmed_sessions =
    await repositories.programme.list_programmed_sessions_for_block(
      session.programme_block_id,
    )
  const future_sessions = programmed_sessions.filter(
    (future) =>
      future.status === 'planned' &&
      future.scheduled_date_local !== null &&
      future.scheduled_date_local > session.session_date_local &&
      future.scheduled_date_local <= end_date,
  )

  if (future_sessions.length === 0) {
    return {
      ...base,
      status: 'no_changes',
      message: 'No future planned sessions remain in this training week.',
    }
  }

  const source_detail =
    await repositories.programme.get_programmed_session_detail(
      session.programmed_session_id,
    )
  const source_exercises =
    await repositories.sessions.list_session_exercises(session.id)
  const unit_preferences =
    await load_exercise_weight_unit_preferences(repositories.settings)

  const source_programmed_by_id = new Map(
    source_detail?.exercises.map((detail) => [
      detail.exercise.id,
      detail,
    ]) ?? [],
  )

  const evidence_by_exercise = new Map<
    string,
    {
      source: SessionExercise
      decision: AdaptiveCurrentWeekDecision
      loads: Map<number, number>
    }
  >()

  for (const source of source_exercises) {
    const [sets, metrics] = await Promise.all([
      repositories.sessions.list_sets_for_session_exercise(source.id),
      repositories.sessions.get_exercise_metrics(source.id),
    ])
    const source_programmed =
      source.programmed_session_exercise_id === null
        ? undefined
        : source_programmed_by_id.get(source.programmed_session_exercise_id)
    const evidence = actual_set_evidence(
      sets,
      source,
      source_programmed?.sets.map((detail) => detail.set) ?? [],
    )
    const decision = decide_current_week_progression(metrics ?? null, evidence)
    base.reviewed_exercises += 1

    if (decision.verdict === 'insufficient_data') continue

    const loads = source_actual_loads(sets)
    if (loads.size === 0) continue

    evidence_by_exercise.set(source.exercise_id, {
      source,
      decision,
      loads,
    })
  }

  const changes: AdaptiveCurrentWeekChange[] = []
  let reviewed_future_sessions = 0

  for (const future of future_sessions) {
    const detail =
      await repositories.programme.get_programmed_session_detail(future.id)
    if (!detail) continue
    reviewed_future_sessions += 1

    for (const planned of detail.exercises) {
      const evidence = evidence_by_exercise.get(planned.exercise.exercise_id)
      if (!evidence) continue

      const unit =
        unit_preferences[planned.exercise.exercise_id] ?? 'kg'
      const marker = progression_marker(session.id)

      for (const set_detail of planned.sets) {
        const set = set_detail.set
        if (
          set.deleted_at !== null ||
          set.set_role !== 'work' ||
          set.structure_type !== 'straight' ||
          set.target_load_type !== 'normal' ||
          set.notes?.includes(marker)
        ) {
          continue
        }

        const actual_load = evidence.loads.get(set.set_number)
        if (actual_load === undefined) continue

        const desired_load =
          evidence.decision.verdict === 'increase_load'
            ? progressed_load_kg(actual_load, unit)
            : actual_load

        if (same_load(set.target_load_kg, desired_load)) continue

        const note =
          `Adaptive current week · ${session.session_date_local} · ${evidence.decision.label}: ${evidence.decision.reason}\n${marker}`
        const updated: ProgrammedSessionSet = {
          ...set,
          target_load_kg: desired_load,
          notes: append_note(set.notes, note),
          updated_at: context.now_iso,
          revision: set.revision + 1,
          device_id: context.device_id,
        }

        await repositories.programme.put_programmed_session_set(updated)
        changes.push({
          programmed_session_id: future.id,
          scheduled_date_local: future.scheduled_date_local!,
          session_name: future.name_snapshot,
          exercise_id: planned.exercise.exercise_id,
          exercise_name: planned.exercise.exercise_name_snapshot,
          set_number: set.set_number,
          previous_load_kg: set.target_load_kg,
          target_load_kg: desired_load,
          verdict: evidence.decision.verdict as Exclude<
            AdaptiveCurrentWeekVerdict,
            'insufficient_data'
          >,
          reason: evidence.decision.reason,
        })
      }
    }
  }

  if (changes.length === 0) {
    return {
      ...base,
      reviewed_future_sessions,
      status: 'no_changes',
      message:
        'The remaining week was reviewed, but no future load target needed changing.',
    }
  }

  return {
    ...base,
    reviewed_future_sessions,
    changes,
    status: 'updated',
    message: `${changes.length} future set target${changes.length === 1 ? '' : 's'} updated from live training evidence.`,
  }
}
