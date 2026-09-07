// Outsiderr service worker — accuracy-first caching
// Only caches static assets (_next/static) and images.
// All pages, RSC payloads, and dynamic data ALWAYS fetch from network.
// Cache is only used as a fallback when the network fails (offline mode).
const CACHE_VERSION = "outsiderr-v4";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Max items in image cache (LRU eviction)
const IMAGE_CACHE_MAX = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Helper: limit cache size (LRU)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // --- Static assets (_next/static): stale-while-revalidate ---
  // These are hashed files that never change content — safe to cache.
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // --- Images: cache-first with background revalidation ---
  // Images are large and don't change often. Cache-first for speed,
  // but always revalidate in the background.
  const isImage =
    request.destination === "image" ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|avif)$/i.test(url.pathname);

  if (isImage) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(IMAGE_CACHE)
                .then((cache) => cache.put(request, copy))
                .then(() => trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // --- EVERYTHING ELSE: network-first, cache only for offline fallback ---
  // This covers:
  //   - HTML page navigations (request.mode === "navigate")
  //   - RSC payloads (request.headers["RSC"] === "1")
  //   - Any other same-origin GET request
  // All dynamic data must come from the database — never from cache.
  if (sameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache dynamic responses — just return them fresh
          return response;
        })
        .catch(async () => {
          // Network failed — try cache as last resort (offline mode)
          const cached = await caches.match(request);
          if (cached) return cached;
          // For navigations, fall back to a basic page
          if (request.mode === "navigate") {
            return new Response(
              "<html><body><h2>You are offline</h2><p>Please check your internet connection.</p></body></html>",
              { headers: { "Content-Type": "text/html" } },
            );
          }
          return Response.error();
        }),
    );
    return;
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "Outsiderr";
  const body = data.body ?? "Something new is happening near you.";
  const icon = "/lightmode.png";
  const badge = "/lightmode.png";
  const url = data.url ?? "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});

// Allow page to trigger immediate SW activation
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
