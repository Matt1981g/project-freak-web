import { create_uuid } from '../../domain/ids/uuid'
import type {
  Exercise,
  ProgrammeBlock,
  ProgrammedSession,
  ProgrammedSessionExercise,
  ProgrammedSessionSet,
  ProgrammedSetComponent,
  TemplateExercise,
  TemplateSet,
  TemplateSetComponent,
  WorkoutTemplate,
} from '../../domain/models'
import type {
  ExerciseRepository,
  ProgrammeImportEntities,
  ProgrammeRepository,
} from '../../data/repositories/contracts'
import {
  programme_import_schema,
  type ProgrammeImportComponent,
  type ProgrammeImportDocument,
  type ProgrammeImportExercise,
  type ProgrammeImportSet,
} from '../../schemas/programmeImport'

export interface ProgrammeImportIssue {
  severity: 'warning' | 'error'
  code: string
  path: string
  message: string
}

export interface ProgrammeExerciseResolution {
  exercise_id: string
  imported_name: string
  canonical_name: string
  revision: number
}

export interface ProgrammeImportPreview {
  source_id: string
  document_hash: string
  document: ProgrammeImportDocument | null
  issues: ProgrammeImportIssue[]
  exercise_resolutions: ProgrammeExerciseResolution[]
  counts: {
    sessions: number
    exercises: number
    sets: number
    components: number
  }
  can_commit: boolean
}

