import type {
  CompletedSession,
  ExerciseAlias,
  ReadinessEntry,
  SetComponent,
  TrainingSet,
} from '../../domain/models'
import type {
  ProgrammedSessionExerciseDetail,
  RepositoryBundle,
} from '../../data/repositories/contracts'
import { load_training_priorities } from '../priorities/trainingPriorities'
import { load_analysis_dashboard_data } from '../analysis/dashboard'
import { load_coach_excluded_sessions } from './coachExclusions'
import { ACTIVE_GYM_SETTING_KEY, TRIDENT_GYM_ID } from '../gyms/gymProfiles'
import { PROGRESS_ENGINE_V2_RULES } from '../workout/progressEngineV2'
import {
  build_next_week_availability_instruction,
  load_next_week_availability,
  type NextWeekAvailabilityInstruction,
} from './nextWeekAvailability'

export const TRAINING_EXPORT_FORMAT = 'project-freak-training-export' as const
export const TRAINING_EXPORT_SCHEMA_VERSION = '1.0.0' as const
export const COACH_INSTRUCTIONS_VERSION = '3.0.0' as const

export type TrainingExportScopeType =
  | 'today'
  | 'last_7_days'
  | 'exercise'
  | 'programme_block'
  | 'full'

export type TrainingExportScopeRequest =
  | { type: 'today' }
  | { type: 'last_7_days' }
  | { type: 'exercise'; exercise_id: string }
  | { type: 'programme_block'; programme_block_id: string }
  | { type: 'full' }

export interface TrainingExportCoachInstructions {
  instruction_version: typeof COACH_INSTRUCTIONS_VERSION
  purpose: string
  user_command: string
  programming_hierarchy: string[]
  review_requirements: string[]
  rules: string[]
  authority: {
    progress_engine_owns: string[]
    coach_owns: string[]
    conflict_rule: string
  }
  weekly_programming_doctrine: string[]
  exercise_selection_rules: string[]
  volume_failure_rules: string[]
  progress_engine: {
    version: typeof PROGRESS_ENGINE_V2_RULES.version
    decision_states: readonly [
      'CALIBRATE',
      'RESET',
      'HOLD',
      'REPS_UP',
      'LOAD_UP',
      'LOAD_DOWN',
      'DELOAD_HOLD',
      'REVIEW',
    ]
    hierarchy: typeof PROGRESS_ENGINE_V2_RULES.hierarchy
    thresholds: {
      good_form: number
      minimum_acceptable_form: number
      good_pump: number
      poor_pump: number
      high_rpe_concern: number
      calibration_exposures: number
      poor_machine_min_exposures: number
      plateau_exposures: number
      reset_window: number
      reset_required_poor_exposures: number
      set_dropoff_percent: number
      load_down_percent: readonly [number, number]
      reset_percent: readonly [number, number]
      severe_reset_percent: readonly [number, number]
      deload_load_percent: readonly [number, number]
      deload_set_percent: readonly [number, number]
      response_weights: {
        form: number
        pump: number
        reps: number
        rpe: number
      }
    }
  }
  next_block: {
    length_days: 7
    calendar_span: 'monday_to_sunday'
    availability: NextWeekAvailabilityInstruction
  }
  required_output: string[]
  output_validation: string[]
  programme_output: {
    format: 'project-freak-programme'
    schema_version: '1.0.0'
    delivery: 'downloadable_json_file'
  }
}

