const CACHE_NAME = 'project-freak-shell-v4-brand'

function app_url(path = '') {
  return new URL(path, self.registration.scope).href
}

function fetch_fresh(request) {
  return fetch(request, { cache: 'no-store' })
}

const CORE_ASSETS = [
  app_url(),
  app_url('manifest.webmanifest'),
  app_url('pf-icon-v2.svg'),
  app_url('pf-favicon-v2.svg'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'PROJECT_FREAK_SKIP_WAITING') {
    void self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const network_first =
    request.mode === 'navigate' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker' ||
    request.destination === 'manifest'

  if (network_first) {
    event.respondWith(
      fetch_fresh(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          const exact = await caches.match(request)
          if (exact) return exact

          if (request.mode === 'navigate') {
            const shell = await caches.match(app_url())
            if (shell) return shell
          }

          return new Response(
            'PROJECT FREAK is offline and this resource is not cached yet.',
            {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            },
          )
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
