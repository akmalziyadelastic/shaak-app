const CACHE_NAME = 'shaak-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache only static shell assets
      return Promise.all(
        STATIC_ASSETS.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`Failed to cache ${url}:`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Return from cache if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Otherwise fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Cache valid responses for future use (Dynamic Caching)
        if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((error) => {
        // 3. Fallback for offline navigation (e.g. index.html)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
        throw error;
      });
    })
  );
});
