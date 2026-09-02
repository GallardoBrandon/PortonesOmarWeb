// Service worker: habilita instalación como PWA y navegación básica offline.
const CACHE_NAME = 'portones-cache-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/productos.html',
  '/producto.html',
  '/galeria.html',
  '/instalar.html',
  '/cliente.html',
  '/admin.html',
  '/styles.css',
  '/script.js',
  '/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API: red primero, con caché como respaldo para catálogo offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Archivos estáticos: caché primero, red como respaldo
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
