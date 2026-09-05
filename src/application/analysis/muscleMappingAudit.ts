import type { ExerciseRepository, SettingsRepository } from '../../data/repositories/contracts'
import {
  load_muscle_mapping_catalogue,
  resolve_exercise_muscle_targets,
  type ResolvedMuscleTarget,
} from './muscleMapping'

export interface MuscleMappingAuditRow {
  exercise_id: string
  canonical_name: string
  category: string | null
  equipment: string | null
  status: 'explicit' | 'fallback' | 'unmapped'
  targets: ResolvedMuscleTarget[]
}

export interface MuscleMappingAudit {
  active_exercises: number
  explicit: number
  fallback: number
  unmapped: number
  rows: MuscleMappingAuditRow[]
}

export async function audit_exercise_muscle_mappings(
  exercises: ExerciseRepository,
  settings: SettingsRepository,
): Promise<MuscleMappingAudit> {
  const [active, catalogue] = await Promise.all([
    exercises.list_active(),
    load_muscle_mapping_catalogue(exercises, settings),
  ])

  const rows = active.map((exercise) => {
    const targets = resolve_exercise_muscle_targets(exercise, catalogue)
    const status: MuscleMappingAuditRow['status'] =
      targets.length === 0
        ? 'unmapped'
        : targets.some((target) => target.source === 'explicit')
          ? 'explicit'
          : 'fallback'
    return {
      exercise_id: exercise.id,
      canonical_name: exercise.canonical_name,
      category: exercise.category,
      equipment: exercise.equipment,
      status,
      targets,
    }
  })

  return {
    active_exercises: rows.length,
    explicit: rows.filter((row) => row.status === 'explicit').length,
    fallback: rows.filter((row) => row.status === 'fallback').length,
    unmapped: rows.filter((row) => row.status === 'unmapped').length,
    rows: rows.sort((a, b) => {
      const rank = { unmapped: 0, fallback: 1, explicit: 2 }
      const status = rank[a.status] - rank[b.status]
      return status || a.canonical_name.localeCompare(b.canonical_name)
    }),
  }
}
