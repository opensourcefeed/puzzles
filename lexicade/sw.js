// Lexicade's service worker, so the game works offline once loaded. The
// build (lexicade-offline in vite.config.js) fills in the file list and the
// version, and writes it to build/sw.js.
//
// - Install: cache every page, script, style, font, icon and the dictionary.
// - Pages and data (dictionary, manifest): network first, so updates arrive
//   at once; the cached copy is the fallback when offline.
// - Hashed assets (scripts, styles) and fonts: cache first, since their
//   names change whenever their content does.

const CACHE = 'lexicade-d3814f3b618a';
const PRECACHE = [
  "/puzzles/lexicade/",
  "/puzzles/lexicade/journey/",
  "/puzzles/lexicade/how-to-play/",
  "/puzzles/lexicade/assets/index-BNW_kE5x.js",
  "/puzzles/lexicade/assets/tutorial-zHTCuyqu.js",
  "/puzzles/lexicade/assets/index-BX9w1fUo.css",
  "/puzzles/lexicade/assets/par.worker-BpAo-_sJ.js",
  "/puzzles/lexicade/apple-touch-icon.png",
  "/puzzles/lexicade/dict/blocked.txt",
  "/puzzles/lexicade/dict/common.tsv",
  "/puzzles/lexicade/dict/words.txt",
  "/puzzles/lexicade/favicon.ico",
  "/puzzles/lexicade/favicon.svg",
  "/puzzles/lexicade/fonts/nunito-latin-wght.woff2",
  "/puzzles/lexicade/logo192.png",
  "/puzzles/lexicade/manifest.json"
];
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('lexicade-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Pages with a query (?level=5) fall back to the page itself
    const cached = await cache.match(request, {ignoreSearch: request.mode === 'navigate'});
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const fresh = request.mode === 'navigate' || /\.(html|txt|tsv|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  event.respondWith(fresh ? networkFirst(request) : cacheFirst(request));
});
