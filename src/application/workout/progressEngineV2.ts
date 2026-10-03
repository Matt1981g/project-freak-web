export const PROGRESS_ENGINE_V2_RULES = {
  version: '2.0.0',
  hierarchy: ['form', 'stimulus', 'reps', 'load'] as const,
  good_form: 8,
  minimum_acceptable_form: 7,
  good_pump: 7,
  poor_pump: 6,
  high_rpe_concern: 9.5,
  calibration_exposures: 2,
  poor_machine_min_exposures: 3,
  plateau_exposures: 3,
  reset_window: 3,
  reset_required_poor_exposures: 2,
  load_down_percent: [2.5, 5] as const,
  reset_percent: [5, 10] as const,
  severe_reset_percent: [10, 15] as const,
  deload_load_percent: [10, 20] as const,
  deload_set_percent: [30, 50] as const,
  set_dropoff_percent: 30,
  fatigue_indicators_per_session: 3,
  fatigue_watch_consecutive_sessions: 2,
  deload_consecutive_sessions: 3,
  machine_response_gap: 1,
  response_weights: {
    form: 0.4,
    pump: 0.35,
    reps: 0.15,
    rpe: 0.1,
  },
} as const

export type ProgressionState =
  | 'CALIBRATE'
  | 'RESET'
  | 'HOLD'
  | 'REPS_UP'
  | 'LOAD_UP'
  | 'LOAD_DOWN'
  | 'DELOAD_HOLD'
  | 'REVIEW'

export type ExerciseProgressionClass = 'A' | 'B' | 'C' | 'D'

export interface ProgressionTarget {
  set_number: number
  target_rep_min: number | null
  target_rep_max: number | null
}

export interface ProgressionExposureSet {
  set_number: number
  load_kg: number | null
  completed_reps: number | null
  failure_status: string
}

export interface ProgressionExposureMetrics {
  rpe: number | null
  pump: number | null
  form: number | null
}

export interface ProgressionExposure {
  id: string
  session_id: string
  session_date_local: string
  exercise_id: string
  gym_profile_id: string | null
  equipment_profile_id: string | null
  equipment_label: string | null
  setup_notes: string | null
  equipment_comparable: boolean
  progression_class: ExerciseProgressionClass
  is_superset: boolean
  is_deload: boolean
  is_substitution: boolean
  sets: ProgressionExposureSet[]
  metrics: ProgressionExposureMetrics
  rom_compromised?: boolean
  technique_breakdown?: boolean
  grinding?: boolean
  high_rpe_early?: boolean
}

export interface CurrentProgressionContext {
  exercise_id: string
  exercise_name: string
  progression_class: ExerciseProgressionClass
  gym_profile_id: string | null
  equipment_profile_id: string | null
  equipment_label: string | null
  setup_notes: string | null
  equipment_comparable: boolean
  is_superset: boolean
  is_substitution: boolean
  is_dumbbell: boolean
  is_lower_body: boolean
}

export interface FatigueSessionEvidence {
  session_id: string
  session_date_local: string
  indicators: string[]
}

export type FatigueState = 'CLEAR' | 'FATIGUE_WATCH' | 'DELOAD'

export interface FatigueDecision {
  state: FatigueState
  consecutive_flagged_sessions: number
  reason: string
}

export interface ProgressionAdjustment {
  kind: 'none' | 'increase' | 'decrease' | 'reset' | 'deload'
  percent_min: number | null
  percent_max: number | null
  set_reduction_percent_min: number | null
  set_reduction_percent_max: number | null
  note: string
}

export interface ProgressEngineDecision {
  state: ProgressionState
  reason: string
  response_score: number | null
  quality_qualified: boolean
  high_quality: boolean
  adjustment: ProgressionAdjustment
  flags: string[]
}

export interface MachineResponseProfile {
  key: string
  exercise_id: string
  gym_profile_id: string | null
  equipment_profile_id: string | null
  equipment_label: string | null
  setup_notes: string | null
  exposures: number
  high_quality_exposures: number
  typical_form: number | null
  typical_pump: number | null
  typical_rpe: number | null
  average_response_score: number | null
  useful_load_kg: number | null
}

