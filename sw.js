// 1. Incrementa la versione per forzare l'aggiornamento
const CACHE_NAME = 'pfd-cache-v1.4.0';

// 2. Risorse statiche + librerie CDN per il supporto offline completo
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logoApp.png',
  './css/style.css',
  './js/app.js',
  './js/tab1-gestione.js',
  './js/tab2-dashboard.js',
  './js/tab3-dettagli.js',
  './js/tab4-rebalancing.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js'
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
// Strategia cache-first con runtime-caching: le richieste GET riuscite
// (stesso-origine e CDN) vengono salvate in cache per il futuro uso offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return resp;
        });
      })
  );
});

// Gestore messaggi per inviare la versione alla pagina web
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME.replace('pfd-cache-', '') });
  }
});
