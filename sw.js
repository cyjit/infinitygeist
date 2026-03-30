const CACHE_VERSION = 'geist-2026032902';

const PRECACHE_URLS = [
  './',
  './index.html',
  './geist.png',
  './geist-192.png',
  './geist-512.png',
  './adepticon_logo.png',
  './ine.svg',
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Analytics: network-only, fail silently
  if (url.hostname === 'gc.zgo.at') {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 204 }))
    );
    return;
  }

  // Google Fonts font files: stale-while-revalidate
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
