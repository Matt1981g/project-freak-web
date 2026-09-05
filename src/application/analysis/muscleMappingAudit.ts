import type { ExerciseRepository, SettingsRepository } from '../../data/repositories/contracts'
import {
  load_muscle_mapping_catalogue,
  resolve_exercise_muscle_targets,
  type ResolvedMuscleTarget,
} from './muscleMapping'
import {
  researched_mapping_for_exercise,
  research_sources_for_mapping,
  type ResearchConfidence,
  type ResearchSource,
} from './researchedMuscleMappings'

export interface MuscleMappingAuditRow {
  exercise_id: string
  canonical_name: string
  category: string | null
  equipment: string | null
  status: 'explicit' | 'research' | 'fallback' | 'unmapped'
  targets: ResolvedMuscleTarget[]
  research_confidence: ResearchConfidence | null
  research_sources: ResearchSource[]
  research_rationale: string | null
}

export interface MuscleMappingAudit {
  active_exercises: number
  explicit: number
  researched: number
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
    const researched = researched_mapping_for_exercise(exercise)
    const status: MuscleMappingAuditRow['status'] =
      targets.length === 0
        ? 'unmapped'
        : targets.some((target) => target.source === 'explicit')
          ? 'explicit'
          : targets.some((target) => target.source === 'research')
            ? 'research'
            : 'fallback'
    return {
      exercise_id: exercise.id,
      canonical_name: exercise.canonical_name,
      category: exercise.category,
      equipment: exercise.equipment,
      status,
      targets,
      research_confidence: researched?.confidence ?? null,
      research_sources: researched ? research_sources_for_mapping(researched) : [],
      research_rationale: researched?.rationale ?? null,
    }
  })

  return {
    active_exercises: rows.length,
    explicit: rows.filter((row) => row.status === 'explicit').length,
    researched: rows.filter((row) => row.status === 'research').length,
    fallback: rows.filter((row) => row.status === 'fallback').length,
    unmapped: rows.filter((row) => row.status === 'unmapped').length,
    rows: rows.sort((a, b) => {
      const rank = { unmapped: 0, fallback: 1, research: 2, explicit: 3 }
      const status = rank[a.status] - rank[b.status]
      return status || a.canonical_name.localeCompare(b.canonical_name)
    }),
  }
}
