/**
 * Local-only emergency journal for pre/post-session feedback editors.
 * The journal is written synchronously on every input (before debounce).
 * Local revisions protect against overwriting newer IndexedDB feedback.
 */
export interface WorkoutFormDraft<T> {
  version: 1
  kind: 'readiness' | 'recovery'
  session_id: string
  base_revision: number
  edit_sequence: number
  changed_at: number
  form: T
}
export const WORKOUT_FORM_DRAFT_PREFIX = 'project-freak:workout-form:v1:'

export function workout_form_key(
  kind: 'readiness' | 'recovery',
  session_id: string,
): string {
  return `${WORKOUT_FORM_DRAFT_PREFIX}${kind}:${session_id}`
}

export function read_workout_form_draft<T>(
  key: string,
): WorkoutFormDraft<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || Array.isArray(value) || typeof value !== 'object') return null
    const data = value as Partial<WorkoutFormDraft<T>>
    if (data.version !== 1 ||
        (data.kind !== 'readiness' && data.kind !== 'recovery') ||
        typeof data.session_id !== 'string' ||
        !Number.isSafeInteger(data.base_revision) ||
        !Number.isSafeInteger(data.edit_sequence) ||
        typeof data.changed_at !== 'number' ||
        !data.form || typeof data.form !== 'object' ||
        Array.isArray(data.form)) return null
    return data as WorkoutFormDraft<T>
  } catch {
    return null
  }
}

export function form_draft_is_current<T>(
  draft: WorkoutFormDraft<T> | null,
  kind: 'readiness' | 'recovery', session_id: string, revision: number,
): draft is WorkoutFormDraft<T> {
  return Boolean(
    draft && draft.kind === kind && draft.session_id === session_id &&
    draft.base_revision === revision,
  )
}

export function write_workout_form_draft<T>(
  key: string, draft: WorkoutFormDraft<T>,
): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clear_workout_form_draft(key: string, sequence?: number): void {
  try {
    const current = read_workout_form_draft<unknown>(key)
    if (sequence !== undefined && current && current.edit_sequence !== sequence) return
    localStorage.removeItem(key)
  } catch {
    // The IndexedDB commit is independent of best-effort recovery storage.
  }
}
