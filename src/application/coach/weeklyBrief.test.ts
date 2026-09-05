import { describe, expect, it } from 'vitest'
import type { TrainingExport } from './trainingExport'
import { build_weekly_coaching_brief } from './weeklyBrief'

const payload: TrainingExport = {
  format: 'project-freak-training-export',
  schema_version: '1.0.0',
  app_version: null,
  db_schema_version: 1,
  exported_at: '2026-09-04T19:00:00.000Z',
  scope: {
    type: 'last_7_days',
    from_date: '2026-08-29',
    to_date: '2026-09-04',
    exercise_ids: [],
    programme_block_id: null,
  },
  coach_instructions: {
    instruction_version: '1.0.0',
    purpose: 'Build the next week.',
    user_command: 'Build next week.',
    programming_hierarchy: ['Form', 'Target-muscle stimulus', 'Reps', 'Load'],
    review_requirements: [],
    rules: [],
    next_block: {
      length_days: 7,
      calendar_span: 'monday_to_sunday',
      schedule: {
        monday: 'train',
        tuesday: 'train',
        wednesday: 'recovery',
        thursday: 'train',
        friday: 'train',
        saturday: 'long_training_session',
        sunday: 'recovery',
      },
    },
    required_output: [],
    programme_output: {
      format: 'project-freak-programme',
      schema_version: '1.0.0',
      delivery: 'downloadable_json_file',
    },
  },
  coach_context: {
    training_priorities: {
      schema_version: '1.0.0',
      configured: true,
      current: [
        'Biceps',
        'Quads',
        'Lats',
        'Shoulders',
        'Triceps',
        'Traps',
        'Back',
        'Glutes',
        'Hamstrings',
        'Calfs',
        'Abs',
        'Chest',
      ],
      intent_by_area: {
        Biceps: 'grow',
        Triceps: 'grow',
        Shoulders: 'grow',
        Traps: 'grow',
        Lats: 'grow',
        Back: 'grow',
        Quads: 'grow',
        Glutes: 'grow',
        Hamstrings: 'grow',
        Calfs: 'grow',
        Abs: 'grow',
        Chest: 'maintain',
      },
      history: [],
    },
    exercise_catalogue: [],
    exercise_aliases: [],
  },
  sessions: [
    {
      id: 'session-1',
      legacy_workout_id: 'W50',
      session_name: 'W50',
      session_date_local: '2026-09-04',
      timezone: null,
      status: 'completed',
      started_at: null,
      completed_at: null,
      readiness: null,
      notes: null,
      exercises: [
        {
          session_exercise_id: 'session-exercise-1',
          exercise_id: 'exercise-1',
          exercise_name_snapshot: 'Nautilus Bicep Curl',
          planned_order: null,
          actual_order: 1,
          rotation_group_key: null,
          rotation_position: null,
          target: {
            target_sets: 2,
            target_rep_min: 8,
            target_rep_max: 12,
            rest_seconds: 90,
            tempo: '3-0-1-0',
            technique_cue: 'Keep shoulder still.',
          },
          metrics: {
            rpe: 9,
            pump: 8,
            form: 10,
            where_felt_text: 'Biceps',
            where_felt_tags: [],
            legacy_tension: null,
            legacy_mmc: null,
            notes: null,
          },
          notes: null,
          sets: [
            {
              id: 'set-1',
              set_number: 1,
              set_role: 'work',
              structure_type: 'straight',
              load_kg: 45,
              load_type: 'normal',
              rep_mode: 'total',
              reps_as_recorded: '12',
              primary_reps_completed: 12,
              left_reps_completed: null,
              right_reps_completed: null,
              completed_reps: 12,
              partial_reps: null,
              duration_seconds: null,
              failure_status: 'none',
              actual_rest_seconds: null,
              set_load_kg_reps: 540,
              set_load_method: 'kg_reps_full_reps_only_v1',
              notes: null,
              completed_at: null,
              components: [],
            },
            {
              id: 'set-2',
              set_number: 2,
              set_role: 'work',
              structure_type: 'straight',
              load_kg: 45,
              load_type: 'normal',
              rep_mode: 'total',
              reps_as_recorded: '10F',
              primary_reps_completed: 10,
              left_reps_completed: null,
              right_reps_completed: null,
              completed_reps: 10,
              partial_reps: null,
              duration_seconds: null,
              failure_status: 'attempted_next_rep_failed',
              actual_rest_seconds: null,
              set_load_kg_reps: 450,
              set_load_method: 'kg_reps_full_reps_only_v1',
              notes: null,
              completed_at: null,
              components: [],
            },
          ],
        },
      ],
    },
  ],
  provenance: null,
}

describe('build_weekly_coaching_brief', () => {
  it('produces a readable evidence summary without replacing the JSON source', () => {
    const brief = build_weekly_coaching_brief(payload)

    expect(brief).toContain('PROJECT FREAK — WEEKLY COACHING BRIEF')
    expect(brief).toContain('Scope: 2026-08-29 to 2026-09-04')
    expect(brief).toContain('Comparable volume: 990 kg')
    expect(brief).toContain('1. Biceps | 2. Quads')
    expect(brief).toContain('Nautilus Bicep Curl [exercise-1]')
    expect(brief).toContain('2 sets | 8–12 reps | 90s rest')
    expect(brief).toContain('S1 45 kg × 12 | S2 45 kg × 10F')
    expect(brief).toContain('RPE 9 | Pump 8 | Form 10 | Where felt Biceps')
    expect(brief).toContain('Sessions without readiness/recovery: 1')
    expect(brief).toContain(
      'The next programme JSON is the prescription. Historical performance is evidence',
    )
  })
})
