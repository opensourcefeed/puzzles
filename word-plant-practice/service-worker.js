/* eslint-disable */
/* Service Worker for Word Plant - Enables offline play and installability */

// The same worker serves both pages: the daily page at /puzzles/word-plant/
// and the practice page at /puzzles/word-plant-practice/. Each page
// registers the copy next to it, which controls that page only.
const SCOPE = new URL('./', self.location).pathname;
// Icons and the built assets of both pages live here
const APP = '/puzzles/word-plant/';

// Every puzzle on the site shares the origin's caches, so names carry the
// page and only this page's old caches are removed
const CACHE_PREFIX = `word-plant:${SCOPE}:`;
// Bump to replace cached icons and images, which are served cache-first
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const DICT_CACHE = `${CACHE_PREFIX}dict-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}dynamic-${CACHE_VERSION}`;
// Caches of the first version, which both pages shared
const LEGACY_CACHE = /^word-plant-(static|dict|dynamic)-v1$/;

const STATIC_ASSETS = [
  SCOPE,
  `${SCOPE}index.html`,
  `${SCOPE}manifest.json`,
  `${APP}favicon.ico`,
  `${APP}logo192.png`,
  `${APP}logo512.png`,
  `${APP}logo192-maskable.png`,
  `${APP}logo512-maskable.png`,
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
          .filter((name) => LEGACY_CACHE.test(name) ||
            (name.startsWith(CACHE_PREFIX) && !validCaches.includes(name)))
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
  if (url.hostname === 'api.datamuse.com') {
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
    url.pathname.startsWith(`${APP}assets/`)
  ) {
    // Pages are cached without their query, so every archive day
    // (?day=YYYY-MM-DD) shares one copy of the page and opens offline
    const key = request.destination === 'document' ? `${url.origin}${url.pathname}` : request;
    event.respondWith(staleWhileRevalidate(request, key));
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
async function staleWhileRevalidate(request, key = request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(key);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.ok) {
      cache.put(key, networkResponse.clone());
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