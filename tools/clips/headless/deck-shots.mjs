/**
 * deck-shots.mjs — capture the AUTHENTICATED surfaces so the deck backdrop can
 * be judged by eye (doc 66 R0: look before you ship).
 *
 * Shoots the dashboard, the theory hub and the reading-heavy practice runner at
 * a desktop and a phone profile, plus (with --bare) the backdrop PLANE on its
 * own, which is the only way to see a layer that is deliberately behind opaque
 * panels.
 *
 * AUTH. The (dashboard) group sits behind proxy.ts, which reads ONE thing: the
 * authjs session cookie. So this does not drive the login form — the local
 * Prisma dev proxy resets its first connection after an idle spell, which makes
 * the credentials POST the flakiest step in a capture that otherwise cannot
 * fail. Mint the cookie from `platform/` (where next-auth and dotenv resolve)
 * and pass it in:
 *
 *   cd platform && node -e "require('dotenv/config');
 *     import('next-auth/jwt').then(async ({encode}) => console.log(await encode({
 *       token:{sub:'<userId>'}, secret:process.env.AUTH_SECRET,
 *       salt:'authjs.session-token', maxAge:86400 })))"
 *
 * Usage:
 *   DECK_COOKIE=<jwt> node deck-shots.mjs <outDir> [--webkit] [--bare]
 *                                         [--base http://localhost:3540]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith("--")) ?? "./deck-shots";
const useWebkit = args.includes("--webkit");
/** Hide every opaque panel, so the backdrop plane can be judged on its own. */
const bare = args.includes("--bare");
/**
 * Exposure-boost the backdrop for INSPECTION only.
 *
 * The deck is built to a hard luminance ceiling, so on a screenshot most of it
 * sits between 0.002 and 0.008 relative luminance — correct, and very hard to
 * check by eye in a review. `--boost` puts a `brightness()` filter on the deck
 * element so the drawing can be verified (is the crest right? does the road
 * converge? are the graduations spaced by angle?). It is a darkroom print, not
 * the product: never judge the DESIGN from a boosted frame.
 */
const boostIdx = args.indexOf("--boost");
const boost = boostIdx >= 0 ? Number(args[boostIdx + 1] ?? 6) : 0;
/**
 * The BEFORE frame: `.deck` removed, leaving the plane the founder is looking
 * at today.
 *
 * This is a faithful reproduction rather than a re-checkout, and it is exact:
 * the layer that shipped here (`.haze` at `fixed … -z-10`) was painted BEHIND
 * the wrapper's own opaque `bg-background` and was never visible on an
 * authenticated page — captured at both profiles, the plane was flat #05070c
 * edge to edge. Hiding the deck reproduces precisely that.
 */
const noDeck = args.includes("--nodeck");
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : process.env.UI_BASE ?? "http://localhost:3540";

const COOKIE = process.env.DECK_COOKIE;
if (!COOKIE) throw new Error("DECK_COOKIE is required — see the header for how to mint one");

const PAGES = [
  { name: "dashboard", url: "/dashboard" },
  { name: "theory", url: "/theory" },
  { name: "practice", url: "/theory/practice" },
];

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

const engine = useWebkit ? (await import("playwright")).webkit : chromium;
const browser = await engine.launch({ headless: true });
const host = new URL(BASE).hostname;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: "dark",
    isMobile: !useWebkit && vp.tag === "mobile",
    hasTouch: vp.tag === "mobile",
    deviceScaleFactor: vp.tag === "mobile" ? 2 : 1,
  });
  await ctx.addCookies([
    {
      name: "authjs.session-token",
      value: COOKIE,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  // The dev overlay is not part of the product; it must never be in a frame
  // the founder is asked to judge.
  await ctx.addInitScript(`(() => {
    const apply = () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal { display: none !important; }${
        noDeck ? " .deck { display: none !important; }" : ""
      }";
      document.head.appendChild(s);
    };
    if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
  })()`);
  if (boost > 0) {
    await ctx.addInitScript(`(() => {
      const css = ".deck { filter: brightness(${boost}) saturate(1.5) !important; }";
      const apply = () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    })()`);
  }
  if (bare) {
    // Everything the deck is behind, made invisible. `visibility` rather than
    // `display` so the layout — and therefore the deck's own sizing — is
    // untouched: this must be the same plane the real page renders, just
    // unobstructed.
    await ctx.addInitScript(() => {
      const css = `header, aside, nav, main, [data-nextjs-toast], nextjs-portal { visibility: hidden !important; }`;
      const apply = () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    });
  }
  const page = await ctx.newPage();

  for (const p of PAGES) {
    try {
      // `domcontentloaded`, not `networkidle`: the dev server holds an HMR
      // websocket open forever, so the network is never idle.
      //
      // Retried on the error boundary, because the local Prisma dev proxy drops
      // connections at random ("DriverAdapterError: ConnectionClosed") and the
      // dashboard makes the most queries of any route, so it is the one that
      // loses the coin flip. That failure has nothing to do with what is being
      // captured, but it would silently put an error card in a review frame.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 300000 });
        await page.waitForTimeout(4000);
        const broke = await page
          .locator("text=Нещо се обърка")
          .count()
          .catch(() => 0);
        if (!broke) break;
        console.log(`  ${p.name}/${vp.tag}: DB dropped the connection, retrying`);
      }
      const suffix = `${useWebkit ? "_webkit" : ""}${bare ? "_bare" : ""}${
        noDeck ? "_before" : ""
      }${boost > 0 ? `_boost${boost}` : ""}`;
      const file = join(OUT, `${p.name}_${vp.tag}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log(`ok ${p.name}/${vp.tag} -> ${file}`);
    } catch (e) {
      console.log(`FAIL ${p.name}/${vp.tag}: ${String(e.message).slice(0, 200)}`);
    }
  }
  await ctx.close();
}

await browser.close();