export interface PoorMachineAssessment {
  low_response: boolean
  reason: string
  current_score: number | null
  alternative_score: number | null
}

export interface ProgressEngineInput {
  current: CurrentProgressionContext
  targets: readonly ProgressionTarget[]
  exposures: readonly ProgressionExposure[]
  fatigue_sessions?: readonly FatigueSessionEvidence[]
  deload_active?: boolean
}

const CLASS_REP_RANGES: Record<
  ExerciseProgressionClass,
  { primary: readonly [number, number]; alternate?: readonly [number, number] }
> = {
  A: { primary: [6, 10], alternate: [8, 12] },
  B: { primary: [8, 15] },
  C: { primary: [10, 20] },
  D: { primary: [15, 25] },
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle]
}

function normalised_setup(value: string | null): string {
  return value?.trim().toLowerCase() ?? ''
}

export function equipment_progression_key(
  value: Pick<
    ProgressionExposure,
    'gym_profile_id' | 'equipment_profile_id' | 'equipment_label' | 'setup_notes'
  >,
): string {
  return JSON.stringify([
    value.gym_profile_id ?? 'unknown-gym',
    value.equipment_profile_id ?? value.equipment_label ?? 'unknown-equipment',
    normalised_setup(value.setup_notes),
  ])
}

export function progression_rep_range(
  progression_class: ExerciseProgressionClass,
) {
  return CLASS_REP_RANGES[progression_class]
}

export function infer_progression_class(input: {
  exercise_name: string
  category?: string | null
  equipment?: string | null
  target_rep_max?: number | null
}): ExerciseProgressionClass {
  const text = `${input.exercise_name} ${input.category ?? ''} ${input.equipment ?? ''}`
    .toLowerCase()

  if (
    input.target_rep_max !== null &&
    input.target_rep_max !== undefined &&
    input.target_rep_max >= 20
  ) {
    return 'D'
  }

  if (/lateral raise|rear delt|calf|calves/.test(text)) return 'D'
  if (
    /curl|triceps|extension|pec deck|fly|raise|adductor|abductor/.test(text)
  ) {
    return 'C'
  }
  if (
    /pendulum|hack squat|leg press|squat|deadlift|heavy press|overhead press/.test(
      text,
    )
  ) {
    return 'A'
  }

  return 'B'
}

function valid_rpe(rpe: number | null): boolean {
  return rpe !== null && rpe >= 1 && rpe <= 10
}

function target_map(targets: readonly ProgressionTarget[]) {
  return new Map(targets.map((target) => [target.set_number, target]))
}

function comparable_sets(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
) {
  const by_set = target_map(targets)
  return exposure.sets
    .map((set) => ({ set, target: by_set.get(set.set_number) }))
    .filter(
      (
        value,
      ): value is {
        set: ProgressionExposureSet
        target: ProgressionTarget
      } => value.target !== undefined,
    )
}

function rep_quality_score(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): number | null {
  const sets = comparable_sets(exposure, targets).filter(
    ({ set }) => set.completed_reps !== null,
  )
  if (sets.length === 0) return null

  const scores = sets.map(({ set, target }) => {
    const reps = set.completed_reps!
    if (target.target_rep_max !== null && target.target_rep_max > 0) {
      return Math.min(10, (reps / target.target_rep_max) * 10)
    }
    if (target.target_rep_min !== null && target.target_rep_min > 0) {
      return Math.min(10, (reps / target.target_rep_min) * 8)
    }
    return 5
  })

  return average(scores)
}

function rpe_quality_score(
  rpe: number | null,
  progression_class: ExerciseProgressionClass,
): number | null {
  if (!valid_rpe(rpe)) return null
  if (progression_class === 'A') {
    if (rpe! >= 8 && rpe! <= 9.5) return 10
    if (rpe! >= 7.5 && rpe! < 8) return 8
    if (rpe! > 9.5) return 6
    return 5
  }

  if (rpe! >= 8 && rpe! <= 10) return 10
  if (rpe! >= 7) return 8
  return 6
}