function build_coach_instructions(
  availability: NextWeekAvailabilityInstruction,
): TrainingExportCoachInstructions {
  return {
    instruction_version: COACH_INSTRUCTIONS_VERSION,
    purpose:
      'Review the supplied PROJECT FREAK training evidence and create the next 7-day hypertrophy programme.',
    user_command: 'Build next week.',
    programming_hierarchy: [
      'Form',
      'Target-muscle stimulus',
      'Reps',
      'Load',
    ],
    review_requirements: [
      'Compare programmed targets with actual performance',
      'Review completed working sets, reps and load',
      'Review comparable tonnage and exercise progression',
      'Review RPE, Pump and Form',
      'Review failure exposure',
      'Review readiness and recovery',
      'Review actual rest where useful',
      'Review weekly volume and frequency',
      'Review direct and secondary muscle exposure, frequency and failure exposure',
      'Review Grow/Maintain intent; priority order ranks growth resources within Grow areas',
      'Review muscle-specific next-session recovery feedback',
      'Review underperformance signals and their underlying evidence',
      'Review the adaptive deload recommendation and confidence',
      'Review Progress Engine V2 states and exceptions before changing exercise loads',
      'Review the dated next-week availability constraint before constructing the schedule',
      'Use historical performance supplied in this export',
      'Respect the current PROJECT FREAK training priority order',
    ],
    rules: [
      'Do not call increased load progress if execution or target-muscle stimulus deteriorated',
      'Treat PF_ADAPTIVE_CHALLENGE and PF_COACH_CHALLENGE targets as stretch prescriptions, not established baselines. Missing a harder challenge once is not regression by itself; compare against pre-challenge actual performance, Form, target-muscle stimulus and repeated evidence.',
      'When deliberately prescribing a harder-than-proven load or rep target in the next programme, include PF_COACH_CHALLENGE in that programmed set notes so PROJECT FREAK can identify the stretch attempt.',
      'Do not fabricate missing loads, reps, scores or historical information',
      'Use only exercise IDs supplied in coach_context.exercise_catalogue',
      'The exercise catalogue is hard-filtered to the currently selected gym; never use an exercise ID absent from it',
      'Treat equipment explicitly marked unavailable or unconfirmed as prohibited for programming',
      'Use coach_context.exercise_aliases to resolve historical names without rewriting history',
      'Do not rewrite historical actuals',
      'Use advanced set methods only when justified by the evidence',
      'Leave target_load_kg null when the evidence does not justify a specific load',
      'For Maintain areas, use the minimum effective work needed to preserve muscle and performance rather than chasing progression for its own sake',
      'For Grow areas, allocate recoverable growth work according to the supplied priority order',
      'Treat category-fallback secondary muscle exposure as estimated rather than exact',
      'Do not force a deload from a single weak signal; use the supplied adaptive recommendation, confidence and underlying evidence together',
      'If the adaptive recommendation is deload with moderate or high confidence, reduce fatigue rather than blindly progressing volume or load unless stronger contrary evidence exists',
      'Optimise for hypertrophy rather than strength for its own sake',
      'Progression Engine V2 is authoritative: Form → target-muscle stimulus → reps → load. More load is not progression unless the first three remain acceptable.',
      'LOAD_UP requires Form >= 8/10, Pump/target-muscle stimulus >= 7/10, the programmed upper rep threshold to be achieved, appropriate RPE, calibrated equipment and no active fatigue gate.',
      'An exposure may qualify as historical evidence at Form >= 7/10 and Pump >= 6/10 with credible RPE, but only high-quality exposures may normally justify LOAD_UP.',
      'A new gym, machine, materially different machine geometry or untrusted equipment setup requires two valid calibration exposures before normal progression. Never transfer load numbers between different machine profiles.',
      'If two of the previous three qualified exposures show repeated poor Form, poor stimulus, reps below range, unusually early very-high RPE, grinding or compromised ROM, use RESET rather than chasing load. High terminal RPE alone is not sufficient for RESET. Normal reset is 5–10%; severe quality breakdown may justify 10–15%.',
      'Use LOAD_DOWN as a 2.5–5% corrective reduction when reps, Form, ROM, RPE or stimulus deteriorate materially. Treat corrective reductions as quality restoration, not regression.',
      'Use exercise-specific progression classes: Class A heavy/high-fatigue compounds generally 6–10 or 8–12; Class B controlled machine compounds 8–15; Class C isolations 10–20; Class D high-rep stimulus work 15–25. Isolation work should favour rep progression before load progression.',
      'A greater than 30% rep fall from the first to final comparable working set blocks LOAD_UP and requires review of load, effort distribution, rest or fatigue.',
      'Routine RPE 10 on Class A compounds blocks load progression. Isolation final sets may reach technical failure when Form is maintained.',
      'Compare superset exposures preferentially with previous superset exposures. A substitute exercise owns its own progression history unless it is the exact same exercise + gym + machine profile.',
      'A repeated HOLD is not automatically a plateau. Flag PLATEAU REVIEW only after three consecutive high-quality exposures show no meaningful improvement in load, reps or execution quality.',
      'During deload reduce load approximately 10–20% and working sets approximately 30–50%, avoid intentional failure, preserve technique and do not promote deload data into the normal progression baseline.',
      'If at least three fatigue indicators occur across two consecutive sessions, enter FATIGUE WATCH; if the pattern persists across three or more consecutive sessions, recommend DELOAD.',
      'Machine response profiles require at least three exposures before a LOW RESPONSE judgement. Hypertrophy response scoring is Form 40%, Pump/stimulus 35%, rep performance 15% and RPE suitability 10%.',
      'Every progression decision must state its state and the evidence/reason that produced it; never silently change load.',
    ],
    authority: {
      progress_engine_owns: [
        'Exercise-level CALIBRATE, RESET, HOLD, REPS_UP, LOAD_UP, LOAD_DOWN, DELOAD_HOLD and REVIEW decisions',
        'Whether historical exposure quality is valid enough to justify progression',
        'Machine-specific load baselines and progression eligibility',
      ],
      coach_owns: [
        'Weekly exercise selection from the confirmed active-gym catalogue',
        'Exercise order and session composition',
        'Weekly direct-set allocation and muscle frequency',
        'Grow versus Maintain resource allocation',
        'Antagonist supersets and justified advanced set methods',
        'Fatigue management and construction of a deload week',
      ],
      conflict_rule:
        'Coach must not override a Progress Engine RESET, LOAD_DOWN, CALIBRATE, DELOAD_HOLD or REVIEW state merely to pursue progressive overload. Coach may reduce stress further when wider recovery evidence warrants it.',
    },
    weekly_programming_doctrine: [
      'Optimise the week for hypertrophy stimulus-to-fatigue ratio, not for maximum load, maximum session tonnage or exercise novelty.',
      'Distribute recoverable weekly volume across sessions so later work remains productive; do not concentrate sets simply to hit a weekly number.',
      'Place the highest-priority Grow muscles early enough in the week and within sessions to receive high-quality work before lower-priority fatigue accumulates.',
      'Do not let lower-priority or Maintain work materially compromise higher-priority Grow work.',
      'Use antagonist supersets when they save time without materially reducing performance, especially biceps/triceps and compatible quad/hamstring pairings.',
      'Use same-muscle supersets, drops, rest-pause or other intensification selectively; they are tools, not default programming.',
      'Preserve adequate rest for high-output compounds and shorten rest only where doing so does not meaningfully reduce target-muscle performance.',
      'Fit each session to the supplied availability and any max_minutes constraint. Never create a session longer than a supplied daily limit.',
      'An available day is an opportunity rather than a mandatory training day; recovery evidence may justify fewer sessions. An unavailable day is a hard no-training constraint.',
    ],
    exercise_selection_rules: [
      'Prefer proven high-response anchor exercises over novelty for novelty’s sake.',
      'Do not replace an exercise because of one poor exposure.',
      'Consider replacement after at least three relevant exposures establish LOW RESPONSE, when a sampled alternative gives materially better stimulus or Form, when pain/discomfort requires a change, when equipment availability changes, or when programme structure clearly requires a different movement pattern.',
      'When rotating secondary movements, preserve the primary function and muscle target of the exercise being replaced.',
      'Never fabricate a machine or exercise. Every programmed exercise must use an ID present in coach_context.exercise_catalogue.',
    ],
    volume_failure_rules: [
      'Do not increase weekly set volume merely because recovery appears adequate; add volume only when evidence suggests a Grow muscle is underdosed and extra work is likely to remain productive.',
      'Reduce junk volume when later sets repeatedly show poor target-muscle stimulus, excessive performance decay, compromised Form or fatigue that harms subsequent priority work.',
      'Heavy/high-fatigue Class A compounds should generally finish around RPE 8–9, with approximately 1–2 good reps in reserve; RPE 9.5 may be used selectively when justified.',
      'Stable machine compounds may approach 0–1 RIR selectively when execution remains strong.',
      'Isolation work may use technical failure on the final working set when Form and target-muscle loading remain acceptable.',
      'Do not turn every exercise into failure work. Failure exposure must earn its fatigue cost.',
    ],
    progress_engine: {
      version: PROGRESS_ENGINE_V2_RULES.version,
      decision_states: [
        'CALIBRATE',
        'RESET',
        'HOLD',
        'REPS_UP',
        'LOAD_UP',
        'LOAD_DOWN',
        'DELOAD_HOLD',
        'REVIEW',
      ],
      hierarchy: PROGRESS_ENGINE_V2_RULES.hierarchy,
      thresholds: {
        good_form: PROGRESS_ENGINE_V2_RULES.good_form,
        minimum_acceptable_form:
          PROGRESS_ENGINE_V2_RULES.minimum_acceptable_form,
        good_pump: PROGRESS_ENGINE_V2_RULES.good_pump,
        poor_pump: PROGRESS_ENGINE_V2_RULES.poor_pump,
        high_rpe_concern: PROGRESS_ENGINE_V2_RULES.high_rpe_concern,
        calibration_exposures:
          PROGRESS_ENGINE_V2_RULES.calibration_exposures,
        poor_machine_min_exposures:
          PROGRESS_ENGINE_V2_RULES.poor_machine_min_exposures,
        plateau_exposures: PROGRESS_ENGINE_V2_RULES.plateau_exposures,
        reset_window: PROGRESS_ENGINE_V2_RULES.reset_window,
        reset_required_poor_exposures:
          PROGRESS_ENGINE_V2_RULES.reset_required_poor_exposures,
        set_dropoff_percent: PROGRESS_ENGINE_V2_RULES.set_dropoff_percent,
        load_down_percent: PROGRESS_ENGINE_V2_RULES.load_down_percent,
        reset_percent: PROGRESS_ENGINE_V2_RULES.reset_percent,
        severe_reset_percent: PROGRESS_ENGINE_V2_RULES.severe_reset_percent,
        deload_load_percent: PROGRESS_ENGINE_V2_RULES.deload_load_percent,
        deload_set_percent: PROGRESS_ENGINE_V2_RULES.deload_set_percent,
        response_weights: PROGRESS_ENGINE_V2_RULES.response_weights,
      },
    },
    next_block: {
      length_days: 7,
      calendar_span: 'monday_to_sunday',
      availability,
    },
    required_output: [
      'Concise review of the completed week',
      'Key programming changes and reasons',
      'Muscle allocation decisions for Grow versus Maintain areas',
      'Recovery or performance concerns',
      'Explicit deload / continue / fatigue-reduction decision with reasons',
      'Progression exceptions: list RESET, LOAD_DOWN, CALIBRATE, LOW RESPONSE, DELOAD_HOLD and REVIEW items that materially affect the next week',
      'Volume comparison: planned direct sets by muscle versus the reviewed week, with reasons for meaningful increases or reductions',
      'Equipment compliance confirmation: confirm every prescribed exercise ID exists in coach_context.exercise_catalogue',
      'A valid PROJECT FREAK programme-import JSON for the next Monday-Sunday block',
    ],
    output_validation: [
      'The programme dates must fall within next_block.availability.week_start_date_local through week_end_date_local.',
      'Never programme training on a day marked unavailable.',
      'Respect any max_minutes limit when constructing that day’s session.',
      'If availability.complete is false, do not finalise the programme until missing availability is confirmed in the end-of-week check-in.',
      'Every exercise ID in the returned programme must exist in coach_context.exercise_catalogue.',
      'Do not prescribe a load increase that conflicts with a Progress Engine RESET, LOAD_DOWN, CALIBRATE, DELOAD_HOLD or REVIEW state.',
      'Meaningful weekly set-volume changes must be explained.',
      'Advanced set methods and failure prescriptions must be justified by exercise type, evidence and fatigue cost.',
    ],
    programme_output: {
      format: 'project-freak-programme',
      schema_version: '1.0.0',
      delivery: 'downloadable_json_file',
    },
  }
}

