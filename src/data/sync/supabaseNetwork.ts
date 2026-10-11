/**
 * Bounded network requests for PF's existing Supabase RPC contract.
 * RPC push uses stable outbox IDs/revisions so a lost acknowledgment may be
 * retried; auth password/refresh endpoints must NOT be retried automatically.
 */
export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly transient: boolean,
  ) {
    super(message)
    this.name = 'SupabaseRequestError'
  }
}

export interface RequestPolicy {
  timeout_ms?: number
  attempts?: number
  retry_delay_ms?: number
}

const transient_statuses = new Set([408, 425, 429, 500, 502, 503, 504])

function transient_error(cause: unknown): SupabaseRequestError {
  if (cause instanceof SupabaseRequestError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  return new SupabaseRequestError(
    `Supabase temporarily unreachable: ${message}. Your unsynced records remain on this device.`,
    null,
    true,
  )
}

export async function supabase_fetch(
  url: string,
  init: RequestInit,
  policy: RequestPolicy = {},
): Promise<Response> {
  const timeout = policy.timeout_ms ?? 12000
  const attempts = policy.attempts ?? 1
  const delay = policy.retry_delay_ms ?? 250
  if (!Number.isFinite(timeout) || timeout < 1 ||
      !Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new Error('Invalid Supabase network request policy.')
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const response = await Promise.race([
        fetch(url, { ...init, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new SupabaseRequestError(
              'Supabase request timed out. Local changes are preserved.',
              null,
              true,
            ))
          }, timeout)
        }),
      ])
      if (transient_statuses.has(response.status) && attempt + 1 < attempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay * (attempt + 1)))
        continue
      }
      return response
    } catch (cause) {
      const error = transient_error(cause)
      if (!error.transient || attempt + 1 >= attempts) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, delay * (attempt + 1)))
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  throw new Error('Unreachable Supabase retry limit.')
}

export function is_terminal_refresh_failure(
  status: number | null,
  error_message: string,
): boolean {
  if (status !== 400 && status !== 401) return false
  return /invalid.refresh.token|refresh.token.not.found|refresh.token.already.used|invalid.grant|session.not.found/i.test(error_message)
}
