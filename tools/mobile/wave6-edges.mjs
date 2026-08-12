// =============================================================================
// wave6-edges.mjs — THE EDGES OF THE SCREEN, MEASURED ON THE DEPLOYED PRODUCT.
//
// WHY THIS FILE EXISTS. Four mobile waves reported green and the founder's
// phone did not change. Three of them measured `/dev/drive-rig`, which 404s in
// production; the fourth measured a login redirect and reported „overflowCount:
// 0" while `hasCanvas` was false. So this probe refuses to produce a number
// before it has proved, on the page it is standing on, that there is a
// simulator there: `hasCanvas === true` AND a non-zero canvas rect AND the
// touch overlay mounted. Every row below is keyed to a §I row of doc 91 so a
// result can be read as „closed" or „open" rather than as „improved".
//
// THE ROWS THIS FILE OWNS
//   I6   pinch-zoom on the driving surface — a REAL two-point CDP pinch on the
//        road AND on a card, because `touch-action` resolves per touch point
//        and the shipped fix is scoped to the scene wrapper only.
//   I7   `--sim-vh` against `visualViewport.height` — the stale-variable defect.
//   I8   the fullscreen arm's 8 px gutter — canvas box vs shell box.
//   I9   document taller than the screen — scrollHeight − clientHeight.
//   I11  the compact sheet standing on the touch controls — px² of overlap and
//        an `elementFromPoint` census of every 44 px control it answers for.
//   I16  overlapping overlays — is the touch hint enrolled in the shell's
//        one-overlay-at-a-time switch.
//   EDGE the founder's clipped card: every visible control measured against the
//        SAFE-AREA box rather than against the viewport box, because a
//        `position: fixed` surface is not laid out inside <body>'s padding and
//        so never receives the payback globals.css does there.
//
// ENGINE. WebKit is the primary engine for geometry (it is his phone). The
// pinch needs CDP `Input.dispatchTouchEvent` with an explicit two-point
// `touchPoints` array — Playwright's touchscreen is single-tap and cannot
// express it — so the pinch rows run on Chromium and say so. Run both.
//
//   node tools/mobile/wave6-edges.mjs --base https://…trycloudflare.com \
//        --email founder@knijka.ai --password '…' --engine webkit
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { engineByName } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3491");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const EMAIL = arg("email", process.env.KNIJKA_MOBILE_EMAIL || "");
const PASSWORD = arg("password", process.env.KNIJKA_MOBILE_PASSWORD || "");
const ENGINE = engineByName(arg("engine", "webkit"));
const TAG = arg("tag", "before");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave6-edges`;
mkdirSync(`${OUT}/shots`, { recursive: true });

const devices = resolveDevices(arg("device", null) ? arg("device", null).split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * PAINTED CONTENT AGAINST THE SAFE-AREA BOX — and the distinction is the whole
 * instrument. The first version of this measured CONTAINER boxes and reported
 * `[data-hud="dash-dock"]` 59 px outside the safe area on an iPhone 16
 * landscape. That is a false positive: the dock is `inset-x-0` on purpose with
 * `justify-center` inside it, so the BOX crosses the notch and the READOUT does
 * not. A row closed on that number would be a row closed on nothing.
 *
 * So this walks LEAF painted things — a text-bearing element with no
 * element children, or any button — and charges an element only for the part of
 * its own CONTENT box (its rect minus its own padding) that falls outside the
 * safe area. Two extra facts per hit, because they decide the fix:
 *   `paysInset` — does any of the element's own or its ancestors' inline/computed
 *                 offsets already contain the emulated inset? If yes, the box is
 *                 inset-aware and something else is wrong with it.
 *   `clippedByViewport` — is it off the DOCUMENT edge as well, i.e. genuinely
 *                 unreachable rather than merely under the camera housing.
 */
async function measureEdges(page, insetPx) {
  return page.evaluate((sa) => {
    const safe = { l: sa.left, r: innerWidth - sa.right, t: sa.top, b: innerHeight - sa.bottom };
    const out = [];
    const seen = new Set();
    const isLeafPainted = (el) => {
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") return true;
      if (el.childElementCount > 0) return false;
      return (el.textContent || "").trim().length > 0;
    };
    for (const el of document.querySelectorAll("body *")) {
      if (!isLeafPainted(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const pad = {
        t: parseFloat(cs.paddingTop) || 0,
        r: parseFloat(cs.paddingRight) || 0,
        b: parseFloat(cs.paddingBottom) || 0,
        l: parseFloat(cs.paddingLeft) || 0,
      };
      const box = { l: r.left + pad.l, r: r.right - pad.r, t: r.top + pad.t, b: r.bottom - pad.b };
      const over = {
        left: +Math.max(0, safe.l - box.l).toFixed(1),
        right: +Math.max(0, box.r - safe.r).toFixed(1),
        top: +Math.max(0, safe.t - box.t).toFixed(1),
        bottom: +Math.max(0, box.b - safe.b).toFixed(1),
      };
      if (over.left + over.right + over.top + over.bottom <= 0.5) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("data-hud") || el.tagName)
        .replace(/\s+/g, " ").trim().slice(0, 44);
      const key = `${name}|${Math.round(r.x)},${Math.round(r.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Which named surface does it belong to — that is what a fix is applied to.
      let owner = null;
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const h = p.getAttribute("data-hud") || p.getAttribute("data-sim-overlay") || (p.hasAttribute("data-sim-shell") ? "sim-shell" : null);
        if (h) { owner = h; break; }
      }
      out.push({
        name,
        owner,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        outsideSafeAreaPx: over,
        clippedByViewport: box.r > innerWidth + 0.5 || box.l < -0.5 || box.b > innerHeight + 0.5,
      });
    }
    const worst = (i) => i.outsideSafeAreaPx.left + i.outsideSafeAreaPx.right + i.outsideSafeAreaPx.top + i.outsideSafeAreaPx.bottom;
    return { safeBox: safe, count: out.length, items: out.sort((a, b) => worst(b) - worst(a)).slice(0, 20) };
  }, insetPx);
}

