import type {
  ExerciseIntelligence,
} from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'

export interface ProgrammeExerciseCatalogueEntry {
  exercise_id: string
  exercise_name: string
  category: string | null
  equipment: string | null
  machine_brand: string | null
  machine_model: string | null
  default_load_type: string
  rep_mode_default: string
  exercise_intelligence: ExerciseIntelligence | null
}

export async function build_programme_exercise_catalogue(
  repository: ExerciseRepository,
): Promise<ProgrammeExerciseCatalogueEntry[]> {
  const active = await repository.list_active()

  return active
    .map((exercise) => ({
      exercise_id: exercise.id,
      exercise_name: exercise.canonical_name,
      category: exercise.category,
      equipment: exercise.equipment,
      machine_brand: exercise.machine_brand ?? null,
      machine_model: exercise.machine_model ?? null,
      default_load_type: exercise.default_load_type,
      rep_mode_default: exercise.rep_mode_default,
      exercise_intelligence: exercise.exercise_intelligence ?? null,
    }))
    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name))
}

export async function build_programme_exercise_catalogue_json(
  repository: ExerciseRepository,
): Promise<string> {
  return JSON.stringify(
    {
      format: 'project-freak-exercise-catalogue',
      schema_version: '1.1.0',
      exercises: await build_programme_exercise_catalogue(repository),
    },
    null,
    2,
  )
}
