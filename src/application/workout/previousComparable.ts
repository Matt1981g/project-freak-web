import type {
  ExerciseMetrics,
  TrainingSet,
} from '../../domain/models'
import type { ExerciseHistoryResult } from '../history/exerciseHistory'
import { is_training_set_completed } from '../../domain/rules/completion'

export interface PreviousComparableSet {
  set_number: number
  load_kg: number | null
  completed_reps: number | null
  failure_status: TrainingSet['failure_status']
  volume_kg: number | null
}

export interface PreviousComparablePerformance {
  session_id: string
  session_date_local: string
  source_exercise_name: string
  sets: PreviousComparableSet[]
  metrics: ExerciseMetrics | undefined
  total_volume_kg: number
}

function is_comparable_set(set: TrainingSet): boolean {
  return (
    is_training_set_completed(set) &&
    set.structure_type === 'straight' &&
    set.rep_mode === 'total' &&
    set.load_type === 'normal'
  )
}

export function select_previous_comparable(
  history: ExerciseHistoryResult,
  current_session_id: string,
  current_session_date_local: string,
): PreviousComparablePerformance | null {
  for (const entry of history.entries) {
    if (entry.session.id === current_session_id) continue
    if (entry.session.status !== 'completed') continue
    if (entry.session.session_date_local > current_session_date_local) continue

    for (const appearance of entry.appearances) {
      const sets = appearance.sets
        .filter(is_comparable_set)
        .sort((a, b) => a.set_number - b.set_number)

      if (sets.length === 0) continue

      return {
        session_id: entry.session.id,
        session_date_local: entry.session.session_date_local,
        source_exercise_name:
          appearance.session_exercise.exercise_name_snapshot,
        sets: sets.map((set) => ({
          set_number: set.set_number,
          load_kg: set.load_kg,
          completed_reps: set.completed_reps,
          failure_status: set.failure_status,
          volume_kg: set.set_load_kg_reps,
        })),
        metrics: appearance.metrics,
        total_volume_kg: sets.reduce(
          (total, set) => total + (set.set_load_kg_reps ?? 0),
          0,
        ),
      }
    }
  }

  return null
}
