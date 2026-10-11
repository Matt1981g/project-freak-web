import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseRequestError, supabase_fetch, is_terminal_refresh_failure } from './supabaseNetwork'

describe('bounded Supabase transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('retries transient RPC failures without changing the serialized request body', async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    const fetch_mock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      requests.push({ url, body: init.body })
      if (requests.length === 1) return { ok: false, status: 503 }
      if (requests.length === 2) throw new TypeError('network interrupted')
      return { ok: true, status: 200 }
    })
    vi.stubGlobal('fetch', fetch_mock)
    const result = await supabase_fetch(
      'https://example.supabase.co/rest/v1/rpc/project_freak_push_mutations',
      { method: 'POST', body: JSON.stringify({ outbox_id: 'stable-1' }) },
      { attempts: 3, retry_delay_ms: 1 },
    )
    expect(result.status).toBe(200)
    expect(fetch_mock).toHaveBeenCalledTimes(3)
    expect(requests.every((r) => r.body === requests[0].body)).toBe(true)
  })

  it('never retries authentication requests by default', async () => {
    const fetch_mock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetch_mock)
    await supabase_fetch('https://example.supabase.co/auth/v1/token', {
      method: 'POST',
    })
    expect(fetch_mock).toHaveBeenCalledTimes(1)
  })

  it('aborts and rejects a hung request within its deadline', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal
      return new Promise<Response>(() => {})
    }))
    await expect(supabase_fetch('https://example.supabase.co/rest/v1/rpc/sync', {
      method: 'POST',
    }, {
      timeout_ms: 15,
      attempts: 1,
    })).rejects.toMatchObject({
      name: 'SupabaseRequestError',
      transient: true,
    })
    expect(signal?.aborted).toBe(true)
  })

  it('only retires refresh credentials for explicit terminal revocation', () => {
    expect(is_terminal_refresh_failure(400, 'invalid refresh token')).toBe(true)
    expect(is_terminal_refresh_failure(401, 'refresh token not found')).toBe(true)
    expect(is_terminal_refresh_failure(503, 'invalid refresh token')).toBe(false)
    expect(is_terminal_refresh_failure(null, 'network offline')).toBe(false)
    expect(new SupabaseRequestError('unavailable', 503, true).transient).toBe(true)
  })
})
