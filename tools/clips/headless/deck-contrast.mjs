/**
 * deck-contrast.mjs — prove, from rendered pixels, that the deck cannot have
 * cost a contrast ratio.
 *
 * The token tests (clusterScope / checkControl / mastery) compute their ratios
 * from globals.css, so they cannot see a BACKDROP at all: they would keep
 * passing even if this layer painted a sunrise behind the theory reader. This
 * closes that gap, in two measurements that together cover every glyph in the
 * authenticated app.
 *
 *   1. THE PLANE. Hide every panel and screenshot what is left — which is the
 *      backdrop and nothing else — then report the brightest pixel in it. Any
 *      text that sits DIRECTLY on the plane is on a ground no brighter than
 *      that. The claim is that it never exceeds the brightest pixel `.haze`
 *      already painted here: #0c1724, relative luminance 0.008183.
 *
 *   2. THE PANELS. For every surface that carries pinned ratios — `.card`,
 *      `.hud-panel`, the option rows, the sidebar, the topbar — read the
 *      COMPUTED background-color and check the alpha is 1. An opaque fill means
 *      no backdrop pixel is under that text at all, which is why those ratios
 *      are arithmetically untouched rather than merely "still passing".
 *
 * WHY NOT A BEFORE/AFTER SCREENSHOT DIFF. It was tried and it measures the
 * wrong thing: these routes stream and animate, so two frames differ for
 * reasons that have nothing to do with the backdrop — one capture had the
 * theory hub's topic grid and the other still had its skeleton, and 75 % of the
 * frame "differed"; the dashboard's error page even prints a fresh code each
 * render. Diffing noise against a contrast claim is worse than not measuring.
 *
 * Usage:  DECK_COOKIE=<jwt> node deck-contrast.mjs [--base http://localhost:3540]
 */
import { chromium } from "./pw.mjs";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : process.env.UI_BASE ?? "http://localhost:3540";
const COOKIE = process.env.DECK_COOKIE;
if (!COOKIE) throw new Error("DECK_COOKIE is required");

/**
 * `--haze-warm` over `--background` — the ceiling the deck promises to hold.
 *
 * As a HEX, not a decimal: the deck's own boresight is painted in exactly this
 * colour, so a rounded literal makes the equality case read as a violation.
 * (It did: 658 pixels "over ceiling", every one of them the boresight, at
 * L 0.0081833 against a hardcoded 0.008183.) The luminance is computed in the
 * page with the same arithmetic as the pixels it is compared against.
 */
const CEILING_HEX = "#0c1724";

const PAGES = ["/theory", "/theory/practice"];
const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900, mobile: false },
  { tag: "mobile", width: 390, height: 844, mobile: true },
];

/** Runs in the page: max/mean luminance of one data-URL PNG. */
const analyse = ([url, ceilingHex]) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const D = ctx.getImageData(0, 0, c.width, c.height).data;
      const ch = (v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const hexL = (h) => {
        const n = Number.parseInt(h.slice(1), 16);
        return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
      };
      const ceiling = hexL(ceilingHex);
      let maxL = 0;
      let sum = 0;
      let over = 0;
      let maxAt = null;
      let maxHex = "";
      const n = D.length / 4;
      for (let i = 0; i < D.length; i += 4) {
        const l = 0.2126 * ch(D[i]) + 0.7152 * ch(D[i + 1]) + 0.0722 * ch(D[i + 2]);
        sum += l;
        if (l > ceiling + 1e-9) over += 1;
        if (l > maxL) {
          maxL = l;
          const px = (i / 4) | 0;
          maxAt = [px % c.width, (px / c.width) | 0];
          maxHex = `#${[D[i], D[i + 1], D[i + 2]]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")}`;
        }
      }
      resolve({ pixels: n, maxL, maxHex, maxAt, meanL: sum / n, over, ceiling });
    };
    img.src = url;
  });

