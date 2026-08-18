/*
 * Isoperia PWA service worker.
 *
 * Goal: after one successful load, the game launches from the home screen with
 * no network — and relaunches instantly rather than re-downloading tens of MB.
 *
 * Strategy is deliberately split:
 *
 *   - The app shell (index.html, manifest, icons) is precached on install. It is
 *     a few kB, so a blocking install is cheap and guarantees the game can boot
 *     offline at all.
 *
 *   - The Unity build (Build/*, StreamingAssets/*) is cached lazily, on first
 *     successful fetch. Precaching it would mean a multi-megabyte install step
 *     that can time out or fail on mobile data, and would download the payload
 *     twice on the very first visit.
 *
 * Cache busting is by CACHE_VERSION, which is stamped from the Unity product
 * version at build time. If you ship a new build and clients keep the old one,
 * that number did not change — bump Player Settings → Version.
 */

const CACHE_VERSION = "isoperia-v{{{ PRODUCT_VERSION }}}";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const BUILD_CACHE = `${CACHE_VERSION}-build`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // addAll() is atomic: one 404 rejects the whole install and leaves the
      // old worker in place. The shell list includes optional files, so add
      // them individually and tolerate misses.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {
            console.warn("[sw] shell asset unavailable, skipping:", url);
          })
        )
      );
      // Take over without waiting for every tab to close. Safe here because the
      // caches are versioned — an old tab keeps talking to the old cache until
      // it reloads.
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(CACHE_VERSION))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** Build payload and streamed assets — big, immutable for a given version. */
function isBuildAsset(url) {
  return url.pathname.includes("/Build/") ||
         url.pathname.includes("/StreamingAssets/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GET is cacheable, and only our own origin. Anything else falls through
  // to the network untouched.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Range requests (audio/video seeking) must not be served from the Cache API —
  // a cached 200 handed back for a Range request breaks the media element.
  if (req.headers.has("range")) return;

  if (isBuildAsset(url)) {
    // Cache-first. These files never change within a version, so a hit is
    // always correct and saves the entire download on relaunch.
    event.respondWith(
      caches.open(BUILD_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;

        const res = await fetch(req);
        // Only store complete, same-origin successes. Caching an opaque or
        // partial response would poison the cache with something we can't
        // validate and can't serve correctly later.
        if (res && res.status === 200 && res.type === "basic") {
          cache.put(req, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // Shell: network-first so a redeployed index.html is picked up promptly,
  // falling back to cache when offline.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const hit = await caches.match(req);
        if (hit) return hit;
        // A navigation with no cache entry still needs to render something
        // rather than the browser's offline error page.
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});

/** Lets the page trigger an immediate update rather than waiting for a reload. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