export function is_quality_qualified(exposure: ProgressionExposure): boolean {
  return (
    exposure.metrics.form !== null &&
    exposure.metrics.form >= PROGRESS_ENGINE_V2_RULES.minimum_acceptable_form &&
    exposure.metrics.pump !== null &&
    exposure.metrics.pump >= PROGRESS_ENGINE_V2_RULES.poor_pump &&
    valid_rpe(exposure.metrics.rpe) &&
    !exposure.technique_breakdown &&
    !exposure.rom_compromised
  )
}

export function is_high_quality(exposure: ProgressionExposure): boolean {
  return (
    exposure.metrics.form !== null &&
    exposure.metrics.form >= PROGRESS_ENGINE_V2_RULES.good_form &&
    exposure.metrics.pump !== null &&
    exposure.metrics.pump >= PROGRESS_ENGINE_V2_RULES.good_pump &&
    valid_rpe(exposure.metrics.rpe) &&
    !exposure.technique_breakdown &&
    !exposure.rom_compromised
  )
}

export function hypertrophy_response_score(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): number | null {
  const form = exposure.metrics.form
  const pump = exposure.metrics.pump
  const reps = rep_quality_score(exposure, targets)
  const rpe = rpe_quality_score(
    exposure.metrics.rpe,
    exposure.progression_class,
  )

  if (form === null || pump === null || reps === null || rpe === null) {
    return null
  }

  const weights = PROGRESS_ENGINE_V2_RULES.response_weights
  return (
    form * weights.form +
    pump * weights.pump +
    reps * weights.reps +
    rpe * weights.rpe
  )
}

function reps_below_range(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): boolean {
  const sets = comparable_sets(exposure, targets)
  return (
    sets.length > 0 &&
    sets.some(
      ({ set, target }) =>
        set.completed_reps === null ||
        (target.target_rep_min !== null &&
          set.completed_reps < target.target_rep_min),
    )
  )
}

function all_reps_in_range(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): boolean {
  const sets = comparable_sets(exposure, targets)
  return (
    sets.length > 0 &&
    sets.every(
      ({ set, target }) =>
        set.completed_reps !== null &&
        (target.target_rep_min === null ||
          set.completed_reps >= target.target_rep_min),
    )
  )
}

function upper_threshold_reached(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): boolean {
  const sets = comparable_sets(exposure, targets)
  return (
    sets.length > 0 &&
    sets.every(
      ({ set, target }) =>
        set.completed_reps !== null &&
        target.target_rep_max !== null &&
        set.completed_reps >= target.target_rep_max,
    )
  )
}

export function has_set_dropoff(exposure: ProgressionExposure): boolean {
  const reps = exposure.sets
    .filter((set) => set.completed_reps !== null)
    .sort((left, right) => left.set_number - right.set_number)
    .map((set) => set.completed_reps!)

  if (reps.length < 2 || reps[0] <= 0) return false
  const drop = ((reps[0] - reps[reps.length - 1]) / reps[0]) * 100
  return drop > PROGRESS_ENGINE_V2_RULES.set_dropoff_percent
}

function poor_indicators(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): string[] {
  const indicators: string[] = []

  if (
    exposure.metrics.form !== null &&
    exposure.metrics.form <= PROGRESS_ENGINE_V2_RULES.minimum_acceptable_form
  ) {
    indicators.push('form')
  }
  if (
    exposure.metrics.pump !== null &&
    exposure.metrics.pump <= PROGRESS_ENGINE_V2_RULES.poor_pump
  ) {
    indicators.push('stimulus')
  }
  if (reps_below_range(exposure, targets)) indicators.push('reps')
  if (
    exposure.metrics.rpe !== null &&
    exposure.metrics.rpe >= PROGRESS_ENGINE_V2_RULES.high_rpe_concern
  ) {
    indicators.push('rpe')
  }
  if (exposure.high_rpe_early) indicators.push('high_rpe_early')
  if (exposure.grinding) indicators.push('grinding')
  if (exposure.rom_compromised) indicators.push('rom')
  if (exposure.technique_breakdown) indicators.push('technique')
  if (has_set_dropoff(exposure)) indicators.push('set_dropoff')

  return indicators
}

