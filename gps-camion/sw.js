// GPS Camion : service worker
// - coque de l'appli (page, icônes, Leaflet) en cache : l'appli s'ouvre même sans réseau
// - page : réseau d'abord (toujours la dernière version), cache si pas de réseau
// - tuiles de carte : réseau d'abord, cache de secours (tunnels, zones sans signal)
// - itinéraires et recherche d'adresses : jamais en cache (toujours le réseau)
const VERSION = '2026-11-19.2';
const SHELL = 'gpscamion-shell-' + VERSION;
const TILES = 'gpscamion-tiles';
const MAX_TILES = 3000;          // ≈ 60–90 Mo de carte au maximum
const SHELL_FILES = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('gpscamion-shell-') && n !== SHELL).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // calcul d'itinéraire (POST) : réseau seul
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') return event.respondWith(tile(req));
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
      return event.respondWith(page(req, url));
    }
    return event.respondWith(cacheFirst(req));
  }
  if (url.hostname === 'cdnjs.cloudflare.com') return event.respondWith(cacheFirst(req));
  // autres services (recherche d'adresses, analyse d'itinéraire) : réseau seul
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

// Page de l'appli : réseau d'abord (4 s), sinon la dernière version en cache
async function page(req, url) {
  const cache = await caches.open(SHELL);
  const key = new Request(url.origin + url.pathname);     // sans ?demo=1 etc.
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  try {
    return await withTimeout(net, 4000);
  } catch {
    const hit = (await cache.match(key)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./'));
    return hit || net.catch(() => new Response('<h1>GPS Camion</h1><p>Pas de réseau. Réessayez quand le signal revient.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
  return res;
}

// Tuiles : réseau d'abord (3,5 s), cache de secours ; la tuile reçue est toujours mise en cache
let puts = 0;
async function tile(req) {
  const cache = await caches.open(TILES);
  const net = fetch(req).then(res => {
    if (res.ok) { cache.put(req, res.clone()); if (++puts % 100 === 0) trim(cache); }
    return res;
  });
  try {
    return await withTimeout(net, 3500);
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return net.catch(() => Response.error());
  }
}

async function trim(cache) {
  const keys = await cache.keys();                         // du plus ancien au plus récent
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
