import type { RestTimerState } from './restTimer'

export type PersistedRestTimer = RestTimerState & {
  exercise_id: string
  exercise_name: string
  next_exercise_id?: string | null
  next_exercise_name?: string | null
  next_exercise_label?: string | null
}

export function rest_timer_storage_key(completed_session_id: string): string {
  return `project-freak:rest-timer:${completed_session_id}`
}

export function parse_stored_rest_timer(
  raw: string | null,
): PersistedRestTimer | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedRestTimer>
    if (
      typeof parsed.planned_seconds !== 'number' ||
      (typeof parsed.ends_at_ms !== 'number' && parsed.ends_at_ms !== null) ||
      (typeof parsed.paused_remaining_seconds !== 'number' &&
        parsed.paused_remaining_seconds !== null) ||
      typeof parsed.exercise_id !== 'string' ||
      typeof parsed.exercise_name !== 'string'
    ) {
      return null
    }

    return {
      ...(parsed as PersistedRestTimer),
      next_exercise_id:
        typeof parsed.next_exercise_id === 'string'
          ? parsed.next_exercise_id
          : null,
      next_exercise_name:
        typeof parsed.next_exercise_name === 'string'
          ? parsed.next_exercise_name
          : null,
      next_exercise_label:
        typeof parsed.next_exercise_label === 'string'
          ? parsed.next_exercise_label
          : null,
    }
  } catch {
    return null
  }
}

export function load_stored_rest_timer(
  completed_session_id: string | undefined,
  storage: Pick<Storage, 'getItem'> | null =
    typeof window === 'undefined' ? null : window.localStorage,
): PersistedRestTimer | null {
  if (!completed_session_id || !storage) return null
  return parse_stored_rest_timer(
    storage.getItem(rest_timer_storage_key(completed_session_id)),
  )
}
