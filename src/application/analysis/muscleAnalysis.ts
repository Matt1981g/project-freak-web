import type {
  ExerciseMetrics,
  MuscleRecoveryStatus,
  TrainingSet,
} from '../../domain/models'
import type { RepositoryBundle } from '../../data/repositories/contracts'
import { is_training_set_completed } from '../../domain/rules/completion'
import type {
  MetricAverage,
  MuscleAnalysisRow,
  MuscleMappingCoverage,
} from './analysisTypes'
import {
  load_muscle_mapping_catalogue,
  resolve_exercise_muscle_targets,
} from './muscleMapping'
import type {
  TrainingPriorityState,
  TrainingPriorityArea,
} from '../priorities/trainingPriorities'

interface MutableMuscleRow {
  muscle: TrainingPriorityArea
  priority: number
  intent: MuscleAnalysisRow['intent']
  direct_sets: number
  secondary_sets: number
  weighted_sets: number
  sessions: Set<string>
  failure_exposure_sets: number
  rpe: number[]
  pump: number[]
  form: number[]
  recovery: MuscleRecoveryStatus[]
  underperformance_exercises: number
}

function average(values: readonly number[]): MetricAverage {
  if (values.length === 0) return { value: null, samples: 0 }
  return {
    value: values.reduce((total, value) => total + value, 0) / values.length,
    samples: values.length,
  }
}

function is_completed_work_set(set: TrainingSet): boolean {
  return (
    set.deleted_at === null &&
    set.set_role === 'work' &&
    is_training_set_completed(set)
  )
}

function failed(set: TrainingSet): boolean {
  return (
    set.failure_status !== 'none' ||
    (set.left_failure_status !== null &&
      set.left_failure_status !== 'none') ||
    (set.right_failure_status !== null &&
      set.right_failure_status !== 'none')
  )
}

function collect_metrics(row: MutableMuscleRow, metrics: ExerciseMetrics | undefined) {
  if (!metrics || metrics.deleted_at !== null) return
  if (metrics.rpe !== null) row.rpe.push(metrics.rpe)
  if (metrics.pump !== null) row.pump.push(metrics.pump)
  if (metrics.form !== null) row.form.push(metrics.form)
}

const RECOVERY_RANK: Record<MuscleRecoveryStatus, number> = {
  fresh: 0,
  mild_soreness: 1,
  sore: 2,
  performance_affected: 3,
}

function worst_recovery(
  values: readonly MuscleRecoveryStatus[],
): MuscleRecoveryStatus | null {
  if (values.length === 0) return null
  return [...values].sort(
    (left, right) => RECOVERY_RANK[right] - RECOVERY_RANK[left],
  )[0]
}

export async function load_current_week_muscle_analysis(
  repositories: RepositoryBundle,
  week_start_local: string,
  week_end_local: string,
  priorities: TrainingPriorityState,
): Promise<{
  muscles: MuscleAnalysisRow[]
  mapping_coverage: MuscleMappingCoverage
}> {
  const rows = new Map<TrainingPriorityArea, MutableMuscleRow>()

  for (const [index, muscle] of priorities.current.entries()) {
    rows.set(muscle, {
      muscle,
      priority: index + 1,
      intent: priorities.intent_by_area[muscle],
      direct_sets: 0,
      secondary_sets: 0,
      weighted_sets: 0,
      sessions: new Set<string>(),
      failure_exposure_sets: 0,
      rpe: [],
      pump: [],
      form: [],
      recovery: [],
      underperformance_exercises: 0,
    })
  }

  const [sessions, exercises, catalogue] = await Promise.all([
    repositories.sessions.list_sessions_descending(),
    repositories.exercises.list_all(),
    load_muscle_mapping_catalogue(repositories.exercises),
  ])
  const exercise_by_id = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const completed = sessions.filter(
    (session) =>
      session.status === 'completed' &&
      session.session_date_local >= week_start_local &&
      session.session_date_local <= week_end_local,
  )

  const explicit_ids = new Set<string>()
  const fallback_ids = new Set<string>()
  const unmapped_ids = new Set<string>()

  for (const session of completed) {
    const session_exercises =
      await repositories.sessions.list_session_exercises(session.id)

    for (const appearance of session_exercises) {
      const exercise = exercise_by_id.get(appearance.exercise_id)
      if (!exercise) {
        unmapped_ids.add(appearance.exercise_id)
        continue
      }

      const sets = (
        await repositories.sessions.list_sets_for_session_exercise(appearance.id)
      ).filter(is_completed_work_set)
      if (sets.length === 0) continue

      const targets = resolve_exercise_muscle_targets(exercise, catalogue)
      if (targets.length === 0) {
        unmapped_ids.add(exercise.id)
        continue
      }

      if (targets.some((target) => target.source === 'explicit')) {
        explicit_ids.add(exercise.id)
        fallback_ids.delete(exercise.id)
      } else if (!explicit_ids.has(exercise.id)) {
        fallback_ids.add(exercise.id)
      }

      const metrics =
        await repositories.sessions.get_exercise_metrics(appearance.id)
      const failures = sets.filter(failed).length

      for (const target of targets) {
        const row = rows.get(target.area)
        if (!row) continue

        if (target.role === 'primary') {
          row.direct_sets += sets.length
        } else {
          row.secondary_sets += sets.length
        }
        row.weighted_sets += sets.length * target.allocation_weight
        row.sessions.add(session.id)
        row.failure_exposure_sets += failures
        collect_metrics(row, metrics)
      }
    }

    const readiness = await repositories.readiness.get_by_session_id(session.id)
    for (const rating of readiness?.muscle_recovery ?? []) {
      const row = rows.get(rating.muscle as TrainingPriorityArea)
      if (row) row.recovery.push(rating.status)
    }
  }

  return {
    muscles: [...rows.values()]
      .sort((left, right) => left.priority - right.priority)
      .map((row) => ({
        muscle: row.muscle,
        priority: row.priority,
        intent: row.intent,
        direct_sets: row.direct_sets,
        secondary_sets: row.secondary_sets,
        weighted_sets: Math.round(row.weighted_sets * 10) / 10,
        frequency: row.sessions.size,
        failure_exposure_sets: row.failure_exposure_sets,
        rpe: average(row.rpe),
        pump: average(row.pump),
        form: average(row.form),
        recovery_status: worst_recovery(row.recovery),
        recovery_samples: row.recovery.length,
        underperformance_exercises: row.underperformance_exercises,
      })),
    mapping_coverage: {
      explicit_exercises: explicit_ids.size,
      category_fallback_exercises: fallback_ids.size,
      unmapped_exercises: unmapped_ids.size,
    },
  }
}
