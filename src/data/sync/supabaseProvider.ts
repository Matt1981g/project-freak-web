import type {
  SyncProvider,
  SyncPullResult,
  SyncPushMutation,
  SyncPushResult,
} from './contracts'

const CONFIG_KEY = 'project-freak:sync:supabase:config:v1'
const SESSION_KEY = 'project-freak:sync:supabase:session:v1'

export interface SupabaseSyncConfig {
  project_url: string
  anon_key: string
}

export interface SupabaseAuthSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user_id: string
  email: string | null
}

interface SupabaseAuthResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: {
    id?: string
    email?: string | null
  } | null
  id?: string
  email?: string | null
  error?: string
  error_description?: string
  msg?: string
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function normalise_project_url(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Supabase project URL is required.')

  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'https:') {
    throw new Error('Supabase project URL must use HTTPS.')
  }
  return parsed.href.replace(/\/$/, '')
}

export function validate_supabase_config(
  input: SupabaseSyncConfig,
): SupabaseSyncConfig {
  const project_url = normalise_project_url(input.project_url)
  const anon_key = input.anon_key.trim()

  if (anon_key.length < 20) {
    throw new Error('Supabase anon key looks incomplete.')
  }

  return { project_url, anon_key }
}

export function save_supabase_config(input: SupabaseSyncConfig): SupabaseSyncConfig {
  const config = validate_supabase_config(input)
  storage()?.setItem(CONFIG_KEY, JSON.stringify(config))
  return config
}

export function load_supabase_config(): SupabaseSyncConfig | null {
  const raw = storage()?.getItem(CONFIG_KEY)
  if (!raw) return null

  try {
    return validate_supabase_config(JSON.parse(raw) as SupabaseSyncConfig)
  } catch {
    return null
  }
}

export function clear_supabase_config(): void {
  storage()?.removeItem(CONFIG_KEY)
  clear_supabase_session()
}

function save_supabase_session(session: SupabaseAuthSession): SupabaseAuthSession {
  storage()?.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function load_supabase_session(): SupabaseAuthSession | null {
  const raw = storage()?.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseAuthSession>
    if (
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      typeof parsed.expires_at !== 'number' ||
      typeof parsed.user_id !== 'string'
    ) {
      return null
    }

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: parsed.expires_at,
      user_id: parsed.user_id,
      email: typeof parsed.email === 'string' ? parsed.email : null,
    }
  } catch {
    return null
  }
}

export function clear_supabase_session(): void {
  storage()?.removeItem(SESSION_KEY)
}

async function parse_json_response<T>(response: Response): Promise<T> {
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const record =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : null
    const message =
      (record &&
        [record.msg, record.error_description, record.error, record.message].find(
          (value): value is string => typeof value === 'string' && value.length > 0,
        )) ||
      `Supabase request failed with HTTP ${response.status}.`
    throw new Error(message)
  }

  return payload as T
}

function auth_headers(config: SupabaseSyncConfig, bearer?: string) {
  return {
    apikey: config.anon_key,
    Authorization: `Bearer ${bearer ?? config.anon_key}`,
    'Content-Type': 'application/json',
  }
}

function session_from_auth_response(payload: SupabaseAuthResponse): SupabaseAuthSession {
  const user = payload.user ?? payload
  const user_id = user?.id
  const access_token = payload.access_token
  const refresh_token = payload.refresh_token
  const expires_in = payload.expires_in

  if (
    typeof user_id !== 'string' ||
    typeof access_token !== 'string' ||
    typeof refresh_token !== 'string' ||
    typeof expires_in !== 'number'
  ) {
    throw new Error(
      'Supabase authenticated the request but did not return a reusable session. If email confirmation is enabled, confirm the email then sign in.',
    )
  }

  return save_supabase_session({
    access_token,
    refresh_token,
    expires_at: Date.now() + Math.max(0, expires_in - 60) * 1000,
    user_id,
    email: typeof user?.email === 'string' ? user.email : null,
  })
}

export async function supabase_sign_up(
  config_input: SupabaseSyncConfig,
  email: string,
  password: string,
): Promise<SupabaseAuthSession | null> {
  const config = validate_supabase_config(config_input)
  const response = await fetch(`${config.project_url}/auth/v1/signup`, {
    method: 'POST',
    headers: auth_headers(config),
    body: JSON.stringify({ email: email.trim(), password }),
  })
  const payload = await parse_json_response<SupabaseAuthResponse>(response)

  if (!payload.access_token) {
    return null
  }

  return session_from_auth_response(payload)
}

export async function supabase_sign_in(
  config_input: SupabaseSyncConfig,
  email: string,
  password: string,
): Promise<SupabaseAuthSession> {
  const config = validate_supabase_config(config_input)
  const response = await fetch(
    `${config.project_url}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: auth_headers(config),
      body: JSON.stringify({ email: email.trim(), password }),
    },
  )

  return session_from_auth_response(
    await parse_json_response<SupabaseAuthResponse>(response),
  )
}

export async function supabase_sign_out(
  config_input: SupabaseSyncConfig,
): Promise<void> {
  const config = validate_supabase_config(config_input)
  const session = load_supabase_session()

  try {
    if (session) {
      await fetch(`${config.project_url}/auth/v1/logout`, {
        method: 'POST',
        headers: auth_headers(config, session.access_token),
      })
    }
  } finally {
    clear_supabase_session()
  }
}

async function refresh_supabase_session(
  config: SupabaseSyncConfig,
  session: SupabaseAuthSession,
): Promise<SupabaseAuthSession> {
  const response = await fetch(
    `${config.project_url}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: auth_headers(config),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    },
  )

  return session_from_auth_response(
    await parse_json_response<SupabaseAuthResponse>(response),
  )
}

export async function require_supabase_session(
  config_input: SupabaseSyncConfig,
): Promise<SupabaseAuthSession> {
  const config = validate_supabase_config(config_input)
  const session = load_supabase_session()

  if (!session) {
    throw new Error('Sign in to Supabase before syncing.')
  }

  if (session.expires_at > Date.now()) {
    return session
  }

  return refresh_supabase_session(config, session)
}

async function rpc<T>(
  config: SupabaseSyncConfig,
  function_name: string,
  body: unknown,
): Promise<T> {
  const session = await require_supabase_session(config)
  const response = await fetch(
    `${config.project_url}/rest/v1/rpc/${function_name}`,
    {
      method: 'POST',
      headers: {
        ...auth_headers(config, session.access_token),
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  return parse_json_response<T>(response)
}

export class SupabaseSyncProvider implements SyncProvider {
  readonly id = 'supabase'
  private readonly config: SupabaseSyncConfig

  constructor(config: SupabaseSyncConfig) {
    this.config = validate_supabase_config(config)
  }

  push_mutations(
    mutations: readonly SyncPushMutation[],
  ): Promise<SyncPushResult> {
    return rpc<SyncPushResult>(
      this.config,
      'project_freak_push_mutations',
      { p_mutations: mutations },
    )
  }

  pull_changes(
    cursor: string | null,
    limit: number,
  ): Promise<SyncPullResult> {
    return rpc<SyncPullResult>(
      this.config,
      'project_freak_pull_changes',
      { p_cursor: cursor, p_limit: limit },
    )
  }
}