export function progression_fatigue_indicators(
  exposure: ProgressionExposure,
  targets: readonly ProgressionTarget[],
): string[] {
  return poor_indicators(exposure, targets)
}

function total_reps(exposure: ProgressionExposure): number {
  return exposure.sets.reduce(
    (total, set) => total + (set.completed_reps ?? 0),
    0,
  )
}

function best_load(exposure: ProgressionExposure): number | null {
  const values = exposure.sets
    .map((set) => set.load_kg)
    .filter((value): value is number => value !== null)
  return values.length === 0 ? null : Math.max(...values)
}

function material_deterioration(
  latest: ProgressionExposure,
  previous: ProgressionExposure | undefined,
): boolean {
  if (!previous) return false

  const latest_reps = total_reps(latest)
  const previous_reps = total_reps(previous)
  const rep_collapse =
    previous_reps > 0 && latest_reps < previous_reps * 0.8
  const form_drop =
    latest.metrics.form !== null &&
    previous.metrics.form !== null &&
    latest.metrics.form <= previous.metrics.form - 2
  const pump_drop =
    latest.metrics.pump !== null &&
    previous.metrics.pump !== null &&
    latest.metrics.pump <= previous.metrics.pump - 2
  const rpe_spike =
    latest.metrics.rpe !== null &&
    previous.metrics.rpe !== null &&
    latest.metrics.rpe >= previous.metrics.rpe + 1

  return (
    rep_collapse ||
    form_drop ||
    pump_drop ||
    rpe_spike ||
    latest.rom_compromised === true ||
    latest.technique_breakdown === true ||
    has_set_dropoff(latest)
  )
}

function adjustment(
  kind: ProgressionAdjustment['kind'],
  percent_min: number | null,
  percent_max: number | null,
  note: string,
  set_reduction_percent_min: number | null = null,
  set_reduction_percent_max: number | null = null,
): ProgressionAdjustment {
  return {
    kind,
    percent_min,
    percent_max,
    set_reduction_percent_min,
    set_reduction_percent_max,
    note,
  }
}

function decision(
  state: ProgressionState,
  reason: string,
  latest: ProgressionExposure | undefined,
  targets: readonly ProgressionTarget[],
  change: ProgressionAdjustment,
  flags: string[] = [],
): ProgressEngineDecision {
  return {
    state,
    reason,
    response_score: latest
      ? hypertrophy_response_score(latest, targets)
      : null,
    quality_qualified: latest ? is_quality_qualified(latest) : false,
    high_quality: latest ? is_high_quality(latest) : false,
    adjustment: change,
    flags,
  }
}

export function evaluate_progress_engine_fatigue(
  sessions: readonly FatigueSessionEvidence[],
): FatigueDecision {
  const ordered = [...sessions].sort((left, right) =>
    left.session_date_local.localeCompare(right.session_date_local),
  )

  let consecutive = 0
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (
      ordered[index].indicators.length >=
      PROGRESS_ENGINE_V2_RULES.fatigue_indicators_per_session
    ) {
      consecutive += 1
      continue
    }
    break
  }

  if (consecutive >= PROGRESS_ENGINE_V2_RULES.deload_consecutive_sessions) {
    return {
      state: 'DELOAD',
      consecutive_flagged_sessions: consecutive,
      reason:
        'Three or more consecutive sessions contain at least three fatigue indicators.',
    }
  }

  if (
    consecutive >= PROGRESS_ENGINE_V2_RULES.fatigue_watch_consecutive_sessions
  ) {
    return {
      state: 'FATIGUE_WATCH',
      consecutive_flagged_sessions: consecutive,
      reason:
        'Two consecutive sessions contain at least three fatigue indicators.',
    }
  }

  return {
    state: 'CLEAR',
    consecutive_flagged_sessions: consecutive,
    reason: 'No persistent multi-session fatigue pattern is detected.',
  }
}

function profile_matches_current(
  exposure: ProgressionExposure,
  current: CurrentProgressionContext,
): boolean {
  return (
    exposure.exercise_id === current.exercise_id &&
    exposure.gym_profile_id === current.gym_profile_id &&
    equipment_progression_key(exposure) ===
      equipment_progression_key({
        gym_profile_id: current.gym_profile_id,
        equipment_profile_id: current.equipment_profile_id,
        equipment_label: current.equipment_label,
        setup_notes: current.setup_notes,
      }) &&
    exposure.is_superset === current.is_superset
  )
}

