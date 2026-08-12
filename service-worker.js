const CACHE = "avimap-v1.2.1";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./src/app.js",
  "./src/map.js",
  "./src/data.js",
  "./src/data-loader.js",
  "./src/geo.js",
  "./src/connector.js",
  "./icons/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Network-first for live aviation data. The app can still boot from cache
  // for its own static files.
  if (
    url.hostname.includes("ourairports") ||
    url.hostname.includes("storage.googleapis.com")
  ) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
