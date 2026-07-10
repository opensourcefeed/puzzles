/* eslint-disable */
/* Service Worker for Word Plant - Enables offline play and installability */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `word-plant-static-${CACHE_VERSION}`;
const DICT_CACHE = `word-plant-dict-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `word-plant-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/puzzles/word-plant-practice/',
  '/puzzles/word-plant-practice/index.html',
  '/puzzles/word-plant-practice/manifest.json',
  '/puzzles/word-plant-practice/favicon.ico',
  '/puzzles/word-plant-practice/logo192.png',
  '/puzzles/word-plant-practice/logo512.png',
  '/puzzles/word-plant-practice/logo192-maskable.png',
  '/puzzles/word-plant-practice/logo512-maskable.png',
];

// Install event - pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, DICT_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Dictionary API: Cache-first with 7-day expiry
  if (url.hostname === 'api.dictionaryapi.dev') {
    event.respondWith(cacheFirstDict(request));
    return;
  }

  // Static assets (images, sounds, fonts): Cache-first
  if (
    request.destination === 'image' ||
    request.destination === 'audio' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|mp3|ogg|woff2?)$/)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App shell (HTML, JS, CSS): Stale-while-revalidate
  if (
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    url.pathname.includes('/static/')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else: Network-first with cache fallback
  event.respondWith(networkFirst(request));
});

// Cache-first strategy for static assets
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Cache-first for dictionary API with time-based expiry
async function cacheFirstDict(request) {
  const cache = await caches.open(DICT_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const cachedDate = new Date(cachedResponse.headers.get('date') || 0);
    const now = new Date();
    const daysSinceCached = (now - cachedDate) / (1000 * 60 * 60 * 24);
    if (daysSinceCached < 7) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('', { status: 503 });
  }
}

// Stale-while-revalidate for JS/CSS
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Network-first for other requests
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 503 });
  }
}