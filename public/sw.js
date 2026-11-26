importScripts("/_next/static/clinic-precache-manifest.js");

const BUILD_ID = self.__CLINIC_BUILD_ID__;
const CACHE_NAME = `clinic-offline-${BUILD_ID}`;
const ROUTES = [
  "/",
  "/login",
  "/register",
  "/billing",
  "/settings",
  "/admin",
  "/doctors",
  "/users",
];
const PUBLIC_ASSETS = [
  "/offline.html",
  "/icon.svg",
  "/manifest.webmanifest",
];
const PRECACHE_ASSETS = self.__CLINIC_PRECACHE_ASSETS__ || [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(
        [...PRECACHE_ASSETS, ...PUBLIC_ASSETS].map((asset) =>
          new URL(asset, self.location.origin).href,
        ),
      );

      for (const route of ROUTES) {
        const response = await fetch(route, { cache: "reload" });
        if (!response.ok) {
          throw new Error(`Unable to precache route ${route}.`);
        }
        await cache.put(new URL(route, self.location.origin), response);
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith("clinic-offline-") &&
              cacheName !== CACHE_NAME,
          )
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(`${url.origin}${url.pathname}`, response.clone());
          }
          return response;
        } catch {
          const cachedPage = await caches.match(
            `${url.origin}${url.pathname}`,
          );
          return (
            cachedPage ??
            (await caches.match(
              new URL("/offline.html", self.location.origin).href,
            ))
          );
        }
      })(),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|gif|ico|jpe?g|js|png|svg|ttf|webp|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedAsset = await cache.match(request, { ignoreSearch: true });
        if (cachedAsset) return cachedAsset;

        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
