import { z } from 'zod'
import {
  FAILURE_TARGETS,
  LOAD_TYPES,
  SET_COMPONENT_TYPES,
  SET_ROLES,
  STRUCTURE_TYPES,
} from '../domain/enums/training'

const iso_date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const nullable_nonempty_string = z.string().min(1).nullable().optional()

const component_schema = z
  .object({
    sequence: z.number().int().min(1),
    component_type: z.enum(SET_COMPONENT_TYPES),
    target_load_kg: z.number().min(0).nullable().optional(),
    load_relation: z
      .enum([
        'absolute',
        'same_as_primary',
        'percentage_of_primary',
        'unknown',
      ])
      .default('unknown'),
    target_load_percent: z.number().positive().nullable().optional(),
    target_rep_min: z.number().int().min(0).nullable().optional(),
    target_rep_max: z.number().int().min(0).nullable().optional(),
    target_duration_seconds: z.number().int().min(0).nullable().optional(),
    failure_target: z.enum(FAILURE_TARGETS).default('none'),
    notes: z.string().nullable().optional(),
  })
  .strict()

const set_schema = z
  .object({
    set_number: z.number().int().min(1),
    set_role: z.enum(SET_ROLES),
    structure_type: z.enum(STRUCTURE_TYPES),
    target_rep_min: z.number().int().min(0).nullable().optional(),
    target_rep_max: z.number().int().min(0).nullable().optional(),
    target_duration_seconds: z.number().int().min(0).nullable().optional(),
    target_load_kg: z.number().min(0).nullable().optional(),
    target_load_type: z.enum(LOAD_TYPES).default('unknown'),
    failure_target: z.enum(FAILURE_TARGETS),
    notes: z.string().nullable().optional(),
    components: z.array(component_schema).default([]),
  })
  .strict()

const exercise_schema = z
  .object({
    exercise_id: z.string().min(1),
    exercise_name: z.string().min(1),
    planned_order: z.number().int().min(1),
    rotation_group_key: nullable_nonempty_string,
    rotation_position: z.number().int().min(1).nullable().optional(),
    target_sets: z.number().int().min(1).nullable().optional(),
    target_rep_min: z.number().int().min(0).nullable().optional(),
    target_rep_max: z.number().int().min(0).nullable().optional(),
    rest_seconds: z.number().int().min(0).nullable().optional(),
    tempo: z.string().nullable().optional(),
    technique_cue: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    sets: z.array(set_schema).min(1),
  })
  .strict()

const session_schema = z
  .object({
    external_id: nullable_nonempty_string,
    name: z.string().min(1),
    scheduled_date_local: iso_date.nullable().optional(),
    day_label: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    exercises: z.array(exercise_schema).min(1),
  })
  .strict()

const programme_schema = z
  .object({
    external_id: nullable_nonempty_string,
    name: z.string().min(1),
    block_type: z
      .enum(['mesocycle', 'microcycle', 'custom'])
      .nullable()
      .optional(),
    start_date_local: iso_date.nullable().optional(),
    end_date_local: iso_date.nullable().optional(),
    goal: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    sessions: z.array(session_schema).min(1),
  })
  .strict()

export const programme_import_schema = z
  .object({
    format: z.literal('project-freak-programme'),
    schema_version: z.literal('1.0.0'),
    generated_at: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    programme: programme_schema,
  })
  .strict()

export type ProgrammeImportDocument = z.infer<typeof programme_import_schema>
export type ProgrammeImportSession = ProgrammeImportDocument['programme']['sessions'][number]
export type ProgrammeImportExercise = ProgrammeImportSession['exercises'][number]
export type ProgrammeImportSet = ProgrammeImportExercise['sets'][number]
export type ProgrammeImportComponent = ProgrammeImportSet['components'][number]
