import type {
  Exercise,
  ExerciseMuscle,
  Muscle,
} from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'
import type { TrainingPriorityArea } from '../priorities/trainingPriorities'

export type MuscleTargetRole = 'primary' | 'secondary'
export type MuscleMappingSource = 'explicit' | 'category_fallback'

export interface ResolvedMuscleTarget {
  area: TrainingPriorityArea
  role: MuscleTargetRole
  allocation_weight: number
  source: MuscleMappingSource
}

export interface MuscleMappingCatalogue {
  muscles: Muscle[]
  links: ExerciseMuscle[]
}

const CATEGORY_FALLBACK: Record<
  string,
  Array<{
    area: TrainingPriorityArea
    role: MuscleTargetRole
    allocation_weight: number
  }>
> = {
  biceps: [{ area: 'Biceps', role: 'primary', allocation_weight: 1 }],
  triceps: [{ area: 'Triceps', role: 'primary', allocation_weight: 1 }],
  shoulders: [
    { area: 'Shoulders', role: 'primary', allocation_weight: 1 },
    { area: 'Triceps', role: 'secondary', allocation_weight: 0.5 },
    { area: 'Traps', role: 'secondary', allocation_weight: 0.25 },
  ],
  delts: [{ area: 'Shoulders', role: 'primary', allocation_weight: 1 }],
  traps: [
    { area: 'Traps', role: 'primary', allocation_weight: 1 },
    { area: 'Back', role: 'secondary', allocation_weight: 0.5 },
  ],
  lats: [
    { area: 'Lats', role: 'primary', allocation_weight: 1 },
    { area: 'Biceps', role: 'secondary', allocation_weight: 0.5 },
    { area: 'Back', role: 'secondary', allocation_weight: 0.25 },
  ],
  back: [
    { area: 'Back', role: 'primary', allocation_weight: 1 },
    { area: 'Lats', role: 'secondary', allocation_weight: 0.5 },
    { area: 'Biceps', role: 'secondary', allocation_weight: 0.5 },
    { area: 'Traps', role: 'secondary', allocation_weight: 0.25 },
  ],
  quads: [
    { area: 'Quads', role: 'primary', allocation_weight: 1 },
    { area: 'Glutes', role: 'secondary', allocation_weight: 0.35 },
  ],
  glutes: [
    { area: 'Glutes', role: 'primary', allocation_weight: 1 },
    { area: 'Hamstrings', role: 'secondary', allocation_weight: 0.35 },
  ],
  hamstrings: [
    { area: 'Hamstrings', role: 'primary', allocation_weight: 1 },
    { area: 'Glutes', role: 'secondary', allocation_weight: 0.35 },
  ],
  calves: [{ area: 'Calfs', role: 'primary', allocation_weight: 1 }],
  calfs: [{ area: 'Calfs', role: 'primary', allocation_weight: 1 }],
  abs: [{ area: 'Abs', role: 'primary', allocation_weight: 1 }],
  chest: [
    { area: 'Chest', role: 'primary', allocation_weight: 1 },
    { area: 'Triceps', role: 'secondary', allocation_weight: 0.5 },
    { area: 'Shoulders', role: 'secondary', allocation_weight: 0.35 },
  ],
}

function normalise(value: string | null): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function muscle_area_from_name(
  name: string,
): TrainingPriorityArea | null {
  const value = normalise(name)
  if (!value) return null

  if (value.includes('bicep')) return 'Biceps'
  if (value.includes('tricep')) return 'Triceps'
  if (
    value.includes('deltoid') ||
    value.includes('delt') ||
    value.includes('shoulder')
  ) return 'Shoulders'
  if (value.includes('trap')) return 'Traps'
  if (value.includes('latissimus') || value === 'lats' || value.includes(' lat ')) {
    return 'Lats'
  }
  if (
    value.includes('quadricep') ||
    value.includes('vastus') ||
    value.includes('rectus femoris') ||
    value === 'quads'
  ) return 'Quads'
  if (value.includes('glute')) return 'Glutes'
  if (
    value.includes('hamstring') ||
    value.includes('biceps femoris') ||
    value.includes('semitendinosus') ||
    value.includes('semimembranosus')
  ) return 'Hamstrings'
  if (
    value.includes('gastrocnemius') ||
    value.includes('soleus') ||
    value.includes('calf') ||
    value.includes('calves')
  ) return 'Calfs'
  if (
    value.includes('abdom') ||
    value.includes('oblique') ||
    value.includes('core')
  ) return 'Abs'
  if (
    value.includes('pector') ||
    value.includes('chest')
  ) return 'Chest'
  if (
    value.includes('erector') ||
    value.includes('rhomboid') ||
    value.includes('upper back') ||
    value.includes('mid back') ||
    value === 'back'
  ) return 'Back'

  return null
}

function fallback_targets(exercise: Exercise): ResolvedMuscleTarget[] {
  const category = normalise(exercise.category).replaceAll(' ', '')
  const exact = CATEGORY_FALLBACK[category]
  if (exact) {
    return exact.map((target) => ({
      ...target,
      source: 'category_fallback' as const,
    }))
  }

  const matched = Object.entries(CATEGORY_FALLBACK).find(([key]) =>
    category.includes(key),
  )?.[1]

  return (matched ?? []).map((target) => ({
    ...target,
    source: 'category_fallback' as const,
  }))
}

export function resolve_exercise_muscle_targets(
  exercise: Exercise,
  catalogue: MuscleMappingCatalogue,
): ResolvedMuscleTarget[] {
  const muscles_by_id = new Map(
    catalogue.muscles.map((muscle) => [muscle.id, muscle]),
  )
  const explicit: ResolvedMuscleTarget[] = catalogue.links.flatMap(
    (link) => {
      if (
        link.exercise_id !== exercise.id ||
        (link.role !== 'primary' && link.role !== 'secondary')
      ) {
        return []
      }

      const muscle = muscles_by_id.get(link.muscle_id)
      const area = muscle ? muscle_area_from_name(muscle.name) : null
      if (!area) return []

      return [
        {
          area,
          role: link.role,
          allocation_weight:
            link.allocation_weight ??
            (link.role === 'primary' ? 1 : 0.5),
          source: 'explicit' as const,
        },
      ]
    },
  )

  if (explicit.length > 0) {
    const by_area = new Map<TrainingPriorityArea, ResolvedMuscleTarget>()
    for (const target of explicit) {
      const current = by_area.get(target.area)
      if (
        !current ||
        target.role === 'primary' ||
        target.allocation_weight > current.allocation_weight
      ) {
        by_area.set(target.area, target)
      }
    }
    return [...by_area.values()]
  }

  return fallback_targets(exercise)
}

export async function load_muscle_mapping_catalogue(
  repository: ExerciseRepository,
): Promise<MuscleMappingCatalogue> {
  const [muscles, links] = await Promise.all([
    repository.list_muscles?.() ?? Promise.resolve([]),
    repository.list_muscle_links?.() ?? Promise.resolve([]),
  ])

  return { muscles, links }
}
