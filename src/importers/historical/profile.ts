export const HISTORICAL_IMPORTER_TYPE = 'project-freak-historical-xlsx'
export const HISTORICAL_IMPORTER_VERSION = '1.0.0'

export const CANONICAL_HISTORICAL_PROFILE = {
  file_name: 'Project_Freak_Browser_Import_COMPLETE_2026-09-04.xlsx',
  sha256: '76df3acfaaefb53b89b7f6e93a2ddb76c802fa5e517f908c524336cc4532d127',
  size_bytes: 202393,
  coverage_start: '2026-06-20',
  coverage_end: '2026-09-04',
  sessions: 50,
  session_exercises: 403,
  exact_exercise_labels: 146,
  sets: 1323,
  case_only_duplicate_groups: 27,
} as const

export const REQUIRED_SET_DATA_COLUMNS = [
  'Workout ID',
  'Date',
  'Day',
  'Start',
  'Finish',
  'Exercise Order',
  'Exercise',
  'Set',
  'Load (kg)',
  'Load Type',
  'Set Type',
  'Reps as Recorded',
  'Primary Reps',
  'Secondary Load (kg)',
  'Secondary Reps',
  'Completed Reps',
  'Failure',
  'RPE',
  'Pump',
  'Form',
  'Legacy Tension',
  'Legacy MMC',
  'Set Load (kg-reps)',
  'Set Load Method',
  'Notes',
  'Data Status',
  'Source',
] as const

export const REQUIRED_SESSION_SUMMARY_COLUMNS = [
  'Workout ID',
  'Date',
  'Day',
  'Start',
  'Finish',
  'Exercises',
  'Working Sets',
  'Completed Reps',
  'Total Recorded Load',
  'Avg RPE',
  'Avg Pump',
  'Avg Form',
  'Data Notes',
] as const

export const EXPECTED_CANONICAL_SHEETS = [
  'Set Data',
  'Session Summary',
  'Exercise Summary',
  'Data Audit',
  'README',
] as const
