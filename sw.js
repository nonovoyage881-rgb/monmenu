/* ════════════════════════════════════════════════════════════════
   sw.js — Service worker de MonMenu (PWA hors ligne)
   Stratégies :
   • App-shell (HTML/CSS/JS/icônes) → cache-first (pré-mis en cache)
   • Recettes TheMealDB              → network-first + repli cache
   • Polices Google                  → stale-while-revalidate
   Les chemins sont RELATIFS pour fonctionner sous un sous-dossier
   GitHub Pages (ex : https://user.github.io/monmenu/).
   ════════════════════════════════════════════════════════════════ */

const VERSION = 'monmenu-v7';
const SHELL_CACHE = `${VERSION}-shell`;
const API_CACHE = `${VERSION}-api`;
const FONT_CACHE = `${VERSION}-fonts`;

/* Fichiers du shell (relatifs à la portée du SW) */
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/views.js',
  './js/ui.js',
  './js/store.js',
  './js/api.js',
  './js/db.js',
  './js/config.js',
  './js/utils.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/* Installation : pré-cache du shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {/* certains assets peuvent manquer en dev */})
  );
});

/* Activation : nettoyage des anciens caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

/* Interception des requêtes */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Recettes TheMealDB → network-first
  if (url.hostname.includes('themealdb.com')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Polices Google → stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // On ne met pas en cache les appels IA (privés) ni les autres origines tierces
  if (url.origin !== self.location.origin) return;

  // Navigation → renvoie index.html depuis le cache si hors ligne (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Shell same-origin → cache-first
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

/* ───────── Stratégies ───────── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res && res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}
