// Outsiderr service worker — app-like caching with stale-while-revalidate
const CACHE_VERSION = "outsiderr-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Precache the app shell
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/lightmode.png",
];

// Max items in image cache (LRU eviction)
const IMAGE_CACHE_MAX = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
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

  // --- Navigations: network-first, fall back to cache, then to "/" ---
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match("/");
          return fallback || Response.error();
        }),
    );
    return;
  }

  // --- Same-origin static assets: stale-while-revalidate ---
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

  // --- Images (same-origin or Supabase Storage): cache-first with background update ---
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

  // --- Other same-origin GET: stale-while-revalidate ---
  if (sameOrigin) {
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
