// Service worker: l'app e i sentieri restano disponibili offline,
// e i riquadri della mappa visti (o scaricati) vengono conservati.
const APP_CACHE = 'app-v13';
const TILE_CACHE = 'tiles-v1';
const APP_FILES = [
  './', 'index.html', 'style.css', 'app.js', 'notes.js', 'tracks.json', 'rides.json', 'confini.json', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png',
  'vendor/leaflet.js', 'vendor/leaflet.css',
  'vendor/images/layers.png', 'vendor/images/layers-2x.png', 'vendor/images/marker-icon.png',
];
const TILE_HOSTS = /(^|\.)tile\.opentopomap\.org$|^tile\.openstreetmap\.org$|^server\.arcgisonline\.com$/;
const tileKey = (url) => url.replace(/\/\/[a-c]\.tile\./, '//tile.');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Riquadri della mappa: prima la copia salvata, altrimenti rete (e la salvo).
  if (TILE_HOSTS.test(url.hostname)) {
    const key = tileKey(req.url);
    e.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(key);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(key, res.clone());
        return res;
      })
    );
    return;
  }

  // File dell'app: rete se c'è (così gli aggiornamenti arrivano), altrimenti copia salvata.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) caches.open(APP_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
  }
});