function latest_matching_exposures(
  input: ProgressEngineInput,
): ProgressionExposure[] {
  return input.exposures
    .filter(
      (exposure) =>
        !exposure.is_deload &&
        profile_matches_current(exposure, input.current),
    )
    .sort((left, right) =>
      right.session_date_local.localeCompare(left.session_date_local),
    )
}

function repeated_reset_required(
  exposures: readonly ProgressionExposure[],
  targets: readonly ProgressionTarget[],
): boolean {
  const recent = exposures
    .filter(is_quality_qualified)
    .slice(0, PROGRESS_ENGINE_V2_RULES.reset_window)
  if (recent.length < PROGRESS_ENGINE_V2_RULES.reset_required_poor_exposures) {
    return false
  }

  return (
    recent.filter((exposure) => poor_indicators(exposure, targets).length > 0)
      .length >= PROGRESS_ENGINE_V2_RULES.reset_required_poor_exposures
  )
}

function severe_reset(exposure: ProgressionExposure): boolean {
  return (
    (exposure.metrics.form !== null && exposure.metrics.form <= 5) ||
    (exposure.metrics.pump !== null && exposure.metrics.pump <= 4) ||
    exposure.technique_breakdown === true ||
    exposure.rom_compromised === true
  )
}

function plateau_detected(
  exposures: readonly ProgressionExposure[],
  targets: readonly ProgressionTarget[],
): boolean {
  const recent = exposures.slice(0, PROGRESS_ENGINE_V2_RULES.plateau_exposures)

  if (
    recent.length < PROGRESS_ENGINE_V2_RULES.plateau_exposures ||
    !recent.every(is_high_quality)
  ) {
    return false
  }

  const loads = recent.map(best_load)
  if (loads.some((value) => value === null)) return false
  const reps = recent.map(total_reps)
  const forms = recent.map((exposure) => exposure.metrics.form!)

  const same_load = Math.max(...(loads as number[])) === Math.min(...(loads as number[]))
  const same_reps = Math.max(...reps) === Math.min(...reps)
  const no_execution_gain = Math.max(...forms) - Math.min(...forms) < 1

  if (!same_load || !same_reps || !no_execution_gain) return false

  return recent.every((exposure) => all_reps_in_range(exposure, targets))
}

function load_up_adjustment(current: CurrentProgressionContext): ProgressionAdjustment {
  if (current.is_dumbbell) {
    return adjustment(
      'increase',
      null,
      null,
      'Use the next available dumbbell increment only after the quality gates are passed.',
    )
  }

  const max = current.is_lower_body ? 7.5 : 5
  return adjustment(
    'increase',
    2.5,
    max,
    current.progression_class === 'C' || current.progression_class === 'D'
      ? 'Isolation work should normally exhaust rep progression before load is increased.'
      : 'Use the smallest practical machine or free-weight increment.',
  )
}

