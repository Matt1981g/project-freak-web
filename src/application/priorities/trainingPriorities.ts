import type { JsonValue, Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'

export const TRAINING_PRIORITY_SETTING_KEY = 'training-priorities-v1'

const LEGACY_TRAINING_PRIORITY_AREAS = [
  'Biceps',
  'Triceps',
  'Shoulders',
  'Traps',
  'Lats',
  'Back',
  'Quads',
  'Glutes',
  'Hamstrings',
  'Calfs',
  'Abs',
  'Chest',
] as const

export const TRAINING_PRIORITY_AREAS = [
  ...LEGACY_TRAINING_PRIORITY_AREAS,
  'Adductors',
] as const

export type TrainingPriorityArea = (typeof TRAINING_PRIORITY_AREAS)[number]
export type MuscleTrainingIntent = 'grow' | 'maintain'

export type MuscleIntentMap = Record<TrainingPriorityArea, MuscleTrainingIntent>

export function default_muscle_intents(): MuscleIntentMap {
  return Object.fromEntries(
    TRAINING_PRIORITY_AREAS.map((area) => [area, 'grow']),
  ) as MuscleIntentMap
}

export interface TrainingPrioritySnapshot {
  effective_from_date_local: string
  updated_at: string
  ordered_areas: TrainingPriorityArea[]
}

export interface TrainingPriorityState {
  schema_version: '1.0.0'
  configured: boolean
  current: TrainingPriorityArea[]
  intent_by_area: MuscleIntentMap
  history: TrainingPrioritySnapshot[]
}

function is_priority_area(value: unknown): value is TrainingPriorityArea {
  return (
    typeof value === 'string' &&
    (TRAINING_PRIORITY_AREAS as readonly string[]).includes(value)
  )
}

function normalise_priority_order(
  ordered_areas: readonly string[],
): TrainingPriorityArea[] | null {
  const unique = new Set(ordered_areas)
  if (unique.size !== ordered_areas.length) return null
  if (!ordered_areas.every(is_priority_area)) return null

  if (
    ordered_areas.length === TRAINING_PRIORITY_AREAS.length &&
    TRAINING_PRIORITY_AREAS.every((area) => unique.has(area))
  ) {
    return [...ordered_areas] as TrainingPriorityArea[]
  }

  const legacy = new Set<string>(LEGACY_TRAINING_PRIORITY_AREAS)
  if (
    ordered_areas.length === LEGACY_TRAINING_PRIORITY_AREAS.length &&
    !unique.has('Adductors') &&
    ordered_areas.every((area) => legacy.has(area))
  ) {
    return [...ordered_areas, 'Adductors'] as TrainingPriorityArea[]
  }

  return null
}

export function validate_priority_order(
  ordered_areas: readonly string[],
): asserts ordered_areas is readonly TrainingPriorityArea[] {
  if (!normalise_priority_order(ordered_areas) || ordered_areas.length !== TRAINING_PRIORITY_AREAS.length) {
    throw new Error(
      `Training priorities must contain all ${TRAINING_PRIORITY_AREAS.length} body parts.`,
    )
  }
}

export function move_priority(
  ordered_areas: readonly TrainingPriorityArea[],
  from_index: number,
  to_index: number,
): TrainingPriorityArea[] {
  if (
    from_index < 0 ||
    from_index >= ordered_areas.length ||
    to_index < 0 ||
    to_index >= ordered_areas.length
  ) {
    return [...ordered_areas]
  }

  const next = [...ordered_areas]
  const [moved] = next.splice(from_index, 1)
  next.splice(to_index, 0, moved)
  return next
}

function parse_state(value: JsonValue): TrainingPriorityState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, JsonValue>
  const current = record.current
  const history = record.history
  const configured = record.configured
  const intent_record =
    record.intent_by_area &&
    typeof record.intent_by_area === 'object' &&
    !Array.isArray(record.intent_by_area)
      ? (record.intent_by_area as Record<string, JsonValue>)
      : null

  if (!Array.isArray(current) || !Array.isArray(history)) {
    return null
  }

  const current_values = current.filter(
    (entry): entry is string => typeof entry === 'string',
  )
  const migrated_legacy_state = !current_values.includes('Adductors')
  const normalised_current = normalise_priority_order(current_values)
  if (!normalised_current) return null

  const parsed_history: TrainingPrioritySnapshot[] = []

  for (const item of history) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue

    const snapshot = item as Record<string, JsonValue>
    if (
      typeof snapshot.effective_from_date_local !== 'string' ||
      typeof snapshot.updated_at !== 'string' ||
      !Array.isArray(snapshot.ordered_areas)
    ) {
      continue
    }

    const ordered = snapshot.ordered_areas.filter(
      (entry): entry is string => typeof entry === 'string',
    )
    const normalised_order = normalise_priority_order(ordered)
    if (!normalised_order) continue

    parsed_history.push({
      effective_from_date_local: snapshot.effective_from_date_local,
      updated_at: snapshot.updated_at,
      ordered_areas: normalised_order,
    })
  }

  const intent_by_area = default_muscle_intents()
  if (migrated_legacy_state) intent_by_area.Adductors = 'maintain'

  if (intent_record) {
    for (const area of TRAINING_PRIORITY_AREAS) {
      const intent = intent_record[area]
      if (intent === 'grow' || intent === 'maintain') {
        intent_by_area[area] = intent
      }
    }
  }

  return {
    schema_version: '1.0.0',
    configured: configured === true,
    current: normalised_current,
    intent_by_area,
    history: parsed_history.sort((a, b) =>
      a.effective_from_date_local.localeCompare(b.effective_from_date_local),
    ),
  }
}

