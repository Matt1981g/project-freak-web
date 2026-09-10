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

const APP_UPDATE_RELOAD_KEY = 'project-freak:last-app-update-reload'
let app_update_check_in_flight: Promise<boolean> | null = null
let app_update_listener_installed = false

export function resolve_pwa_registration(
  href = 'http://localhost/',
): PwaRegistrationTarget {
  const scope_url = new URL('./', href)
  return {
    script_url: new URL('sw.js', scope_url).href,
    scope: scope_url.pathname,
  }
}

function current_module_script_url(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )
  return script?.src ?? null
}

function deployed_module_script_url(html: string, base_url: string): string | null {
  const document_copy = new DOMParser().parseFromString(html, 'text/html')
  const script = document_copy.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )
  const source = script?.getAttribute('src')
  return source ? new URL(source, base_url).href : null
}

async function check_for_deployed_app_update(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof location === 'undefined') {
    return false
  }
  if (document.visibilityState !== 'visible') return false
  if (app_update_check_in_flight) return app_update_check_in_flight

  const operation = (async () => {
    const current_script = current_module_script_url()
    if (!current_script) return false

    const base_url = new URL('./', location.href).href
    const response = await fetch(base_url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) return false

    const deployed_script = deployed_module_script_url(
      await response.text(),
      base_url,
    )
    if (!deployed_script) return false

    if (deployed_script === current_script) {
      sessionStorage.removeItem(APP_UPDATE_RELOAD_KEY)
      return false
    }

    if (sessionStorage.getItem(APP_UPDATE_RELOAD_KEY) === deployed_script) {
      return false
    }

    sessionStorage.setItem(APP_UPDATE_RELOAD_KEY, deployed_script)
    location.reload()
    return true
  })()
    .catch(() => false)
    .finally(() => {
      app_update_check_in_flight = null
    })

  app_update_check_in_flight = operation
  return operation
}

function install_app_update_listener(): void {
  if (app_update_listener_installed) return
  app_update_listener_installed = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void check_for_deployed_app_update()
    }
  })
}

export async function initialize_pwa_runtime(): Promise<PwaStartupResult> {
  let service_worker_registered = false
  let service_worker_update_requested = false

  install_app_update_listener()
  void check_for_deployed_app_update()

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
