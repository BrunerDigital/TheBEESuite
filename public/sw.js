const CACHE_NAME = "bee-suite-app-shell-v1";
const APP_SHELL_URLS = [
  "/app",
  "/brand/the-bee-suite/app-icon-yellow.png",
  "/brand/the-bee-suite/favicon.png",
  "/brand/the-bee-suite/logo-primary-horizontal-white.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/app")));
    return;
  }

  const cacheableStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest";

  if (!cacheableStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      return cached || fetched;
    }),
  );
});