export async function load_training_priorities(
  repository: SettingsRepository,
): Promise<TrainingPriorityState> {
  const stored = await repository.get(TRAINING_PRIORITY_SETTING_KEY)
  const parsed = stored ? parse_state(stored.value_json) : null

  return (
    parsed ?? {
      schema_version: '1.0.0',
      configured: false,
      current: [...TRAINING_PRIORITY_AREAS],
      intent_by_area: default_muscle_intents(),
      history: [],
    }
  )
}

export async function save_training_priorities(
  ordered_areas: readonly TrainingPriorityArea[],
  repository: SettingsRepository,
  context: {
    local_date: string
    now_iso: string
  },
): Promise<TrainingPriorityState> {
  validate_priority_order(ordered_areas)

  const existing = await load_training_priorities(repository)
  const snapshot: TrainingPrioritySnapshot = {
    effective_from_date_local: context.local_date,
    updated_at: context.now_iso,
    ordered_areas: [...ordered_areas],
  }

  const history = existing.history.filter(
    (item) => item.effective_from_date_local !== context.local_date,
  )
  history.push(snapshot)
  history.sort((a, b) =>
    a.effective_from_date_local.localeCompare(b.effective_from_date_local),
  )

  const state: TrainingPriorityState = {
    schema_version: '1.0.0',
    configured: true,
    current: [...ordered_areas],
    intent_by_area: existing.intent_by_area,
    history,
  }

  const setting: Setting = {
    key: TRAINING_PRIORITY_SETTING_KEY,
    scope: 'global',
    value_json: state as unknown as JsonValue,
    updated_at: context.now_iso,
    device_id: null,
  }

  await repository.put(setting)
  return state
}

export async function save_training_intents(
  intent_by_area: MuscleIntentMap,
  repository: SettingsRepository,
  context: {
    now_iso: string
  },
): Promise<TrainingPriorityState> {
  const existing = await load_training_priorities(repository)
  const cleaned = default_muscle_intents()

  for (const area of TRAINING_PRIORITY_AREAS) {
    const intent = intent_by_area[area]
    if (intent !== 'grow' && intent !== 'maintain') {
      throw new Error(`Intent for ${area} must be Grow or Maintain.`)
    }
    cleaned[area] = intent
  }

  const state: TrainingPriorityState = {
    ...existing,
    intent_by_area: cleaned,
  }

  await repository.put({
    key: TRAINING_PRIORITY_SETTING_KEY,
    scope: 'global',
    value_json: state as unknown as JsonValue,
    updated_at: context.now_iso,
    device_id: null,
  })

  return state
}
