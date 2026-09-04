import { describe, expect, it } from 'vitest'
import {
  next_exercise_after_completion,
  next_rotation_exercise_id,
  type RotationExercise,
} from './pairedRotation'

function exercise(
  id: string,
  order: number,
  group: string | null,
  position: number | null,
  complete = false,
): RotationExercise {
  return {
    id,
    actual_order: order,
    rotation_group_key: group,
    rotation_position: position,
    completed_at: complete ? '2026-09-04T18:00:00.000Z' : null,
  }
}

describe('paired exercise rotation', () => {
  const sequence = [
    exercise('a1', 1, 'A', 1),
    exercise('a2', 2, 'A', 2),
    exercise('b1', 3, 'B', 1),
    exercise('b2', 4, 'B', 2),
    exercise('single', 5, null, null),
  ]

  it('rotates A1 to A2 and A2 back to A1', () => {
    expect(next_rotation_exercise_id(sequence, 'a1')).toBe('a2')
    expect(next_rotation_exercise_id(sequence, 'a2')).toBe('a1')
  })

  it('does not invent rotation for a normal exercise', () => {
    expect(next_rotation_exercise_id(sequence, 'single')).toBeNull()
  })

  it('after finishing A1, keeps the athlete inside the pair while A2 remains', () => {
    const state = [
      exercise('a1', 1, 'A', 1, true),
      exercise('a2', 2, 'A', 2, false),
      exercise('b1', 3, 'B', 1, false),
    ]

    expect(next_exercise_after_completion(state, 'a1')).toBe('a2')
  })

  it('after both A exercises are complete, advances to the next unfinished exercise', () => {
    const state = [
      exercise('a1', 1, 'A', 1, true),
      exercise('a2', 2, 'A', 2, true),
      exercise('b1', 3, 'B', 1, false),
      exercise('b2', 4, 'B', 2, false),
    ]

    expect(next_exercise_after_completion(state, 'a2')).toBe('b1')
  })
})
