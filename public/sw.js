const CACHE_NAME = 'film-shop-v13';
const ASSETS = [
    '/',
    '/mobile.html',
    '/styles.css',
    '/app.js',
    '/mobile.css',
    '/mobile.js',
    '/manifest.webmanifest',
    '/mobile.webmanifest',
    '/quad-film-icon.png',
    '/quad-film-icon-192.png',
    '/quad-film-icon-512.png'
  ];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (event.request.method === 'GET' && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
