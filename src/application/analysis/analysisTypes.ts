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
