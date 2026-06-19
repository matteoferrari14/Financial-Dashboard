const CACHE_NAME = 'dashboard-stonks-v1';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './logoApp.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fill(event.request);
      })
  );
});
