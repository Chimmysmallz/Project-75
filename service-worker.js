/* =====================================================================
   PROJECT 75 — service-worker.js
   Offline-first app shell. Bump CACHE when you change any core file.
   All paths are relative so it works on GitHub Pages project sites
   (e.g. https://user.github.io/project-75/).
   ===================================================================== */
const CACHE = 'project75-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/store.js',
  './js/charts.js',
  './js/food.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Add individually so one missing optional asset never fails the install.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* ignore */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin requests; let everything else pass through.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: serve the app shell so offline reloads work.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
    })
  );
});