/** Clear whatever blocking card is on screen, up to `n` times. */
async function ackAll(page, n = 6) {
  for (let i = 0; i < n; i += 1) {
    const hit = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent || "").trim();
        if (/^(Разбрах|Продължи|Започни|Разбрах — продължи)/.test(t)) { b.click(); return true; }
      }
      return false;
    });
    if (!hit) return i;
    await sleep(430);
  }
  return n;
}
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

if (!EMAIL || !PASSWORD) throw new Error("[wave6] --email and --password are required (this runs against the DEPLOYED product).");

const browser = await ENGINE.launcher.launch(ENGINE.name === "chromium" ? { args: GL_ARGS } : {});
const results = [];

// ONE SIGN-IN FOR THE WHOLE SWEEP — the login route is budgeted 10 per 10
// minutes per IP (modules/security/policy.ts), and six profiles × a re-run
// walks into it and then reports a login page as simulator geometry.
const { context: authContext } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authContext.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authContext.storageState();
await authContext.close();
console.log(`[wave6] signed in ONCE as ${EMAIL} on ${ENGINE.name}; ${devices.length} profiles reuse the session`);

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  // NO-FULLSCREEN MODE, and it is not a convenience.
  //
  // Chromium grants the Fullscreen API for a <div>; iOS Safari never has. So on
  // Chromium the shell takes its `isFullscreen` arm and the BROWSER ITSELF
  // suppresses pinch-zoom — which would turn every I6 sample into a negative
  // that proves nothing about the founder's phone. Refusing the request puts
  // Chromium on the SAME code path as his iPhone (the `immersive` arm), which
  // is the only state in which „the road no longer zooms" is a claim about him.
  if (process.argv.includes("--block-fullscreen")) {
    await context.addInitScript(() => {
      const deny = () => Promise.reject(new TypeError("fullscreen blocked by the harness"));
      Element.prototype.requestFullscreen = deny;
      // The shell also feature-detects; make the detection agree with iOS.
      try { Object.defineProperty(document, "fullscreenEnabled", { get: () => false }); } catch { /* frozen */ }
    });
  }
  const page = await context.newPage();
  const cdp = ENGINE.name === "chromium" ? await context.newCDPSession(page) : null;
  const rec = {
    engine: ENGINE.name,
    device: device.id,
    label: device.label,
    inset: insetBanner(device, inset),
    insetPx: { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left },
    viewport: { w: device.width, h: device.height },
  };
  console.log(`\n${"=".repeat(96)}\n${device.label}  [${ENGINE.name}]\n  ${rec.inset}`);

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(3600);

    // ── THE GATE. Five probes have reported „0 overflow" from a page with no
    //    simulator on it. Nothing below is written unless this passes.
    const live = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c?.getBoundingClientRect() ?? null;
      return {
        url: location.pathname + location.search,
        hasCanvas: Boolean(c),
        canvas: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
        hasTouchOverlay: Boolean(document.querySelector('[data-hud="touch-controls"]')),
        compact: document.querySelector("[data-sim-shell]")?.getAttribute("data-sim-compact") ?? null,
      };
    });
    rec.live = live;
    if (!live.hasCanvas || !live.canvas || live.canvas.w < 1 || live.canvas.h < 1 || !live.hasTouchOverlay) {
      throw new Error(`GATE FAILED — no live simulator on ${live.url}: ${JSON.stringify(live)}`);
    }
    console.log(`  gate OK — canvas ${live.canvas.w}×${live.canvas.h} at ${live.canvas.x},${live.canvas.y}; compact=${live.compact}`);

    // ── I8 · 16 px of road. The shell's own box against the canvas's box.
    rec.i8 = await page.evaluate(() => {
      const shell = document.querySelector("[data-sim-shell]");
      const c = document.querySelector("canvas");
      if (!shell || !c) return null;
      const cs = getComputedStyle(shell);
      const s = shell.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      return {
        shellPadding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => Math.round(parseFloat(v) || 0)),
        shellGap: Math.round(parseFloat(cs.rowGap) || 0),
        shell: { w: +s.width.toFixed(1), h: +s.height.toFixed(1) },
        canvasVsViewport: { dw: +(innerWidth - r.width).toFixed(1), dh: +(innerHeight - r.height).toFixed(1) },
        fullscreen: document.fullscreenElement != null,
      };
    });

    // ── I6 · PINCH. The whole point of this row, and it needs a real two-point
    //    touch sequence. `touch-action` is intersected across the elements the
    //    pointers are over, so the road and a card are DIFFERENT experiments:
    //    the shipped fix is scoped to the scene wrapper only.
    rec.i6 = { engineSupportsPinch: Boolean(cdp), samples: [] };
    if (cdp) {
      const pinchAt = async (label, cx, cy, maxSpread = 130) => {
        const before = await page.evaluate(() => ({ scale: +(visualViewport?.scale ?? 1).toFixed(3), ox: Math.round(visualViewport?.offsetLeft ?? 0), oy: Math.round(visualViewport?.offsetTop ?? 0) }));
        const pts = (spread) => [
          { x: cx - spread, y: cy, id: 11, radiusX: 12, radiusY: 12, force: 1 },
          { x: cx + spread, y: cy, id: 12, radiusX: 12, radiusY: 12, force: 1 },
        ];
        const ladder = [30, 55, 80, 105, 130].filter((s) => s <= maxSpread).concat(maxSpread < 30 ? [maxSpread] : []);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(Math.min(14, maxSpread - 4)) });
        for (const s of ladder) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(s) });
          await sleep(45);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(500);
        const after = await page.evaluate(() => ({ scale: +(visualViewport?.scale ?? 1).toFixed(3), ox: Math.round(visualViewport?.offsetLeft ?? 0), oy: Math.round(visualViewport?.offsetTop ?? 0) }));
        const touchAction = await page.evaluate(([x, y]) => {
          let el = document.elementFromPoint(x, y);
          const chain = [];
          while (el && el !== document.documentElement) { chain.push(getComputedStyle(el).touchAction); el = el.parentElement; }
          return { at: chain[0] ?? null, chain: chain.slice(0, 6), on: (document.elementFromPoint(x, y)?.getAttribute("data-hud") || document.elementFromPoint(x, y)?.tagName || "") };
        }, [cx, cy]);
        rec.i6.samples.push({ label, at: [cx, cy], before, after, zoomed: after.scale > before.scale + 0.05, touchAction });
        // Reset the visual viewport before the next sample.
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(130) });
        for (const s of [100, 70, 40, 14]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(s) }); await sleep(45); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(500);
      };
      // 1. the road (what the shipped fix covers)
      await pinchAt("road", Math.round(device.width * 0.5), Math.round(device.height * 0.45));
      // 2. the top rail — DOM chrome that is neither the road nor a card
      await pinchAt("top-rail", Math.round(device.width * 0.5), 24);
      // 3. A CARD — and this is the sample the row actually turns on. §I6's fix
      //    is scoped to a wrapper whose only child is the scene; every card is a
      //    SIBLING of it, so a pinch that starts on a card is a different
      //    experiment from a pinch that starts on the road, and a card is where
      //    his finger is when a card is up. Wait for one rather than sampling
      //    whatever happened to be mounted 3 s in.
      await page.waitForSelector("[data-sim-overlay-card]", { timeout: 15_000 }).catch(() => {});
      const cardPt = await page.evaluate(() => {
        for (const sel of ["[data-sim-overlay-card]", '[data-hud="touch-hint"]', '[data-hud="notify-column"]']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 24 && r.height > 24 && getComputedStyle(el).display !== "none") {
            return { sel, pt: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)], spread: Math.floor(Math.min(r.width, 260) / 2) - 4 };
          }
        }
        return null;
      });
      rec.i6.cardFound = cardPt;
      // Both fingers INSIDE the card — `touch-action` is intersected across the
      // touch points, so one finger on the road would let the road's `none`
      // decide the gesture and the sample would say nothing about the card.
      if (cardPt) await pinchAt("card", cardPt.pt[0], cardPt.pt[1], Math.max(18, Math.min(cardPt.spread, 90)));

    }

    // ── I7 · stale --sim-vh. Read the published variable against the live
    //    visual viewport, then again after a real viewport change, which is what
    //    a URL bar is. `page.setViewportSize` is the only chrome change this
    //    harness can make; it moves `visualViewport.height` exactly as a
    //    toolbar does, which is the input C6 is about.
    const readVh = () => page.evaluate(() => {
      const shell = document.querySelector("[data-sim-shell]");
      const raw = shell ? getComputedStyle(shell).getPropertyValue("--sim-vh").trim() : "";
      const px = /px$/.test(raw) ? Math.round(parseFloat(raw)) : null;
      return { raw, px, vv: Math.round(window.visualViewport?.height ?? innerHeight), inner: innerHeight, fullscreen: document.fullscreenElement != null };
    });
    const vh0 = await readVh();
    let vh1 = null;
    let vh2 = null;
    // A window that the UA has put into fullscreen cannot be resized from the
    // outside („To resize minimized/maximized/fullscreen window, restore it to
    // normal state first"), and that is not a limitation worth working around:
    // fullscreen IS the state §C6 is about, and `vh0` already carries the
    // verdict there — the hook stands down while `--sim-vh` keeps publishing.
    if (!vh0.fullscreen) {
      await page.setViewportSize({ width: device.width, height: device.height - 44 });
      await sleep(700);
      vh1 = await readVh();
      await page.setViewportSize({ width: device.width, height: device.height });
      await sleep(700);
      vh2 = await readVh();
    }
    const samples = [vh0, vh1, vh2].filter(Boolean);
    rec.i7 = {
      atRest: vh0,
      afterUrlBarAppears: vh1,
      afterUrlBarHides: vh2,
      inFullscreen: vh0.fullscreen,
      // The defect is „published height ≠ what the student can see".
      driftPx: samples.map((v) => (v.px == null ? null : v.px - v.vv)),
      stale: samples.some((v) => v.px != null && Math.abs(v.px - v.vv) > 2),
    };

    // ── I9 · document taller than the screen.
    rec.i9 = await page.evaluate(() => {
      const de = document.documentElement;
      const body = getComputedStyle(document.body);
      return {
        overflowYPx: de.scrollHeight - de.clientHeight,
        overflowXPx: de.scrollWidth - de.clientWidth,
        bodyPaddingBottom: Math.round(parseFloat(body.paddingBottom) || 0),
        bodyPaddingSides: [Math.round(parseFloat(body.paddingLeft) || 0), Math.round(parseFloat(body.paddingRight) || 0)],
      };
    });

    // ── EDGE · THE CLIPPED CARD. See `measureEdges` below: PAINTED CONTENT
    //    against the safe-area box, not container boxes.
    rec.edge = await measureEdges(page, rec.insetPx);

    // ── I16 · overlapping overlays. Is the hint enrolled in the switch?
    rec.i16 = await page.evaluate(() => {
      const shell = document.querySelector("[data-sim-shell]");
      const hint = document.querySelector('[data-hud="touch-hint"]');
      return {
        overlayActive: shell?.getAttribute("data-sim-overlay-active") ?? null,
        compact: shell?.getAttribute("data-sim-compact") ?? null,
        hintPresent: Boolean(hint),
        hintDisplay: hint ? getComputedStyle(hint).display : null,
        // The rule can only be judged when BOTH are on screen at once.
        bothVisible: Boolean(hint) && getComputedStyle(hint).display !== "none" && shell?.getAttribute("data-sim-overlay-active") === "on",
      };
    });

    // ── I11 · the sheet stands on the controls. Open the OVERLAY sheet — the
    //    `SimOverlay` bottom sheet at `bottom: var(--sim-dash-h)`, which is the
    //    surface §I11/§D4 is about and the one a phone student reaches the whole
    //    pre-drive through («СПИСЪК» / «Защо»). NOT the ⚙ car sheet: that one
    //    lives inside `[data-hud="touch-controls"]`, so measuring it would count
    //    the controls against themselves.
    const openedSheet = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button,[role="button"]')) {
        const t = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).trim();
        if (/^(Защо|СПИСЪК|Списък|Подробно)/.test(t) || /Защо|СПИСЪК/.test(t)) { b.click(); return true; }
      }
      return false;
    });
    await sleep(600);
    rec.i11 = await page.evaluate((didOpen) => {
      const controls = [];
      for (const el of document.querySelectorAll('[data-hud="touch-controls"] button, [data-hud="touch-controls"] [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        controls.push({ name: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34), r });
      }
      const sheets = [];
      for (const sel of ['[data-sim-overlay-state="open"]', '[data-hud="notify-column"]']) {
        const el = document.querySelector(sel);
        if (el) sheets.push({ sel, r: el.getBoundingClientRect() });
      }
      let area = 0;
      const dead = [];
      for (const c of controls) {
        for (const s of sheets) {
          const w = Math.min(c.r.right, s.r.right) - Math.max(c.r.left, s.r.left);
          const h = Math.min(c.r.bottom, s.r.bottom) - Math.max(c.r.top, s.r.top);
          if (w > 0 && h > 0) area += w * h;
        }
        const hit = document.elementFromPoint(c.r.x + c.r.width / 2, c.r.y + c.r.height / 2);
        if (hit && !hit.closest('[data-hud="touch-controls"]')) {
          dead.push({ control: c.name, answeredBy: (hit.getAttribute?.("aria-label") || hit.textContent || hit.tagName).replace(/\s+/g, " ").trim().slice(0, 40) });
        }
      }
      const sheetRect = sheets.find((s) => s.sel.includes("open"))?.r ?? null;
      const shell = document.querySelector("[data-sim-shell]");
      const cssVar = (n) => (shell ? getComputedStyle(shell).getPropertyValue(n).trim() : "");
      return {
        sheetOpened: didOpen,
        // The two lengths the clearance contract is made of, as the engine
        // resolved them — so „the sheet stands on the thumb band" is a number.
        simTouchFloor: cssVar("--sim-touch-floor"),
        simDashH: cssVar("--sim-dash-h"),
        // ── THE HARNESS-BLINDNESS CHECK, and it is the reason five sweeps
        //    reported green on a broken screen. `lib/insets.mjs` substitutes the
        //    profile's real inset into every `env(safe-area-inset-*)` the app
        //    AUTHORED; anything that computes an inset in JS still reads the
        //    engine's 0. `--sim-touch-floor` is published as authored CSS
        //    precisely so it stays inside that reach — and this asserts it did:
        //    a raw value still containing `env(` is a value the emulation never
        //    touched, i.e. a thumb band measured 21–34 px short of the real one.
        touchFloorWasEmulated: !/env\(/.test(cssVar("--sim-touch-floor")),
        controls: controls.length,
        overlapPx2: Math.round(area),
        deadControls: dead.length,
        dead: dead.slice(0, 12),
        sheet: sheetRect ? { x: Math.round(sheetRect.x), y: Math.round(sheetRect.y), w: Math.round(sheetRect.width), h: Math.round(sheetRect.height), bottom: Math.round(sheetRect.bottom) } : null,
        // Where the touch band's ceiling actually is: the topmost 44 px control.
        controlCeilingY: controls.length ? Math.round(Math.min(...controls.map((c) => c.r.top))) : null,
      };
    }, openedSheet);
    // EDGE, measured with the sheet OPEN as well — that is the surface whose
    //    «Разбрах» he photographed running off the right edge.
    rec.edgeSheetOpen = await measureEdges(page, rec.insetPx);
    await page.screenshot({ path: `${OUT}/shots/${TAG}-${ENGINE.name}-${device.id}-sheet.png` });

    // Close it again so the pinch rows below see the landing state.
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button,[role="button"]')) {
        if (/Затвори/.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || ""))) { b.click(); return; }
      }
    });
    await sleep(400);

    // ── EDGE, third state: the FIRST-RUN TOUCH HINT with nothing else up. Its
    //    «Разбрах» is the one the founder names, and it is the one control §U8
    //    measured with `touch-action: auto`.
    rec.acked = await ackAll(page, 6);
    await sleep(700);
    rec.edgeHint = await measureEdges(page, rec.insetPx);
    rec.hintState = await page.evaluate(() => {
      const hint = document.querySelector('[data-hud="touch-hint"]');
      if (!hint) return { present: false };
      const cs = getComputedStyle(hint);
      const r = hint.getBoundingClientRect();
      const ack = [...hint.querySelectorAll("button")].map((b) => {
        const q = b.getBoundingClientRect();
        return { text: (b.textContent || "").trim().slice(0, 20), rect: [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)], touchAction: getComputedStyle(b).touchAction };
      });
      return { present: true, display: cs.display, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], buttons: ack };
    });
    await page.screenshot({ path: `${OUT}/shots/${TAG}-${ENGINE.name}-${device.id}-hint.png` });

    // ── A per-pixel-ish touch-action map, cheap version: a 9×9 grid of the
    //    stage, resolved up the ancestor chain. §T1's own instrument.
    rec.touchActionMap = await page.evaluate(() => {
      const cells = [];
      let zoomable = 0;
      for (let gy = 0; gy < 9; gy += 1) {
        for (let gx = 0; gx < 9; gx += 1) {
          const x = Math.round(((gx + 0.5) / 9) * innerWidth);
          const y = Math.round(((gy + 0.5) / 9) * innerHeight);
          let el = document.elementFromPoint(x, y);
          let effective = "auto";
          while (el && el !== document.documentElement) {
            const ta = getComputedStyle(el).touchAction;
            if (ta && ta !== "auto") { effective = ta; break; }
            el = el.parentElement;
          }
          // Only `none`, `pan-x`, `pan-y` and combinations WITHOUT `pinch-zoom`
          // suppress the gesture. `manipulation` kills double-tap, not pinch.
          const permitsPinch = effective === "auto" || effective === "manipulation" || /pinch-zoom/.test(effective);
          if (permitsPinch) zoomable += 1;
          cells.push(effective);
        }
      }
      return { zoomablePermilleOfGrid: Math.round((zoomable / 81) * 1000), zoomableCells: zoomable, of: 81, distinct: [...new Set(cells)] };
    });

    // ── THE POSITIVE CONTROL, run LAST because it NAVIGATES AWAY.
    if (cdp) {
      //, AND WITHOUT IT EVERY LINE ABOVE IS WORTHLESS.
      //
      // „scale 1 → 1" is what a working `touch-action` looks like AND what a
      // pinch that never happened looks like. The audit's own gesture lane had
      // to throw a result away for exactly this reason. So the same code, the
      // same CDP session, is fired at a page this product DELIBERATELY leaves
      // zoomable — the theory screens, where minors read dense Bulgarian legal
      // text and where §I6 forbids us to touch the viewport meta. If the scale
      // does not rise there, the instrument is blind and the simulator's zeros
      // above are not evidence of anything.
      rec.i6.positiveControl = { route: "/theory" };
      try {
        await page.goto(`${BASE}/theory`, { waitUntil: "domcontentloaded", timeout: 180_000 });
        await sleep(2500);
        const before = await page.evaluate(() => +(visualViewport?.scale ?? 1).toFixed(3));
        const cx = Math.round(device.width * 0.5);
        const cy = Math.round(device.height * 0.5);
        const pts = (spread) => [
          { x: cx - spread, y: cy, id: 21, radiusX: 12, radiusY: 12, force: 1 },
          { x: cx + spread, y: cy, id: 22, radiusX: 12, radiusY: 12, force: 1 },
        ];
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(14) });
        for (const s of [30, 55, 80, 105, 130]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(s) }); await sleep(45); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(600);
        const after = await page.evaluate(() => ({ scale: +(visualViewport?.scale ?? 1).toFixed(3), ox: Math.round(visualViewport?.offsetLeft ?? 0) }));
        rec.i6.positiveControl = { route: "/theory", before, after: after.scale, offsetLeft: after.ox, instrumentIsHonest: after.scale > before + 0.05 };
        // §I9 belongs to an ORDINARY page, by its own words („it is unreachable
        // on the screen he was complaining about … it is the ordinary pages
        // that carry it"), so it is measured on one while we are standing here.
        //
        // AND IT IS AN A/B, because a raw overflow number cannot tell „the
        // inset made this page taller than the screen" apart from „this page
        // has more content than the screen", which is ordinary scrolling and
        // not a defect. So: measure, remove the payback, measure again, put it
        // back. If the delta is the inset AND the page fits without it, §L11
        // is live here. If the page overflows by hundreds of px either way, the
        // inset is not what the student is scrolling past.
        rec.i9Ordinary = await page.evaluate(() => {
          const de = document.documentElement;
          const read = () => de.scrollHeight - de.clientHeight;
          const before = read();
          const was = document.body.style.paddingBottom;
          document.body.style.paddingBottom = "0px";
          void de.offsetHeight;
          const without = read();
          document.body.style.paddingBottom = was;
          return {
            route: location.pathname,
            overflowYPx: before,
            overflowYWithoutBodyPaddingPx: without,
            attributableToInsetPx: before - without,
            fitsWithoutTheInset: without <= 0,
            overflowXPx: de.scrollWidth - de.clientWidth,
            bodyPaddingBottom: Math.round(parseFloat(getComputedStyle(document.body).paddingBottom) || 0),
          };
        });
      } catch (error) {
        rec.i6.positiveControl = { route: "/theory", error: String(error?.message || error).split("\n")[0] };
      }
    }

    await page.screenshot({ path: `${OUT}/shots/${TAG}-${ENGINE.name}-${device.id}.png` });
    rec.ok = true;
  } catch (error) {
    rec.ok = false;
    rec.error = String(error?.message || error).split("\n").slice(0, 3).join(" | ");
    console.log(`  !! ${rec.error}`);
  }

  results.push(rec);
  // A compact per-profile readout so a run can be read while it is still going.
  if (rec.ok) {
    console.log(`  I7  --sim-vh ${rec.i7?.atRest?.raw} vs vv ${rec.i7?.atRest?.vv}  drift ${JSON.stringify(rec.i7?.driftPx)}  stale=${rec.i7?.stale}`);
    console.log(`  I8  shell padding ${JSON.stringify(rec.i8?.shellPadding)} gap ${rec.i8?.shellGap}  canvas short by ${JSON.stringify(rec.i8?.canvasVsViewport)}`);
    console.log(`  I9  document overflow  y=${rec.i9?.overflowYPx}px  x=${rec.i9?.overflowXPx}px  (body pb ${rec.i9?.bodyPaddingBottom})`);
    console.log(`  I11 sheet ${rec.i11?.sheetOpened ? "opened" : "NOT FOUND"}; overlap ${rec.i11?.overlapPx2}px², dead controls ${rec.i11?.deadControls}/${rec.i11?.controls}  [--sim-touch-floor=${rec.i11?.simTouchFloor || "(absent)"} --sim-dash-h=${rec.i11?.simDashH}]`);
    console.log(`  I16 overlayActive=${rec.i16?.overlayActive} hintDisplay=${rec.i16?.hintDisplay} bothVisible=${rec.i16?.bothVisible}`);
    for (const [label, e] of [["landing", rec.edge], ["sheet-open", rec.edgeSheetOpen], ["first-run-hint", rec.edgeHint]]) {
      console.log(`  EDGE[${label}] ${e?.count ?? "-"} painted things outside the safe box; worst: ${(e?.items || []).slice(0, 3).map((i) => `«${i.name}»@${i.owner} L+${i.outsideSafeAreaPx.left} R+${i.outsideSafeAreaPx.right} T+${i.outsideSafeAreaPx.top} B+${i.outsideSafeAreaPx.bottom}${i.clippedByViewport ? " OFF-SCREEN" : ""}`).join(" | ")}`);
    }
    console.log(`  T1  ${rec.touchActionMap?.zoomableCells}/81 grid cells still permit pinch (${rec.touchActionMap?.distinct.join(", ")})`);
    for (const s of rec.i6?.samples || []) console.log(`  I6  pinch@${s.label} scale ${s.before.scale}→${s.after.scale} offsetLeft ${s.before.ox}→${s.after.ox}  ZOOMED=${s.zoomed}  touch-action ${s.touchAction.at}`);
    if (rec.i6?.positiveControl) console.log(`  I6  POSITIVE CONTROL /theory: scale ${rec.i6.positiveControl.before}→${rec.i6.positiveControl.after} offsetLeft ${rec.i6.positiveControl.offsetLeft} → instrument honest = ${rec.i6.positiveControl.instrumentIsHonest}${rec.i6.positiveControl.error ? ` (${rec.i6.positiveControl.error})` : ""}`);
    if (rec.i9Ordinary) console.log(`  I9  ordinary page ${rec.i9Ordinary.route}: overflow y=${rec.i9Ordinary.overflowYPx}px, WITHOUT the body payback ${rec.i9Ordinary.overflowYWithoutBodyPaddingPx}px → attributable to the inset ${rec.i9Ordinary.attributableToInsetPx}px; fits without it = ${rec.i9Ordinary.fitsWithoutTheInset}`);
  }
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/${TAG}-${ENGINE.name}.json`, JSON.stringify({ base: BASE, route: ROUTE, engine: ENGINE.name, tag: TAG, at: new Date().toISOString(), results }, null, 2));
console.log(`\n[wave6] wrote ${OUT}/${TAG}-${ENGINE.name}.json`);