function stable_stringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable_stringify(item)).join(',')}]`
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable_stringify(record[key])}`,
      )
      .join(',')}}`
  }

  return JSON.stringify(value) ?? 'undefined'
}

async function sha256_text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function issue(
  severity: ProgrammeImportIssue['severity'],
  code: string,
  path: string,
  message: string,
): ProgrammeImportIssue {
  return { severity, code, path, message }
}

function validate_min_max(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
  path: string,
  issues: ProgrammeImportIssue[],
): void {
  if (
    minimum !== null &&
    minimum !== undefined &&
    maximum !== null &&
    maximum !== undefined &&
    minimum > maximum
  ) {
    issues.push(
      issue(
        'error',
        'invalid_range',
        path,
        `Minimum ${minimum} cannot exceed maximum ${maximum}.`,
      ),
    )
  }
}

function validate_component(
  component: ProgrammeImportComponent,
  path: string,
  issues: ProgrammeImportIssue[],
): void {
  validate_min_max(
    component.target_rep_min,
    component.target_rep_max,
    `${path}.reps`,
    issues,
  )

  if (
    component.load_relation === 'absolute' &&
    (component.target_load_kg === null ||
      component.target_load_kg === undefined)
  ) {
    issues.push(
      issue(
        'error',
        'absolute_component_missing_load',
        path,
        'Absolute component load requires target_load_kg.',
      ),
    )
  }

  if (
    component.load_relation === 'percentage_of_primary' &&
    (component.target_load_percent === null ||
      component.target_load_percent === undefined)
  ) {
    issues.push(
      issue(
        'error',
        'percentage_component_missing_percent',
        path,
        'Percentage-of-primary component requires target_load_percent.',
      ),
    )
  }
}

function validate_set(
  set: ProgrammeImportSet,
  path: string,
  issues: ProgrammeImportIssue[],
): void {
  validate_min_max(set.target_rep_min, set.target_rep_max, `${path}.reps`, issues)

  const component_sequences = new Set<number>()
  for (const [component_index, component] of set.components.entries()) {
    if (component_sequences.has(component.sequence)) {
      issues.push(
        issue(
          'error',
          'duplicate_component_sequence',
          `${path}.components[${component_index}]`,
          `Component sequence ${component.sequence} is duplicated.`,
        ),
      )
    }
    component_sequences.add(component.sequence)

    validate_component(
      component,
      `${path}.components[${component_index}]`,
      issues,
    )
  }

  if (set.structure_type === 'straight' && set.components.length > 0) {
    issues.push(
      issue(
        'error',
        'straight_set_has_components',
        path,
        'Straight sets cannot contain drop/rest-pause/myo/partial components.',
      ),
    )
  }

  if (
    ['drop', 'rest_pause', 'myo_rep', 'partials'].includes(
      set.structure_type,
    ) &&
    set.components.length === 0
  ) {
    issues.push(
      issue(
        'error',
        'structured_set_missing_components',
        path,
        `${set.structure_type} requires at least one explicit component.`,
      ),
    )
  }
}

function validate_exercise(
  exercise: ProgrammeImportExercise,
  path: string,
  issues: ProgrammeImportIssue[],
): void {
  validate_min_max(
    exercise.target_rep_min,
    exercise.target_rep_max,
    `${path}.target_reps`,
    issues,
  )

  if (
    exercise.target_sets !== null &&
    exercise.target_sets !== undefined &&
    exercise.target_sets !== exercise.sets.length
  ) {
    issues.push(
      issue(
        'error',
        'target_set_count_mismatch',
        path,
        `target_sets=${exercise.target_sets} but ${exercise.sets.length} explicit sets were supplied.`,
      ),
    )
  }

  if (
    (exercise.rotation_group_key === null ||
      exercise.rotation_group_key === undefined) !==
    (exercise.rotation_position === null ||
      exercise.rotation_position === undefined)
  ) {
    issues.push(
      issue(
        'error',
        'incomplete_rotation_definition',
        path,
        'rotation_group_key and rotation_position must either both be set or both be null.',
      ),
    )
  }

  const set_numbers = new Set<number>()
  for (const [set_index, set] of exercise.sets.entries()) {
    if (set_numbers.has(set.set_number)) {
      issues.push(
        issue(
          'error',
          'duplicate_set_number',
          `${path}.sets[${set_index}]`,
          `Set number ${set.set_number} is duplicated.`,
        ),
      )
    }
    set_numbers.add(set.set_number)
    validate_set(set, `${path}.sets[${set_index}]`, issues)
  }
}

function validate_document_semantics(
  document: ProgrammeImportDocument,
  active_exercises: Exercise[],
): {
  issues: ProgrammeImportIssue[]
  resolutions: ProgrammeExerciseResolution[]
} {
  const issues: ProgrammeImportIssue[] = []
  const resolutions: ProgrammeExerciseResolution[] = []
  const active_by_id = new Map(
    active_exercises.map((exercise) => [exercise.id, exercise]),
  )

  const programme = document.programme
  if (
    programme.start_date_local &&
    programme.end_date_local &&
    programme.start_date_local > programme.end_date_local
  ) {
    issues.push(
      issue(
        'error',
        'programme_date_range_invalid',
        'programme',
        'Programme start date cannot be after end date.',
      ),
    )
  }

  const session_external_ids = new Set<string>()

  for (const [session_index, session] of programme.sessions.entries()) {
    const session_path = `programme.sessions[${session_index}]`

    if (session.external_id) {
      if (session_external_ids.has(session.external_id)) {
        issues.push(
          issue(
            'error',
            'duplicate_session_external_id',
            session_path,
            `Session external_id "${session.external_id}" is duplicated.`,
          ),
        )
      }
      session_external_ids.add(session.external_id)
    } else {
      issues.push(
        issue(
          'warning',
          'session_missing_external_id',
          session_path,
          'Session has no external_id, so future changed imports cannot be linked to this template family automatically.',
        ),
      )
    }

    const orders = new Set<number>()
    const rotation_groups = new Map<string, number[]>()

    for (const [exercise_index, exercise] of session.exercises.entries()) {
      const exercise_path = `${session_path}.exercises[${exercise_index}]`

      if (orders.has(exercise.planned_order)) {
        issues.push(
          issue(
            'error',
            'duplicate_planned_order',
            exercise_path,
            `planned_order ${exercise.planned_order} is duplicated in this session.`,
          ),
        )
      }
      orders.add(exercise.planned_order)

      const resolved = active_by_id.get(exercise.exercise_id)
      if (!resolved) {
        issues.push(
          issue(
            'error',
            'unknown_or_archived_exercise_id',
            exercise_path,
            `Exercise ID "${exercise.exercise_id}" is not an active exercise definition.`,
          ),
        )
      } else {
        resolutions.push({
          exercise_id: resolved.id,
          imported_name: exercise.exercise_name,
          canonical_name: resolved.canonical_name,
          revision: resolved.revision,
        })

        if (exercise.exercise_name !== resolved.canonical_name) {
          issues.push(
            issue(
              'warning',
              'exercise_name_snapshot_updated',
              exercise_path,
              `Imported name "${exercise.exercise_name}" differs from current canonical name "${resolved.canonical_name}". The programmed snapshot will use the current canonical name.`,
            ),
          )
        }
      }

      if (exercise.rotation_group_key && exercise.rotation_position) {
        const positions =
          rotation_groups.get(exercise.rotation_group_key) ?? []
        positions.push(exercise.rotation_position)
        rotation_groups.set(exercise.rotation_group_key, positions)
      }

      validate_exercise(exercise, exercise_path, issues)
    }

    for (const [group_key, positions] of rotation_groups) {
      if (positions.length < 2) {
        issues.push(
          issue(
            'error',
            'rotation_group_too_small',
            session_path,
            `Rotation group "${group_key}" must contain at least two exercises.`,
          ),
        )
      }

      if (new Set(positions).size !== positions.length) {
        issues.push(
          issue(
            'error',
            'duplicate_rotation_position',
            session_path,
            `Rotation group "${group_key}" has duplicate rotation positions.`,
          ),
        )
      }
    }
  }

  return { issues, resolutions }
}

export async function preview_programme_import(
  json_text: string,
  exercises: ExerciseRepository,
): Promise<ProgrammeImportPreview> {
  let raw: unknown

  try {
    raw = JSON.parse(json_text)
  } catch {
    return {
      source_id: '',
      document_hash: '',
      document: null,
      issues: [
        issue(
          'error',
          'invalid_json',
          '$',
          'The programme file is not valid JSON.',
        ),
      ],
      exercise_resolutions: [],
      counts: { sessions: 0, exercises: 0, sets: 0, components: 0 },
      can_commit: false,
    }
  }

  const parsed = programme_import_schema.safeParse(raw)
  if (!parsed.success) {
    return {
      source_id: '',
      document_hash: '',
      document: null,
      issues: parsed.error.issues.map((entry) =>
        issue(
          'error',
          'schema_validation_error',
          entry.path.length > 0 ? entry.path.join('.') : '$',
          entry.message,
        ),
      ),
      exercise_resolutions: [],
      counts: { sessions: 0, exercises: 0, sets: 0, components: 0 },
      can_commit: false,
    }
  }

  const document = parsed.data
  const canonical_json = stable_stringify(document)
  const document_hash = await sha256_text(canonical_json)
  const semantic = validate_document_semantics(
    document,
    await exercises.list_active(),
  )

  const all_exercises = document.programme.sessions.flatMap(
    (session) => session.exercises,
  )
  const all_sets = all_exercises.flatMap((exercise) => exercise.sets)
  const all_components = all_sets.flatMap((set) => set.components)

  return {
    source_id: `programme-json:${document_hash}`,
    document_hash,
    document,
    issues: semantic.issues,
    exercise_resolutions: semantic.resolutions,
    counts: {
      sessions: document.programme.sessions.length,
      exercises: all_exercises.length,
      sets: all_sets.length,
      components: all_components.length,
    },
    can_commit: !semantic.issues.some((entry) => entry.severity === 'error'),
  }
}

function metadata(
  id: string,
  timestamp: string,
  device_id: string,
  source_id: string,
) {
  return {
    id,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    revision: 1,
    device_id,
    source_kind: 'programme_import' as const,
    source_id,
  }
}

function template_family_id(
  document: ProgrammeImportDocument,
  session_index: number,
): string {
  const session = document.programme.sessions[session_index]

  if (session.external_id) {
    return document.programme.external_id
      ? `programme:${document.programme.external_id}:session:${session.external_id}`
      : `session:${session.external_id}`
  }

  return create_uuid()
}

function resolution_map(preview: ProgrammeImportPreview) {
  return new Map(
    preview.exercise_resolutions.map((resolution) => [
      resolution.exercise_id,
      resolution,
    ]),
  )
}

function copied_set_fields(set: ProgrammeImportSet) {
  return {
    set_number: set.set_number,
    set_role: set.set_role,
    structure_type: set.structure_type,
    target_rep_min: set.target_rep_min ?? null,
    target_rep_max: set.target_rep_max ?? null,
    target_duration_seconds: set.target_duration_seconds ?? null,
    target_load_kg: set.target_load_kg ?? null,
    target_load_type: set.target_load_type,
    failure_target: set.failure_target,
    notes: set.notes ?? null,
  }
}

function copied_component_fields(component: ProgrammeImportComponent) {
  return {
    sequence: component.sequence,
    component_type: component.component_type,
    target_load_kg: component.target_load_kg ?? null,
    load_relation: component.load_relation,
    target_load_percent: component.target_load_percent ?? null,
    target_rep_min: component.target_rep_min ?? null,
    target_rep_max: component.target_rep_max ?? null,
    target_duration_seconds: component.target_duration_seconds ?? null,
    failure_target: component.failure_target,
    notes: component.notes ?? null,
  }
}

export async function build_programme_import_entities(
  preview: ProgrammeImportPreview,
  programme_repository: ProgrammeRepository,
  device_id: string,
  timestamp = new Date().toISOString(),
): Promise<ProgrammeImportEntities> {
  if (!preview.can_commit || !preview.document) {
    throw new Error('Programme preview contains blocking validation errors.')
  }

  const document = preview.document
  const resolutions = resolution_map(preview)
  const block_id = create_uuid()

  const block: ProgrammeBlock = {
    ...metadata(block_id, timestamp, device_id, preview.source_id),
    name: document.programme.name,
    block_type: document.programme.block_type ?? 'custom',
    start_date_local: document.programme.start_date_local ?? null,
    end_date_local: document.programme.end_date_local ?? null,
    status: 'draft',
    goal: document.programme.goal ?? null,
    notes: document.programme.notes ?? null,
  }

  const templates: WorkoutTemplate[] = []
  const template_exercises: TemplateExercise[] = []
  const template_sets: TemplateSet[] = []
  const template_set_components: TemplateSetComponent[] = []
  const programmed_sessions: ProgrammedSession[] = []
  const programmed_session_exercises: ProgrammedSessionExercise[] = []
  const programmed_session_sets: ProgrammedSessionSet[] = []
  const programmed_set_components: ProgrammedSetComponent[] = []

  for (const [session_index, session] of document.programme.sessions.entries()) {
    const template_id = create_uuid()
    const programmed_session_id = create_uuid()
    const family_id = template_family_id(document, session_index)
    const previous_version =
      await programme_repository.get_latest_template_version(family_id)
    const version_number = previous_version + 1

    templates.push({
      ...metadata(template_id, timestamp, device_id, preview.source_id),
      programme_block_id: block_id,
      name: session.name,
      day_label: session.day_label ?? null,
      template_family_id: family_id,
      version_number,
      status: 'draft',
      notes: session.notes ?? null,
    })

    programmed_sessions.push({
      ...metadata(
        programmed_session_id,
        timestamp,
        device_id,
        preview.source_id,
      ),
      programme_block_id: block_id,
      workout_template_id: template_id,
      scheduled_date_local: session.scheduled_date_local ?? null,
      name_snapshot: session.name,
      status: 'planned',
      notes: session.notes ?? null,
    })

    for (const exercise of session.exercises) {
      const resolution = resolutions.get(exercise.exercise_id)
      if (!resolution) {
        throw new Error(
          `Exercise ${exercise.exercise_id} was not resolved during preview.`,
        )
      }

      const template_exercise_id = create_uuid()
      const programmed_exercise_id = create_uuid()
      const target_sets = exercise.target_sets ?? exercise.sets.length

      template_exercises.push({
        ...metadata(
          template_exercise_id,
          timestamp,
          device_id,
          preview.source_id,
        ),
        workout_template_id: template_id,
        exercise_id: exercise.exercise_id,
        planned_order: exercise.planned_order,
        rotation_group_key: exercise.rotation_group_key ?? null,
        rotation_position: exercise.rotation_position ?? null,
        target_sets,
        target_rep_min: exercise.target_rep_min ?? null,
        target_rep_max: exercise.target_rep_max ?? null,
        rest_seconds: exercise.rest_seconds ?? null,
        tempo: exercise.tempo ?? null,
        technique_cue: exercise.technique_cue ?? null,
        notes: exercise.notes ?? null,
      })

      programmed_session_exercises.push({
        ...metadata(
          programmed_exercise_id,
          timestamp,
          device_id,
          preview.source_id,
        ),
        programmed_session_id,
        exercise_id: exercise.exercise_id,
        exercise_name_snapshot: resolution.canonical_name,
        planned_order: exercise.planned_order,
        rotation_group_key: exercise.rotation_group_key ?? null,
        rotation_position: exercise.rotation_position ?? null,
        target_sets,
        target_rep_min: exercise.target_rep_min ?? null,
        target_rep_max: exercise.target_rep_max ?? null,
        rest_seconds: exercise.rest_seconds ?? null,
        tempo: exercise.tempo ?? null,
        technique_cue: exercise.technique_cue ?? null,
        notes: exercise.notes ?? null,
      })

      for (const set of exercise.sets) {
        const template_set_id = create_uuid()
        const programmed_set_id = create_uuid()

        template_sets.push({
          ...metadata(
            template_set_id,
            timestamp,
            device_id,
            preview.source_id,
          ),
          template_exercise_id,
          ...copied_set_fields(set),
        })

        programmed_session_sets.push({
          ...metadata(
            programmed_set_id,
            timestamp,
            device_id,
            preview.source_id,
          ),
          programmed_session_exercise_id: programmed_exercise_id,
          ...copied_set_fields(set),
        })

        for (const component of set.components) {
          template_set_components.push({
            ...metadata(
              create_uuid(),
              timestamp,
              device_id,
              preview.source_id,
            ),
            template_set_id,
            ...copied_component_fields(component),
          })

          programmed_set_components.push({
            ...metadata(
              create_uuid(),
              timestamp,
              device_id,
              preview.source_id,
            ),
            programmed_session_set_id: programmed_set_id,
            ...copied_component_fields(component),
          })
        }
      }
    }
  }

  return {
    block,
    templates,
    template_exercises,
    template_sets,
    template_set_components,
    programmed_sessions,
    programmed_session_exercises,
    programmed_session_sets,
    programmed_set_components,
  }
}

export async function commit_programme_import(
  preview: ProgrammeImportPreview,
  programme_repository: ProgrammeRepository,
  device_id: string,
): Promise<'committed' | 'duplicate_noop'> {
  const entities = await build_programme_import_entities(
    preview,
    programme_repository,
    device_id,
  )

  return programme_repository.commit_import(entities)
}
