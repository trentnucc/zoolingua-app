/* Zoolingua service worker: offline shell + cached model and runtime.
   Shell files are network-first (so updates land), the big binaries are cache-first. */
const VERSION = 'zl-v8';
const SHELL = ['./', 'index.html', 'styles.css?v=8', 'app.js?v=8', 'manifest.json', 'img/logo.png', 'img/hero-dog.jpg', 'img/how-it-works.jpg', 'img/sample-clip.mp4', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'];
const HEAVY = ['ort/ort.min.js', 'ort/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.mjs', 'model/zoolingua-sd10.onnx'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).then(() => c.addAll(HEAVY).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc. go straight to the network
  const heavy = HEAVY.some((h) => url.pathname.endsWith(h.replace('./', '')));
  if (heavy) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { keep(req, res); return res; })));
    return;
  }
  // Network first, but never wait on a captive portal: after 2.5s a cached copy wins (the network reply still refreshes the cache).
  // Only page navigations fall back to the app shell; a missing image or script must fail as itself.
  const fromNet = fetch(req).then((res) => { keep(req, res); return res; });
  const fromCache = () => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : null));
  e.respondWith(new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { fromCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } }); }, 2500);
    fromNet.then((res) => { clearTimeout(timer); if (!settled) { settled = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); if (settled) return; fromCache().then((hit) => { settled = true; resolve(hit || Response.error()); }); });
  }));
});
// Clone before the page starts reading the body, and cache only complete 200s (a 206 range reply cannot be stored).
function keep(req, res) {
  if (res.status !== 200 || res.type === 'opaque') return;
  const copy = res.clone();
  caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
}