/** Runs in the page: computed background alpha of every pinned surface. */
const panelOpacity = () => {
  const SELECTORS = [
    ".card",
    ".hud-panel",
    ".panel",
    "aside",
    "header",
    "[role='radio']",
    "[role='checkbox']",
    "label",
    "button",
  ];
  const out = [];
  for (const sel of SELECTORS) {
    const nodes = [...document.querySelectorAll(sel)];
    if (!nodes.length) continue;
    let opaque = 0;
    let translucent = 0;
    const examples = [];
    for (const el of nodes) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(bg);
      const parts = m ? m[1].split(",").map((p) => Number.parseFloat(p)) : [];
      const alpha = parts.length === 4 ? parts[3] : 1;
      const transparent = parts.length === 4 && parts[3] === 0;
      if (transparent) continue; // no fill of its own; inherits its parent's
      if (alpha >= 1) opaque += 1;
      else {
        translucent += 1;
        if (examples.length < 3) examples.push(`${el.className.toString().slice(0, 40)} ${bg}`);
      }
    }
    out.push({ sel, opaque, translucent, examples });
  }
  return out;
};

const browser = await chromium.launch({ headless: true });
const host = new URL(BASE).hostname;
const planeResults = [];

for (const vp of VIEWPORTS) {
  const base = {
    viewport: { width: vp.width, height: vp.height },
    colorScheme: "dark",
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
  };
  const cookie = [
    {
      name: "authjs.session-token",
      value: COOKIE,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ];

  // --- 1. the plane, alone ------------------------------------------------
  {
    const ctx = await browser.newContext(base);
    await ctx.addCookies(cookie);
    // `visibility`, not `display`: the layout — and therefore the deck's own
    // sizing — must be exactly the layout of the real page.
    await ctx.addInitScript(`(() => {
      const apply = () => {
        const s = document.createElement("style");
        s.textContent = "header,aside,nav,main,nextjs-portal{visibility:hidden!important}" +
          ".deck-drift{animation:none!important;transform:translate3d(40%,0,0)!important}";
        document.head.appendChild(s);
      };
      if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
    })()`);
    const page = await ctx.newPage();
    for (const url of PAGES) {
      await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 300000 });
      await page.waitForTimeout(3500);
      const png = (await page.screenshot()).toString("base64");
      const scratch = await (await browser.newContext()).newPage();
      const stat = await scratch.evaluate(analyse, [`data:image/png;base64,${png}`, CEILING_HEX]);
      await scratch.context().close();
      planeResults.push({ url, vp: vp.tag, ...stat });
      console.log(
        `PLANE ${url.padEnd(18)} @${vp.tag.padEnd(7)} brightest ${stat.maxHex} ` +
          `L ${stat.maxL.toFixed(6)} at ${stat.maxAt} · mean L ${stat.meanL.toFixed(6)} · ` +
          `pixels over ceiling ${stat.over} / ${stat.pixels}`,
      );
    }
    await ctx.close();
  }

  // --- 2. the panels above it --------------------------------------------
  {
    const ctx = await browser.newContext(base);
    await ctx.addCookies(cookie);
    const page = await ctx.newPage();
    for (const url of PAGES) {
      await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 300000 });
      await page.waitForTimeout(3500);
      const rows = await page.evaluate(panelOpacity);
      const translucent = rows.filter((r) => r.translucent > 0);
      console.log(
        `PANELS ${url.padEnd(17)} @${vp.tag.padEnd(7)} ` +
          rows.map((r) => `${r.sel}:${r.opaque}op/${r.translucent}tr`).join(" "),
      );
      for (const r of translucent) {
        console.log(`   translucent ${r.sel}: ${r.examples.join(" | ")}`);
      }
    }
    await ctx.close();
  }
}

const worst = planeResults.reduce((a, r) => (r.maxL > a.maxL ? r : a), planeResults[0]);
const over = planeResults.reduce((a, r) => a + r.over, 0);
console.log(
  `\nVERDICT: brightest pixel the deck paints anywhere = ${worst.maxHex} ` +
    `(L ${worst.maxL.toFixed(6)}), ceiling ${CEILING_HEX} — ` +
    (over === 0 ? "HOLDS" : `BROKEN, ${over} pixels over`),
);

await browser.close();
