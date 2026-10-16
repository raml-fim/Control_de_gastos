/* ============================================================================
 * sw.js — service worker de la aplicación
 * ---------------------------------------------------------------------------
 * RF-21 (modo sin conexión): guarda en caché el armazón de la aplicación para
 * que abra incluso sin red. Los datos del usuario viven en localStorage, así
 * que la app funciona completamente offline una vez cargada una vez.
 *
 * Nota: los service workers solo se registran desde http(s). Si abres
 * index.html directamente (file://), la aplicación funciona igual, pero sin
 * caché del navegador.
 * ==========================================================================*/

var CACHE = 'cgai-v1';

var ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './js/core/util.js',
  './js/core/storage.js',
  './js/core/state.js',
  './js/core/analytics.js',
  './js/core/intelligence.js',
  './js/core/security.js',
  './js/core/notify.js',
  './js/core/ui.js',
  './js/views/dashboard.js',
  './js/views/movements.js',
  './js/views/budget.js',
  './js/views/goals.js',
  './js/views/analysis.js',
  './js/views/settings.js',
  './js/app.js'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll falla por completo si un recurso no está; se toleran fallos sueltos
      return Promise.all(ARCHIVOS.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  var peticion = evento.request;
  if (peticion.method !== 'GET') { return; }

  // Estrategia: caché primero para el armazón; red como respaldo y actualización.
  evento.respondWith(
    caches.match(peticion).then(function (enCache) {
      if (enCache) { return enCache; }
      return fetch(peticion).then(function (respuesta) {
        if (!respuesta || respuesta.status !== 200 || respuesta.type === 'opaque') {
          return respuesta;
        }
        var copia = respuesta.clone();
        caches.open(CACHE).then(function (cache) { cache.put(peticion, copia); });
        return respuesta;
      }).catch(function () {
        // Sin red y sin caché: si es una navegación, se sirve el index guardado
        if (peticion.mode === 'navigate') { return caches.match('./index.html'); }
        return new Response('Recurso no disponible sin conexión.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
