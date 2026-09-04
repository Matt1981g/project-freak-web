import type { ExerciseRepository } from '../../data/repositories/contracts'

export interface ProgrammeExerciseCatalogueEntry {
  exercise_id: string
  exercise_name: string
  category: string | null
  equipment: string | null
  default_load_type: string
  rep_mode_default: string
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
      default_load_type: exercise.default_load_type,
      rep_mode_default: exercise.rep_mode_default,
    }))
    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name))
}

export async function build_programme_exercise_catalogue_json(
  repository: ExerciseRepository,
): Promise<string> {
  return JSON.stringify(
    {
      format: 'project-freak-exercise-catalogue',
      schema_version: '1.0.0',
      exercises: await build_programme_exercise_catalogue(repository),
    },
    null,
    2,
  )
}
