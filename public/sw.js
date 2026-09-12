// Bump CACHE when shipping new assets; the old cache is dropped on activate.
const CACHE = 'hifdh-v2';
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
