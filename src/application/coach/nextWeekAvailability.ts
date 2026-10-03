import type { JsonValue, Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'

export const NEXT_WEEK_AVAILABILITY_SETTING_KEY =
  'coach-next-week-availability-v1'

export const COACH_WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type CoachWeekDay = (typeof COACH_WEEK_DAYS)[number]

export type CoachAvailabilityStatus =
  | 'unspecified'
  | 'available'
  | 'long_session'
  | 'unavailable'

export interface CoachAvailabilityDay {
  status: CoachAvailabilityStatus
  max_minutes: number | null
}

export interface NextWeekAvailabilityState {
  schema_version: '1.0.0'
  week_start_date_local: string
  days: Record<CoachWeekDay, CoachAvailabilityDay>
}

export interface CoachAvailabilityInstructionDay extends CoachAvailabilityDay {
  date_local: string
}

export interface NextWeekAvailabilityInstruction {
  week_start_date_local: string
  week_end_date_local: string
  complete: boolean
  source: 'coach_screen' | 'unspecified'
  days: Record<CoachWeekDay, CoachAvailabilityInstructionDay>
  scheduling_rule: string
}

function parse_local_date(value: string): Date {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Local date must use YYYY-MM-DD.')
  }
  return parsed
}

function local_date_from_date(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function plus_days(date_local: string, days: number): string {
  const value = parse_local_date(date_local)
  value.setUTCDate(value.getUTCDate() + days)
  return local_date_from_date(value)
}

export function next_week_start_date(current_local_date: string): string {
  const current = parse_local_date(current_local_date)
  const day = current.getUTCDay()
  const days_until_next_monday = ((8 - day) % 7) || 7
  current.setUTCDate(current.getUTCDate() + days_until_next_monday)
  return local_date_from_date(current)
}

export function default_next_week_availability(
  current_local_date: string,
): NextWeekAvailabilityState {
  return {
    schema_version: '1.0.0',
    week_start_date_local: next_week_start_date(current_local_date),
    days: Object.fromEntries(
      COACH_WEEK_DAYS.map((day) => [
        day,
        { status: 'unspecified', max_minutes: null },
      ]),
    ) as Record<CoachWeekDay, CoachAvailabilityDay>,
  }
}

function is_status(value: JsonValue): value is CoachAvailabilityStatus {
  return (
    value === 'unspecified' ||
    value === 'available' ||
    value === 'long_session' ||
    value === 'unavailable'
  )
}

function parse_max_minutes(value: JsonValue): number | null {
  if (value === null) return null
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 20 &&
    value <= 240
    ? Math.round(value)
    : null
}

function parse_state(
  value: JsonValue,
  expected_week_start_date_local: string,
): NextWeekAvailabilityState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, JsonValue>
  if (record.week_start_date_local !== expected_week_start_date_local) {
    return null
  }

  const raw_days = record.days
  if (!raw_days || typeof raw_days !== 'object' || Array.isArray(raw_days)) {
    return null
  }

  const day_record = raw_days as Record<string, JsonValue>
  const days = {} as Record<CoachWeekDay, CoachAvailabilityDay>

  for (const day of COACH_WEEK_DAYS) {
    const raw_day = day_record[day]
    if (!raw_day || typeof raw_day !== 'object' || Array.isArray(raw_day)) {
      days[day] = { status: 'unspecified', max_minutes: null }
      continue
    }

    const item = raw_day as Record<string, JsonValue>
    days[day] = {
      status: is_status(item.status) ? item.status : 'unspecified',
      max_minutes: parse_max_minutes(item.max_minutes),
    }
  }

  return {
    schema_version: '1.0.0',
    week_start_date_local: expected_week_start_date_local,
    days,
  }
}

export async function load_next_week_availability(
  repository: SettingsRepository,
  current_local_date: string,
): Promise<NextWeekAvailabilityState> {
  const fallback = default_next_week_availability(current_local_date)
  const stored = await repository.get(NEXT_WEEK_AVAILABILITY_SETTING_KEY)
  if (!stored) return fallback

  return (
    parse_state(stored.value_json, fallback.week_start_date_local) ?? fallback
  )
}

export async function save_next_week_availability(
  state: NextWeekAvailabilityState,
  repository: SettingsRepository,
  context: { current_local_date: string; now_iso: string },
): Promise<NextWeekAvailabilityState> {
  const expected_week_start_date_local = next_week_start_date(
    context.current_local_date,
  )

  if (state.week_start_date_local !== expected_week_start_date_local) {
    throw new Error(
      'Next-week availability is stale. Refresh the Coach screen before saving.',
    )
  }

  const cleaned = {} as Record<CoachWeekDay, CoachAvailabilityDay>
  for (const day of COACH_WEEK_DAYS) {
    const value = state.days[day]
    cleaned[day] = {
      status: value?.status ?? 'unspecified',
      max_minutes:
        value?.max_minutes !== null &&
        value?.max_minutes !== undefined &&
        Number.isFinite(value.max_minutes) &&
        value.max_minutes >= 20 &&
        value.max_minutes <= 240
          ? Math.round(value.max_minutes)
          : null,
    }
  }

  const saved: NextWeekAvailabilityState = {
    schema_version: '1.0.0',
    week_start_date_local: expected_week_start_date_local,
    days: cleaned,
  }

  const setting: Setting = {
    key: NEXT_WEEK_AVAILABILITY_SETTING_KEY,
    scope: 'global',
    value_json: saved as unknown as JsonValue,
    updated_at: context.now_iso,
    device_id: null,
  }

  await repository.put(setting)
  return saved
}

export function availability_is_complete(
  state: NextWeekAvailabilityState,
): boolean {
  return COACH_WEEK_DAYS.every(
    (day) => state.days[day].status !== 'unspecified',
  )
}

export function build_next_week_availability_instruction(
  state: NextWeekAvailabilityState,
): NextWeekAvailabilityInstruction {
  const complete = availability_is_complete(state)
  const days = Object.fromEntries(
    COACH_WEEK_DAYS.map((day, index) => [
      day,
      {
        ...state.days[day],
        date_local: plus_days(state.week_start_date_local, index),
      },
    ]),
  ) as Record<CoachWeekDay, CoachAvailabilityInstructionDay>

  return {
    week_start_date_local: state.week_start_date_local,
    week_end_date_local: plus_days(state.week_start_date_local, 6),
    complete,
    source: complete ? 'coach_screen' : 'unspecified',
    days,
    scheduling_rule:
      'Availability is a hard scheduling constraint: never programme training on a day marked unavailable. Available and long-session days are opportunities, not mandatory sessions; recovery evidence may justify using fewer available days. If any day is unspecified, confirm the missing availability in the end-of-week check-in before programming.',
  }
}
