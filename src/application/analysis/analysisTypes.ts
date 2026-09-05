import type {
  MuscleTrainingIntent,
  TrainingPriorityArea,
} from '../priorities/trainingPriorities'
import type { MuscleRecoveryStatus } from '../../domain/models'

export interface MetricAverage {
  value: number | null
  samples: number
}

export interface WeeklyTrainingAnalysis {
  week_start_local: string
  week_end_local: string
  completed_sessions: number
  working_sets: number
  comparable_tonnage_kg: number
  failure_sets: number
  rpe: MetricAverage
  pump: MetricAverage
  form: MetricAverage
}

export interface MuscleAnalysisRow {
  muscle: TrainingPriorityArea
  priority: number
  intent: MuscleTrainingIntent
  direct_sets: number
  secondary_sets: number
  weighted_sets: number
  frequency: number
  failure_exposure_sets: number
  rpe: MetricAverage
  pump: MetricAverage
  form: MetricAverage
  recovery_status: MuscleRecoveryStatus | null
  recovery_samples: number
  underperformance_exercises: number
}

export interface MuscleMappingCoverage {
  explicit_exercises: number
  category_fallback_exercises: number
  unmapped_exercises: number
}

export type UnderperformanceSeverity = 'moderate' | 'high'

export interface UnderperformanceSignal {
  code: string
  severity: UnderperformanceSeverity
  label: string
  detail: string
  muscles: TrainingPriorityArea[]
  exercise_id: string | null
}

export interface UnderperformanceAnalysis {
  status: 'clear' | 'watch' | 'flagged'
  signals: UnderperformanceSignal[]
  regressed_exercises: number
  performance_affected_recoveries: number
}

export type DeloadRecommendation =
  | 'continue'
  | 'reduce_fatigue'
  | 'reduce_volume'
  | 'deload'
  | 'insufficient_evidence'

export interface AdaptiveDeloadAnalysis {
  recommendation: DeloadRecommendation
  score: number
  confidence: 'low' | 'moderate' | 'high'
  reasons: string[]
}

export interface AnalysisTrendMuscle {
  muscle: TrainingPriorityArea
  priority: number
  intent: MuscleTrainingIntent
  direct_sets: number
  secondary_sets: number
  weighted_sets: number
  frequency: number
  failure_exposure_sets: number
}

export interface AnalysisTrendWindow {
  weeks_requested: 4 | 8 | 12
  weeks_available: number
  from_date_local: string | null
  to_date_local: string | null
  completed_sessions: number
  working_sets: number
  comparable_tonnage_kg: number
  failure_sets: number
  average_sessions_per_week: number
  average_working_sets_per_week: number
  rpe: MetricAverage
  pump: MetricAverage
  form: MetricAverage
  muscles: AnalysisTrendMuscle[]
}

export interface AnalysisDashboard {
  weeks: WeeklyTrainingAnalysis[]
  trend_windows: AnalysisTrendWindow[]
  muscles: MuscleAnalysisRow[]
  mapping_coverage: MuscleMappingCoverage
  underperformance: UnderperformanceAnalysis
  deload: AdaptiveDeloadAnalysis
}
