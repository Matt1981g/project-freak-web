export interface PwaStartupResult {
  service_worker_supported: boolean
  service_worker_registered: boolean
  service_worker_update_requested: boolean
  storage_persistence_supported: boolean
  storage_persisted_before: boolean | null
  storage_persist_requested: boolean
  storage_persisted_after: boolean | null
}

export interface PwaRegistrationTarget {
  script_url: string
  scope: string
}

export function resolve_pwa_registration(
  href = 'http://localhost/',
): PwaRegistrationTarget {
  const scope_url = new URL('./', href)
  return {
    script_url: new URL('sw.js', scope_url).href,
    scope: scope_url.pathname,
  }
}

export async function initialize_pwa_runtime(): Promise<PwaStartupResult> {
  let service_worker_registered = false
  let service_worker_update_requested = false

  if ('serviceWorker' in navigator) {
    try {
      const href =
        typeof globalThis.location === 'undefined'
          ? 'http://localhost/'
          : globalThis.location.href
      const target = resolve_pwa_registration(href)
      const registration = await navigator.serviceWorker.register(
        target.script_url,
        {
          scope: target.scope,
          updateViaCache: 'none',
        },
      )
      service_worker_registered = true

      if (registration.waiting) {
        registration.waiting.postMessage('PROJECT_FREAK_SKIP_WAITING')
      }

      if (typeof registration.update === 'function') {
        service_worker_update_requested = true
        await registration.update()
      }
    } catch {
      service_worker_registered = false
    }
  }

  let storage_persisted_before: boolean | null = null
  let storage_persisted_after: boolean | null = null
  let storage_persist_requested = false
  const storage_persistence_supported =
    typeof navigator.storage?.persisted === 'function' &&
    typeof navigator.storage?.persist === 'function'

  if (storage_persistence_supported) {
    try {
      storage_persisted_before = await navigator.storage.persisted()

      if (!storage_persisted_before) {
        storage_persist_requested = true
        storage_persisted_after = await navigator.storage.persist()
      } else {
        storage_persisted_after = true
      }
    } catch {
      storage_persisted_after = storage_persisted_before
    }
  }

  return {
    service_worker_supported: 'serviceWorker' in navigator,
    service_worker_registered,
    service_worker_update_requested,
    storage_persistence_supported,
    storage_persisted_before,
    storage_persist_requested,
    storage_persisted_after,
  }
}