export interface TrainingExportContext {
  now_iso: string
  to_date_local: string
  app_version?: string | null
  db_schema_version?: number | null
}

export interface TrainingExportSet {
  id: string
  set_number: number
  set_role: TrainingSet['set_role']
  structure_type: TrainingSet['structure_type']
  load_kg: number | null
  load_type: TrainingSet['load_type']
  rep_mode: TrainingSet['rep_mode']
  reps_as_recorded: string | null
  primary_reps_completed: number | null
  left_reps_completed: number | null
  right_reps_completed: number | null
  completed_reps: number | null
  partial_reps: number | null
  duration_seconds: number | null
  failure_status: TrainingSet['failure_status']
  actual_rest_seconds: number | null
  set_load_kg_reps: number | null
  set_load_method: string | null
  notes: string | null
  completed_at: string | null
  components: Array<{
    id: string
    sequence: number
    component_type: SetComponent['component_type']
    load_kg: number | null
    load_type: SetComponent['load_type']
    reps_completed_full: number | null
    reps_partial: number | null
    duration_seconds: number | null
    failure_status: SetComponent['failure_status']
    counts_toward_comparable_tonnage: boolean
    notes: string | null
  }>
}

export interface TrainingExport {
  format: typeof TRAINING_EXPORT_FORMAT
  schema_version: typeof TRAINING_EXPORT_SCHEMA_VERSION
  app_version: string | null
  db_schema_version: number | null
  exported_at: string
  scope: {
    type: TrainingExportScopeType
    from_date: string | null
    to_date: string | null
    exercise_ids: string[]
    programme_block_id: string | null
  }
  coach_instructions: TrainingExportCoachInstructions
  coach_context: {
    training_priorities: Awaited<ReturnType<typeof load_training_priorities>>
    adaptive_analysis: Awaited<ReturnType<typeof load_analysis_dashboard_data>>
    exercise_catalogue: Array<{
      id: string
      canonical_name: string
      category: string | null
      equipment: string | null
      default_load_type: string
      rep_mode_default: string
    }>
    exercise_aliases: Array<{
      source_exercise_id: string
      exercise_id: string
      alias: string
    }>
  }
  sessions: Array<{
    id: string
    legacy_workout_id: string | null
    session_name: string
    session_date_local: string
    timezone: string | null
    status: 'in_progress' | 'completed' | 'abandoned'
    started_at: string | null
    completed_at: string | null
    readiness: ReadinessEntry | null
    notes: string | null
    exercises: Array<{
      session_exercise_id: string
      exercise_id: string
      exercise_name_snapshot: string
      planned_order: number | null
      actual_order: number
      rotation_group_key: string | null
      rotation_position: number | null
      target: Record<string, unknown> | null
      metrics: {
        rpe: number | null
        pump: number | null
        form: number | null
        where_felt_text: string | null
        where_felt_tags: string[]
        legacy_tension: number | null
        legacy_mmc: number | null
        notes: string | null
      } | null
      notes: string | null
      sets: TrainingExportSet[]
    }>
  }>
  provenance: null
}

