import type { TrainingSet } from '../../domain/models'
import type { SessionRepository } from '../../data/repositories/contracts'
import { calculate_comparable_tonnage } from '../../domain/rules/tonnage'

export interface CorrectCompletedSetInput {
  set: TrainingSet
  load_kg: number | null
  completed_reps: number
  failed_next_rep: boolean
}

export interface CorrectCompletedSetContext {
  device_id: string
  now_iso: string
}

function validate_non_negative(
  value: number | null,
  name: string,
  integer = false,
): void {
  if (value === null) return

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${name} must be a non-negative${integer ? ' whole' : ''} number.`,
    )
  }
}

export function can_safely_correct_set(set: TrainingSet): boolean {
  return (
    set.completed_at !== null &&
    set.rep_mode === 'total' &&
    set.structure_type === 'straight'
  )
}

export async function correct_completed_set(
  input: CorrectCompletedSetInput,
  repository: SessionRepository,
  context: CorrectCompletedSetContext,
): Promise<TrainingSet> {
  if (input.set.completed_at === null) {
    throw new Error('Only completed sets can be corrected from history.')
  }

  if (!can_safely_correct_set(input.set)) {
    throw new Error(
      'This set uses an advanced structure or rep mode and cannot be safely corrected with the simple editor.',
    )
  }

  validate_non_negative(input.load_kg, 'Load')
  validate_non_negative(input.completed_reps, 'Reps', true)

  const failure_status = input.failed_next_rep
    ? 'attempted_next_rep_failed'
    : 'none'

  const tonnage = calculate_comparable_tonnage({
    load_kg: input.load_kg,
    load_type: input.set.load_type,
    rep_mode: input.set.rep_mode,
    primary_reps_completed: input.completed_reps,
  })

  const corrected: TrainingSet = {
    ...input.set,
    updated_at: context.now_iso,
    revision: input.set.revision + 1,
    device_id: context.device_id,
    load_kg: input.load_kg,
    reps_as_recorded: `${input.completed_reps}${input.failed_next_rep ? 'F' : ''}`,
    primary_reps_completed: input.completed_reps,
    completed_reps: input.completed_reps,
    failure_status,
    set_load_kg_reps: tonnage.value,
    set_load_method: tonnage.method,
  }

  await repository.put_set(corrected, 'User corrected completed set')
  return corrected
}
