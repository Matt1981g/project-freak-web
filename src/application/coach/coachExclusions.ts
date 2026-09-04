import type { JsonValue, Setting } from '../../domain/models'
import type { SettingsRepository } from '../../data/repositories/contracts'

export const COACH_EXCLUDED_SESSIONS_SETTING_KEY =
  'coach-excluded-sessions-v1'

export interface CoachExcludedSessionsState {
  schema_version: '1.0.0'
  session_ids: string[]
}

function parse_state(value: JsonValue): CoachExcludedSessionsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { schema_version: '1.0.0', session_ids: [] }
  }

  const record = value as Record<string, JsonValue>
  const raw = record.session_ids
  if (!Array.isArray(raw)) {
    return { schema_version: '1.0.0', session_ids: [] }
  }

  const session_ids = [
    ...new Set(raw.filter((value): value is string => typeof value === 'string')),
  ].sort()

  return { schema_version: '1.0.0', session_ids }
}

export async function load_coach_excluded_sessions(
  repository: SettingsRepository,
): Promise<CoachExcludedSessionsState> {
  const stored = await repository.get(COACH_EXCLUDED_SESSIONS_SETTING_KEY)
  return stored
    ? parse_state(stored.value_json)
    : { schema_version: '1.0.0', session_ids: [] }
}

export async function set_session_coach_excluded(
  session_id: string,
  excluded: boolean,
  repository: SettingsRepository,
  context: { now_iso: string },
): Promise<CoachExcludedSessionsState> {
  const current = await load_coach_excluded_sessions(repository)
  const ids = new Set(current.session_ids)

  if (excluded) ids.add(session_id)
  else ids.delete(session_id)

  const state: CoachExcludedSessionsState = {
    schema_version: '1.0.0',
    session_ids: [...ids].sort(),
  }

  const setting: Setting = {
    key: COACH_EXCLUDED_SESSIONS_SETTING_KEY,
    scope: 'global',
    value_json: state as unknown as JsonValue,
    updated_at: context.now_iso,
    device_id: null,
  }

  await repository.put(setting)
  return state
}