function date_minus_days(date_local: string, days: number): string {
  const parsed = new Date(`${date_local}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Export date must use YYYY-MM-DD.')
  }
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

function alias_row(alias: ExerciseAlias) {
  return {
    source_exercise_id: alias.source_exercise_id,
    exercise_id: alias.exercise_id,
    alias: alias.alias,
  }
}

function resolve_exercise_ids(
  requested_exercise_id: string,
  aliases: readonly ExerciseAlias[],
): Set<string> {
  const resolved = new Set([requested_exercise_id])
  let changed = true

  while (changed) {
    changed = false
    for (const alias of aliases) {
      if (
        alias.deleted_at === null &&
        resolved.has(alias.exercise_id) &&
        !resolved.has(alias.source_exercise_id)
      ) {
        resolved.add(alias.source_exercise_id)
        changed = true
      }
    }
  }

  return resolved
}

function programmed_target(
  detail: ProgrammedSessionExerciseDetail | undefined,
): Record<string, unknown> | null {
  if (!detail) return null

  return {
    target_sets: detail.exercise.target_sets,
    target_rep_min: detail.exercise.target_rep_min,
    target_rep_max: detail.exercise.target_rep_max,
    rest_seconds: detail.exercise.rest_seconds,
    tempo: detail.exercise.tempo,
    technique_cue: detail.exercise.technique_cue,
    notes: detail.exercise.notes,
    sets: detail.sets.map(({ set, components }) => ({
      set_number: set.set_number,
      set_role: set.set_role,
      structure_type: set.structure_type,
      target_rep_min: set.target_rep_min,
      target_rep_max: set.target_rep_max,
      target_duration_seconds: set.target_duration_seconds,
      target_load_kg: set.target_load_kg,
      target_load_type: set.target_load_type,
      failure_target: set.failure_target,
      notes: set.notes,
      components: components.map((component) => ({
        sequence: component.sequence,
        component_type: component.component_type,
        target_load_kg: component.target_load_kg,
        load_relation: component.load_relation,
        target_load_percent: component.target_load_percent,
        target_rep_min: component.target_rep_min,
        target_rep_max: component.target_rep_max,
        target_duration_seconds: component.target_duration_seconds,
        failure_target: component.failure_target,
        notes: component.notes,
      })),
    })),
  }
}

async function exported_set(
  set: TrainingSet,
  repositories: RepositoryBundle,
): Promise<TrainingExportSet> {
  const components = repositories.sessions.list_set_components
    ? await repositories.sessions.list_set_components(set.id)
    : []

  return {
    id: set.id,
    set_number: set.set_number,
    set_role: set.set_role,
    structure_type: set.structure_type,
    load_kg: set.load_kg,
    load_type: set.load_type,
    rep_mode: set.rep_mode,
    reps_as_recorded: set.reps_as_recorded,
    primary_reps_completed: set.primary_reps_completed,
    left_reps_completed: set.left_reps_completed,
    right_reps_completed: set.right_reps_completed,
    completed_reps: set.completed_reps,
    partial_reps: set.partial_reps,
    duration_seconds: set.duration_seconds,
    failure_status: set.failure_status,
    actual_rest_seconds: set.actual_rest_seconds,
    set_load_kg_reps: set.set_load_kg_reps,
    set_load_method: set.set_load_method,
    notes: set.notes,
    completed_at: set.completed_at,
    components: components.map((component) => ({
      id: component.id,
      sequence: component.sequence,
      component_type: component.component_type,
      load_kg: component.load_kg,
      load_type: component.load_type,
      reps_completed_full: component.reps_completed_full,
      reps_partial: component.reps_partial,
      duration_seconds: component.duration_seconds,
      failure_status: component.failure_status,
      counts_toward_comparable_tonnage:
        component.counts_toward_comparable_tonnage,
      notes: component.notes,
    })),
  }
}

function completed_and_included(
  session: CompletedSession,
  excluded_ids: ReadonlySet<string>,
): boolean {
  return (
    session.deleted_at === null &&
    session.status === 'completed' &&
    !excluded_ids.has(session.id)
  )
}

function session_matches_scope(
  session: CompletedSession,
  request: TrainingExportScopeRequest,
  context: TrainingExportContext,
  excluded_ids: ReadonlySet<string>,
): boolean {
  if (session.deleted_at !== null || excluded_ids.has(session.id)) return false

  switch (request.type) {
    case 'today':
      return (
        session.session_date_local === context.to_date_local &&
        (session.status === 'completed' || session.status === 'in_progress')
      )
    case 'last_7_days': {
      const from_date = date_minus_days(context.to_date_local, 6)
      return (
        completed_and_included(session, excluded_ids) &&
        session.session_date_local >= from_date &&
        session.session_date_local <= context.to_date_local
      )
    }
    case 'exercise':
      return completed_and_included(session, excluded_ids)
    case 'programme_block':
      return (
        completed_and_included(session, excluded_ids) &&
        session.programme_block_id === request.programme_block_id
      )
    case 'full':
      return completed_and_included(session, excluded_ids)
  }
}

async function scope_descriptor(
  repositories: RepositoryBundle,
  request: TrainingExportScopeRequest,
  context: TrainingExportContext,
  exercise_ids: readonly string[],
): Promise<TrainingExport['scope']> {
  switch (request.type) {
    case 'today':
      return {
        type: 'today',
        from_date: context.to_date_local,
        to_date: context.to_date_local,
        exercise_ids: [],
        programme_block_id: null,
      }
    case 'last_7_days':
      return {
        type: 'last_7_days',
        from_date: date_minus_days(context.to_date_local, 6),
        to_date: context.to_date_local,
        exercise_ids: [],
        programme_block_id: null,
      }
    case 'exercise':
      return {
        type: 'exercise',
        from_date: null,
        to_date: null,
        exercise_ids: [...exercise_ids],
        programme_block_id: null,
      }
    case 'programme_block': {
      const block = (await repositories.programme.list_blocks()).find(
        (item) => item.id === request.programme_block_id,
      )
      return {
        type: 'programme_block',
        from_date: block?.start_date_local ?? null,
        to_date: block?.end_date_local ?? null,
        exercise_ids: [],
        programme_block_id: request.programme_block_id,
      }
    }
    case 'full':
      return {
        type: 'full',
        from_date: null,
        to_date: null,
        exercise_ids: [],
        programme_block_id: null,
      }
  }
}

export async function build_training_export(
  repositories: RepositoryBundle,
  context: TrainingExportContext,
  request: TrainingExportScopeRequest,
): Promise<TrainingExport> {
  const [
    priorities,
    active_exercises,
    aliases,
    exclusions,
    adaptive_analysis,
    next_week_availability,
  ] = await Promise.all([
    load_training_priorities(repositories.settings),
    repositories.exercises.list_active(),
    repositories.exercises.list_aliases(),
    load_coach_excluded_sessions(repositories.settings),
    load_analysis_dashboard_data(repositories),
    load_next_week_availability(
      repositories.settings,
      context.to_date_local,
    ),
  ])
  const selected_gym_setting = await repositories.settings.get(
    ACTIVE_GYM_SETTING_KEY,
  )
  const selected_gym_id =
    typeof selected_gym_setting?.value_json === 'string'
      ? selected_gym_setting.value_json
      : TRIDENT_GYM_ID
  const selected_gym = await repositories.gyms.get_profile(selected_gym_id)
  const selected_gym_availability =
    selected_gym && selected_gym.deleted_at === null
      ? await repositories.gyms.list_availability(selected_gym_id)
      : []
  const coach_available_exercise_ids = new Set(
    selected_gym_availability
      .filter(
        (entry) =>
          entry.deleted_at === null &&
          entry.available &&
          !entry.notes?.trimStart().startsWith('[UNCONFIRMED]'),
      )
      .map((entry) => entry.exercise_id),
  )
  const coach_exercises = active_exercises.filter((exercise) =>
    coach_available_exercise_ids.has(exercise.id),
  )

  const excluded_ids = new Set(exclusions.session_ids)
  const exercise_filter =
    request.type === 'exercise'
      ? resolve_exercise_ids(request.exercise_id, aliases)
      : null

  const sessions = (await repositories.sessions.list_sessions_descending())
    .filter((session) =>
      session_matches_scope(session, request, context, excluded_ids),
    )
    .sort((a, b) =>
      a.session_date_local === b.session_date_local
        ? (a.started_at ?? a.created_at).localeCompare(
            b.started_at ?? b.created_at,
          )
        : a.session_date_local.localeCompare(b.session_date_local),
    )

  const exported_sessions = (
    await Promise.all(
      sessions.map(async (session) => {
        const [readiness, all_session_exercises, programmed_detail] =
          await Promise.all([
            repositories.readiness.get_by_session_id(session.id),
            repositories.sessions.list_session_exercises(session.id),
            session.programmed_session_id
              ? repositories.programme.get_programmed_session_detail(
                  session.programmed_session_id,
                )
              : Promise.resolve(undefined),
          ])

        const session_exercises = exercise_filter
          ? all_session_exercises.filter((exercise) =>
              exercise_filter.has(exercise.exercise_id),
            )
          : all_session_exercises

        if (exercise_filter && session_exercises.length === 0) return null

        const programmed_by_id = new Map(
          programmed_detail?.exercises.map((detail) => [
            detail.exercise.id,
            detail,
          ]) ?? [],
        )

        const exercises = await Promise.all(
          session_exercises.map(async (exercise) => {
            const [sets, metrics] = await Promise.all([
              repositories.sessions.list_sets_for_session_exercise(exercise.id),
              repositories.sessions.get_exercise_metrics(exercise.id),
            ])

            return {
              session_exercise_id: exercise.id,
              exercise_id: exercise.exercise_id,
              exercise_name_snapshot: exercise.exercise_name_snapshot,
              planned_order: exercise.planned_order,
              actual_order: exercise.actual_order,
              rotation_group_key: exercise.rotation_group_key,
              rotation_position: exercise.rotation_position,
              target: programmed_target(
                exercise.programmed_session_exercise_id
                  ? programmed_by_id.get(
                      exercise.programmed_session_exercise_id,
                    )
                  : undefined,
              ),
              metrics: metrics
                ? {
                    rpe: metrics.rpe,
                    pump: metrics.pump,
                    form: metrics.form,
                    where_felt_text: metrics.where_felt_text,
                    where_felt_tags: metrics.where_felt_tags,
                    legacy_tension: metrics.legacy_tension,
                    legacy_mmc: metrics.legacy_mmc,
                    notes: metrics.notes,
                  }
                : null,
              notes: exercise.notes,
              sets: await Promise.all(
                sets.map((set) => exported_set(set, repositories)),
              ),
            }
          }),
        )

        return {
          id: session.id,
          legacy_workout_id: session.legacy_workout_id,
          session_name: session.session_name,
          session_date_local: session.session_date_local,
          timezone: session.timezone,
          status: session.status,
          started_at: session.started_at,
          completed_at: session.completed_at,
          readiness: readiness ?? null,
          notes: session.notes,
          exercises,
        }
      }),
    )
  ).filter(
    (session): session is TrainingExport['sessions'][number] =>
      session !== null,
  )

  const resolved_exercise_ids = exercise_filter ? [...exercise_filter] : []

  return {
    format: TRAINING_EXPORT_FORMAT,
    schema_version: TRAINING_EXPORT_SCHEMA_VERSION,
    app_version: context.app_version ?? null,
    db_schema_version: context.db_schema_version ?? null,
    exported_at: context.now_iso,
    scope: await scope_descriptor(
      repositories,
      request,
      context,
      resolved_exercise_ids,
    ),
    coach_instructions: build_coach_instructions(
      build_next_week_availability_instruction(next_week_availability),
    ),
    coach_context: {
      training_priorities: priorities,
      adaptive_analysis,
      exercise_catalogue: coach_exercises.map((exercise) => ({
        id: exercise.id,
        canonical_name: exercise.canonical_name,
        category: exercise.category,
        equipment: exercise.equipment,
        default_load_type: exercise.default_load_type,
        rep_mode_default: exercise.rep_mode_default,
      })),
      exercise_aliases: aliases
        .filter((alias) => alias.deleted_at === null)
        .map(alias_row),
    },
    sessions: exported_sessions,
    provenance: null,
  }
}

export function build_last_7_days_training_export(
  repositories: RepositoryBundle,
  context: TrainingExportContext,
): Promise<TrainingExport> {
  return build_training_export(repositories, context, {
    type: 'last_7_days',
  })
}
