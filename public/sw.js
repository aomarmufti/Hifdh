// Bump CACHE when shipping new assets; the old cache is dropped on activate.
const CACHE = 'hifdh-v3';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './config.js',
  './lib/quran.js', './lib/engine.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch Supabase or CDN traffic - those must always hit the network
  // so data stays fresh and auth redirects behave.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate: instant paint, next load gets the update.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});

/* ══════════════════════ push ══════════════════════
   This is the whole point of the service worker: it runs with the app fully
   closed, so the 5:30 reminder arrives whether or not Hifdh is open.
   ═════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* malformed payload */ }

  const title = data.title || 'Hifdh';
  const options = {
    body: data.body || "Today's portion is ready.",
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'hifdh-daily',
    renotify: true,
    data: { url: data.url || './' }
  };
  // waitUntil keeps the worker alive until the notification is actually shown.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) {
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

// A subscription can be rotated by the push service. Tell the page so it can
// re-register; if nothing is open the next launch re-subscribes anyway.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) client.postMessage({ type: 'resubscribe' });
  })());
});
