import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SupabaseSyncProvider,
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
