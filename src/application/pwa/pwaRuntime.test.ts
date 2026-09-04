import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initialize_pwa_runtime,
  resolve_pwa_registration,
} from './pwaRuntime'

describe('PWA runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves service worker paths for root and hosted subpaths', () => {
    expect(
      resolve_pwa_registration('https://example.com/#/plan'),
    ).toEqual({
      script_url: 'https://example.com/sw.js',
      scope: '/',
    })

    expect(
      resolve_pwa_registration(
        'https://example.com/project-freak-web/#/plan',
      ),
    ).toEqual({
      script_url: 'https://example.com/project-freak-web/sw.js',
      scope: '/project-freak-web/',
    })
  })

  it('registers the service worker and requests persistence when needed', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const register = vi.fn().mockResolvedValue({
      waiting: null,
      update,
    })
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockResolvedValue(true)

    vi.stubGlobal('navigator', {
      serviceWorker: { register },
      storage: { persisted, persist },
    })

    const result = await initialize_pwa_runtime()

    expect(register).toHaveBeenCalledWith('http://localhost/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(update).toHaveBeenCalledOnce()
    expect(persisted).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    expect(result).toEqual({
      service_worker_supported: true,
      service_worker_registered: true,
      service_worker_update_requested: true,
      storage_persistence_supported: true,
      storage_persisted_before: false,
      storage_persist_requested: true,
      storage_persisted_after: true,
    })
  })

  it('does not request persistence again when storage is already persistent', async () => {
    const persist = vi.fn()

    vi.stubGlobal('navigator', {
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist,
      },
    })

    const result = await initialize_pwa_runtime()

    expect(persist).not.toHaveBeenCalled()
    expect(result.service_worker_supported).toBe(false)
    expect(result.service_worker_update_requested).toBe(false)
    expect(result.storage_persisted_before).toBe(true)
    expect(result.storage_persisted_after).toBe(true)
  })

  it('degrades safely when browser APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {})

    const result = await initialize_pwa_runtime()

    expect(result).toEqual({
      service_worker_supported: false,
      service_worker_registered: false,
      service_worker_update_requested: false,
      storage_persistence_supported: false,
      storage_persisted_before: null,
      storage_persist_requested: false,
      storage_persisted_after: null,
    })
  })
})
