import type {
  CompletedSession,
  Exercise,
  ExerciseAlias,
  ExerciseMetrics,
  SessionExercise,
  TrainingSet,
} from '../../domain/models'
import type {
  ExerciseRepository,
  SessionRepository,
} from '../../data/repositories/contracts'
import { is_training_set_completed } from '../../domain/rules/completion'

export interface ExerciseHistoryAppearance {
  session_exercise: SessionExercise
  sets: TrainingSet[]
  metrics: ExerciseMetrics | undefined
}

export interface ExerciseHistoryEntry {
  session: CompletedSession
  appearances: ExerciseHistoryAppearance[]
  completed_sets: number
  total_volume_kg: number
}

export interface ExerciseHistoryResult {
  exercise: Exercise
  resolved_exercise_ids: string[]
  entries: ExerciseHistoryEntry[]
}

function resolve_canonical_id(
  requested_id: string,
  aliases: readonly ExerciseAlias[],
): string {
  let current = requested_id
  const visited = new Set<string>()

  while (!visited.has(current)) {
    visited.add(current)
    const parent = aliases.find(
      (alias) =>
        alias.deleted_at === null &&
        alias.source_exercise_id === current &&
        alias.exercise_id !== current,
    )
    if (!parent) break
    current = parent.exercise_id
  }

  return current
}

function resolve_descendant_ids(
  canonical_id: string,
  aliases: readonly ExerciseAlias[],
): string[] {
  const ids = new Set([canonical_id])
  let changed = true

  while (changed) {
    changed = false

    for (const alias of aliases) {
      if (
        alias.deleted_at === null &&
        ids.has(alias.exercise_id) &&
        !ids.has(alias.source_exercise_id)
      ) {
        ids.add(alias.source_exercise_id)
        changed = true
      }
    }
  }

  return [...ids]
}

export async function load_exercise_history(
  requested_exercise_id: string,
  exercise_repository: ExerciseRepository,
  session_repository: SessionRepository,
): Promise<ExerciseHistoryResult | undefined> {
  const aliases = await exercise_repository.list_aliases()
  const canonical_id = resolve_canonical_id(requested_exercise_id, aliases)
  const exercise = await exercise_repository.get_by_id(canonical_id)

  if (!exercise || exercise.deleted_at !== null) {
    return undefined
  }

  const resolved_ids = resolve_descendant_ids(canonical_id, aliases)
  const relevant_ids = new Set(resolved_ids)
  const sessions = await session_repository.list_sessions_descending()
  const entries: ExerciseHistoryEntry[] = []

  for (const session of sessions) {
    if (session.deleted_at !== null) continue

    const session_exercises =
      await session_repository.list_session_exercises(session.id)
    const matching = session_exercises.filter((session_exercise) =>
      relevant_ids.has(session_exercise.exercise_id),
    )

    if (matching.length === 0) continue

    const appearances = await Promise.all(
      matching.map(async (session_exercise) => ({
        session_exercise,
        sets:
          await session_repository.list_sets_for_session_exercise(
            session_exercise.id,
          ),
        metrics:
          await session_repository.get_exercise_metrics(session_exercise.id),
      })),
    )

    const completed_sets = appearances.flatMap((appearance) =>
      appearance.sets.filter(is_training_set_completed),
    )

    entries.push({
      session,
      appearances,
      completed_sets: completed_sets.length,
      total_volume_kg: completed_sets.reduce(
        (total, set) => total + (set.set_load_kg_reps ?? 0),
        0,
      ),
    })
  }

  return {
    exercise,
    resolved_exercise_ids: resolved_ids,
    entries,
  }
}
