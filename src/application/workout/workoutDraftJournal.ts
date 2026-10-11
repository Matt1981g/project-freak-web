import { WORKOUT_FORM_DRAFT_PREFIX } from './workoutFormJournal'
/**
 * Synchronous, origin-local emergency journal for edits not yet committed to
 * IndexedDB. This is NOT a cloud mutation or a replacement for set autosave.
 * One entry per set prevents iOS suspension during the debounce window from
 * losing the last typed load, reps, component or RPE.
 */
export interface WorkoutSetDraft {
  version: 1
  session_id: string
  exercise_id: string
  set_number: number
  base_revision: number
  edit_sequence: number
  changed_at: number
  load_kg: number | null
  completed_reps: number | null
  rpe: number | null
  failed_next_rep: boolean
  components: unknown[]
}

export const WORKOUT_DRAFT_PREFIX = 'project-freak:workout-draft:v1:'

export function workout_draft_key(
  session_id: string, exercise_id: string, set_number: number,
): string {
  return `${WORKOUT_DRAFT_PREFIX}${session_id}:${exercise_id}:${set_number}`
}

export function read_workout_draft(key: string): WorkoutSetDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft: unknown = JSON.parse(raw)
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null
    const data = draft as Partial<WorkoutSetDraft>
    if (data.version !== 1 ||
        typeof data.session_id !== 'string' ||
        typeof data.exercise_id !== 'string' ||
        !Number.isSafeInteger(data.set_number) ||
        !Number.isSafeInteger(data.base_revision) ||
        !Number.isSafeInteger(data.edit_sequence) ||
        !Number.isFinite(data.changed_at) ||
        !Array.isArray(data.components)) return null
    return data as WorkoutSetDraft
  } catch {
    return null
  }
}

export function write_workout_draft(key: string, draft: WorkoutSetDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clear_workout_draft(
  key: string, edit_sequence?: number,
): void {
  try {
    const current = read_workout_draft(key)
    // Do not clear a newer keystroke after an older async Dexie write returns.
    if (edit_sequence !== undefined &&
        current && current.edit_sequence !== edit_sequence) return
    localStorage.removeItem(key)
  } catch {
    // localStorage is best-effort; IndexedDB remains the committed record.
  }
}

export function should_recover_workout_draft(
  draft: WorkoutSetDraft | null,
  session_id: string,
  exercise_id: string,
  set_number: number,
  saved_revision: number,
  is_completed: boolean,
): boolean {
  return Boolean(draft && !is_completed &&
    draft.session_id === session_id &&
    draft.exercise_id === exercise_id &&
    draft.set_number === set_number &&
    draft.base_revision === saved_revision)
}

let active_writes = 0
export function track_workout_write<T>(operation: Promise<T>): Promise<T> {
  active_writes++
  return operation.finally(() => {
    active_writes--
  })
}

/** Reload is deferred while a workout editor has unsaved/pending changes. */
export function workout_update_is_unsafe(path = ''): boolean {
  if (!path.includes('/workout/')) return false
  if (active_writes > 0) return true
  const session_id = path.split('/workout/')[1]?.split(/[/?#]/)[0] ?? ''
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(`${WORKOUT_DRAFT_PREFIX}${session_id}:`) ||
          key?.startsWith(`${WORKOUT_FORM_DRAFT_PREFIX}readiness:${session_id}`) ||
          key?.startsWith(`${WORKOUT_FORM_DRAFT_PREFIX}recovery:${session_id}`)) return true
    }
  } catch {
    // Storage access denied: defer reload while on an active workout.
    return true
  }
  return false
}
