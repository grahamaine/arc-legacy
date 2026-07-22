// Minimal service worker so the app is installable (home screen / desktop) and
// works offline. Bump CACHE to invalidate old caches on deploy.
const CACHE = "arc-legacy-v5";
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

  // Stale-while-revalidate: serve the cached copy fast, but refresh it in the
  // background so changed assets (e.g. a new logo) self-heal on the next load.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (
              res &&
              res.status === 200 &&
              new URL(request.url).origin === self.location.origin
            ) {
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
