import type { Exercise, ExerciseAlias } from '../../domain/models'
import { exercise_intelligence_schema, intelligence_key, validate_exercise_intelligence } from '../../domain/rules/exerciseIntelligenceValidation'
import { intelligence_review_reason } from './exerciseIntelligenceReviewPolicy'

export interface ExerciseIntelligenceFinding {
  exercise_id: string
  exercise_name: string
  code: string
  message: string
  related_exercise_ids?: string[]
}

/** Inspect stored records without changing IDs, history, confirmations or metadata. */
export function inspect_exercise_intelligence(exercises: Exercise[], aliases: ExerciseAlias[] = []) {
  const active = exercises.filter((exercise) => exercise.deleted_at === null && exercise.archived_at === null)
  const findings: ExerciseIntelligenceFinding[] = []
  const groups = new Map<string, Exercise[]>()
  const resolved = new Set(aliases.filter((alias) => alias.deleted_at === null &&
    exercises.some((exercise) => exercise.id === alias.exercise_id && exercise.deleted_at === null && exercise.archived_at === null) &&
    alias.source_exercise_id !== alias.exercise_id).map((alias) => alias.source_exercise_id))
  for (const exercise of active) {
    const add = (code: string, message: string) => findings.push({ exercise_id: exercise.id, exercise_name: exercise.canonical_name, code, message })
    const issues = validate_exercise_intelligence(exercise.exercise_intelligence)
    for (const issue of issues) add(issue.code, issue.message)
    const intelligence = exercise.exercise_intelligence
    if (intelligence && exercise_intelligence_schema.safeParse(intelligence).success) {
      if (intelligence.metadata_status === 'needs_review') add('needs_review', 'Exercise is awaiting manual confirmation.')
      const confirmed = ['verified', 'user_confirmed'].includes(intelligence.metadata_status)
      // Old fallback provenance alone is not a fault after a valid manual correction.
      if (!confirmed && intelligence.metadata_sources.some((source) => source.toLowerCase().includes('category fallback'))) {
        add('generic_fallback', 'Only a category fallback supports this classification.')
      }
      const reason = intelligence_review_reason(exercise)
      if (reason) add('unresolved_variant', reason.message)
    }
    if (!resolved.has(exercise.id)) {
      // Same labels on different machines/gyms are not automatically duplicates.
      const key = [exercise.canonical_name, exercise.equipment, exercise.machine_brand, exercise.machine_model, exercise.origin_gym_profile_id]
        .map((value) => intelligence_key(value ?? '')).join('|')
      groups.set(key, [...(groups.get(key) ?? []), exercise])
    }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const exercise of group) findings.push({
      exercise_id: exercise.id, exercise_name: exercise.canonical_name,
      code: 'duplicate_candidate',
      message: 'Multiple active IDs have the same name and equipment context; confirm whether these are distinct setups before merging.',
      related_exercise_ids: group.filter((other) => other.id !== exercise.id).map((other) => other.id),
    })
    const signatures = new Set(group.map((exercise) => {
      const parsed = exercise_intelligence_schema.safeParse(exercise.exercise_intelligence)
      if (!parsed.success) return JSON.stringify(exercise.exercise_intelligence)
      const data = parsed.data
      return JSON.stringify(Object.fromEntries(Object.entries(data)
        .filter(([key]) => !key.startsWith('metadata_'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, Array.isArray(value)
          ? value.map((item: unknown) => typeof item === 'string' ? intelligence_key(item) : item).sort()
          : typeof value === 'string' ? intelligence_key(value) : value])))
    }))
    if (signatures.size > 1) findings.push({
      exercise_id: group[0].id, exercise_name: group[0].canonical_name,
      code: 'inconsistent_duplicate', message: 'Matching exercise labels have conflicting intelligence; compare their muscles, movement, family and setup.',
      related_exercise_ids: group.slice(1).map((exercise) => exercise.id),
    })
  }
  findings.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || a.code.localeCompare(b.code))
  return { active_exercises: active.length, affected_exercises: new Set(findings.map((finding) => finding.exercise_id)).size,
    status: findings.length ? 'warning' as const : 'clean' as const, findings }
}
