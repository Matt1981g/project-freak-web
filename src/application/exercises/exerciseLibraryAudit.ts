import type { ExerciseRepository } from '../../data/repositories/contracts'
import { find_case_only_exercise_alias_candidates } from '../../domain/rules/exerciseAliases'
import { backfill_exercise_intelligence } from './exerciseIntelligence'
import { backfill_known_legacy_exercises } from './exerciseIntelligenceLegacy'
import { apply_exercise_intelligence_review_policy } from './exerciseIntelligenceReviewPolicy'
import { inspect_exercise_intelligence, type ExerciseIntelligenceFinding } from './exerciseIntelligenceAudit'
import { cleanup_exercise_intelligence } from './exerciseIntelligenceCleanup'

export interface ExerciseLibraryAudit {
  total_definitions: number
  active_definitions: number
  archived_definitions: number
  alias_records: number
  unresolved_case_groups: number
  orphan_aliases: number
  intelligence_complete: number
  intelligence_missing: number
  intelligence_needs_review: number
  intelligence_average_confidence: number | null
  intelligence_validation_findings: ExerciseIntelligenceFinding[]
  intelligence_review_items: Array<{
    exercise_id: string
    exercise_name: string
    confidence: number
  }>
  status: 'clean' | 'warning'
}

export async function audit_exercise_library(
  repository: ExerciseRepository,
): Promise<ExerciseLibraryAudit> {
  await backfill_known_legacy_exercises(repository)
  await backfill_exercise_intelligence(repository)
  await apply_exercise_intelligence_review_policy(repository)
  await cleanup_exercise_intelligence(repository)

  const [exercises, aliases] = await Promise.all([
    repository.list_all(),
    repository.list_aliases(),
  ])

  const live_exercises = exercises.filter(
    (exercise) => exercise.deleted_at === null,
  )
  const live_aliases = aliases.filter((alias) => alias.deleted_at === null)
  const exercise_ids = new Set(live_exercises.map((exercise) => exercise.id))

  const orphan_aliases = live_aliases.filter(
    (alias) =>
      !exercise_ids.has(alias.exercise_id) ||
      !exercise_ids.has(alias.source_exercise_id),
  ).length

  const active_exercises = live_exercises.filter(
    (exercise) => exercise.archived_at === null,
  )
  const active_definitions = active_exercises.length
  const unresolved_case_groups = find_case_only_exercise_alias_candidates(
    live_exercises,
    live_aliases,
  ).length

  const validation = inspect_exercise_intelligence(exercises, aliases)
  const invalid_ids = new Set(validation.findings.filter((finding) =>
    ['missing_metadata', 'invalid_metadata', 'unresolved_classification'].includes(finding.code)).map((finding) => finding.exercise_id))
  const intelligence_complete = active_exercises.filter(
    (exercise) => !invalid_ids.has(exercise.id),
  ).length
  const intelligence_missing = active_definitions - intelligence_complete
  const intelligence_review_items = active_exercises
    .filter((exercise) => exercise.exercise_intelligence?.metadata_status === 'needs_review')
    .map((exercise) => ({
      exercise_id: exercise.id,
      exercise_name: exercise.canonical_name,
      confidence: exercise.exercise_intelligence?.metadata_confidence ?? 0,
    }))
    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name, 'en-GB'))
  const intelligence_needs_review = intelligence_review_items.length
  const confidence_values = active_exercises
    .map((exercise) => exercise.exercise_intelligence?.metadata_confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
  const intelligence_average_confidence =
    confidence_values.length > 0
      ? confidence_values.reduce((sum, value) => sum + value, 0) /
        confidence_values.length
      : null

  return {
    total_definitions: live_exercises.length,
    active_definitions,
    archived_definitions: live_exercises.length - active_definitions,
    alias_records: live_aliases.length,
    unresolved_case_groups,
    orphan_aliases,
    intelligence_complete,
    intelligence_missing,
    intelligence_needs_review,
    intelligence_average_confidence,
    intelligence_validation_findings: validation.findings,
    intelligence_review_items,
    status:
      unresolved_case_groups === 0 &&
      orphan_aliases === 0 &&
      intelligence_missing === 0 &&
      validation.status === 'clean' &&
      intelligence_needs_review === 0
        ? 'clean'
        : 'warning',
  }
}
