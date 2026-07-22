// Minimal service worker so the app is installable (home screen / desktop) and
// works offline. Bump CACHE to invalidate old caches on deploy.
const CACHE = "arc-legacy-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/logo.png",
  "/favicon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Network-first for page navigations so the app stays fresh; fall back to the
  // cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for other GETs (hashed assets are immutable).
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
