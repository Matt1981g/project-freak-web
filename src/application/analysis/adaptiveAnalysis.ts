import type { RepositoryBundle } from '../../data/repositories/contracts'
import type {
  AdaptiveDeloadAnalysis,
  MuscleAnalysisRow,
  UnderperformanceAnalysis,
  UnderperformanceSignal,
  WeeklyTrainingAnalysis,
} from './analysisTypes'
import {
  load_muscle_mapping_catalogue,
  resolve_exercise_muscle_targets,
} from './muscleMapping'
import { load_exercise_history } from '../history/exerciseHistory'
import { build_exercise_progression } from './exerciseProgression'

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function unique_signal(
  signals: UnderperformanceSignal[],
  signal: UnderperformanceSignal,
) {
  if (
    signals.some(
      (existing) =>
        existing.code === signal.code &&
        existing.exercise_id === signal.exercise_id &&
        existing.label === signal.label,
    )
  ) {
    return
  }
  signals.push(signal)
}

export function build_adaptive_deload_analysis(
  signals: readonly UnderperformanceSignal[],
  evidence: {
    completed_sessions: number
    scored_exercises: number
    recovery_samples: number
  },
): AdaptiveDeloadAnalysis {
  const high = signals.filter((signal) => signal.severity === 'high').length
  const moderate = signals.length - high
  const score = high * 3 + moderate

  const confidence: AdaptiveDeloadAnalysis['confidence'] =
    evidence.completed_sessions >= 4 &&
    (evidence.scored_exercises >= 6 || evidence.recovery_samples >= 4)
      ? 'high'
      : evidence.completed_sessions >= 2
        ? 'moderate'
        : 'low'

  if (evidence.completed_sessions < 2 && high === 0) {
    return {
      recommendation: 'insufficient_evidence',
      score,
      confidence,
      reasons: [
        'Fewer than two completed sessions are available for a reliable fatigue decision.',
      ],
    }
  }

  const reasons = signals
    .slice()
    .sort((left, right) =>
      left.severity === right.severity ? 0 : left.severity === 'high' ? -1 : 1,
    )
    .slice(0, 5)
    .map((signal) => `${signal.label}: ${signal.detail}`)

  if (high >= 2 || score >= 7) {
    return {
      recommendation: 'deload',
      score,
      confidence,
      reasons:
        reasons.length > 0
          ? reasons
          : ['Multiple high-cost recovery signals are present.'],
    }
  }

  if (score >= 4) {
    return {
      recommendation: 'reduce_volume',
      score,
      confidence,
      reasons,
    }
  }

  if (score >= 2) {
    return {
      recommendation: 'reduce_fatigue',
      score,
      confidence,
      reasons,
    }
  }

  return {
    recommendation: 'continue',
    score,
    confidence,
    reasons: [
      'No repeated performance or recovery breakdown is currently detected.',
    ],
  }
}

