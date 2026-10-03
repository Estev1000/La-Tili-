/* =============================================================
   La Tili · Service Worker
   Precarga la app para que abra al instante y funcione sin internet
   para mostrar la interfaz. Los datos del chat SIEMPRE vienen de
   Supabase: acá nunca se cachean peticiones a la red externa.
   ============================================================= */

const CACHE_NAME = 'la-tili-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './js/config.js',
  './js/app.js',
  './js/pwa.js',
  './icon-192x192.png',
  './icon-512x512.png',
  './icon-512x512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32x32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch((err) => console.warn('[sw] no se pudo precachear todo:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// El navegador avisa cuando hay una versión nueva esperando
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Solo lo nuestro (GitHub Pages). Supabase y los CDN se ignoran:
  // cachear el chat o el SDK rompería el tiempo real.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});