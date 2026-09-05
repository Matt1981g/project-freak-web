import type { JsonValue, Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'
import {
  TRAINING_PRIORITY_AREAS,
  type TrainingPriorityArea,
} from '../priorities/trainingPriorities'
import type { MuscleTargetRole } from './muscleMapping'

export const EXERCISE_MUSCLE_MAPPING_SETTING_KEY =
  'exercise-muscle-mappings-v1'

export interface VerifiedExerciseMuscleTarget {
  area: TrainingPriorityArea
  role: MuscleTargetRole
  allocation_weight: number
}

export interface VerifiedExerciseMuscleMappingState {
  schema_version: '1.0.0'
  mappings: Record<string, VerifiedExerciseMuscleTarget[]>
}

function valid_area(value: unknown): value is TrainingPriorityArea {
  return (
    typeof value === 'string' &&
    (TRAINING_PRIORITY_AREAS as readonly string[]).includes(value)
  )
}

function valid_role(value: unknown): value is MuscleTargetRole {
  return value === 'primary' || value === 'secondary'
}

function parse_state(value: JsonValue): VerifiedExerciseMuscleMappingState {
  const empty: VerifiedExerciseMuscleMappingState = {
    schema_version: '1.0.0',
    mappings: {},
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const record = value as Record<string, JsonValue>
  const mappings = record.mappings
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    return empty
  }

  const parsed: Record<string, VerifiedExerciseMuscleTarget[]> = {}
  for (const [exercise_id, raw_targets] of Object.entries(mappings)) {
    if (!Array.isArray(raw_targets)) continue

    const targets: VerifiedExerciseMuscleTarget[] = []
    for (const raw of raw_targets) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const target = raw as Record<string, JsonValue>
      if (!valid_area(target.area) || !valid_role(target.role)) continue
      const weight =
        typeof target.allocation_weight === 'number' &&
        Number.isFinite(target.allocation_weight)
          ? Math.max(0, Math.min(1, target.allocation_weight))
          : target.role === 'primary'
            ? 1
            : 0.5

      targets.push({
        area: target.area,
        role: target.role,
        allocation_weight: weight,
      })
    }

    if (targets.some((target) => target.role === 'primary')) {
      parsed[exercise_id] = targets
    }
  }

  return { schema_version: '1.0.0', mappings: parsed }
}

export async function load_verified_exercise_muscle_mappings(
  repository: SettingsRepository,
): Promise<VerifiedExerciseMuscleMappingState> {
  const stored = await repository.get(EXERCISE_MUSCLE_MAPPING_SETTING_KEY)
  return stored ? parse_state(stored.value_json) : parse_state(null)
}

export async function save_verified_exercise_muscle_mapping(
  exercise_id: string,
  targets: readonly VerifiedExerciseMuscleTarget[],
  repository: SettingsRepository,
  now_iso: string,
): Promise<VerifiedExerciseMuscleMappingState> {
  const primary = targets.filter((target) => target.role === 'primary')
  if (primary.length === 0) {
    throw new Error('Choose at least one primary muscle.')
  }

  const by_area = new Map<TrainingPriorityArea, VerifiedExerciseMuscleTarget>()
  for (const target of targets) {
    if (!valid_area(target.area) || !valid_role(target.role)) continue
    const current = by_area.get(target.area)
    if (!current || target.role === 'primary') {
      by_area.set(target.area, {
        area: target.area,
        role: target.role,
        allocation_weight:
          target.role === 'primary'
            ? 1
            : Math.max(0, Math.min(1, target.allocation_weight || 0.5)),
      })
    }
  }

  const state = await load_verified_exercise_muscle_mappings(repository)
  const next: VerifiedExerciseMuscleMappingState = {
    schema_version: '1.0.0',
    mappings: {
      ...state.mappings,
      [exercise_id]: [...by_area.values()],
    },
  }

  const setting: Setting = {
    key: EXERCISE_MUSCLE_MAPPING_SETTING_KEY,
    scope: 'global',
    value_json: next as unknown as JsonValue,
    updated_at: now_iso,
    device_id: null,
  }
  await repository.put(setting)
  return next
}
