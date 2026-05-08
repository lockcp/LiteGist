const CACHE_NAME = 'litegist-v16';
const STATIC_ASSETS = ['/admin', '/admin/', '/admin/index.html', '/admin/styles.css', '/admin/app.js', '/admin/manifest.json', '/admin/icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API and auth — let them go straight to network
  if (url.pathname.startsWith('/api/') || url.pathname === '/admin/logout') return;

  // Local static assets: serve from cache immediately, revalidate in background
  if (url.origin === self.location.origin && STATIC_ASSETS.some(a => url.pathname === a || url.pathname === a + '/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fresh = fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || fresh;
        })
      )
    );
    return;
  }

  // CDN scripts: cache on first load, serve from cache after that
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
