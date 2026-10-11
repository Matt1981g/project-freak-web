import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clear_workout_draft,
  read_workout_draft,
  should_recover_workout_draft,
  track_workout_write,
  workout_draft_key,
  workout_update_is_unsafe,
  write_workout_draft,
  type WorkoutSetDraft,
} from './workoutDraftJournal'

const KEY = workout_draft_key('session-a', 'exercise-a', 2)
const INITIAL: WorkoutSetDraft = {
  version: 1, session_id: 'session-a', exercise_id: 'exercise-a',
  set_number: 2, base_revision: 4, edit_sequence: 1, changed_at: 100,
  load_kg: 60, completed_reps: 12, rpe: 9,
  failed_next_rep: false, components: [],
}

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size },
  })
})

describe('uncommitted workout edit journal', () => {
  it('restores the exact set after a simulated full reload without any database write', () => {
    expect(write_workout_draft(KEY, INITIAL)).toBe(true)
    expect(read_workout_draft(KEY)).toEqual(INITIAL)
    expect(should_recover_workout_draft(
      read_workout_draft(KEY), 'session-a', 'exercise-a', 2, 4, false,
    )).toBe(true)
    expect(should_recover_workout_draft(
      read_workout_draft(KEY), 'other-session', 'exercise-a', 2, 4, false,
    )).toBe(false)
  })

  it('never replays a stale revision or resurrects a completed set', () => {
    expect(should_recover_workout_draft(INITIAL, 'session-a', 'exercise-a', 2, 5, false))
      .toBe(false)
    expect(should_recover_workout_draft(INITIAL, 'session-a', 'exercise-a', 2, 4, true))
      .toBe(false)
  })

  it('clears only the exact snapshot after its async write, not a newer keystroke', () => {
    write_workout_draft(KEY, INITIAL)
    write_workout_draft(KEY, { ...INITIAL, edit_sequence: 2, completed_reps: 13 })
    clear_workout_draft(KEY, 1)
    expect(read_workout_draft(KEY)?.completed_reps).toBe(13)
    clear_workout_draft(KEY, 2)
    expect(read_workout_draft(KEY)).toBeNull()
  })

  it('prevents app update during a draft or an in-flight save', async () => {
    write_workout_draft(KEY, INITIAL)
    expect(workout_update_is_unsafe('#/workout/session-a')).toBe(true)
    expect(workout_update_is_unsafe('#/plan')).toBe(false)
    clear_workout_draft(KEY)
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const saving = track_workout_write(pending)
    expect(workout_update_is_unsafe('#/workout/session-a')).toBe(true)
    release()
    await saving
    expect(workout_update_is_unsafe('#/workout/session-a')).toBe(false)
  })

  it('fails closed on unavailable device storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota exceeded') },
      key: () => { throw new Error('blocked') },
      get length() { throw new Error('blocked') },
    })
    expect(write_workout_draft(KEY, INITIAL)).toBe(false)
    expect(read_workout_draft(KEY)).toBeNull()
    expect(workout_update_is_unsafe('#/workout/session-a')).toBe(true)
  })
})
