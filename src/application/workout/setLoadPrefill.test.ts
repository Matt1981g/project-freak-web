import { describe, expect, it } from 'vitest'
import type { TrainingSet } from '../../domain/models'
import type { PreviousComparablePerformance } from './previousComparable'
import type { ProgressionSuggestion } from './progressionSuggestion'
import { select_set_load_prefill } from './setLoadPrefill'

const progression = (
  verdict: ProgressionSuggestion['verdict'],
): ProgressionSuggestion => ({
  verdict,
  label:
    verdict === 'hold_load'
      ? 'HOLD LOAD'
      : verdict === 'add_reps'
        ? 'ADD REPS'
        : verdict === 'consider_load_increase'
          ? 'CONSIDER LOAD INCREASE'
          : 'INSUFFICIENT DATA',
  reason: 'fixture',
})

const previous: PreviousComparablePerformance = {
  session_id: 'session-old',
  session_date_local: '2026-09-01',
  source_exercise_name: 'Nautilus Bicep Curl',
  sets: [
    {
      set_number: 1,
      load_kg: 45,
      completed_reps: 10,
      failure_status: 'none',
      volume_kg: 450,
    },
    {
      set_number: 2,
      load_kg: 47.5,
      completed_reps: 8,
      failure_status: 'none',
      volume_kg: 380,
    },
  ],
  metrics: undefined,
  total_volume_kg: 830,
}

function saved_set(load_kg: number | null): TrainingSet {
  return {
    id: 'set-1',
    created_at: '2026-09-04T05:00:00.000Z',
    updated_at: '2026-09-04T05:00:00.000Z',
    deleted_at: null,
    revision: 1,
    device_id: 'device-1',
    source_kind: 'user',
    source_id: null,
    completed_session_id: 'session-1',
    session_exercise_id: 'session-exercise-1',
    exercise_id: 'exercise-1',
    exercise_order_snapshot: 1,
    set_number: 1,
    set_role: 'work',
    structure_type: 'straight',
    load_kg,
    load_type: 'normal',
    rep_mode: 'total',
    reps_as_recorded: null,
    primary_reps_completed: null,
    left_reps_completed: null,
    right_reps_completed: null,
    completed_reps: null,
    partial_reps: null,
    duration_seconds: null,
    failure_status: 'none',
    left_failure_status: null,
    right_failure_status: null,
    actual_rest_seconds: null,
    set_load_kg_reps: null,
    set_load_method: null,
    notes: null,
    completed_at: null,
    source_record_key: null,
  }
}

describe('select_set_load_prefill', () => {
  it('preserves an already-saved load over programme and history', () => {
    expect(
      select_set_load_prefill({
        existing_set: saved_set(42.5),
        programmed_load_kg: 50,
        previous,
        progression: progression('add_reps'),
        set_number: 1,
      }),
    ).toEqual({ load_kg: 42.5, source: 'saved' })
  })

  it('preserves an intentionally saved blank', () => {
    expect(
      select_set_load_prefill({
        existing_set: saved_set(null),
        programmed_load_kg: 50,
        previous,
        progression: progression('add_reps'),
        set_number: 1,
      }),
    ).toEqual({ load_kg: null, source: 'saved' })
  })

  it('prefers an explicit programmed load over previous comparable load', () => {
    expect(
      select_set_load_prefill({
        existing_set: null,
        programmed_load_kg: 50,
        previous,
        progression: progression('add_reps'),
        set_number: 1,
      }),
    ).toEqual({ load_kg: 50, source: 'programme' })
  })

  it('uses the matching previous set load for actionable progression', () => {
    expect(
      select_set_load_prefill({
        existing_set: null,
        programmed_load_kg: null,
        previous,
        progression: progression('hold_load'),
        set_number: 2,
      }),
    ).toEqual({ load_kg: 47.5, source: 'previous_comparable' })
  })

  it('does not invent a load when progression is insufficient', () => {
    expect(
      select_set_load_prefill({
        existing_set: null,
        programmed_load_kg: null,
        previous,
        progression: progression('insufficient_data'),
        set_number: 1,
      }),
    ).toEqual({ load_kg: null, source: 'blank' })
  })

  it('stays blank when the previous session has no matching set number', () => {
    expect(
      select_set_load_prefill({
        existing_set: null,
        programmed_load_kg: null,
        previous,
        progression: progression('add_reps'),
        set_number: 3,
      }),
    ).toEqual({ load_kg: null, source: 'blank' })
  })
})
