import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SupabaseSyncProvider,
  supabase_sign_in,
  require_supabase_session,
  check_supabase_backend,
  validate_supabase_config,
} from './supabaseProvider'

describe('Supabase sync provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalises a valid HTTPS project URL', () => {
    expect(
      validate_supabase_config({
        project_url: 'https://example.supabase.co/',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).toEqual({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    })
  })

  it('rejects non-HTTPS configuration', () => {
    expect(() =>
      validate_supabase_config({
        project_url: 'http://example.supabase.co',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).toThrow('HTTPS')
  })

  it('clears an expired stored session when refresh fails', async () => {
    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          access_token: 'expired-access',
          refresh_token: 'expired-refresh',
          expires_at: Date.now() - 60_000,
          user_id: 'user-1',
          email: 'test@example.com',
        }),
      ),
      setItem: vi.fn(),
      removeItem,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'invalid refresh token' }),
      }),
    )

    await expect(
      check_supabase_backend({
        project_url: 'https://example.supabase.co',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).rejects.toThrow('invalid refresh token')

    expect(removeItem).toHaveBeenCalledWith(
      'project-freak:sync:supabase:session:v1',
    )
  })

  it('clears malformed stored sessions instead of leaving a poisoned login behind', async () => {
    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 123,
          expires_at: 'not-a-number',
          user_id: 'user-1',
        }),
      ),
      setItem: vi.fn(),
      removeItem,
    })

    await expect(
      check_supabase_backend({
        project_url: 'https://example.supabase.co',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).rejects.toThrow('Sign in to Supabase before syncing.')

    expect(removeItem).toHaveBeenCalledWith(
      'project-freak:sync:supabase:session:v1',
    )
  })

  it('preserves a reusable refresh credential after a nonterminal 401 response', async () => {
    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          access_token: 'rejected-access',
          refresh_token: 'refresh',
          expires_at: Date.now() + 60_000,
          user_id: 'user-1',
          email: 'test@example.com',
        }),
      ),
      setItem: vi.fn(),
      removeItem,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'invalid access token' }),
      }),
    )

    await expect(
      check_supabase_backend({
        project_url: 'https://example.supabase.co',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).rejects.toThrow('invalid access token')

    // A generic access-token 401 alone does not prove refresh revocation.
    // The client has retried the RPC only after attempting forced refresh.
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('retains offline credentials after refresh times out or is unreachable', async () => {
    const removeItem = vi.fn()
    const getItem = vi.fn().mockReturnValue(JSON.stringify({
      access_token: 'expired-access',
      refresh_token: 'valid-offline-refresh',
      expires_at: Date.now() - 60_000,
      user_id: 'user-1',
      email: 'user@example.com',
    }))
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(require_supabase_session({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    })).rejects.toThrow('temporarily unreachable')
    expect(removeItem).not.toHaveBeenCalled()
    expect(getItem).toHaveBeenCalled()
  })

  it('refreshes a rejected access JWT and retries the same cloud request once', async () => {
    const setItem = vi.fn()
    const access = {
      access_token: 'old-token',
      refresh_token: 'old-refresh',
      expires_at: Date.now() + 60_000,
      user_id: 'user-1',
      email: 'user@example.com',
    }
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockImplementation(() => JSON.stringify(access)),
      setItem,
      removeItem: vi.fn(),
    })
    const responses = [
      { ok: false, status: 401, text: async () => JSON.stringify({ error: 'JWT expired' }) },
      { ok: true, status: 200, text: async () => JSON.stringify({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: 'user-1', email: 'user@example.com' },
      }) },
      { ok: true, status: 200, text: async () => JSON.stringify({
        contract_version: '1.0.0',
        authenticated_user_id: 'user-1',
        entity_count: 0,
        change_count: 0,
      }) },
    ]
    const fetch_mock = vi.fn().mockImplementation(async () => responses.shift())
    vi.stubGlobal('fetch', fetch_mock)
    await expect(check_supabase_backend({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    })).resolves.toMatchObject({ contract_version: '1.0.0' })
    expect(fetch_mock).toHaveBeenCalledTimes(3)
    expect(setItem).toHaveBeenCalledWith(
      'project-freak:sync:supabase:session:v1',
      expect.stringContaining('new-refresh'),
    )
  })

  it('rejects changing the bound account before overwriting the saved login', async () => {
    const setItem = vi.fn()
    const existing = JSON.stringify({
      access_token: 'original-access',
      refresh_token: 'original-refresh',
      expires_at: Date.now() + 60_000,
      user_id: 'original-user',
      email: 'original@example.com',
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(existing),
      setItem,
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: 'other-user', email: 'other@example.com' },
      }),
    }))

    await expect(supabase_sign_in(
      { project_url: 'https://example.supabase.co', anon_key: 'abcdefghijklmnopqrstuvwxyz' },
      'other@example.com',
      'test-password',
      async (candidate) => {
        expect(candidate.user_id).toBe('other-user')
        throw new Error('Account mismatch: the existing dataset is not linked to this user.')
      },
    )).rejects.toThrow('Account mismatch')
    expect(setItem).not.toHaveBeenCalled()
    await expect(require_supabase_session({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    })).resolves.toMatchObject({ user_id: 'original-user' })
  })

  it('pins an active provider to its original user across external account changes', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        access_token: 'other-account-access',
        refresh_token: 'refresh',
        expires_at: Date.now() + 60_000,
        user_id: 'other-user',
        email: null,
      })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    const fetch_mock = vi.fn()
    vi.stubGlobal('fetch', fetch_mock)
    const provider = new SupabaseSyncProvider({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    }, 'original-user')
    await expect(provider.pull_changes(null, 100)).rejects.toThrow(
      'account changed during sync',
    )
    expect(fetch_mock).not.toHaveBeenCalled()
  })

  it('verifies the authenticated backend contract without mutating data', async () => {
    const fetch_mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          contract_version: '1.0.0',
          authenticated_user_id: 'user-1',
          entity_count: 12,
          change_count: 14,
        }),
    })
    vi.stubGlobal('fetch', fetch_mock)
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: Date.now() + 60_000,
          user_id: 'user-1',
          email: 'test@example.com',
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    await expect(
      check_supabase_backend({
        project_url: 'https://example.supabase.co',
        anon_key: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).resolves.toEqual({
      contract_version: '1.0.0',
      authenticated_user_id: 'user-1',
      entity_count: 12,
      change_count: 14,
    })

    expect(fetch_mock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/project_freak_sync_health',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      }),
    )
  })

  it('maps push mutations to the Supabase RPC contract', async () => {
    const fetch_mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          acknowledged_outbox_ids: ['outbox-1'],
          remote_user_id: 'user-1',
          error: null,
        }),
    })
    vi.stubGlobal('fetch', fetch_mock)
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_at: Date.now() + 60_000,
          user_id: 'user-1',
          email: 'test@example.com',
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    const provider = new SupabaseSyncProvider({
      project_url: 'https://example.supabase.co',
      anon_key: 'abcdefghijklmnopqrstuvwxyz',
    })

    await expect(
      provider.push_mutations([
        {
          outbox_id: 'outbox-1',
          entity_type: 'set',
          entity_id: 'set-1',
          operation: 'upsert',
          revision: 1,
          payload_json: { id: 'set-1' },
          created_at: '2026-09-04T20:00:00.000Z',
        },
      ]),
    ).resolves.toMatchObject({
      acknowledged_outbox_ids: ['outbox-1'],
      remote_user_id: 'user-1',
      error: null,
    })

    expect(fetch_mock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/project_freak_push_mutations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"outbox-1"'),
      }),
    )
  })
})
