// 1. Incrementa la versione per forzare l'aggiornamento
const CACHE_NAME = 'pfd-cache-v1.2.2'; 

// 2. Includiamo anche Chart.js per il supporto offline completo
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logoApp.png',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Installazione: forza l'attivazione immediata del nuovo SW
self.addEventListener('install', event => {
  self.skipWaiting(); // Non aspetta la chiusura dell'app
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Attivazione: elimina le vecchie cache (es. v1.2.0) e prende il controllo
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Eliminazione vecchia cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Applica le modifiche subito
  );
});

// Intercettazione delle richieste offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// Gestore messaggi per inviare la versione alla pagina web
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME.replace('pfd-cache-', '') });
  }
});
