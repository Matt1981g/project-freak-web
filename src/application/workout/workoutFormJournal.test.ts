import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clear_workout_form_draft,
  form_draft_is_current,
  read_workout_form_draft,
  rebase_newer_workout_form_draft,
  workout_form_key,
  write_workout_form_draft,
  type WorkoutFormDraft,
} from './workoutFormJournal'

type Feedback = { session_quality: number | null; coach_note: string }
const key = workout_form_key('recovery', 'session-1')
const data: WorkoutFormDraft<Feedback> = {
  version: 1,
  kind: 'recovery',
  session_id: 'session-1',
  base_revision: 7,
  edit_sequence: 2,
  changed_at: 0,
  form: { session_quality: 8, coach_note: 'Strong quad pump' },
}

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, val: string) => { values.set(key, val) },
    removeItem: (key: string) => { values.delete(key) },
  })
})

describe('readiness and post-workout emergency journals', () => {
  it('survives reload, restoring only when the source revision still matches', () => {
    expect(write_workout_form_draft(key, data)).toBe(true)
    const replay = read_workout_form_draft<Feedback>(key)
    expect(replay?.form).toEqual(data.form)
    expect(replay?.changed_at).toBeGreaterThan(0)
    expect(form_draft_is_current(replay, 'recovery', 'session-1', 7)).toBe(true)
    expect(form_draft_is_current(replay, 'recovery', 'session-1', 8)).toBe(false)
    expect(form_draft_is_current(replay, 'recovery', 'another-session', 7)).toBe(false)
  })

  it('does not clear a later input when an earlier IndexedDB write finishes', () => {
    write_workout_form_draft(key, data)
    write_workout_form_draft(key, {
      ...data, edit_sequence: 3,
      form: { session_quality: 9, coach_note: 'Later edit' },
    })
    clear_workout_form_draft(key, 2)
    expect(read_workout_form_draft<Feedback>(key)?.form.session_quality).toBe(9)
    clear_workout_form_draft(key, 3)
    expect(read_workout_form_draft(key)).toBeNull()
  })

  it('rebases later readiness edits after an older write finishes without erasing them', () => {
    const readiness_key = workout_form_key('readiness', 'session-1')
    write_workout_form_draft(readiness_key, {
      ...data, kind: 'readiness', edit_sequence: 5,
    })
    write_workout_form_draft(readiness_key, {
      ...data, kind: 'readiness', edit_sequence: 6,
      form: { session_quality: 10, coach_note: 'Last edit survives' },
    })
    expect(rebase_newer_workout_form_draft(readiness_key, 5, 7, 8)).toBe(true)
    clear_workout_form_draft(readiness_key, 5)
    const recovered = read_workout_form_draft<Feedback>(readiness_key)
    expect(recovered?.form.coach_note).toBe('Last edit survives')
    expect(form_draft_is_current(recovered, 'readiness', 'session-1', 8)).toBe(true)
    expect(rebase_newer_workout_form_draft(readiness_key, 6, 8, 9)).toBe(false)
  })

  it('rejects damaged or mismatched locally stored records', () => {
    const wrong_key = workout_form_key('readiness', 'session-2')
    write_workout_form_draft(wrong_key, data)
    expect(form_draft_is_current(read_workout_form_draft(wrong_key),
      'readiness', 'session-2', 7)).toBe(false)
    vi.stubGlobal('localStorage', {
      getItem: () => '{bad json',
    })
    expect(read_workout_form_draft(key)).toBeNull()
  })
})
