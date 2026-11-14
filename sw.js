const CACHE_NAME = 'royal-chess-pwa-v3';

const APP_SHELL = [
  './',
  './index.html',
  './chess.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Best-effort cache for CDN scripts so offline AI/local play works
      await Promise.allSettled(
        EXTERNAL_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept WebRTC/PeerJS signaling or non-http(s) requests
  if (!url.protocol.startsWith('http')) return;
  if (url.hostname.includes('peerjs.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate for same-origin files
        if (url.origin === self.location.origin) {
          fetch(event.request)
            .then((networkRes) => {
              if (networkRes && networkRes.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkRes);
                });
              }
            })
            .catch(() => {});
        }
        return cached;
      }

      return fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.ok && (url.origin === self.location.origin || EXTERNAL_ASSETS.includes(event.request.url))) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkRes;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./chess.html');
          }
        });
    })
  );
});
