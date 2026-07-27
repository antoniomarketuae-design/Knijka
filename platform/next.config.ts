import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Security headers (audit 2026-07-24, M-22 — this file was the untouched
 * 5-line scaffold, so the app shipped none of these at all).
 *
 * CSP IS SPLIT IN TWO, ON PURPOSE.
 *
 * The enforced policy contains only directives that CANNOT break a working
 * page: they forbid things this app never does. `frame-ancestors 'none'` is
 * the one the audit actually calls out — /checkout mounts Stripe Embedded
 * Checkout and was itself framable by any origin, which is a clickjacking
 * setup on the one screen where a teenager types a card number.
 *
 * The full script/style/connect policy ships as Report-Only. Enforcing it
 * blind would be the exact mistake doc 66's R0 rule exists to prevent — look
 * before you ship. Next.js needs either `'unsafe-inline'` or a per-request
 * nonce for its bootstrap scripts and for Tailwind's injected styles, and a
 * nonce forces every page dynamic (it must be generated per request), which
 * on a 3D product whose landing page is the funnel is a real cost. So: run
 * Report-Only, read the console violations on a real session that covers
 * /checkout AND the simulator, then move the value from
 * `contentSecurityPolicyReportOnly` to `contentSecurityPolicy` below.
 */
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Only in production: on a plain-http dev server this would upgrade
  // localhost sub-resources to https and break them.
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  // 'unsafe-inline': Next's bootstrap + flight payload are inline scripts.
  // 'wasm-unsafe-eval': Rapier's physics wasm (ADR-005) is compiled at runtime.
  // 'unsafe-eval' in dev only — React uses eval to rebuild server stacks.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProd ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  // blob: is the KTX2/Draco transcoder output and the canvas snapshots the
  // review tools take; https://*.stripe.com is Stripe's telemetry pixel.
  "img-src 'self' data: blob: https://*.stripe.com",
  // next/font/google self-hosts at build time, so no Google origin is needed.
  "font-src 'self' data:",
  `connect-src 'self' blob: data: https://api.stripe.com https://m.stripe.network https://r.stripe.com${isProd ? "" : " ws: http://localhost:*"}`,
  // three.js loaders instantiate their decoders from blob: worker URLs.
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  // The mistake reels are same-origin .webm; Stripe's embedded checkout and
  // 3DS challenge run in these frames.
  "media-src 'self' blob:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://m.stripe.network",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Belt to CSP's braces: still honoured by browsers that ignore
  // frame-ancestors, and free.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin cross-site, the full URL same-site. Exam and review URLs
  // carry attempt ids; those must not travel to Stripe in a Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // ADR-004, users are MINORS and we take no biometrics: camera and
  // microphone are denied outright rather than left to a future accident.
  // `payment` is delegated to Stripe's frames so Apple/Google Pay still work
  // inside embedded checkout — denying it there would silently kill the
  // wallet buttons.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "usb=()",
      "magnetometer=()",
      "accelerometer=()",
      'payment=(self "https://checkout.stripe.com" "https://js.stripe.com")',
    ].join(", "),
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicyReportOnly,
  },
  // HSTS in production only. On http it is ignored anyway, but shipping it in
  // dev is how someone ends up with localhost pinned to https in their browser
  // for two years.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

/**
 * Cache-Control for `public/` (audit 2026-07-24, finding M-27).
 *
 * Next fingerprints and immutably caches `/_next/static/*`, but everything it
 * serves out of `public/` got the framework default — `public, max-age=0`.
 * Measured on the production build: a repeat fetch of a poster returned
 * `transferSize 300, decodedBodySize 1,122,231` — a conditional round trip per
 * asset, per page load. The simulator touches 60+ files before the first
 * frame, so that is 60+ revalidations on a phone before anything renders.
 * `max-age=0` also tells the Cloudflare edge to store nothing, so every clip
 * byte is served by the single VPS.
 *
 * `immutable` is NOT usable here: these files are not content-hashed, and the
 * founder re-renders a reel under the SAME filename (`sc-…__m1.webm`), so a
 * year-long immutable cache would pin the old cut in every browser that ever
 * saw it. The shape used instead is a real TTL plus a much longer
 * `stale-while-revalidate`: browser and edge serve instantly for the TTL, then
 * keep serving the stale copy while refreshing it in the background. A
 * re-render propagates on its own within one TTL, with no purge, and nobody
 * ever waits on a revalidation.
 *
 * TTLs are graded by how often the bytes actually change:
 *   - textures / world JSON / GLB kits / decoder wasm: only when a build ships
 *     them, and deploys are rare → 7 days.
 *   - clips and stills: re-rendered during founder review → 1 day.
 *   - `manifest.json`: the INDEX that names all of the above. A stale index
 *     beside fresh files is the one combination that actually breaks (it can
 *     name a file that is not there yet), so it revalidates in minutes. They
 *     are 1–2 KB; the round trip costs nothing.
 * The manifest rule is deliberately LAST — Next applies matching rules in
 * order and the last one to set a given key wins.
 */
