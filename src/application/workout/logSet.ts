import { create_uuid } from '../../domain/ids/uuid'
import type { SetComponentType } from '../../domain/enums/training'
import type {
  ProgrammedSessionSet,
  SessionExercise,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import { calculate_comparable_tonnage } from '../../domain/rules/tonnage'
import type { SessionRepository } from '../../data/repositories/contracts'

export interface SaveTrainingSetComponentInput {
  sequence: number
  component_type: SetComponentType
  load_kg: number | null
  reps_completed_full: number | null
  reps_partial: number | null
  duration_seconds: number | null
  failed_next_rep: boolean
  counts_toward_comparable_tonnage: boolean
  notes: string | null
}

export interface SaveTrainingSetInput {
  session_exercise: SessionExercise
  programmed_set: ProgrammedSessionSet | null
  existing_set: TrainingSet | null
  set_number: number
  load_kg: number | null
  completed_reps: number | null
  failed_next_rep: boolean
  complete: boolean
  components?: SaveTrainingSetComponentInput[]
}

export interface SaveTrainingSetContext {
  device_id: string
  now_iso: string
  id_factory?: () => string
}

function validate_number(
  value: number | null,
  name: string,
  integer = false,
): void {
  if (value === null) return
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be a non-negative${integer ? ' whole' : ''} number.`)
  }
}

function build_components(
  inputs: readonly SaveTrainingSetComponentInput[],
  existing: readonly SetComponent[],
  set_id: string,
  load_type: TrainingSet['load_type'],
  context: SaveTrainingSetContext,
): SetComponent[] {
  const make_id = context.id_factory ?? (() => create_uuid())

  return inputs.map((input) => {
    validate_number(input.load_kg, 'Component load')
    validate_number(input.reps_completed_full, 'Component reps', true)
    validate_number(input.reps_partial, 'Component partial reps', true)
    validate_number(input.duration_seconds, 'Component duration', true)

    if (
      input.failed_next_rep &&
      input.reps_completed_full === null &&
      input.reps_partial === null
    ) {
      throw new Error('Component failure can only be recorded after reps are entered.')
    }

    const previous = existing.find(
      (component) =>
        component.sequence === input.sequence &&
        component.component_type === input.component_type,
    )

    return {
      id: previous?.id ?? make_id(),
      created_at: previous?.created_at ?? context.now_iso,
      updated_at: context.now_iso,
      deleted_at: null,
      revision: previous ? previous.revision + 1 : 1,
      device_id: context.device_id,
      source_kind: 'user',
      source_id: null,
      set_id,
      sequence: input.sequence,
      component_type: input.component_type,
      load_kg: input.load_kg,
      load_type,
      reps_completed_full: input.reps_completed_full,
      reps_partial: input.reps_partial,
      duration_seconds: input.duration_seconds,
      failure_status: input.failed_next_rep
        ? 'attempted_next_rep_failed'
        : 'none',
      counts_toward_comparable_tonnage:
        input.counts_toward_comparable_tonnage,
      notes: input.notes,
    }
  })
}

export async function save_training_set(
  input: SaveTrainingSetInput,
  repository: SessionRepository,
  context: SaveTrainingSetContext,
): Promise<TrainingSet> {
  validate_number(input.load_kg, 'Load')
  validate_number(input.completed_reps, 'Reps', true)

  if (input.failed_next_rep && input.completed_reps === null) {
    throw new Error('Failure can only be recorded after completed reps are entered.')
  }

  if (input.complete && input.completed_reps === null) {
    throw new Error('Enter completed reps before completing the set.')
  }

  const existing = input.existing_set
  const make_id = context.id_factory ?? (() => create_uuid())
  const set_id = existing?.id ?? make_id()
  const load_type = input.programmed_set?.target_load_type ?? 'normal'
  const failure_status = input.failed_next_rep
    ? 'attempted_next_rep_failed'
    : 'none'

  const existing_components =
    existing && repository.list_set_components
      ? await repository.list_set_components(existing.id)
      : []
  const components = build_components(
    input.components ?? [],
    existing_components,
    set_id,
    load_type,
    context,
  )

  const tonnage = input.complete
    ? calculate_comparable_tonnage({
        load_kg: input.load_kg,
        load_type,
        rep_mode: 'total',
        primary_reps_completed: input.completed_reps,
        components,
      })
    : { value: null, method: null }

  const set: TrainingSet = {
    id: set_id,
    created_at: existing?.created_at ?? context.now_iso,
    updated_at: context.now_iso,
    deleted_at: null,
    revision: existing ? existing.revision + 1 : 1,
    device_id: context.device_id,
    source_kind: 'user',
    source_id: null,
    completed_session_id: input.session_exercise.completed_session_id,
    session_exercise_id: input.session_exercise.id,
    exercise_id: input.session_exercise.exercise_id,
    exercise_order_snapshot: input.session_exercise.actual_order,
    set_number: input.programmed_set?.set_number ?? input.set_number,
    set_role: input.programmed_set?.set_role ?? 'work',
    structure_type: input.programmed_set?.structure_type ?? 'straight',
    load_kg: input.load_kg,
    load_type,
    rep_mode: 'total',
    reps_as_recorded:
      input.completed_reps === null
        ? null
        : `${input.completed_reps}${input.failed_next_rep ? 'F' : ''}`,
    primary_reps_completed: input.completed_reps,
    left_reps_completed: null,
    right_reps_completed: null,
    completed_reps: input.completed_reps,
    partial_reps: null,
    duration_seconds: null,
    failure_status,
    left_failure_status: null,
    right_failure_status: null,
    actual_rest_seconds: existing?.actual_rest_seconds ?? null,
    set_load_kg_reps: tonnage.value,
    set_load_method: tonnage.method,
    notes: existing?.notes ?? null,
    completed_at: input.complete
      ? existing?.completed_at ?? context.now_iso
      : existing?.completed_at ?? null,
    source_record_key: null,
  }

  if (input.complete && input.session_exercise.started_at === null) {
    await repository.put_session_exercise({
      ...input.session_exercise,
      started_at: context.now_iso,
      updated_at: context.now_iso,
      revision: input.session_exercise.revision + 1,
      device_id: context.device_id,
    })
  }

  await repository.put_set(set)
  if (components.length > 0) {
    await repository.put_set_components(components)
  }
  return set
}
