export interface PwaStartupResult {
  service_worker_supported: boolean
  service_worker_registered: boolean
  storage_persistence_supported: boolean
  storage_persisted_before: boolean | null
  storage_persist_requested: boolean
  storage_persisted_after: boolean | null
}

export async function initialize_pwa_runtime(): Promise<PwaStartupResult> {
  let service_worker_registered = false

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      service_worker_registered = true
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
    storage_persistence_supported,
    storage_persisted_before,
    storage_persist_requested,
    storage_persisted_after,
  }
}
