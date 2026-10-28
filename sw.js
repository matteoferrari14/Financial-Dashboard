// 1. Incrementa la versione per forzare l'aggiornamento
const CACHE_NAME = 'pfd-cache-v1.6.25';

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
  './js/tab5-etf-inserimenti.js',
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
// Strategia cache-first con runtime-caching: SOLO le risorse dell'app (stesso-origine e
// CDN in whitelist) vengono salvate in cache. Le chiamate esterne (pagina justETF letta
// tramite r.jina.ai) NON sono intercettate: passano dirette al browser e non finiscono mai in cache.
const hostInCache = [
  self.location.host,                 // file dell'app su GitHub Pages
  'cdn.jsdelivr.net'                  // Chart.js
];

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (!hostInCache.includes(url.hostname)) return; // proxy CORS e API esterne: nessun intervento

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return resp;
        }).catch(() => caches.match('./index.html'));
      })
  );
});

// Gestore messaggi per inviare la versione alla pagina web
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME.replace('pfd-cache-', '') });
  }
});
