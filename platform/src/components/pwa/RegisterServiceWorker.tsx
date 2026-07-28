"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js. Renders nothing.
 *
 * Mounted once from the root layout so the worker is installed no matter which
 * surface the student landed on — the offline page is worth having on the
 * theory reader as much as on the dashboard, and a worker registered from a
 * page they may never visit is a worker that never installs.
 *
 * `updateViaCache: "none"` is the flag that keeps a deploy reachable: without
 * it the browser may answer its own update check for sw.js out of the HTTP
 * cache, and a worker can then outlive the build it shipped with. With it, the
 * script is re-fetched from the network on every update check.
 *
 * Errors are swallowed on purpose. Registration fails on http:// origins other
 * than localhost, in some private-browsing modes, and behind enterprise
 * policies. None of those are conditions the student can act on, and none of
 * them stop the app working — the only thing lost is the offline page. An
 * unhandled rejection in the console on every page load would be worse.
 *
 * NOT gated to production. The worker is deliberately harmless in development
 * (it caches nothing but one static file and never touches /_next/), and a
 * registration that only exists in production is one that gets verified for
 * the first time in production.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // After load: registering during hydration competes with the page's own
    // requests for the same connection, on the phones that can least afford it.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* see the note above — nothing the student can act on */
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
