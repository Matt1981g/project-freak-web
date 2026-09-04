import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialize_pwa_runtime } from './pwaRuntime'

describe('initialize_pwa_runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers the service worker and requests persistence when needed', async () => {
    const register = vi.fn().mockResolvedValue({})
    const persisted = vi.fn().mockResolvedValue(false)
    const persist = vi.fn().mockResolvedValue(true)

    vi.stubGlobal('navigator', {
      serviceWorker: { register },
      storage: { persisted, persist },
    })

    const result = await initialize_pwa_runtime()

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(persisted).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledOnce()
    expect(result).toEqual({
      service_worker_supported: true,
      service_worker_registered: true,
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
    expect(result.storage_persisted_before).toBe(true)
    expect(result.storage_persisted_after).toBe(true)
  })

  it('degrades safely when browser APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {})

    const result = await initialize_pwa_runtime()

    expect(result).toEqual({
      service_worker_supported: false,
      service_worker_registered: false,
      storage_persistence_supported: false,
      storage_persisted_before: null,
      storage_persist_requested: false,
      storage_persisted_after: null,
    })
  })
})