const DAY = 60 * 60 * 24;
/** Assets that change only when a build ships them. */
const CACHE_DEPLOY_SCOPED = `public, max-age=${7 * DAY}, stale-while-revalidate=${30 * DAY}`;
/** Media the founder re-renders in place during review. */
const CACHE_MEDIA = `public, max-age=${DAY}, stale-while-revalidate=${7 * DAY}`;
/** The indexes that name the files above — must never outlive them. */
const CACHE_MANIFEST = "public, max-age=300, stale-while-revalidate=3600";

/**
 * Build/serve directory — overridable, default unchanged.
 *
 * WHY (2026-07-27, clip-rig I/O investigation): Turbopack keeps a persistent
 * dev cache under `<distDir>/dev/cache/turbopack`. On this box `.next` lives on
 * E:, a 7200 rpm MECHANICAL disk (random 4 KB read ≈ 79 ms vs 0.33 ms on C:),
 * and that cache had grown to 12.4 GB / 19,447 files unpruned since 2026-07-10.
 * The result was not a compiler problem — the dev server sat at ~0% CPU with a
 * request pending, blocked on seeks — but /dev/clip-headless still never
 * finished compiling, so mistake reels were being shipped unverified.
 *
 * The clip rig (tools/clips/headless/clip-rig.mjs) therefore runs its OWN
 * server against its OWN distDir, so the render path can never inherit — or
 * poison — the cache the shared :3000 dev server is using, and the rig can
 * prune its cache on a schedule it controls.
 *
 * Unset (every normal `npm run dev` / `npm run build` / the VPS deploy) this is
 * exactly `.next`, i.e. no behaviour change at all.
 */
const distDir = process.env.KNIJKA_DIST_DIR || ".next";

const nextConfig: NextConfig = {
  distDir,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Simulator + app assets: KTX2/HDR textures, GLB kits, district JSON,
        // the basis/draco decoder wasm, traces, icons.
        source: "/:dir(sim|world|models|basis|draco|icons|traces)/:path*",
        headers: [{ key: "Cache-Control", value: CACHE_DEPLOY_SCOPED }],
      },
      { source: "/og.png", headers: [{ key: "Cache-Control", value: CACHE_DEPLOY_SCOPED }] },
      {
        // Mistake reels + their WebP posters, and the dev scene stills.
        source: "/:dir(clips|scene-stills)/:path*",
        headers: [{ key: "Cache-Control", value: CACHE_MEDIA }],
      },
      {
        // Every manifest, at any depth (/clips/manifest.json,
        // /sim/textures/manifest.json, /sim/city-v3/textures/manifest.json).
        source: "/:path*/manifest.json",
        headers: [{ key: "Cache-Control", value: CACHE_MANIFEST }],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // Audit 2026-07-24 H-11 fix 1 — delivery weight on a phone.
      //
      // @react-three/rapier hard-imports @dimforge/rapier3d-compat, whose whole
      // reason to exist is inlining the 1.53 MB physics wasm as base64 inside
      // the JS. That produced a 2,236,377 B chunk containing one contiguous
      // 2,092,530-character string, all of it on the critical path to the first
      // simulator frame. The plain @dimforge/rapier3d build is the same engine
      // shipped as a real .wasm asset the browser stream-compiles.
      //
      // `browser` condition ONLY: the vehicle harness tests run the same rapier
      // world in Node with no bundler and no .wasm loader, and they import
      // -compat directly. See src/modules/sim/vehicle/rapierBrowser.ts for the
      // one API difference the shim papers over (`init()`).
      "@dimforge/rapier3d-compat": {
        browser: "./src/modules/sim/vehicle/rapierBrowser.ts",
      },
    },
  },
};

export default nextConfig;