export function run_progress_engine_v2(
  input: ProgressEngineInput,
): ProgressEngineDecision {
  const matching = latest_matching_exposures(input)
  const latest = matching[0]
  const previous = matching[1]
  const valid_calibration_exposures = matching.filter(is_quality_qualified).length

  if (
    !input.current.equipment_comparable ||
    valid_calibration_exposures <
      PROGRESS_ENGINE_V2_RULES.calibration_exposures
  ) {
    return decision(
      'CALIBRATE',
      valid_calibration_exposures === 0
        ? 'This gym + machine + exercise setup does not yet have a trusted hypertrophy baseline. Establish load, rep range, RPE, Form and stimulus before progressing.'
        : 'Only one valid exposure exists for this gym + machine + exercise setup. Repeat a quality calibration exposure before normal progression starts.',
      latest,
      input.targets,
      adjustment(
        'none',
        null,
        null,
        'Do not infer a load from a different machine or gym during calibration.',
      ),
      ['machine_calibration'],
    )
  }

  if (input.deload_active) {
    return decision(
      'DELOAD_HOLD',
      'A deload is active. Maintain the movement pattern while deliberately reducing fatigue; deload data must not become a new progression baseline.',
      latest,
      input.targets,
      adjustment(
        'deload',
        PROGRESS_ENGINE_V2_RULES.deload_load_percent[0],
        PROGRESS_ENGINE_V2_RULES.deload_load_percent[1],
        'No intentional failure. Prioritise technique and contraction quality.',
        PROGRESS_ENGINE_V2_RULES.deload_set_percent[0],
        PROGRESS_ENGINE_V2_RULES.deload_set_percent[1],
      ),
      ['deload_active'],
    )
  }

  const fatigue = evaluate_progress_engine_fatigue(input.fatigue_sessions ?? [])
  if (fatigue.state === 'DELOAD') {
    return decision(
      'DELOAD_HOLD',
      fatigue.reason,
      latest,
      input.targets,
      adjustment(
        'deload',
        PROGRESS_ENGINE_V2_RULES.deload_load_percent[0],
        PROGRESS_ENGINE_V2_RULES.deload_load_percent[1],
        'Reduce fatigue rather than chasing progression.',
        PROGRESS_ENGINE_V2_RULES.deload_set_percent[0],
        PROGRESS_ENGINE_V2_RULES.deload_set_percent[1],
      ),
      ['adaptive_deload'],
    )
  }

  if (!latest) {
    return decision(
      'REVIEW',
      'No comparable exposure is available after calibration filtering.',
      undefined,
      input.targets,
      adjustment('none', null, null, 'Review the exercise history.'),
    )
  }

  const latest_poor = poor_indicators(latest, input.targets)
  if (repeated_reset_required(matching, input.targets)) {
    const severe = severe_reset(latest)
    const reset_range = severe
      ? PROGRESS_ENGINE_V2_RULES.severe_reset_percent
      : PROGRESS_ENGINE_V2_RULES.reset_percent

    return decision(
      'RESET',
      `Stimulus quality has deteriorated repeatedly across the recent exposure window (${latest_poor.join(', ') || 'multiple quality indicators'}). Rebuild from Form → stimulus → reps → load.`,
      latest,
      input.targets,
      adjustment(
        'reset',
        reset_range[0],
        reset_range[1],
        severe
          ? 'Severe quality deterioration permits a larger reset.'
          : 'A deliberate load reset is progression-corrective, not regression.',
      ),
      ['repeated_poor_quality'],
    )
  }

  if (
    latest.metrics.form !== null &&
    latest.metrics.form < PROGRESS_ENGINE_V2_RULES.minimum_acceptable_form
  ) {
    return decision(
      'LOAD_DOWN',
      `Previous Form was ${latest.metrics.form}/10, below the minimum acceptable threshold. Reduce load and restore execution quality before progressing.`,
      latest,
      input.targets,
      adjustment(
        'decrease',
        PROGRESS_ENGINE_V2_RULES.load_down_percent[0],
        PROGRESS_ENGINE_V2_RULES.load_down_percent[1],
        'Small corrective reduction; do not treat this as regression.',
      ),
      ['form_gate_failed'],
    )
  }

  if (
    latest.metrics.pump !== null &&
    latest.metrics.pump < PROGRESS_ENGINE_V2_RULES.poor_pump &&
    latest.metrics.rpe !== null &&
    latest.metrics.rpe >= PROGRESS_ENGINE_V2_RULES.high_rpe_concern
  ) {
    return decision(
      'RESET',
      `Target-muscle stimulus was poor (${latest.metrics.pump}/10) while RPE was very high (${latest.metrics.rpe}/10). The load is ahead of useful hypertrophy stimulus.`,
      latest,
      input.targets,
      adjustment(
        'reset',
        PROGRESS_ENGINE_V2_RULES.reset_percent[0],
        PROGRESS_ENGINE_V2_RULES.reset_percent[1],
        'Rebuild with cleaner ROM, control and target-muscle tension.',
      ),
      ['poor_stimulus_high_rpe'],
    )
  }

  if (material_deterioration(latest, previous)) {
    return decision(
      'LOAD_DOWN',
      'Performance quality deteriorated materially versus the previous comparable exposure. Reduce load slightly rather than forcing progression.',
      latest,
      input.targets,
      adjustment(
        'decrease',
        PROGRESS_ENGINE_V2_RULES.load_down_percent[0],
        PROGRESS_ENGINE_V2_RULES.load_down_percent[1],
        'Correct the quality trend first.',
      ),
      ['material_deterioration'],
    )
  }

  if (
    input.current.progression_class === 'A' &&
    latest.metrics.rpe === 10
  ) {
    return decision(
      'HOLD',
      'A heavy compound reached RPE 10. Routine compound failure blocks load progression; repeat with cleaner reserve and execution.',
      latest,
      input.targets,
      adjustment('none', null, null, 'Hold the current load.'),
      ['compound_failure_gate'],
    )
  }

  if (fatigue.state === 'FATIGUE_WATCH') {
    return decision(
      'HOLD',
      `${fatigue.reason} Load progression is blocked until the fatigue trend clears.`,
      latest,
      input.targets,
      adjustment('none', null, null, 'Hold load and prioritise recovery.'),
      ['fatigue_watch'],
    )
  }

  if (reps_below_range(latest, input.targets)) {
    if (
      latest.metrics.rpe !== null &&
      latest.metrics.rpe >= PROGRESS_ENGINE_V2_RULES.high_rpe_concern
    ) {
      return decision(
        'LOAD_DOWN',
        'The programmed rep range was missed while RPE was already very high. A small load reduction is more appropriate than chasing reps at this load.',
        latest,
        input.targets,
        adjustment(
          'decrease',
          PROGRESS_ENGINE_V2_RULES.load_down_percent[0],
          PROGRESS_ENGINE_V2_RULES.load_down_percent[1],
          'Restore productive reps and quality.',
        ),
        ['reps_below_range', 'high_rpe'],
      )
    }

    return decision(
      'HOLD',
      'The programmed rep range was not achieved on every comparable set. Hold the load and improve rep performance without sacrificing quality.',
      latest,
      input.targets,
      adjustment('none', null, null, 'Do not add load.'),
      ['reps_below_range'],
    )
  }

  if (plateau_detected(matching, input.targets)) {
    return decision(
      'REVIEW',
      'PLATEAU REVIEW: three consecutive high-quality exposures show no meaningful improvement in reps, load or execution quality. Review rep target, set volume, exercise order, rest or exercise selection rather than automatically adding weight.',
      latest,
      input.targets,
      adjustment('none', null, null, 'Coach intervention required.'),
      ['plateau_review'],
    )
  }

  if (upper_threshold_reached(latest, input.targets) && is_high_quality(latest)) {
    return decision(
      'LOAD_UP',
      `Form ${latest.metrics.form}/10 and stimulus ${latest.metrics.pump}/10 passed the quality gates, the programmed upper rep threshold was achieved, RPE was appropriate, and no fatigue gate is active.`,
      latest,
      input.targets,
      load_up_adjustment(input.current),
      ['quality_gate_passed', 'upper_rep_threshold_reached'],
    )
  }

  if (all_reps_in_range(latest, input.targets) && is_high_quality(latest)) {
    return decision(
      'REPS_UP',
      'The current load is producing good Form and target-muscle stimulus. Keep the load and add reps within the programmed range before adding weight.',
      latest,
      input.targets,
      adjustment('none', null, null, 'Rep progression comes before load progression.'),
      ['quality_gate_passed'],
    )
  }

  if (is_quality_qualified(latest)) {
    return decision(
      'HOLD',
      'The current load is productive, but the evidence does not yet justify a progression change. Repeat it and preserve quality.',
      latest,
      input.targets,
      adjustment('none', null, null, 'A repeated HOLD is not automatically a plateau.'),
    )
  }

  return decision(
    'REVIEW',
    'The available data is contradictory or incomplete. Do not infer progression until Form, stimulus, reps and RPE provide a coherent signal.',
    latest,
    input.targets,
    adjustment('none', null, null, 'Review the recorded exposure.'),
    ['contradictory_data'],
  )
}

