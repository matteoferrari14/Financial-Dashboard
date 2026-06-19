const CACHE_NAME = 'dashboard-stonks-v1';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Installazione e salvataggio dei file nella cache locale
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione delle richieste per farla funzionare offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});