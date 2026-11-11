const CACHE_NAME = 'motocontrol-v13';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/utils.js',
  './js/state.js',
  './js/ui.js',
  './js/calc.js',
  './js/views.js',
  './js/render.js',
  './js/import.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});