export function build_machine_response_profiles(
  exposures: readonly ProgressionExposure[],
  targets: readonly ProgressionTarget[],
): MachineResponseProfile[] {
  const groups = new Map<string, ProgressionExposure[]>()

  for (const exposure of exposures.filter((item) => !item.is_deload)) {
    const key = equipment_progression_key(exposure)
    groups.set(key, [...(groups.get(key) ?? []), exposure])
  }

  return [...groups.entries()].map(([key, values]) => {
    const scored = values
      .map((exposure) => ({
        exposure,
        score: hypertrophy_response_score(exposure, targets),
      }))
      .filter(
        (
          value,
        ): value is { exposure: ProgressionExposure; score: number } =>
          value.score !== null,
      )

    const exemplar = values[0]
    const useful_loads = values
      .filter(is_high_quality)
      .map(best_load)
      .filter((value): value is number => value !== null)

    return {
      key,
      exercise_id: exemplar.exercise_id,
      gym_profile_id: exemplar.gym_profile_id,
      equipment_profile_id: exemplar.equipment_profile_id,
      equipment_label: exemplar.equipment_label,
      setup_notes: exemplar.setup_notes,
      exposures: values.length,
      high_quality_exposures: values.filter(is_high_quality).length,
      typical_form: average(
        values
          .map((value) => value.metrics.form)
          .filter((value): value is number => value !== null),
      ),
      typical_pump: average(
        values
          .map((value) => value.metrics.pump)
          .filter((value): value is number => value !== null),
      ),
      typical_rpe: average(
        values
          .map((value) => value.metrics.rpe)
          .filter((value): value is number => value !== null),
      ),
      average_response_score: average(scored.map((value) => value.score)),
      useful_load_kg: median(useful_loads),
    }
  })
}

