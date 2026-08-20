const CACHE_NAME = "bee-suite-app-shell-v3";
const APP_SHELL_URLS = [
  "/app",
  "/brand/the-bee-suite/app-icon-yellow.png",
  "/brand/the-bee-suite/browser-icon.png",
  "/brand/the-bee-suite/logo-primary-horizontal-white.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS)),
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
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          if (url.pathname === "/app" || url.pathname === "/app/") {
            const appShell = await caches.match("/app");
            if (appShell) return appShell;
          }

          return new Response("The BEE Suite is offline. Reconnect and reload this page.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }
      })(),
    );
    return;
  }

  const cacheableStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest";

  if (!cacheableStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    })(),
  );
});

function safeNotificationPayload(event) {
  const fallback = {
    title: "The BEE Suite",
    body: "A new update is ready in The BEE Suite.",
    url: "/notifications",
    tag: "bee-suite-update",
    badgeCount: 1,
    icon: "/brand/the-bee-suite/app-icon-yellow.png",
    badge: "/brand/the-bee-suite/browser-icon.png",
  };

  if (!event.data) return fallback;
  try {
    const payload = event.data.json();
    return payload && typeof payload === "object" ? { ...fallback, ...payload } : fallback;
  } catch {
    return fallback;
  }
}

function safeNotificationUrl(value) {
  if (typeof value !== "string") return "/notifications";
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/notifications";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/notifications";
  }
}

self.addEventListener("push", (event) => {
  const payload = safeNotificationPayload(event);
  const badgeCount = Number(payload.badgeCount);
  const tasks = [
    self.registration.showNotification(
      typeof payload.title === "string" && payload.title ? payload.title : "The BEE Suite",
      {
        body: typeof payload.body === "string" ? payload.body : "A new update is ready in The BEE Suite.",
        icon: typeof payload.icon === "string" ? payload.icon : "/brand/the-bee-suite/app-icon-yellow.png",
        badge: typeof payload.badge === "string" ? payload.badge : "/brand/the-bee-suite/browser-icon.png",
        tag: typeof payload.tag === "string" ? payload.tag : "bee-suite-update",
        data: {
          url: safeNotificationUrl(payload.url),
          notificationId: typeof payload.notificationId === "string" ? payload.notificationId : null,
        },
        renotify: true,
      },
    ),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) client.postMessage({ type: "bee-suite-notification" });
    }),
  ];

  if (Number.isFinite(badgeCount) && badgeCount >= 0 && "setAppBadge" in self.navigator) {
    tasks.push(self.navigator.setAppBadge(Math.floor(badgeCount)));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = safeNotificationUrl(event.notification.data?.url);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
