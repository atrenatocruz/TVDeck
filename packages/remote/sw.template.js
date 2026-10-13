/* TVDeck Remote service worker. vite.config.ts fills in the version and precache list at build time.
 * Scope is /remote/. It only caches the app shell; /ws, /healthz, /icons and anything cross-origin are never touched. */
const VERSION = "__VERSION__";
const CACHE = "tvdeck-remote-" + VERSION;
const PRECACHE = __PRECACHE__;
const SHELL = "/remote/";
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tvdeck-remote-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request, fallbackKey) {
  return new Promise((resolve) => {
    let settled = false;
    const useCache = () => caches.match(fallbackKey, { cacheName: CACHE }).then((hit) => hit || caches.match(SHELL, { cacheName: CACHE }));
    const timer = setTimeout(() => {
      useCache().then((hit) => {
        if (hit && !settled) {
          settled = true;
          resolve(hit);
        }
      });
    }, NETWORK_TIMEOUT_MS);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(fallbackKey, copy));
        }
        if (!settled) {
          settled = true;
          resolve(res);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        if (settled) return;
        useCache().then((hit) => {
          settled = true;
          resolve(hit || Response.error());
        });
      });
  });
}

function cacheFirst(request) {
  return caches.match(request, { cacheName: CACHE }).then(
    (hit) =>
      hit ||
      fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/remote/") || url.pathname === "/remote/sw.js") return;

  if (req.mode === "navigate" || url.pathname === "/remote/index.html") {
    event.respondWith(networkFirst(req, SHELL));
  } else if (url.pathname === "/remote/manifest.webmanifest") {
    event.respondWith(networkFirst(req, req.url));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
