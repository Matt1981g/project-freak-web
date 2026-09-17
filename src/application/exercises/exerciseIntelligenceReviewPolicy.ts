import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'

export interface IntelligenceReviewReason {
  code:
    | 'unclassified'
    | 'ambiguous_name'
    | 'pulldown_handle'
    | 'row_geometry'
    | 'cable_fly_angle'
  message: string
}

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function is_protected(intelligence: ExerciseIntelligence): boolean {
  if (
    intelligence.metadata_status === 'verified' ||
    intelligence.metadata_status === 'user_confirmed'
  ) {
    return true
  }

  return intelligence.metadata_sources.some((source) =>
    source.toLocaleLowerCase('en-GB').includes('pf legacy exercise audit'),
  )
}

function ambiguous_name_reason(name: string): IntelligenceReviewReason | null {
  const ambiguous_exact = new Set([
    'delts machine',
    'delt machine',
    'lunges',
    'lunge',
    'seated row',
    'cable row',
    'machine row',
    'lat pulldown',
    'pulldown machine',
  ])

  if (ambiguous_exact.has(name)) {
    return {
      code: 'ambiguous_name',
      message: 'Exercise name does not specify enough geometry or setup detail.',
    }
  }

  if (
    name.includes('lunge') &&
    !name.includes('reverse') &&
    !name.includes('forward') &&
    !name.includes('stationary') &&
    !name.includes('walking') &&
    !name.includes('split squat')
  ) {
    return {
      code: 'ambiguous_name',
      message: 'Lunge direction or execution style is unspecified.',
    }
  }

  return null
}

export function intelligence_review_reason(
  exercise: Exercise,
): IntelligenceReviewReason | null {
  const intelligence = exercise.exercise_intelligence
  if (!intelligence || is_protected(intelligence)) return null

  const name = normalise(exercise.canonical_name)
  const name_reason = ambiguous_name_reason(name)
  if (name_reason) return name_reason

  if (
    intelligence.movement_pattern === 'Needs classification' ||
    intelligence.muscle_length_bias === 'unknown'
  ) {
    return {
      code: 'unclassified',
      message: 'Movement geometry is not sufficiently classified.',
    }
  }

  if (
    intelligence.exercise_family === 'Lat pulldown' &&
    !intelligence.grip_or_handle
  ) {
    return {
      code: 'pulldown_handle',
      message: 'Pulldown grip or handle is unspecified.',
    }
  }

  if (
    intelligence.exercise_family === 'Row' ||
    (intelligence.exercise_family === 'Seated cable row' &&
      !intelligence.grip_or_handle)
  ) {
    return {
      code: 'row_geometry',
      message: 'Row grip, elbow path or machine geometry is unspecified.',
    }
  }

  if (
    name.includes('cable fly') &&
    !name.includes('low to high') &&
    !name.includes('high to low')
  ) {
    return {
      code: 'cable_fly_angle',
      message: 'Cable fly direction or angle is unspecified.',
    }
  }

  return null
}

export async function apply_exercise_intelligence_review_policy(
  repository: ExerciseRepository,
  timestamp = new Date().toISOString(),
): Promise<number> {
  const exercises = await repository.list_active()
  let updated = 0

  for (const exercise of exercises) {
    if (exercise.deleted_at !== null || exercise.archived_at !== null) continue

    const intelligence = exercise.exercise_intelligence
    if (!intelligence) continue

    const reason = intelligence_review_reason(exercise)
    if (!reason) continue
    if (intelligence.metadata_status === 'needs_review') continue

    const policy_source = `PF review policy: ${reason.message}`
    const metadata_sources = intelligence.metadata_sources.includes(policy_source)
      ? intelligence.metadata_sources
      : [...intelligence.metadata_sources, policy_source]

    await repository.put({
      ...exercise,
      exercise_intelligence: {
        ...intelligence,
        metadata_status: 'needs_review',
        metadata_confidence: Math.min(intelligence.metadata_confidence, 0.78),
        metadata_sources,
      },
      updated_at: timestamp,
      revision: exercise.revision + 1,
    })
    updated += 1
  }

  return updated
}
