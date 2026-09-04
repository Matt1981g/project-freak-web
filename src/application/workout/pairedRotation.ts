export interface RotationExercise {
  id: string
  actual_order: number
  rotation_group_key: string | null
  rotation_position: number | null
  completed_at: string | null
}

export interface RotationProgressExercise extends RotationExercise {
  completed_sets: number
  target_sets: number
}

function rotation_members<T extends RotationExercise>(
  exercises: readonly T[],
  current: T,
): T[] {
  if (!current.rotation_group_key) return []

  return exercises
    .filter(
      (exercise) =>
        exercise.rotation_group_key === current.rotation_group_key,
    )
    .sort((a, b) => {
      const left = a.rotation_position ?? Number.MAX_SAFE_INTEGER
      const right = b.rotation_position ?? Number.MAX_SAFE_INTEGER
      return left !== right ? left - right : a.actual_order - b.actual_order
    })
}

export function next_rotation_exercise_id<T extends RotationExercise>(
  exercises: readonly T[],
  current_exercise_id: string,
): string | null {
  const current = exercises.find(
    (exercise) => exercise.id === current_exercise_id,
  )
  if (!current) return null

  const members = rotation_members(exercises, current)
  if (members.length < 2) return null

  const current_index = members.findIndex(
    (exercise) => exercise.id === current.id,
  )
  if (current_index < 0) return null

  return members[(current_index + 1) % members.length].id
}

export function recommended_rotation_exercise_id<
  T extends RotationProgressExercise,
>(
  exercises: readonly T[],
  current_exercise_id: string,
): string | null {
  const current = exercises.find(
    (exercise) => exercise.id === current_exercise_id,
  )
  if (!current) return null

  const members = rotation_members(exercises, current)
  if (members.length < 2) return null

  const available = members.filter(
    (exercise) =>
      exercise.completed_at === null &&
      exercise.completed_sets < exercise.target_sets,
  )
  if (available.length === 0) return null

  const lowest_completed_sets = Math.min(
    ...available.map((exercise) => exercise.completed_sets),
  )
  const lagging = new Set(
    available
      .filter(
        (exercise) => exercise.completed_sets === lowest_completed_sets,
      )
      .map((exercise) => exercise.id),
  )

  const current_index = members.findIndex(
    (exercise) => exercise.id === current.id,
  )
  if (current_index < 0) return null

  for (let offset = 1; offset <= members.length; offset += 1) {
    const candidate = members[(current_index + offset) % members.length]
    if (lagging.has(candidate.id)) {
      return candidate.id
    }
  }

  return null
}

export function is_rotation_exercise_lagging<
  T extends RotationProgressExercise,
>(
  exercises: readonly T[],
  exercise_id: string,
): boolean {
  const current = exercises.find((exercise) => exercise.id === exercise_id)
  if (!current || !current.rotation_group_key) return false
  if (
    current.completed_at !== null ||
    current.completed_sets >= current.target_sets
  ) {
    return false
  }

  const members = rotation_members(exercises, current)
  if (members.length < 2) return false

  const most_completed = Math.max(
    ...members.map((exercise) => exercise.completed_sets),
  )
  return current.completed_sets < most_completed
}

export function next_exercise_after_completion<T extends RotationExercise>(
  exercises: readonly T[],
  current_exercise_id: string,
): string | null {
  const current = exercises.find(
    (exercise) => exercise.id === current_exercise_id,
  )
  if (!current) return null

  const members = rotation_members(exercises, current)
  if (members.length > 1) {
    const current_index = members.findIndex(
      (exercise) => exercise.id === current.id,
    )

    for (let offset = 1; offset < members.length; offset += 1) {
      const candidate =
        members[(current_index + offset) % members.length]
      if (candidate.completed_at === null) {
        return candidate.id
      }
    }
  }

  return (
    [...exercises]
      .filter(
        (exercise) =>
          exercise.id !== current.id &&
          exercise.completed_at === null &&
          exercise.actual_order > current.actual_order,
      )
      .sort((a, b) => a.actual_order - b.actual_order)[0]?.id ?? null
  )
}
