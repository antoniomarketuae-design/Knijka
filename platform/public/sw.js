/*
 * Книжка.AI — service worker.
 *
 * ONE JOB: when a student on Bulgarian mobile data loses signal mid-lesson,
 * show an honest page in our own voice instead of the browser's dinosaur.
 * That is all. Everything else a service worker CAN do has been left out on
 * purpose, and the omissions are the design:
 *
 *   NO HTML CACHING. Navigations are network-only with a fallback. A service
 *   worker that caches pages is how an app ships a bug and then serves it
 *   forever, because the student's phone answers every navigation from a cache
 *   that never asks the server again. Here, if the network is up the student
 *   always gets the deploy that is live right now.
 *
 *   NO CACHING OF /_next/ CHUNKS. Same reason, worse failure mode: a cached
 *   HTML/JS pair from two different builds is a white screen with a chunk-load
 *   error, and the student cannot fix it by reloading. Next.js already
 *   fingerprints and immutably caches those through ordinary HTTP.
 *
 *   NO PUSH, NO SYNC, NO ANALYTICS, NO IDENTIFIERS. Users are MINORS
 *   (ADR-004). This file caches ONE static asset and knows nothing about who
 *   is asking. There is no `push` handler here, and there must never be one
 *   added without a DPIA.
 *
 *   NO API RESPONSES. Exam attempts, progress and tutor threads are personal
 *   data and are never written to a cache on the device.
 *
 * DEPLOYS REACH USERS. Three mechanisms, all needed:
 *   1. VERSION below is part of every cache name, so a new worker never reads
 *      the old worker's cache.
 *   2. `skipWaiting()` + `clients.claim()` — the new worker takes over
 *      immediately instead of waiting for every tab to close. This is only
 *      safe BECAUSE nothing above is cached: there is no old app shell for the
 *      new worker to be inconsistent with.
 *   3. `activate` deletes every cache that is not on the current keep-list, so
 *      a superseded offline page cannot linger.
 * The registration also passes `updateViaCache: "none"`, so the browser
 * re-fetches THIS file from the network on every update check rather than
 * reading it from the HTTP cache.
 *
 * BUMP `VERSION` WHENEVER offline.html CHANGES. Nothing else in the product
 * depends on it.
 */

const VERSION = "2026-07-28.1";
const SHELL_CACHE = `knijka-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/**
 * The precache list, in full. It is one file, and that file is deliberately
 * self-contained — inline CSS, inline SVG, no fonts, no scripts — so the
 * offline page cannot fail on a sub-resource that was never cached.
 */
const PRECACHE = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `cache: "reload"` bypasses the HTTP cache: precaching a stale copy of
      // the offline page from the browser's own cache would defeat the point
      // of versioning it.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("knijka-") && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Anything that is not a page load is left entirely alone — no interception,
  // no cache, not even a pass-through wrapper. An untouched request is one the
  // browser handles exactly as it would with no service worker installed.
  if (request.method !== "GET") return;
  if (request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Stripe's return leg and any other API-shaped navigation must fail loudly
  // rather than land on a page that says „няма връзка" when the real problem
  // is a 500.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        // The network is genuinely unreachable (a thrown fetch, not a 4xx/5xx —
        // an error response resolves and is returned above, because a server
        // error is not an offline state and pretending otherwise hides bugs).
        const cache = await caches.open(SHELL_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response("Няма връзка с интернет.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
