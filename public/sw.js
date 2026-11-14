// Aluna service worker — keeps the app shell (incl. the crisis contacts screen) available offline.
// Network-first for same-origin GETs, falling back to cache. Never caches /api or Supabase calls.
const CACHE = 'aluna-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        // SPA navigation offline → serve the shell; the router renders the right screen.
        if (req.mode === 'navigate') return (await caches.match('/index.html')) || (await caches.match('/'))
        return Response.error()
      }),
  )
})

// ---- Web Push: one gentle prompt per check-in (+ max one reminder), sent by /api/heartbeat ----
self.addEventListener('push', (event) => {
  let data = { title: 'Aluna', body: 'Your check-in is ready. About a minute.', url: '/', tag: 'aluna' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag, // replaces an earlier Aluna notification instead of stacking
      renotify: false,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    }),
  )
})

// Tapping the notification opens straight into the check-in (one tap, no navigation).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