export interface ProgressEngineRegressionRow {
  source_exposure_id: string
  session_date_local: string
  decision: ProgressEngineDecision
}

export function run_progress_engine_regression(
  input: ProgressEngineInput,
): ProgressEngineRegressionRow[] {
  const chronological = [...input.exposures].sort((left, right) =>
    left.session_date_local.localeCompare(right.session_date_local),
  )

  return chronological.map((exposure, index) => ({
    source_exposure_id: exposure.id,
    session_date_local: exposure.session_date_local,
    decision: run_progress_engine_v2({
      ...input,
      exposures: chronological.slice(0, index + 1),
      fatigue_sessions: (input.fatigue_sessions ?? []).filter(
        (session) => session.session_date_local <= exposure.session_date_local,
      ),
    }),
  }))
}

export function assess_poor_machine_response(
  current: MachineResponseProfile,
  alternatives: readonly MachineResponseProfile[],
): PoorMachineAssessment {
  if (
    current.exposures < PROGRESS_ENGINE_V2_RULES.poor_machine_min_exposures ||
    current.average_response_score === null
  ) {
    return {
      low_response: false,
      reason: 'At least three exposures are required before judging a machine response.',
      current_score: current.average_response_score,
      alternative_score: null,
    }
  }

  const comparable = alternatives
    .filter(
      (profile) =>
        profile.exercise_id === current.exercise_id &&
        profile.key !== current.key &&
        profile.exposures >= PROGRESS_ENGINE_V2_RULES.poor_machine_min_exposures &&
        profile.average_response_score !== null,
    )
    .map((profile) => profile.average_response_score!)

  if (comparable.length === 0) {
    return {
      low_response: false,
      reason: 'No sufficiently sampled alternative machine profile exists.',
      current_score: current.average_response_score,
      alternative_score: null,
    }
  }

  const alternative_score = Math.max(...comparable)
  const gap = alternative_score - current.average_response_score

  return {
    low_response: gap >= PROGRESS_ENGINE_V2_RULES.machine_response_gap,
    reason:
      gap >= PROGRESS_ENGINE_V2_RULES.machine_response_gap
        ? 'LOW RESPONSE EXERCISE: this machine profile has at least three exposures and its hypertrophy response score is materially below a sampled alternative.'
        : 'Machine response is not materially worse than sampled alternatives.',
    current_score: current.average_response_score,
    alternative_score,
  }
}