export async function load_adaptive_training_analysis(
  repositories: RepositoryBundle,
  current_week: WeeklyTrainingAnalysis,
  muscles: MuscleAnalysisRow[],
): Promise<{
  muscles: MuscleAnalysisRow[]
  underperformance: UnderperformanceAnalysis
  deload: AdaptiveDeloadAnalysis
}> {
  const sessions = (
    await repositories.sessions.list_sessions_descending()
  ).filter(
    (session) =>
      session.status === 'completed' &&
      session.session_date_local >= current_week.week_start_local &&
      session.session_date_local <= current_week.week_end_local,
  )
  const signals: UnderperformanceSignal[] = []
  const exercise_ids = new Set<string>()
  const readiness_entries = []

  for (const session of sessions) {
    const [session_exercises, readiness] = await Promise.all([
      repositories.sessions.list_session_exercises(session.id),
      repositories.readiness.get_by_session_id(session.id),
    ])
    for (const exercise of session_exercises) exercise_ids.add(exercise.exercise_id)
    if (readiness) readiness_entries.push(readiness)
  }

  const [exercise_definitions, catalogue] = await Promise.all([
    repositories.exercises.list_all(),
    load_muscle_mapping_catalogue(
      repositories.exercises,
      repositories.settings,
    ),
  ])
  const exercise_by_id = new Map(
    exercise_definitions.map((exercise) => [exercise.id, exercise]),
  )
  const regression_count_by_muscle = new Map<string, number>()

  for (const exercise_id of exercise_ids) {
    const history = await load_exercise_history(
      exercise_id,
      repositories.exercises,
      repositories.sessions,
    )
    if (!history) continue

    const progression = build_exercise_progression(history)
    const latest = progression.latest
    if (
      !latest ||
      latest.session_date_local < current_week.week_start_local ||
      latest.session_date_local > current_week.week_end_local ||
      latest.verdict !== 'regressed'
    ) {
      continue
    }

    const definition = exercise_by_id.get(exercise_id)
    const targets = definition
      ? resolve_exercise_muscle_targets(definition, catalogue)
      : []
    const target_muscles = targets.map((target) => target.area)

    for (const muscle of new Set(target_muscles)) {
      regression_count_by_muscle.set(
        muscle,
        (regression_count_by_muscle.get(muscle) ?? 0) + 1,
      )
    }

    unique_signal(signals, {
      code: 'exercise_regression',
      severity: 'moderate',
      label: `${history.exercise.canonical_name} regressed`,
      detail: latest.reason,
      muscles: [...new Set(target_muscles)],
      exercise_id,
    })
  }

  const affected = new Set<string>()
  let recovery_samples = 0
  const fatigue: number[] = []
  const energy: number[] = []

  for (const readiness of readiness_entries) {
    if (readiness.session_fatigue !== null) fatigue.push(readiness.session_fatigue)
    if (readiness.energy_pre !== null) energy.push(readiness.energy_pre)

    for (const rating of readiness.muscle_recovery ?? []) {
      recovery_samples += 1
      if (rating.status === 'performance_affected') {
        affected.add(rating.muscle)
      }
    }
  }

  for (const muscle of affected) {
    unique_signal(signals, {
      code: 'recovery_performance_affected',
      severity: 'high',
      label: `${muscle} recovery affected performance`,
      detail:
        'The next-session recovery check reported that soreness or fatigue was affecting performance.',
      muscles: [muscle as MuscleAnalysisRow['muscle']],
      exercise_id: null,
    })
  }

  const avg_fatigue = average(fatigue)
  if (avg_fatigue !== null && avg_fatigue >= 8.5) {
    unique_signal(signals, {
      code: 'high_session_fatigue',
      severity: 'high',
      label: 'Session fatigue is very high',
      detail: `Average recorded session fatigue is ${avg_fatigue.toFixed(1)}/10.`,
      muscles: [],
      exercise_id: null,
    })
  } else if (avg_fatigue !== null && avg_fatigue >= 7.5) {
    unique_signal(signals, {
      code: 'elevated_session_fatigue',
      severity: 'moderate',
      label: 'Session fatigue is elevated',
      detail: `Average recorded session fatigue is ${avg_fatigue.toFixed(1)}/10.`,
      muscles: [],
      exercise_id: null,
    })
  }

  const avg_energy = average(energy)
  if (avg_energy !== null && avg_energy <= 5) {
    unique_signal(signals, {
      code: 'low_pre_session_energy',
      severity: 'moderate',
      label: 'Pre-session energy is low',
      detail: `Average recorded energy is ${avg_energy.toFixed(1)}/10.`,
      muscles: [],
      exercise_id: null,
    })
  }

  if (current_week.form.value !== null && current_week.form.value < 7) {
    unique_signal(signals, {
      code: 'low_form',
      severity: 'high',
      label: 'Execution quality has fallen',
      detail: `Average Form is ${current_week.form.value.toFixed(1)}/10.`,
      muscles: [],
      exercise_id: null,
    })
  } else if (current_week.form.value !== null && current_week.form.value < 8) {
    unique_signal(signals, {
      code: 'form_watch',
      severity: 'moderate',
      label: 'Execution quality needs watching',
      detail: `Average Form is ${current_week.form.value.toFixed(1)}/10.`,
      muscles: [],
      exercise_id: null,
    })
  }

  if (
    current_week.working_sets >= 8 &&
    current_week.failure_sets / current_week.working_sets >= 0.35
  ) {
    unique_signal(signals, {
      code: 'high_failure_density',
      severity: 'moderate',
      label: 'Failure exposure is high',
      detail: `${current_week.failure_sets} of ${current_week.working_sets} working sets reached recorded failure.`,
      muscles: [],
      exercise_id: null,
    })
  }

  const high_count = signals.filter((signal) => signal.severity === 'high').length
  const moderate_count = signals.length - high_count
  const status: UnderperformanceAnalysis['status'] =
    high_count > 0 || moderate_count >= 2
      ? 'flagged'
      : moderate_count === 1
        ? 'watch'
        : 'clear'

  const updated_muscles = muscles.map((muscle) => ({
    ...muscle,
    underperformance_exercises:
      regression_count_by_muscle.get(muscle.muscle) ?? 0,
  }))

  const underperformance: UnderperformanceAnalysis = {
    status,
    signals,
    regressed_exercises: signals.filter(
      (signal) => signal.code === 'exercise_regression',
    ).length,
    performance_affected_recoveries: affected.size,
  }

  return {
    muscles: updated_muscles,
    underperformance,
    deload: build_adaptive_deload_analysis(signals, {
      completed_sessions: current_week.completed_sessions,
      scored_exercises: current_week.form.samples,
      recovery_samples,
    }),
  }
}
