// Service worker for the ZMT Phone POS PWA.
// Network-first for navigations, cache-first for static assets. Never touch
// the WebSocket or API endpoints.
const CACHE = 'zmt-psale-v1';
const CORE = ['/', 'index.html', 'manifest.webmanifest', 'app.js', 'vendor/zxing.min.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname === '/api/pair' || url.pathname === '/ws' || url.pathname === '/cert') return;
  const isNavigation = e.request.mode === 'navigate' ||
    (e.request.method === 'GET' && (url.pathname === '/' || url.pathname === '/sale/' || url.pathname === '/sale'));
  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/sale/')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match('/sale/')))
  );
});