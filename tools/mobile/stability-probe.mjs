#!/usr/bin/env node
// =============================================================================
// stability-probe.mjs — phase 7. Does the layout HOLD STILL?
//
//   node tools/mobile/stability-probe.mjs --base-url http://localhost:3520
//   node tools/mobile/stability-probe.mjs -r theory -d iphone16-landscape
//   node tools/mobile/stability-probe.mjs --engine chromium     (second opinion)
//
// Every other lane moved something. This one asks the questions the founder
// asked, in his words, and answers each of them with a number:
//
//   "elements shifting position"            -> SHIFT, measured before/after
//   "uneven margins"                        -> GAPS, min left vs min right
//   "controls touching screen edges"        -> EDGE, incl. the REAL device insets
//   "overlapping components"                -> OVERLAP + OCCLUSION (hit-test)
//   "different layouts between ... orientations" -> the two orientations compared
//   "elements moving when popups appear"    -> the drawer opened and closed again
//   "controls not respecting safe areas"    -> non-interactive surfaces too
//
// It runs on the phase-0 harness (lib/pw, lib/devices, lib/auth, lib/user,
// lib/routes) so it inherits WebKit-not-Chromium, a real authenticated session
// with the landed path asserted, and the device profiles' REAL safe-area insets
// (Playwright's WebKit is the desktop port: env() resolves to 0 there, so the
// profile supplies the notch — see lib/devices.mjs).
//
// THREE THINGS THIS MEASURES THAT THE COVERAGE PROBE DOES NOT
// ---------------------------------------------------------------------------
// 1. probe.mjs checks safe areas for INTERACTIVE elements only. A panel, a card
//    or a drawer's own body under the Dynamic Island is just as broken, so this
//    checks every element that PAINTS.
// 2. Nothing measured motion. A snapshot is taken before an overlay opens, with
//    it open, and after it closes; every element present in all three is
//    compared by position. A layout that reflows when a popup appears is the
//    founder's "elements moving when popups appear".
// 3. iOS toolbars resize the VISUAL viewport, not the layout one. Playwright
//    cannot hide a real Safari toolbar, so this does the honest equivalent:
//    shrink the viewport by the toolbar's height, snapshot, restore, snapshot.
//    Anything that fails to come back to where it started would jump on a real
//    phone the moment the student scrolls.
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./lib/pw.mjs";
import { contextOptions, resolveDevices, resolveMotion } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";
import { gotoAuthenticated, NAV_BUDGET_MS, signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";
import { isWorldFrame, waitForWorld, worldVitals } from "./lib/ready.mjs";
import { appMs, instrumentShare, settle } from "./lib/settle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, ".out", "stability");

/** A shift under this is sub-pixel rounding, not motion. */
const SHIFT_TOLERANCE_PX = 0.5;
/** The founder's own number: "nothing sits within 8px of an unsafe edge". */
const EDGE_MARGIN_PX = 8;
/** iOS Safari's collapsing toolbar, portrait. The visual viewport grows by this. */
const TOOLBAR_PX = 90;
/**
 * How long a surface may take to stop moving after a state change before the
 * student sees it as a lurch rather than a transition. iOS animates the toolbar
 * over roughly 250ms, so a layout that is still settling well past that is
 * visibly chasing the viewport. Reported for every phase; only exceeding this
 * counts against the row.
 */
const SETTLE_BUDGET_MS = 1200;
/**
 * When the probe owns more than this share of a sample, the SAMPLE is about the
 * box and says so out loud — even though the metric itself (`atRestMs`, taken
 * in-page) no longer contains it. A quarter, not a half: "most of it was the
 * instrument" is far too late a place to start warning, and the number that
 * started this whole round was 99.2%.
 */
const INSTRUMENT_SHARE_LIMIT = 0.25;
/**
 * THE PHASE THAT FOLLOWS NO STATE CHANGE. `base` is taken after the route has
 * loaded, after `prepare`, after the world wait, and after a fixed
 * `settleMs` sleep of 1.2-6 s — so by construction nothing is settling when it
 * runs, and whatever it reports is the FLOOR of this instrument on this box,
 * not a settling time. It was scored against the settle budget like any other
 * phase, and in the last recorded sweep it was the WORST one (32,144 ms), which
 * is how a budget came to be decided by the phase in which the app was idle.
 * It is still measured and still printed — an app that is STILL MOVING 1.2 s
 * after load is a real finding — but it is named for what it is.
 */
const IDLE_PHASE = "base";
/**
 * How long a route that declares `requiresWorld` may take to actually PAINT the
 * 3D world before this probe gives up and records nothing.
 *
 * Generous on purpose: on this box a cold `next dev` compile of the driving
 * route plus its GLB/KTX2 assets has been measured in minutes, and the honest
 * answer to "the world was not up yet" is to wait, not to measure the loading
 * screen and call it 1,190 ms. It is a REFUSAL budget, not a performance one —
 * exceeding it fails the row, it never silently shortens the wait.
 */
const WORLD_TIMEOUT_MS = Number(process.env.KNIJKA_WORLD_TIMEOUT_MS || 180_000);

// -----------------------------------------------------------------------------
// The surfaces. ROUTES is the phase-0 list; /dashboard is added here because it
// is the screen a student lands on and it is pure app shell — the fastest way
// to see a shell-level regression that every other route inherits.
// -----------------------------------------------------------------------------
const DASHBOARD = {
  id: "dashboard",
  path: "/dashboard",
  label: "Табло — the shell every route inherits",
  expectPath: "/dashboard",
  waitFor: "#main-content",
  settleMs: 1200,
};
const SURFACES = [DASHBOARD, ...ROUTES.filter((r) => r.id !== "simulator-drive-intro")];

function parseArgs(argv) {
  const out = { routes: [], devices: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = argv[++i];
    else if (a === "--engine") out.engine = argv[++i];
    // A NEGATIVE CONTROL, because a zero from a check nobody has ever seen fire
    // is not evidence. `--inject-css` puts a stylesheet into every measured page
    // after it loads, which lets a suspected regression be reproduced without
    // editing the app — and, the reason it exists, lets each finding class be
    // proven to still be detectable. See tools/mobile/regressions/ for the ones
    // used to verify this probe.
    else if (a === "--inject-css") out.injectCss = argv[++i];
    // ONE RUN IS NOT A MEASUREMENT WHEN THE MARGIN IS THIN. `settle` is a
    // wall-clock number on a box that is shared with every other lane, and this
    // probe reported a 1,200 ms budget met by 2 ms once and by 10 ms once — from
    // single runs, which cannot tell "the product got faster" from "the box was
    // quieter". `--repeat N` re-measures the same surface N times in the same
    // session and reports min / median / worst / spread per phase, so the
    // verdict comes with the one fact that makes it readable: how far the number
    // moves when nothing about the app changes.
    else if (a === "--repeat") out.repeat = Math.max(1, Number(argv[++i]) || 1);
    // MOTION IS A RUN PARAMETER AND IT IS PRINTED. `reducedMotion: "reduce"`
    // was hard-coded on every device profile with nothing saying so, which made
    // every animation claim ever made through this harness unfalsifiable: a
    // reduced-motion frame was being compared against a reduced-motion frame.
    // `--motion allow` runs the app the way a student's phone does; the default
    // is still `reduce` because a LAYOUT sweep wants deterministic geometry —
    // but now the report states which, in a line nobody can miss.
    else if (a === "--motion") out.motion = argv[++i];
    else if (a === "--device" || a === "-d") out.devices.push(argv[++i]);
    else if (a === "--route" || a === "-r") out.routes.push(argv[++i]);
    else if (a.startsWith("--")) out.flags.add(a.slice(2));
  }
  return out;
}

// =============================================================================
// THE IN-PAGE HALF. Runs inside WebKit; may not reference Node.
// =============================================================================
function stabilityBody(config) {
  const { safeArea, margin, phase } = config;
  const VW = Math.round(window.innerWidth);
  const VH = Math.round(window.innerHeight);

  // --------------------------------------------------------------- helpers
  const alpha = (color) => {
    if (!color || color === "transparent") return 0;
    const m = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!m) return 1;
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length < 4) return 1;
    const a = Number.parseFloat(p[3]);
    return Number.isFinite(a) ? a : 1;
  };

  const opacityCache = new Map();
  function effectiveOpacity(el) {
    if (opacityCache.has(el)) return opacityCache.get(el);
    const own = Number.parseFloat(getComputedStyle(el).opacity);
    const parent = el.parentElement;
    const v = (Number.isFinite(own) ? own : 1) * (parent ? effectiveOpacity(parent) : 1);
    opacityCache.set(el, v);
    return v;
  }

  /** Tailwind's `.sr-only` / `.visually-hidden` idiom paints nothing. */
  function isClippedAway(cs) {
    if (/^rect\((0px,?\s*){4}\)$/.test((cs.clip || "").replace(/\s+/g, " ").trim())) return true;
    if ((cs.clipPath || "") === "inset(50%)") return true;
    return false;
  }

  /**
   * A STABLE KEY, because a snapshot diff is only as good as its identity.
   * Tag + id + first three classes + aria-label, up four levels, then an
   * ordinal among everything that produced the same string. Class lists in this
   * app are Tailwind and therefore descriptive and stable across a re-render;
   * an element whose classes CHANGE (a toggled state) simply drops out of the
   * intersection rather than being reported as a phantom move.
   */
  function keyBase(el) {
    const parts = [];
    let node = el;
    for (let d = 0; node && node.nodeType === 1 && d < 4; d += 1) {
      let p = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${p}#${node.id}`);
        break;
      }
      const cls = (node.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
      if (cls) p += `.${cls}`;
      const al = node.getAttribute("aria-label");
      if (al) p += `[${al.slice(0, 24)}]`;
      parts.unshift(p);
      node = node.parentElement;
    }
    return parts.join(">").slice(0, 200);
  }

  /**
   * Only elements that enter the snapshot may consume an ordinal. The
   * reachability audit below deliberately looks at elements OUTSIDE the viewport,
   * and if those took numbers from this counter, an element scrolling into view
   * between two phases would renumber its siblings and the diff would report a
   * row of phantom moves that describe the bookkeeping rather than the layout.
   */
  const keyCounts = new Map();
  function keyFor(el) {
    const base = keyBase(el);
    const n = (keyCounts.get(base) || 0) + 1;
    keyCounts.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  }

  const REPLACED = new Set([
    "IMG", "SVG", "CANVAS", "VIDEO", "IFRAME", "INPUT", "SELECT", "TEXTAREA",
    "PROGRESS", "METER", "HR", "OBJECT", "EMBED",
  ]);

  /** Does this element put ink on its own box? Same rule as the coverage probe. */
  function paints(el, cs) {
    if (REPLACED.has(el.tagName)) return true;
    if (alpha(cs.backgroundColor) > 0) return true;
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    if (cs.backdropFilter && cs.backdropFilter !== "none") return true;
    if (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") return true;
    if (cs.boxShadow && cs.boxShadow !== "none") return true;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = Number.parseFloat(cs[`border${side}Width`]);
      const st = cs[`border${side}Style`];
      if (w > 0 && st !== "none" && st !== "hidden" && alpha(cs[`border${side}Color`]) > 0) {
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------- IS THIS EDGE HANDLED?
  //
  // THE BLIND SPOT THIS CLOSES. Playwright's WebKit is the DESKTOP port: it has
  // no notch, so `env(safe-area-inset-*)` resolves to 0 no matter what viewport
  // is set (lib/devices.mjs says so, which is why the profile carries the real
  // insets). The consequence nobody had accounted for: an element that handles
  // the home indicator CORRECTLY, with
  // `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))`, measures as
  // 12px of padding here and is reported as sitting 22px inside the unsafe
  // band. Reporting that as a bug would send this lane to "fix" the one line
  // in the codebase that is already right.
  //
  // So each finding is classified from the AUTHORED CSS rather than from the
  // computed pixel:
  //
  //   envAware    — this element, or an ancestor whose box actually contains
  //                 it, declares env(safe-area-inset-<edge>) for that edge.
  //   escapesBody — a `position: fixed` ancestor-or-self (or an absolute with
  //                 no positioned ancestor) puts this element's containing
  //                 block at the VIEWPORT, so <body>'s safe-area padding —
  //                 which globals.css applies precisely to pay the inset back
  //                 for in-flow content — does not reach it.
  //
  // Which gives four verdicts, and only one of them is a defect:
  //   !envAware && escapesBody  -> BLOCKING. Nothing pays this inset.
  //   !envAware && !escapesBody -> body's padding pays it. Fine.
  //    envAware && escapesBody  -> the surface pays it itself. Fine.
  //    envAware && !escapesBody -> body pays it AND the element pays it again:
  //                               a double inset, i.e. dead space, i.e. the
  //                               founder's "uneven margins". Advisory.
  //
  // DO NOT `continue` ON A RULE THAT HAS `cssRules`. Since CSS Nesting shipped,
  // a plain CSSStyleRule ALSO exposes a (usually empty) `cssRules` list, so the
  // obvious `if (rule.cssRules) { recurse; continue; }` skips every style rule
  // in the document. Measured here, on this stylesheet: that shape found 0 of
  // the 8 rules mentioning safe-area-inset — including `body { padding-left:
  // env(safe-area-inset-left, 0px) … }` — and the probe then reported the
  // entire landscape column of the app as unprotected. Test the rule, THEN
  // descend.
  const envRules = [];
  try {
    const walkRules = (list) => {
      for (let i = 0; i < list.length; i += 1) {
        const rule = list[i];
        let text = "";
        try { text = rule.cssText || ""; } catch { text = ""; }
        if (rule.selectorText && text.includes("safe-area-inset")) {
          envRules.push({ selector: rule.selectorText, text });
        }
        const kids = rule.cssRules;
        if (kids && kids.length) walkRules(kids);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; } // cross-origin
      walkRules(rules);
    }
  } catch { /* ignore */ }

  const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);

  /** Does <body>'s safe-area padding actually reach this element? */
  function escapesBody(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed") return true;
      if (p === "absolute") {
        // Contained by the nearest POSITIONED ancestor; if there is none below
        // <body>, the containing block is the initial one — the viewport.
        let anchored = false;
        for (let a = n.parentElement; a && a !== document.body; a = a.parentElement) {
          if (POSITIONED.has(getComputedStyle(a).position)) { anchored = true; break; }
        }
        if (!anchored && !POSITIONED.has(getComputedStyle(document.body).position)) return true;
      }
    }
    return false;
  }

  /**
   * Where env(safe-area-inset-<edge>) is declared for this element.
   *   self — on the element or an ancestor BELOW <body> (i.e. a surface paying
   *          its own inset, which is what a fixed surface must do)
   *   body — on <body>/<html>, i.e. globals.css's blanket pay-back for in-flow
   *          content. Only reaches the element when it does not escape.
   * The walk stops above a `fixed` ancestor: nothing higher contains its box.
   */
  function envSources(el, edgeName) {
    const side = edgeName.replace(/\(bare\)$/, "");
    const wanted = `safe-area-inset-${side}`;
    const declares = (n) => {
      if ((n.getAttribute?.("style") || "").includes(wanted)) return true;
      for (const r of envRules) {
        if (!r.text.includes(wanted)) continue;
        try { if (n.matches(r.selector)) return true; } catch { /* :has() etc. */ }
      }
      return false;
    };
    let self = false;
    let body = false;
    for (let n = el; n; n = n.parentElement) {
      const isRoot = n === document.body || n === document.documentElement;
      if (declares(n)) { if (isRoot) body = true; else self = true; }
      if (isRoot) break;
      if (getComputedStyle(n).position === "fixed") break;
    }
    // <body> is only reached by the walk when nothing fixed interrupted it; ask
    // it directly too, so the "does the blanket exist at all" fact is never
    // confused with "does it reach this element".
    if (!body && document.body && declares(document.body)) body = true;
    return { self, body };
  }

  const INTERACTIVE =
    'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],' +
    '[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],' +
    '[role="option"],[role="slider"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const interactiveSet = new Set(document.querySelectorAll(INTERACTIVE));

  // ------------------------------------------------------------- inventory
  //
  // `items` is CLIPPED TO THE VIEWPORT, which is right for every question about
  // ink — an element off screen paints on no edge, crowds no margin and overlaps
  // no thumb. It is wrong for exactly one question: whether a control can be
  // REACHED. The severe cases there are the ones entirely off screen (the drawer
  // shipped with „Изход" 173px below a panel that could not scroll), and this
  // filter dropped them before anything could look. So they are collected here
  // instead of discarded, and audited separately below.
  const items = [];
  const offscreenInteractive = [];
  for (const el of document.querySelectorAll("*")) {
    const tag = el.tagName;
    if (
      tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META" ||
      tag === "TITLE" || tag === "HEAD" || tag === "NOSCRIPT" || tag === "TEMPLATE"
    ) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (effectiveOpacity(el) <= 0) continue;
    if (isClippedAway(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom <= 0 || r.top >= VH || r.right <= 0 || r.left >= VW) {
      if (interactiveSet.has(el)) {
        offscreenInteractive.push({
          key: keyBase(el),
          x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10,
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
          interactive: true,
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
          el,
        });
      }
      continue;
    }

    // Inside a dialog / overlay? Such elements are EXPECTED to appear and
    // vanish; they are excluded from the shift comparison (which is about the
    // page NOT moving) but still audited for edges and overlaps.
    let inOverlay = false;
    for (let n = el; n; n = n.parentElement) {
      if (
        n.getAttribute?.("role") === "dialog" ||
        n.hasAttribute?.("data-sim-overlay") ||
        n.getAttribute?.("aria-modal") === "true"
      ) { inOverlay = true; break; }
    }

    items.push({
      key: keyFor(el),
      tag: tag.toLowerCase(),
      x: Math.round(r.left * 10) / 10,
      y: Math.round(r.top * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      paints: paints(el, cs),
      interactive: interactiveSet.has(el),
      pos: cs.position,
      inOverlay,
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
      el,
    });
  }

  // --------------------------------------------------------------- 1. EDGES
  // The insets that matter are the DEVICE's. Playwright's desktop WebKit
  // reports env() = 0, so the profile supplies the notch and the home bar.
  const envProbe = document.createElement("div");
  envProbe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:0;height:0;" +
    "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
    "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
  document.documentElement.appendChild(envProbe);
  const ecs = getComputedStyle(envProbe);
  const envInsets = {
    top: Number.parseFloat(ecs.paddingTop) || 0,
    right: Number.parseFloat(ecs.paddingRight) || 0,
    bottom: Number.parseFloat(ecs.paddingBottom) || 0,
    left: Number.parseFloat(ecs.paddingLeft) || 0,
  };
  envProbe.remove();

  const unsafe = {
    top: Math.max(safeArea.top, envInsets.top),
    right: Math.max(safeArea.right, envInsets.right),
    bottom: Math.max(safeArea.bottom, envInsets.bottom),
    left: Math.max(safeArea.left, envInsets.left),
  };

  const edge = [];
  for (const it of items) {
    if (!it.paints && !it.interactive) continue;
    // A full-bleed backdrop (the dimmer behind a drawer, the app ground) is
    // SUPPOSED to reach every edge — it is paint, not furniture. Charging it
    // would bury the real findings under one entry per screen.
    const fullBleed = it.w >= VW - 1 && it.h >= VH - 1;
    if (fullBleed) continue;
    // SCROLLED-PAST IS NOT "AT THE EDGE". An element that continues BEYOND the
    // viewport on an axis is not positioned against that edge, it is simply cut
    // by the fold — the sixth topic card on a scrolling list, charged for
    // "bottom -82px" purely because the list is longer than the screen. Its
    // real bottom is somewhere below, and <body>'s padding-bottom guards the
    // document's end. Only elements that TERMINATE inside the viewport can be
    // sitting on an inset.
    const runsPastBottom = it.y + it.h > VH + 1;
    const runsPastRight = it.x + it.w > VW + 1;
    const runsPastTop = it.y < -1;
    const runsPastLeft = it.x < -1;

    const edges = [];
    if (unsafe.top > 0 && !runsPastTop && it.y < unsafe.top + margin) {
      edges.push({ edge: "top", gapPx: Math.round(it.y - unsafe.top) });
    }
    if (unsafe.bottom > 0 && !runsPastBottom && VH - (it.y + it.h) < unsafe.bottom + margin) {
      edges.push({ edge: "bottom", gapPx: Math.round(VH - (it.y + it.h) - unsafe.bottom) });
    }
    if (unsafe.left > 0 && !runsPastLeft && it.x < unsafe.left + margin) {
      edges.push({ edge: "left", gapPx: Math.round(it.x - unsafe.left) });
    }
    if (unsafe.right > 0 && !runsPastRight && VW - (it.x + it.w) < unsafe.right + margin) {
      edges.push({ edge: "right", gapPx: Math.round(VW - (it.x + it.w) - unsafe.right) });
    }
    // Even where there is no notch (the small Android), a control hard against
    // the physical edge is the founder's "controls touching screen edges".
    if (unsafe.left === 0 && it.interactive && !runsPastLeft && it.x < margin) {
      edges.push({ edge: "left(bare)", gapPx: Math.round(it.x) });
    }
    if (unsafe.right === 0 && it.interactive && !runsPastRight && VW - (it.x + it.w) < margin) {
      edges.push({ edge: "right(bare)", gapPx: Math.round(VW - (it.x + it.w)) });
    }
    if (edges.length === 0) continue;

    const escapes = escapesBody(it.el);
    for (const e of edges) {
      const src = envSources(it.el, e.edge);
      e.envSelf = src.self;
      e.envBody = src.body;
      e.escapesBody = escapes;
      if (e.edge === "top") {
        // ADVISORY BY CONSTRUCTION, and this is a decision the product already
        // made rather than a hole. layout.tsx ships
        // `appleWebApp.statusBarStyle: "black"` — NOT "black-translucent" —
        // so in standalone iOS reserves the status strip and the web view
        // starts below it; in a Safari tab the browser's own chrome owns that
        // band. Either way env(safe-area-inset-top) is 0 on this app, which is
        // exactly why globals.css pays back left/right/bottom on <body> and
        // deliberately not top. The 59px in the device profile is the physical
        // Dynamic Island, not a band this page is ever handed. Padding every
        // screen by 59px to satisfy it would spend 7% of a portrait iPhone on
        // nothing and break the founder's 85% budget.
        e.verdict = "advisory:status-bar-owned";
      } else if (!src.self && escapes) {
        e.verdict = "BLOCKING";     // fixed surface, nobody pays the inset
      } else if (!src.self && !src.body) {
        e.verdict = "BLOCKING";     // in flow, but nothing declares the inset
      } else if (src.self && !escapes && src.body) {
        e.verdict = "advisory:double-inset";
      } else {
        e.verdict = "ok:handled";
      }
    }
    edge.push({
      key: it.key, label: it.label, interactive: it.interactive, pos: it.pos,
      escapesBody: escapes,
      rect: { x: it.x, y: it.y, w: it.w, h: it.h }, edges,
      blocking: edges.some((e) => e.verdict === "BLOCKING"),
    });
  }
  const edgeBlocking = edge.filter((e) => e.blocking);

  // ------------------------------------------------------------ 2. MARGINS
  // "uneven margins". The narrowest gap to the left edge versus the narrowest
  // gap to the right, over everything that paints and is not full-bleed. A
  // symmetric layout answers with the same number twice.
  let minLeft = Infinity, minRight = Infinity, leftBy = null, rightBy = null;
  for (const it of items) {
    if (!it.paints && !it.interactive) continue;
    if (it.w >= VW - 1) continue; // full-width bands have no side margin to be uneven
    if (it.x < minLeft) { minLeft = it.x; leftBy = it; }
    const gr = VW - (it.x + it.w);
    if (gr < minRight) { minRight = gr; rightBy = it; }
  }
  const margins = {
    minLeftPx: Number.isFinite(minLeft) ? Math.round(minLeft * 10) / 10 : null,
    minRightPx: Number.isFinite(minRight) ? Math.round(minRight * 10) / 10 : null,
    leftBy: leftBy ? { key: leftBy.key, label: leftBy.label } : null,
    rightBy: rightBy ? { key: rightBy.key, label: rightBy.label } : null,
  };
  margins.deltaPx =
    margins.minLeftPx === null || margins.minRightPx === null
      ? null
      : Math.round(Math.abs(margins.minLeftPx - margins.minRightPx) * 10) / 10;

  // -------------------------------------------------------- 3. UNREACHABLE
  //
  // BELOW THE FOLD IS NOT THE SAME AS OUT OF REACH, and the difference is
  // whether anything between the element and the viewport can scroll. The edge
  // audit above deliberately ignores elements that run past the viewport — on a
  // long list that is just the fold. But an element that overflows a container
  // with `overflow: hidden`, inside a `fixed` layer that is exactly viewport
  // height, is not below the fold: it is GONE, and no gesture brings it back.
  //
  // Found by looking rather than by measuring: the nav drawer is `inset-y-0`,
  // so it is 393px tall on a landscape iPhone, and nine nav rows plus „Изход"
  // do not fit. „Настройки" rendered 100px past the bottom edge and „Изход"
  // 173px past it, with nothing to scroll.
  // SCROLLING THE DOCUMENT DOES NOT MOVE A FIXED LAYER, and treating it as if it
  // did made this check unable to report the one defect it was written for. The
  // clause below used to be unconditional: `if (documentScrolls) scrollable =
  // true`. Every dashboard surface scrolls its document, so the nav drawer's
  // „Изход" — 173px below the bottom of a `fixed inset-0` layer, which no gesture
  // on earth brings back — was laundered into "reachable" on exactly the screens
  // it was broken on. A `position: fixed` ancestor pins the element to the
  // viewport, so once the walk crosses one, only scrollers AT OR BELOW that layer
  // can still save it; the page behind it is irrelevant.
  const unreachable = [];
  for (const it of [...items, ...offscreenInteractive]) {
    if (!it.interactive) continue;
    const past = Math.round(Math.max(it.y + it.h - VH, -it.y, it.x + it.w - VW, -it.x));
    if (past <= 1) continue;
    let scrollable = false;
    let pinnedToViewport = getComputedStyle(it.el).position === "fixed";
    for (let n = it.el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (
        /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1
      ) { scrollable = true; break; }
      if (
        /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1
      ) { scrollable = true; break; }
      if (cs.position === "fixed") pinnedToViewport = true;
      if (n === document.body) break;
    }
    // The document itself scrolling counts too — but only for content the
    // document actually carries.
    if (!scrollable && !pinnedToViewport) {
      const se = document.scrollingElement || document.documentElement;
      if (se.scrollHeight > se.clientHeight + 1) scrollable = true;
    }
    if (!scrollable) {
      unreachable.push({ key: it.key, label: it.label, pastPx: past, pinnedToViewport });
    }
  }

  // ----------------------------------------------------------- 4. OVERLAPS
  // Two controls a thumb can hit at once. Ancestor/descendant pairs are normal
  // (a button inside a bar), so only SIBLING-disjoint pairs are reported.
  const inter = items.filter((i) => i.interactive);
  const overlaps = [];
  for (let a = 0; a < inter.length; a += 1) {
    for (let b = a + 1; b < inter.length; b += 1) {
      const A = inter[a], B = inter[b];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 1 && oy > 1) {
        overlaps.push({
          a: { key: A.key, label: A.label }, b: { key: B.key, label: B.label },
          overlapPx: Math.round(ox * oy),
        });
      }
    }
  }

  // A stricter, more honest version of the same question: aim at the control's
  // centre and ask the DOM what is actually there. Whatever answers is what a
  // thumb hits. (routes.mjs already found one popup button a real thumb misses.)
  const occluded = [];
  for (const it of inter) {
    if (it.inOverlay) continue; // a modal deliberately covers the page under it
    const cx = Math.round(it.x + it.w / 2);
    const cy = Math.round(it.y + it.h / 2);
    if (cx < 0 || cy < 0 || cx >= VW || cy >= VH) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (hit === it.el || it.el.contains(hit) || hit.contains(it.el)) continue;
    occluded.push({
      key: it.key, label: it.label,
      hitBy: (hit.getAttribute("aria-label") || hit.className || hit.tagName).toString().slice(0, 60),
    });
  }

  // ------------------------------------------------------------- 5. SCROLL
  const se = document.scrollingElement || document.documentElement;

  return {
    phase,
    viewport: {
      width: VW, height: VH,
      visual: window.visualViewport
        ? { width: Math.round(window.visualViewport.width), height: Math.round(window.visualViewport.height) }
        : null,
    },
    insets: { profile: safeArea, env: envInsets, effective: unsafe },
    document: {
      scrollX: Math.round(se.scrollWidth - se.clientWidth),
      scrollY: Math.round(se.scrollHeight - se.clientHeight),
    },
    counts: { elements: items.length, interactive: inter.length },
    edge,
    edgeBlocking,
    margins,
    // REPORT WHAT YOU MEASURE. `unreachable` was computed here and then left out
    // of this object, so the one defect it exists to catch — a control rendered
    // outside a container that cannot scroll — was calculated on every surface,
    // on every device, and thrown away. It is the exact failure mode the README
    // says this harness exists to end ("a check that silently measures nothing"),
    // and it hid a real one: the nav drawer is `inset-y-0`, i.e. 393px tall in
    // landscape, and „Настройки" and „Изход" rendered 100px and 173px past its
    // bottom edge with nothing to scroll. That was found by LOOKING at a capture,
    // which is not a thing a sweep is allowed to depend on.
    unreachable,
    overlaps,
    occluded,
    // The snapshot itself, for the before/after diff. `el` cannot cross the
    // bridge, so it is stripped here rather than in every caller.
    snapshot: items.map(({ el, ...rest }) => rest),
  };
}

// =============================================================================
// SETTLING — because a fixed sleep against an async re-render measures the sleep.
//
// The portrait driving shell publishes its own height from `visualViewport`
// through React state (LessonPlayShell's useVisualViewportHeight), so after the
// viewport changes there is a window in which the DOM knows the new size and the
// shell has not re-rendered at it yet. Traced on this box with
// tools/mobile/toolbar-trace.mjs: at +100ms after the restore, --sim-vh was still
// 762px against a 852px viewport; by +700ms it was 852px and correct.
//
// The probe waited exactly 700ms. So the same code, the same app and the same
// device reported `shift(toolbar) = 0` on one run and `90` on the next — a 90px
// displacement of the cluster, the speedometer and the menu buttons that existed
// only inside the measuring instrument's own timing. Raising the sleep to 2s
// would have "fixed" it and would have been laundering: the honest instrument
// waits for the layout to STOP MOVING, and then reports how long that took, so a
// genuinely slow reflow shows up as the number it is instead of hiding under a
// longer sleep.
// =============================================================================

// THE MEASUREMENT ITSELF NOW LIVES IN lib/settle.mjs, and it lives there so it
// can be TESTED. `settleBody` is driven against a fake document in
// settle.test.mjs — a document whose geometry stops changing at a known sample
// and whose clock is under the test's control — which is the only way to prove
// that the number this probe reports is the app's and not the probe's. Every
// one of the four defects found in this instrument survived because the
// instrument had no test that could see it from outside.
//
// `appMs` is THE metric. `s.ms` is still recorded and still printed, and
// nothing scores against it.

/** Median of a numeric list. Empty list -> 0. */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// =============================================================================
// The Node half.
// =============================================================================

/**
 * Compare two snapshots by key. Overlay-internal elements are excluded.
 *
 * POSITION IS THE VERDICT; SIZE IS REPORTED BESIDE IT. The founder's words are
 * "elements shifting position" and "elements moving when popups appear" — an
 * element that stays exactly where it is and gets TALLER because the menu it
 * owns just opened inside it has not moved, and nothing on the page moved with
 * it. Scoring dx/dy and dw/dh together made the driving screen's own micro menu
 * read as a 304.5px shift on every device, at dx0 dy0, which is a number that
 * describes the measuring instrument rather than the layout. So `worstPx` is
 * max(|dx|, |dy|) and growth is carried separately as `grewPx`.
 */
function diff(before, after, { includeOverlay = false } = {}) {
  const a = new Map(before.map((i) => [i.key, i]));
  const moves = [];
  const grew = [];
  for (const it of after) {
    if (!includeOverlay && (it.inOverlay || a.get(it.key)?.inOverlay)) continue;
    const was = a.get(it.key);
    if (!was) continue;
    const dx = Math.abs(it.x - was.x);
    const dy = Math.abs(it.y - was.y);
    const dw = Math.abs(it.w - was.w);
    const dh = Math.abs(it.h - was.h);
    const record = {
      key: it.key, label: it.label,
      dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10,
      dw: Math.round(dw * 10) / 10, dh: Math.round(dh * 10) / 10,
      from: { x: was.x, y: was.y, w: was.w, h: was.h },
      to: { x: it.x, y: it.y, w: it.w, h: it.h },
    };
    const moved = Math.max(dx, dy);
    if (moved > SHIFT_TOLERANCE_PX) moves.push({ ...record, worst: Math.round(moved * 10) / 10 });
    else if (Math.max(dw, dh) > SHIFT_TOLERANCE_PX) grew.push(record);
  }
  moves.sort((p, q) => q.worst - p.worst);
  return {
    compared: a.size,
    moved: moves.length,
    worstPx: moves[0]?.worst ?? 0,
    moves: moves.slice(0, 12),
    resized: grew.length,
    resizes: grew.slice(0, 6),
  };
}

const args = parseArgs(process.argv.slice(2));
const engine = engineByName(args.engine || "webkit");
const url = args.baseUrl || process.env.KNIJKA_MOBILE_BASE_URL || "http://localhost:3520";
const devices = resolveDevices(
  args.devices.length > 0
    ? args.devices
    : ["iphone16-portrait", "iphone16-landscape", "small-portrait", "small-landscape"],
);
const surfaces =
  args.routes.length > 0 ? SURFACES.filter((s) => args.routes.includes(s.id)) : SURFACES;
const REPEAT = args.repeat ?? 1;
const MOTION = resolveMotion(args.motion ?? "reduce");

mkdirSync(OUT_DIR, { recursive: true });

const injectedCss = args.injectCss ? readFileSync(args.injectCss, "utf8") : null;
if (injectedCss) {
  console.log(
    `[stability] INJECTING ${args.injectCss} into every page — this is a NEGATIVE CONTROL run. ` +
      `Findings below describe the injected regression, not the shipped app.`,
  );
}

const credentials =
  process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
    ? { email: process.env.KNIJKA_MOBILE_EMAIL, password: process.env.KNIJKA_MOBILE_PASSWORD }
    : await ensureHarnessUser();

/**
 * Compile from NODE first: a fetch has no navigation timeout and no service
 * worker in front of it. See lib/measure.mjs warmRoutes for the long version.
 *
 * "NO NAVIGATION TIMEOUT" USED TO MEAN NO TIMEOUT AT ALL, AND THAT IS A WAY TO
 * LOSE A WHOLE SWEEP IN SILENCE. Measured here on 2026-08-05: Turbopack began a
 * `filesystem cache database compaction` that ran for 7.0 minutes, the dev
 * server stopped answering, and this `fetch` sat on the open connection with no
 * deadline and nothing printed. The run was killed at 15.5 minutes having
 * produced zero output and zero CPU — indistinguishable, from outside, from a
 * slow compile. A sweep that can hang forever without saying so is the same
 * class of defect as a number that includes its own instrument: the failure is
 * invisible from inside the thing it breaks.
 *
 * So: a deadline, generous enough for a genuine cold compile on a mechanical
 * disk, and a line printed BEFORE the wait as well as after it.
 *
 * AND THE LADDER THIS SITS IN IS LONG, WHICH IS WORTH SAYING OUT LOUD RATHER
 * THAN DISCOVERING. `gotoAuthenticated` retries three times and re-warms
 * between attempts, so a single iteration against a sick dev server can spend
 * 3x180 s of navigation plus 2x420 s of warming — about 20 minutes — before it
 * gives up. Observed on 2026-08-05: one landscape iteration sat there for 18
 * minutes. That is FINITE and, thanks to the heartbeat below, VISIBLE, which
 * are the two properties it did not have before. It is not fast, and a sweep
 * whose box is in that state should be re-run rather than believed.
 */
const WARM_TIMEOUT_MS = Number(process.env.KNIJKA_WARM_TIMEOUT_MS || 420_000);
async function warm(target, cookie = "") {
  const t0 = Date.now();
  console.log(`[stability] warming ${target} (up to ${Math.round(WARM_TIMEOUT_MS / 1000)}s)…`);
  try {
    const res = await fetch(target, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
    });
    await res.arrayBuffer();
    console.log(`[stability] warmed ${target} -> ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(
      `[stability] warm ${target} failed after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message}` +
        (e?.name === "TimeoutError"
          ? " — the dev server did not answer. It is probably compacting its Turbopack cache; that has" +
            " been measured at 7 minutes on this box. The sweep continues; the navigation will retry."
          : ""),
    );
  }
}

/**
 * SAY SOMETHING WHILE YOU WAIT. A row can legitimately take minutes, and the
 * only thing worse than a slow probe is a slow probe that looks like a hung one
 * — every stall in this harness's history was first diagnosed by killing a run
 * that had printed nothing for a quarter of an hour.
 */
function heartbeat(label, everyMs = 30_000) {
  const t0 = Date.now();
  const timer = setInterval(() => {
    console.log(`[stability] …still in ${label} after ${Math.round((Date.now() - t0) / 1000)}s`);
  }, everyMs);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}

// -----------------------------------------------------------------------------
// THE RUN, DECLARED BEFORE IT STARTS AND AGAIN WHEN IT ENDS.
//
// Every parameter that can change what a number means goes here, printed, in
// one block. `motion` is on this list because it was NOT on any list: it was
// hard-coded to "reduce" in lib/devices.mjs on every profile, and a reader of
// the resulting table had no way to know that the app's animations had been
// switched off before it was measured.
// -----------------------------------------------------------------------------
const runBanner = () =>
  [
    `RUN — ${engine.name} @ ${url}`,
    `  motion=${MOTION.id}      ${MOTION.says}`,
    `  repeat=${REPEAT}  devices=${devices.map((d) => d.id).join(",")}  routes=${surfaces.map((s) => s.id).join(",")}`,
    `  settle budget ${SETTLE_BUDGET_MS} ms, measured as atRestMs IN-PAGE — the probe's own bridge`,
    `  crossings are outside the metric, and their share of each sample is printed beside it.`,
    `  patience: navigation ${Math.round(NAV_BUDGET_MS / 1000)}s TOTAL across every retry, world ` +
      `${Math.round(WORLD_TIMEOUT_MS / 1000)}s, warm ${Math.round(WARM_TIMEOUT_MS / 1000)}s.`,
    `  A run that exceeds its budget is LOST and says so; a slow one reports itself every 30s.`,
  ].join("\n");
console.log(`\n${runBanner()}\n`);

await warm(new URL("/login", url).toString());

const probeArgs = (device, phase) => ({
  safeArea: device.safeArea,
  margin: EDGE_MARGIN_PX,
  phase,
});

const browser = await engine.launcher.launch();
const rows = [];
let storageState;

try {
  for (const device of devices) {
    const context = await browser.newContext({
      ...contextOptions(device, { motion: MOTION.id }),
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(180_000);

    try {
      if (!storageState) {
        await signIn(page, credentials, url);
        storageState = await context.storageState();
        const cookies = await context.cookies();
        const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        for (const s of surfaces) await warm(new URL(s.path, url).toString(), cookie);
      }

      for (const surface of surfaces) {
       const iterations = [];
       for (let iteration = 1; iteration <= REPEAT; iteration += 1) {
        const row = { route: surface.id, device: device.id, ok: false, iteration };
        // Hoisted out of the try so the FAILURE path can name its frame too.
        const suffix = REPEAT > 1 ? `__i${String(iteration).padStart(2, "0")}` : "";
        const stopBeat = heartbeat(`${surface.id} · ${device.id} · run #${iteration}`);
        try {
          await gotoAuthenticated(page, url, surface);
          if (surface.waitFor) {
            await page.waitForSelector(surface.waitFor, { timeout: 180_000, state: "attached" });
          }
          if (injectedCss) await page.addStyleTag({ content: injectedCss });
          // Dismiss whatever is already up, BEFORE the world wait. The driving
          // shell opens with a full-screen `role="dialog"`, and this probe has
          // no evidence that such a dialog leaves the canvas visible — waiting
          // for a rendered street from behind an opaque modal would refuse
          // every row forever, which is not honesty, it is just a probe that
          // is switched off. So: clear it first, wait second, and clear again
          // afterwards (below) for anything that mounted during the wait.
          if (surface.prepare) await surface.prepare(page);

          // ---- THE WORLD HAS TO BE UP BEFORE ANYTHING IS RECORDED ---------
          // `waitFor: "canvas"` is satisfied by an attached, empty, black
          // rectangle, and `settleMs` is a guess. Together they are why every
          // number this probe ever produced for the driving shell described a
          // LOADING SCREEN: black canvas, „Зареждане на улицата със зебра…",
          // a live „Compiling …" badge — and geometry that settles beautifully,
          // because nothing was moving, because nothing was there.
          //
          // So the canvas is asked, in pixels (lib/ready.mjs). The wait is
          // reported separately and is NEVER part of a settle number: settle
          // measures what happens AFTER a state change on a live screen.
          if (surface.requiresWorld) {
            const world = await waitForWorld(page, {
              timeoutMs: WORLD_TIMEOUT_MS,
              onStep: (s) =>
                process.stdout.write(
                  `\r      [world] ${String(s.at).padStart(6)}ms ` +
                    `${s.ok ? "RENDERED" : `waiting — ${s.reason}`}`.padEnd(96),
                ),
            });
            process.stdout.write("\n");
            row.world = {
              ready: world.ready,
              ms: world.ms,
              reads: world.reads,
              vitals: world.vitals,
              timeline: world.timeline,
            };
            if (!world.ready) {
              // REFUSING IS THE POINT. A row recorded here would be a row about
              // a shell, and a shell's geometry is clean, symmetric and fast —
              // it passes every budget this file owns while telling the founder
              // nothing about the product.
              throw new Error(
                `the 3D world never rendered within ${Math.round(world.ms / 1000)}s ` +
                  `(${world.reason}) — refusing to record a sample of the loading screen`,
              );
            }
          }

          // ---- AND AGAIN, FOR WHAT MOUNTED DURING THE WAIT ----------------
          // `prepare` running ONLY before the wait was half a check: it cannot
          // dismiss a dialog React has not mounted yet, so on a slow cold load
          // it found nothing, returned happily, and the intro popup then
          // appeared over the world and was measured as part of the road.
          // Running it a second time closes that window. It is idempotent —
          // it clicks until nothing is left to click — and its refusal ("a
          // modal is still open, this is the intro state, not the road") now
          // fires against a shell that has actually finished starting, which
          // is the only time that refusal means anything.
          if (surface.prepare) await surface.prepare(page);

          await page.waitForTimeout(surface.settleMs ?? 1200);
          row.settle = { base: await settle(page) };

          // REFUSE TO MEASURE AN ERROR BOUNDARY. app/error.tsx renders a
          // perfectly well-behaved little panel — correct margins, no overflow,
          // nothing near an edge — so a route whose server component threw
          // scores CLEAN and hands back a row that looks exactly like data.
          // This box's dev database is a 10-slot PGlite shared by every lane
          // and it goes to its cap regularly, so /dashboard alternated 200 and
          // 500 across a single sweep. Same refusal as gotoAuthenticated's for
          // the service worker's offline page, and for the same reason.
          const boundary = await page
            .evaluate(() => /Системен доклад[\s\S]{0,80}Нещо се обърка/.test(document.body?.innerText || ""))
            .catch(() => false);
          if (boundary) {
            throw new Error(
              `${surface.path} rendered the error boundary („Нещо се обърка") — refusing to ` +
                `report an error panel's geometry as ${surface.id}. Usually the shared dev ` +
                `database at its connection cap; re-run this route.`,
            );
          }

          // ---- WHICH STEP BLANKS THE CANVAS ------------------------------
          // A row that ends on a black canvas is refused (below), but "it went
          // out somewhere in the middle" is not an actionable finding. This
          // asks the canvas after EVERY phase, so the refusal comes with the
          // gesture that caused it. Deliberately outside every settle window —
          // it is a screenshot, it costs a few hundred ms, and none of it may
          // land in a number about the app.
          row.worldPhases = [];
          const worldCheck = async (label) => {
            if (!surface.requiresWorld) return;
            const v = await worldVitals(page);
            const verdict = v.vitals ? isWorldFrame(v.vitals) : { ok: false, reason: v.reason };
            row.worldPhases.push({
              phase: label,
              ok: verdict.ok,
              reason: verdict.reason,
              distinct: v.vitals?.distinct ?? null,
              darkShare: v.vitals?.darkShare ?? null,
              busyShare: v.vitals?.busyShare ?? null,
            });
          };
          await worldCheck("after-base-settle");

          const base = await page.evaluate(stabilityBody, probeArgs(device, "base"));
          Object.assign(row, {
            viewport: base.viewport, insets: base.insets, document: base.document,
            counts: base.counts, edge: base.edge, edgeBlocking: base.edgeBlocking,
            margins: base.margins, overlaps: base.overlaps, occluded: base.occluded,
            unreachable: base.unreachable,
          });

          // ---- THE POPUP TEST -------------------------------------------
          // The mobile drawer is the one overlay every dashboard surface has,
          // so it is the cross-cutting probe. On the driving shell the lesson
          // menu plays the same role.
          // `.first()` on a union selector picks the first in DOM ORDER, which
          // is not the same as the first one a thumb can reach: the app topbar's
          // hamburger comes earlier in the document than the driving shell's
          // lesson menu, and inside the simulator it is `display: none`. Taking
          // `.first()` there silently skipped the popup test on every driving
          // row and reported it as "-", i.e. as a pass-shaped non-answer. Ask
          // each candidate whether it is actually visible.
          let trigger = null;
          for (const selector of [
            'header[data-app-topbar] button[aria-controls="mobile-nav"]',
            'button[aria-label="Меню на урока"]',
          ]) {
            const candidate = page.locator(selector).first();
            if (await candidate.isVisible().catch(() => false)) { trigger = candidate; break; }
          }
          // A trigger Playwright REFUSES to click is a finding, not a reason to
          // abandon the whole row: `elementFromPoint` at its centre returns
          // something else, i.e. a real thumb would miss too. Record it and
          // carry on measuring everything that does not need the popup.
          let opened = false;
          if (trigger !== null) {
            try {
              await trigger.click({ timeout: 20_000 });
              opened = true;
            } catch {
              row.overlayTriggerUntappable = true;
            }
          } else {
            row.overlayTriggerMissing = true;
          }
          if (opened) {
            row.settle.overlayOpen = await settle(page);
            await worldCheck("after-overlay-open");
            const open = await page.evaluate(stabilityBody, probeArgs(device, "overlay-open"));
            row.overlayEdge = open.edge;
            row.overlayEdgeBlocking = open.edgeBlocking;
            row.overlayOverlaps = open.overlaps;
            row.overlayOccluded = open.occluded;
            // The drawer's own rows only exist in THIS phase, so the base
            // measurement can never see them. Measuring reachability only at
            // rest is why the „Изход" that fell off the landscape drawer had to
            // be found by eye.
            row.overlayUnreachable = open.unreachable;
            row.shiftOnOpen = diff(base.snapshot, open.snapshot);

            // ---- THE CLOSE -------------------------------------------------
            // ESCAPE IS NOT A DISMISS KEY ON THE DRIVING SHELL, and this phase
            // is the one the whole settle budget is judged on.
            //
            // This used to be `page.keyboard.press("Escape")`. On
            // simulator-drive that keystroke does not close the lesson menu:
            // modules/sim/engine/input.ts:272 binds Escape to
            // `onTogglePause()`, documented at line 14 as "Escape — pause
            // menu". So the phase named `overlayClose` left the menu open and
            // MOUNTED THE „Пауза" MODAL ON TOP OF IT — it was measuring a
            // second overlay OPENING, and the number it produced (the worst
            // phase, the one that decided a 1,200 ms verdict by 10 ms) was
            // about a dialog appearing, not about a layout coming to rest
            // after a dismissal. Three consecutive captures show it: the menu
            // still open, „Пауза" over it, in the frame taken at the END of
            // the row.
            //
            // So: close it the way a student does — toggle the control that
            // opened it — and then PROVE the overlay count actually went down.
            // A close phase that did not close anything is reported as such
            // instead of being averaged into the budget.
            const overlayCount = () =>
              page
                .evaluate(() => {
                  let n = 0;
                  for (const el of document.querySelectorAll(
                    '[role="dialog"],[data-sim-overlay],[aria-modal="true"]',
                  )) {
                    const cs = getComputedStyle(el);
                    if (cs.display === "none" || cs.visibility === "hidden") continue;
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) n += 1;
                  }
                  return n;
                })
                .catch(() => -1);

            const openCount = await overlayCount();
            await trigger.click({ timeout: 20_000 }).catch(() => {});
            row.settle.overlayClose = await settle(page);
            await worldCheck("after-overlay-close");
            let closedCount = await overlayCount();

            // The toggle is the honest first choice, but not every surface has
            // one that closes. Fall back to the overlay's own dismiss control —
            // and to NOTHING after that. There is deliberately no Escape
            // fallback: on this route Escape OPENS the pause menu, so a
            // "fallback" would re-create the exact defect this block exists to
            // remove, and would do it only on the runs where the honest close
            // had already failed — i.e. it would hide the finding. Which
            // gesture was needed is recorded, because "the menu needs two
            // different gestures to shut" is itself a finding about the screen.
            // PAGE-WIDE, not scoped to the dialog: on the driving shell the
            // control that opens the lesson menu RELABELS itself to „Затвори"
            // while the menu is up, so it is neither the original trigger
            // (its aria-label changed) nor a descendant of the panel.
            if (closedCount >= openCount && closedCount !== -1) {
              const dismiss = page
                .locator('button[aria-label*="атвор" i], button:has-text("Затвори")')
                .first();
              if (await dismiss.isVisible().catch(() => false)) {
                await dismiss.click({ timeout: 10_000 }).catch(() => {});
                row.overlayClosedBy = "dismiss-button";
                closedCount = await overlayCount();
              }
            }
            if (closedCount >= openCount && closedCount !== -1) {
              row.overlayCloseFailed = true;
              row.overlayCloseCounts = { open: openCount, afterClose: closedCount };
            } else {
              row.overlayClosedBy = row.overlayClosedBy ?? "trigger-toggle";
            }

            const closed = await page.evaluate(stabilityBody, probeArgs(device, "overlay-closed"));
            row.shiftOnClose = diff(base.snapshot, closed.snapshot);
            row.overlayTested = true;
          } else {
            row.overlayTested = false;
          }

          // ---- THE TOOLBAR TEST -----------------------------------------
          // iOS grows the visual viewport when the toolbar collapses. Shrink
          // the layout viewport by the same amount, snapshot, restore.
          const vp = page.viewportSize();
          await page.setViewportSize({ width: vp.width, height: Math.max(240, vp.height - TOOLBAR_PX) });
          row.settle.toolbarShown = await settle(page);
          await worldCheck("after-viewport-shrink");
          const shrunk = await page.evaluate(stabilityBody, probeArgs(device, "toolbar-shown"));
          // WHAT COUNTS AS "CLIPPED BY THE TOOLBAR". Content that runs past the
          // fold on a scrolling page is not clipped, it is below the fold — the
          // student scrolls. The defect is a PINNED control (fixed/sticky, the
          // things that are supposed to stay reachable) that the smaller
          // viewport cuts off, because no amount of scrolling brings that back.
          const cutOff = (i) => i.interactive && i.y + i.h > shrunk.viewport.height + 1;
          row.toolbar = {
            shrunkTo: shrunk.viewport,
            edgeBlocking: shrunk.edgeBlocking.length,
            clippedPinned: shrunk.snapshot.filter(
              (i) => cutOff(i) && (i.pos === "fixed" || i.pos === "sticky"),
            ).length,
            clippedFlow: shrunk.snapshot.filter((i) => cutOff(i) && i.pos !== "fixed" && i.pos !== "sticky").length,
            docScrollY: shrunk.document.scrollY,
          };
          await page.setViewportSize(vp);
          row.settle.toolbarHidden = await settle(page);
          await worldCheck("after-viewport-restore");
          const restored = await page.evaluate(stabilityBody, probeArgs(device, "toolbar-hidden"));
          row.shiftOnToolbar = diff(base.snapshot, restored.snapshot);

          // ---- AND WAS THE WORLD STILL THERE AT THE END? -------------------
          // THE GATE AT THE TOP OF THE ROW IS HALF A GATE. Everything that
          // decides this row happens AFTER it: two overlay toggles and two
          // viewport resizes, each of which tears down and rebuilds the WebGL
          // drawing buffer. A canvas that rendered a street at second 40 and
          // has been black ever since would still be reported as a measurement
          // of the road, and the capture written at the bottom of this block —
          // the one artefact a human ever opens — would show the black.
          //
          // That is exactly how row C8's frames came to exist. So the canvas is
          // asked a SECOND time, in the same pixels, at the moment the capture
          // is taken; the row is refused if the answer changed. This is the
          // „open a capture and see a street" check, mechanised, so that it
          // stops depending on somebody remembering to look.
          if (surface.requiresWorld) {
            const end = await worldVitals(page);
            const verdict = end.vitals ? isWorldFrame(end.vitals) : { ok: false, reason: end.reason };
            row.worldAtEnd = { ok: verdict.ok, reason: verdict.reason, vitals: end.vitals };
            await page
              .screenshot({
                path: join(
                  OUT_DIR,
                  `${verdict.ok ? "" : "ENDED-BLANK__"}${surface.id}__${device.id}${suffix}.png`,
                ),
              })
              .catch(() => {});
            if (!verdict.ok) {
              throw new Error(
                `the world was up when this row started and is NOT up in the frame the row ends on ` +
                  `(${verdict.reason}) — every geometry number above describes a screen the student ` +
                  `never sees. Capture: ENDED-BLANK__${surface.id}__${device.id}${suffix}.png`,
              );
            }
          } else {
            await page.screenshot({ path: join(OUT_DIR, `${surface.id}__${device.id}${suffix}.png`) });
          }
          row.ok = true;
        } catch (error) {
          row.error = String(error?.message || error).split("\n")[0];
          // THE SUFFIX MATTERS. Without it every failed iteration wrote to the
          // same path, so a 4-run sweep that lost run #04 kept ONE image — and
          // if two runs failed, only the last one's evidence survived. The run
          // that has to be explained is precisely the one that was overwritten.
          await page
            .screenshot({ path: join(OUT_DIR, `FAILED__${surface.id}__${device.id}${suffix}.png`) })
            .catch(() => {});
        } finally {
          stopBeat();
        }
        iterations.push(row);
        const tag = REPEAT > 1 ? `#${String(iteration).padStart(2, "0")} ` : "";
        console.log(
          row.ok
            ? `  ${tag}${row.route.padEnd(18)} ${row.device.padEnd(20)} ` +
              `edge=${row.edgeBlocking.length}/${row.edge.length} ` +
              `+overlay=${row.overlayEdgeBlocking ? row.overlayEdgeBlocking.length : "-"} ` +
              `margins=${row.margins.minLeftPx}/${row.margins.minRightPx} ` +
              `unreach=${row.unreachable.length}/${row.overlayUnreachable ? row.overlayUnreachable.length : "-"} ` +
              `overlap=${row.overlaps.length} occl=${row.occluded.length} ` +
              `shift(open)=${row.shiftOnOpen ? row.shiftOnOpen.worstPx : "-"} ` +
              `shift(close)=${row.shiftOnClose ? row.shiftOnClose.worstPx : "-"} ` +
              `shift(toolbar)=${row.shiftOnToolbar.worstPx} clip=${row.toolbar.clippedPinned}/${row.toolbar.clippedFlow}` +
              (REPEAT > 1
                ? `  settle(app)=${Object.values(row.settle).map((s) => appMs(s) ?? "NONE").join("/")}`
                : "")
            : `  ${tag}${row.route.padEnd(18)} ${row.device.padEnd(20)} ERROR ${row.error}`,
        );
       }
       // ONE ROW PER SURFACE STILL, so every existing reader of this report
       // keeps working. The reported row is the LAST successful iteration — but
       // the settle verdict below is taken over ALL of them, because a budget
       // that only has to be met on the run you happened to keep is not a
       // budget. `settleRuns` carries every sample so the spread is auditable.
       const ok = iterations.filter((r) => r.ok);
       const chosen = ok.length > 0 ? ok[ok.length - 1] : iterations[0];
       chosen.iterations = iterations.length;
       chosen.iterationsOk = ok.length;
       // ONLY the runs that were accepted may be SCORED. That is the whole
       // point of the refusal, and widening it here would undo it.
       chosen.settleRuns = ok.map((r) => r.settle);
       // …but a refused run still took measurements, and throwing them away
       // makes a refusal unreadable ("something went wrong somewhere"). They are
       // kept under a name nothing scores, paired with what the canvas was doing
       // at each checkpoint, and printed in a section that says REFUSED on every
       // line. Diagnosis, never data.
       chosen.refused = iterations
         .filter((r) => !r.ok)
         .map((r) => ({
           iteration: r.iteration,
           error: r.error,
           settle: r.settle ?? {},
           worldPhases: r.worldPhases ?? [],
         }));
       // EVERY iteration's world wait, failed ones included — that is where the
       // evidence lives when a run is lost. `chosen.world` alone would describe
       // only the run that happened to survive.
       chosen.worldRuns = iterations
         .filter((r) => r.world)
         .map((r) => ({ iteration: r.iteration, ready: r.world.ready, ms: r.world.ms, reads: r.world.reads }));
       // ALWAYS, not `if (iterations.length > 1)`. A single run that was lost is
       // 100% of the sample gone, and the old guard meant the ONE case where
       // the loss is total was the one case that recorded no reason for it.
       chosen.iterationErrors = iterations.filter((r) => !r.ok).map((r) => `#${r.iteration} ${r.error}`);
       rows.push(chosen);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

// ------------------------------------------------------- ORIENTATION AGREEMENT
// "different layouts between devices or orientations". Same route, same phone,
// two orientations: do the same things exist?
const orientationPairs = [
  ["iphone16-portrait", "iphone16-landscape"],
  ["small-portrait", "small-landscape"],
];
const orientation = [];
for (const [p, l] of orientationPairs) {
  for (const surface of surfaces) {
    const rp = rows.find((r) => r.route === surface.id && r.device === p && r.ok);
    const rl = rows.find((r) => r.route === surface.id && r.device === l && r.ok);
    if (!rp || !rl) continue;
    orientation.push({
      route: surface.id,
      pair: `${p} | ${l}`,
      elements: `${rp.counts.elements} | ${rl.counts.elements}`,
      interactive: `${rp.counts.interactive} | ${rl.counts.interactive}`,
      interactiveDelta: Math.abs(rp.counts.interactive - rl.counts.interactive),
      edge: `${rp.edge.length} | ${rl.edge.length}`,
      margins: `${rp.margins.minLeftPx}/${rp.margins.minRightPx} | ${rl.margins.minLeftPx}/${rl.margins.minRightPx}`,
    });
  }
}

// A NEGATIVE-CONTROL RUN MUST NOT BE ABLE TO POSE AS THE REPORT. `--inject-css`
// deliberately breaks the app, and writing that to `stability.json` puts a file
// full of real-looking findings exactly where anything reading this harness looks
// for the verdict — the same "it looks like data" failure the auth and offline
// refusals exist to prevent. It has already happened once: two fixture runs
// overwrote a clean 24-row sweep with one injected row.
const report = {
  engine: engine.name,
  baseUrl: url,
  at: new Date().toISOString(),
  injectedCss: args.injectCss ?? null,
  // THE RUN'S OWN PARAMETERS, IN THE ARTEFACT. A JSON that does not say whether
  // animations were playing cannot be re-read six weeks later, and this one
  // could not: `reducedMotion` was a constant in another file.
  run: {
    motion: MOTION.id,
    motionMeans: MOTION.says,
    colorScheme: "dark",
    repeat: REPEAT,
    settleBudgetMs: SETTLE_BUDGET_MS,
    settleMetric: "atRestMs — measured in-page; the probe's bridge crossings are outside it",
    instrumentShareLimit: INSTRUMENT_SHARE_LIMIT,
    idlePhase: IDLE_PHASE,
  },
  rows,
  orientation,
};
const reportName = args.injectCss
  ? `stability-INJECTED-${basename(args.injectCss).replace(/\.css$/, "")}.json`
  : "stability.json";
writeFileSync(join(OUT_DIR, reportName), JSON.stringify(report, null, 2));

// ----------------------------------------------------------------- the table
console.log(`\nSTABILITY — ${runBanner().split("\n").slice(1).join("\n")}\n`);
const H = ["route", "device", "edge!", "+ovl!", "margins L/R", "unreach", "ovlp", "occl", "open", "close", "bar", "clip", "app ms", "instr%"];
console.log(
  `  ${H[0].padEnd(18)}${H[1].padEnd(20)}${H[2].padEnd(7)}${H[3].padEnd(7)}${H[4].padEnd(14)}` +
  `${H[5].padEnd(9)}${H[6].padEnd(6)}${H[7].padEnd(6)}${H[8].padEnd(7)}${H[9].padEnd(7)}${H[10].padEnd(6)}${H[11].padEnd(6)}` +
  `${H[12].padEnd(9)}${H[13]}`,
);
let failed = false;
for (const r of rows) {
  // A ROW THAT LOST RUNS IS NOT A CLEAN ROW, AND THAT INCLUDES A ROW THAT LOST
  // ALL OF THEM. The --repeat 4 sweep that produced the last C8 number dropped
  // run #04 in BOTH passes and still printed a table with no mark on it: 25% of
  // the sample gone, and the one surviving artefact was a quieter number.
  // Losing a sample is a finding about the measurement, so it fails the row the
  // same way an overlap does — and it is printed BEFORE the `!r.ok` bail-out,
  // which used to `continue` past it whenever every run of a row was lost.
  if (r.iterations && r.iterationsOk < r.iterations) {
    failed = true;
    console.log(
      `  ${r.route.padEnd(18)}${r.device.padEnd(20)}` +
        `LOST ${r.iterations - r.iterationsOk}/${r.iterations} RUNS — ${(r.iterationErrors ?? []).join(" | ")}`,
    );
  }
  if (!r.ok) { failed = true; console.log(`  ${r.route.padEnd(18)}${r.device.padEnd(20)}ERROR ${r.error}`); continue; }
  const overlayEdge = r.overlayEdgeBlocking ? r.overlayEdgeBlocking.length : 0;
  const unreach = r.unreachable.length + (r.overlayUnreachable?.length ?? 0);
  // ACROSS EVERY ITERATION, not just the one whose geometry is reported. With
  // --repeat 1 these are identical; with --repeat N a budget that is met on
  // four runs out of five has not been met.
  const settles = (r.settleRuns?.length ? r.settleRuns : [r.settle ?? {}]).flatMap((s) =>
    Object.values(s),
  );
  // THE METRIC IS THE APP NUMBER. `s.ms` — total wall clock, the thing the
  // budget used to be stated against — is still recorded, still printed in the
  // detail, and no longer decides anything: it contained the probe's own bridge
  // crossings, up to 99.2% of a sample. `appMs` is `atRestMs`, timestamped
  // inside the page, which is when the layout was demonstrably no longer
  // moving. A phase that produced no app number at all is NOT a zero.
  const apps = settles.map(appMs);
  const noSample = apps.some((v) => v === null);
  const worstApp = apps.reduce((m, v) => (v === null ? m : Math.max(m, v)), 0);
  const worstShare = settles.reduce((m, s) => Math.max(m, instrumentShare(s)), 0);
  const instrumentBound = worstShare > INSTRUMENT_SHARE_LIMIT;
  const neverSettled = settles.some((s) => !s.settled);
  const bad =
    r.edgeBlocking.length > 0 || overlayEdge > 0 ||
    r.overlaps.length > 0 || r.occluded.length > 0 || unreach > 0 ||
    (r.shiftOnOpen?.worstPx ?? 0) > 0 || (r.shiftOnClose?.worstPx ?? 0) > 0 ||
    r.shiftOnToolbar.worstPx > 0 || r.toolbar.clippedPinned > 0 ||
    (r.margins.deltaPx ?? 0) > 2 ||
    neverSettled || noSample || worstApp > SETTLE_BUDGET_MS;
  if (bad) failed = true;
  r.worstAppSettleMs = noSample ? null : worstApp;
  r.worstSettleMs = settles.reduce((m, s) => Math.max(m, s.ms ?? 0), 0);
  r.instrumentShare = Math.round(worstShare * 1000) / 1000;
  r.neverSettled = neverSettled;
  console.log(
    `  ${r.route.padEnd(18)}${r.device.padEnd(20)}` +
    `${String(r.edgeBlocking.length).padEnd(7)}` +
    `${String(r.overlayEdgeBlocking ? overlayEdge : "-").padEnd(7)}` +
    `${`${r.margins.minLeftPx}/${r.margins.minRightPx}`.padEnd(14)}` +
    `${`${r.unreachable.length}/${r.overlayUnreachable ? r.overlayUnreachable.length : "-"}`.padEnd(9)}` +
    `${String(r.overlaps.length).padEnd(6)}${String(r.occluded.length).padEnd(6)}` +
    `${String(r.shiftOnOpen ? r.shiftOnOpen.worstPx : "-").padEnd(7)}` +
    `${String(r.shiftOnClose ? r.shiftOnClose.worstPx : "-").padEnd(7)}` +
    `${String(r.shiftOnToolbar.worstPx).padEnd(6)}${String(r.toolbar.clippedPinned).padEnd(6)}` +
    `${`${noSample ? "NO SAMPLE" : worstApp}${neverSettled ? "!" : ""}`.padEnd(9)}` +
    `${(worstShare * 100).toFixed(0)}%` +
    (instrumentBound ? "  INSTRUMENT-BOUND" : "") +
    (bad ? "   <--" : ""),
  );
}
console.log("\n  edge!   = BLOCKING safe-area findings (nothing in the CSS pays that inset).");
console.log("  +ovl!   = the same, measured with the popup open. Advisory findings are below.");
console.log("  unreach = controls outside the viewport with NOTHING that scrolls (resting / popup open).");
console.log(
  `  app ms  = worst APP settle across every phase and every run: in-page ms from a state change\n` +
    `            to the layout demonstrably no longer moving (budget ${SETTLE_BUDGET_MS} ms; "!" = a phase\n` +
    `            never came to rest; "NO SAMPLE" = a phase produced no number and this row has no\n` +
    `            verdict in it). This is NOT the old \`settle\` column: that was wall clock and it\n` +
    `            included the probe's own page.evaluate round trips.\n` +
    `  instr%  = the probe's share of the sample it took — bridge crossings plus the cost of its own\n` +
    `            DOM walk inside the page. It is NOT inside "app ms" any more, but past\n` +
    `            ${(INSTRUMENT_SHARE_LIMIT * 100).toFixed(0)}% the row is marked INSTRUMENT-BOUND: the box, not the product, set the pace.`,
);

// ------------------------------------------------------------ WORLD READINESS
// THE EVIDENCE THAT THIS ROW IS ABOUT THE PRODUCT. Without these numbers the
// table below is indistinguishable from the one this probe printed while it was
// measuring a black canvas — and that table looked excellent.
const worldRows = rows.filter((r) => r.world);
if (worldRows.length > 0) {
  console.log("\nWORLD READINESS — the canvas was asked, in pixels, before anything was recorded");
  console.log(
    `  ${"route".padEnd(18)}${"device".padEnd(20)}${"up?".padEnd(6)}${"wait".padEnd(9)}` +
      `${"reads".padEnd(7)}${"colours".padEnd(9)}${"busy".padEnd(8)}${"dark".padEnd(8)}${"std".padEnd(7)}${"still up at end?"}`,
  );
  for (const r of worldRows) {
    const v = r.world.vitals ?? {};
    const end = r.worldAtEnd;
    console.log(
      `  ${r.route.padEnd(18)}${r.device.padEnd(20)}` +
        `${(r.world.ready ? "yes" : "NO").padEnd(6)}${`${r.world.ms}ms`.padEnd(9)}` +
        `${String(r.world.reads).padEnd(7)}${String(v.distinct ?? "-").padEnd(9)}` +
        `${String(v.busyShare ?? "-").padEnd(8)}${String(v.darkShare ?? "-").padEnd(8)}${String(v.stdLuma ?? "-").padEnd(7)}` +
        `${end ? (end.ok ? `yes (${end.vitals?.distinct ?? "-"} colours)` : `NO — ${end.reason}`) : "not checked"}`,
    );
    // EVERY iteration, failed ones included. The row above describes the run
    // that was kept; a run that never rendered produced no sample at all, and
    // that is the single most important thing this section can say.
    for (const w of r.worldRuns ?? []) {
      if (!w.ready) {
        console.log(`      #${String(w.iteration).padStart(2, "0")} NEVER RENDERED after ${w.ms} ms / ${w.reads} reads`);
      }
    }
    // WHICH GESTURE PUT IT OUT. Printed whenever the canvas was not a rendered
    // scene at every checkpoint, so the finding names the step instead of
    // saying "somewhere between the gate and the capture".
    const phases = r.worldPhases ?? [];
    if (phases.some((p) => !p.ok)) {
      console.log(`      THE CANVAS WENT OUT DURING THIS ROW — checkpoint by checkpoint:`);
      for (const p of phases) {
        console.log(
          `        ${p.phase.padEnd(24)}${p.ok ? "world" : "BLANK"}  ` +
            `${String(p.distinct ?? "-").padStart(4)} colours  dark ${p.darkShare ?? "-"}` +
            (p.ok ? "" : `   <-- ${p.reason}`),
        );
      }
    }
    const rendered = (r.worldRuns ?? []).filter((w) => w.ready).map((w) => w.ms);
    if (rendered.length > 1) {
      console.log(
        `      ${rendered.length} runs rendered: ${Math.min(...rendered)}..${Math.max(...rendered)} ms ` +
          `(median ${median(rendered)} ms) of waiting before any measurement began`,
      );
    }
  }
  console.log(
    "\n  wait    = time from the page load to two consecutive frames that are a rendered scene.\n" +
      "            Popups are dismissed both BEFORE this (so a modal cannot hide the canvas) and\n" +
      "            AFTER it (so one that mounts during the wait is not measured as road). NOT part\n" +
      "            of any settle number below, and NOT a performance figure — it is a dev server\n" +
      "            compiling on a mechanical disk.\n" +
      "  colours = distinct colours in the centre band of the canvas (a cleared buffer has ~35, the\n" +
      "            same buffer with the lesson menu over it ~110, a rendered street ~450).\n" +
      "  busy    = fraction of the band that varies between neighbouring pixels — the statistic a\n" +
      "            dialog cannot fake. See lib/ready.mjs for the measured table these lines come from.\n" +
      "  still up at end? = THE SAME QUESTION, ASKED AGAIN IN THE FRAME THE CAPTURE IS TAKEN FROM.\n" +
      "            Two overlay toggles and two viewport resizes happen between the gate at the top of\n" +
      "            a row and the screenshot at the bottom, and every one of them rebuilds the WebGL\n" +
      "            drawing buffer. A row that says yes here is a row whose capture shows a street —\n" +
      "            which is the check that had to be done by eye, and therefore was not done.",
  );
}

console.log("\nSETTLE DETAIL — app ms to come to rest, per phase (wall clock and instrument share beside it)");
for (const r of rows) {
  if (!r.ok || !r.settle) continue;
  const parts = Object.entries(r.settle).map(([phase, s]) => {
    const app = appMs(s);
    return (
      `${phase}${phase === IDLE_PHASE ? "(idle)" : ""} ` +
      `${app === null ? "NO-SAMPLE" : app}${s.settled ? "" : "!"}` +
      `[wall ${s.ms}, ${(instrumentShare(s) * 100).toFixed(0)}% probe]`
    );
  });
  console.log(`  ${r.route.padEnd(18)}${r.device.padEnd(20)}${parts.join("  ")}`);
}
console.log(
  `\n  "${IDLE_PHASE}(idle)" IS NOT A SETTLING TIME. Nothing changes state before it: the route has\n` +
    `  loaded, the popups are dismissed, the world (where required) has rendered, and a fixed\n` +
    `  settleMs sleep of 1.2-6 s has already elapsed. So it measures the FLOOR of this instrument on\n` +
    `  this box — useful, and the right thing to compare the other phases against, but it can only\n` +
    `  fail if the app is STILL MOVING seconds after load. It was scored against the settle budget\n` +
    `  like every other phase, and in the last recorded sweep it was the WORST one at 32,144 ms of\n` +
    `  which 31,881 ms was the probe: a budget decided by the phase in which the app did nothing.`,
);

// ---------------------------------------------------------- SETTLE STABILITY
// THE NUMBER ABOUT THE NUMBER.
//
// The two times this budget has been reported met it was by 2 ms and by 10 ms,
// from single runs. A single run cannot distinguish "the product got faster"
// from "the box was quieter", and a margin thinner than the run-to-run spread is
// not a margin at all. So when the probe is asked to repeat, it says how far the
// number moves while the app does not, and how coarse the instrument's own steps
// are — an app number can only land on floor + k*step, so a 10 ms margin inside
// a 100 ms step is a rounding accident.
//
// EVERY FIGURE IN THIS BLOCK IS THE APP NUMBER (`atRestMs`, timestamped in-page
// by lib/settle.mjs). The old wall-clock number is printed beside it under
// `wall(med)` and scores nothing, because it contained the probe's own bridge
// crossings — 99.2% of one recorded sample — and therefore moved with the box.
if (REPEAT > 1) {
  console.log(
    `\nSETTLE STABILITY — ${REPEAT} runs of the same measurement, same app, same box.` +
      `\n  Every number in this block is the APP number (atRestMs, in-page). "wall" is the old` +
      `\n  metric — total round-trip time — printed beside it so the two can never be confused again.`,
  );
  console.log(
    `  ${"route".padEnd(18)}${"device".padEnd(20)}${"phase".padEnd(15)}` +
      `${"n".padEnd(4)}${"min".padEnd(7)}${"median".padEnd(8)}${"worst".padEnd(7)}${"spread".padEnd(8)}` +
      `${"wall(med)".padEnd(11)}${"instr%".padEnd(8)}${"step".padEnd(6)}over`,
  );
  for (const r of rows) {
    if (!r.ok || !r.settleRuns?.length) continue;
    const phases = [...new Set(r.settleRuns.flatMap((s) => Object.keys(s)))];
    for (const phase of phases) {
      const samples = r.settleRuns.map((s) => s[phase]).filter(Boolean);
      if (samples.length === 0) continue;
      const app = samples.map(appMs).filter((v) => v !== null);
      const missing = samples.length - app.length;
      const lo = app.length ? Math.min(...app) : null;
      const hi = app.length ? Math.max(...app) : null;
      const over = app.filter((v) => v > SETTLE_BUDGET_MS).length;
      const share = median(samples.map((s) => Math.round(instrumentShare(s) * 100)));
      console.log(
        `  ${r.route.padEnd(18)}${r.device.padEnd(20)}${`${phase}${phase === IDLE_PHASE ? "(idle)" : ""}`.padEnd(15)}` +
          `${String(app.length).padEnd(4)}${String(lo ?? "-").padEnd(7)}${String(app.length ? median(app) : "-").padEnd(8)}` +
          `${String(hi ?? "-").padEnd(7)}${String(hi === null ? "-" : hi - lo).padEnd(8)}` +
          `${String(median(samples.map((s) => s.ms ?? 0))).padEnd(11)}` +
          `${`${share}%`.padEnd(8)}` +
          `${String(Math.max(...samples.map((s) => s.stepMs ?? 0))).padEnd(6)}` +
          `${over}/${app.length}${over > 0 ? "  <-- OVER BUDGET" : ""}` +
          (missing > 0 ? `  ${missing} RUN(S) PRODUCED NO SAMPLE` : ""),
      );
    }
  }
  console.log(
    `\n  min/median/worst/spread are APP ms across the ${REPEAT} runs. wall(med) = the whole round trip\n` +
      `  including the probe's own bridge crossings — informational only, nothing scores against it.\n` +
      `  step = the widest gap between two consecutive in-page reads, i.e. the RESOLUTION: an app\n` +
      `  number can only land on ~150 + k*step, so a budget margin thinner than one step is a\n` +
      `  rounding accident and is called one below.`,
  );

  // AND THE VERDICT ON THE VERDICT, stated in one line so nobody has to do the
  // arithmetic and nobody can quietly not do it.
  for (const r of rows) {
    if (!r.ok || !r.settleRuns?.length) continue;
    // WORST APP PHASE PER RUN. A run in which any phase produced no sample has
    // no worst, and is counted as lost rather than as a fast run.
    const perRun = r.settleRuns.map((s) => {
      const values = Object.values(s).map(appMs);
      return values.some((v) => v === null) ? null : Math.max(...values);
    });
    const worstPerRun = perRun.filter((v) => v !== null);
    const noSampleRuns = perRun.length - worstPerRun.length;
    if (worstPerRun.length === 0) {
      console.log(
        `\n  ${r.route} · ${r.device}: NO APP NUMBER AT ALL — every one of the ${perRun.length} runs had a phase\n` +
          `  that never came to rest. There is no verdict here, and a blank is not a pass.`,
      );
      failed = true;
      continue;
    }
    const hi = Math.max(...worstPerRun);
    const lo = Math.min(...worstPerRun);
    const mid = median(worstPerRun);
    const spread = hi - lo;
    const margin = SETTLE_BUDGET_MS - hi;
    const step = Math.max(
      ...r.settleRuns.flatMap((s) => Object.values(s).map((x) => x.stepMs ?? 0)),
    );
    const failures = worstPerRun.filter((v) => v > SETTLE_BUDGET_MS).length;
    const noise = spread > Math.abs(margin) || step > Math.abs(margin);

    // THE INSTRUMENT IS INSIDE THE MEASUREMENT, and on a loaded box it IS the
    // measurement. `settle.ms` is wall clock around a polling loop whose every
    // read is a `page.evaluate` round trip, and those round trips are charged
    // to the app. The worst sample in the last recorded sweep was 32,144 ms of
    // which 31,881 ms was `evalMs` — the layout had come to rest at 1,477 ms
    // (`atRestMs`) and the other 30 seconds were the probe waiting for its own
    // question to be answered. That cuts both ways, which is why it belongs in
    // the verdict rather than a footnote: on a busy box it fails the app for
    // the box's sins, and on a quiet one it passes anything, including a black
    // canvas. When the instrument owns most of the number, the number is about
    // the box.
    const evals = r.settleRuns.flatMap((s) => Object.values(s).map((x) => x.evalMs ?? 0));
    const totals = r.settleRuns.flatMap((s) => Object.values(s).map((x) => x.ms));
    const evalTotal = evals.reduce((a, b) => a + b, 0);
    const msTotal = totals.reduce((a, b) => a + b, 0);
    const evalShare = msTotal > 0 ? evalTotal / msTotal : 0;
    const wallHi = Math.max(...totals);
    const instrumentBound = evalShare > INSTRUMENT_SHARE_LIMIT;
    const asked = r.iterations ?? perRun.length;
    const lost = asked - worstPerRun.length;
    console.log(
      `\n  ${r.route} · ${r.device}: worst APP phase per run — min ${lo} / median ${mid} / worst ${hi} ms ` +
        `against a ${SETTLE_BUDGET_MS} ms budget.\n` +
        `  ${worstPerRun.length} of ${asked} runs produced a full sample` +
        (lost > 0
          ? ` — ${lost} WERE LOST: ${[...(r.iterationErrors ?? []), ...(noSampleRuns > 0 ? [`${noSampleRuns} run(s) had a phase that never came to rest`] : [])].join(" | ")}`
          : "") +
        `.\n  ${failures} of ${worstPerRun.length} runs were over budget. ` +
        `Spread ${spread} ms; instrument resolution ${step} ms; margin at worst ${margin} ms.\n` +
        `  Wall clock for the same samples peaked at ${wallHi} ms, of which ${(evalShare * 100).toFixed(0)}% was this probe —\n` +
        `  NONE of that is inside the app numbers above; it is timed inside the page.\n` +
        (failures > 0
          ? `  VERDICT: OVER BUDGET on ${failures} of ${worstPerRun.length} runs — the budget is not met.`
          : noise
            ? `  VERDICT: NOT REPRODUCIBLE. The margin is smaller than the run-to-run spread and/or the\n` +
              `  instrument's own step, so this pass/fail is a property of the box, not of the product.`
            : `  VERDICT: reproducible — the margin is wider than both the spread and the instrument step.`) +
        (instrumentBound
          ? `\n  INSTRUMENT-BOUND SAMPLE: ${(evalShare * 100).toFixed(0)}% of the wall clock around these measurements was the\n` +
            `  probe (bridge crossings plus its own DOM walk), over the ${(INSTRUMENT_SHARE_LIMIT * 100).toFixed(0)}% line. The APP numbers survive\n` +
            `  that — they are timestamped in-page — but anything that reads the wall column, and every\n` +
            `  number this probe published before this change, is about the box.`
          : "") +
        (lost > 0
          ? `\n  AND IT IS NOT A FULL SAMPLE: ${lost} of ${asked} runs never reported. Read every number\n` +
            `  above as the best ${worstPerRun.length} of ${asked}.`
          : ""),
    );
  }
}

// ------------------------------------------------------------- REFUSED DETAIL
// WHAT A REFUSED ROW HAD MEASURED WHEN IT WAS REFUSED, AND WHAT THE CANVAS WAS
// DOING AT THE TIME. None of this is scored and none of it appears in the table
// — a refusal that silently deletes its own evidence is only half a refusal,
// and "the row failed" with no numbers is exactly the report that makes the
// next person re-run by hand and read a capture with their eyes.
const refusedRows = rows.filter((r) => (r.refused ?? []).length > 0);
if (refusedRows.length > 0) {
  console.log("\nREFUSED — measured, then thrown out. DIAGNOSIS ONLY; nothing here is a verdict.");
  for (const r of refusedRows) {
    for (const run of r.refused) {
      console.log(`  ${r.route} · ${r.device} · run #${String(run.iteration).padStart(2, "0")}`);
      console.log(`      REFUSED: ${run.error}`);
      const phases = Object.entries(run.settle);
      if (phases.length > 0) {
        console.log(
          `      phases measured before the refusal: ` +
            phases
              .map(([name, s]) => `${name} ${appMs(s) ?? "NO-SAMPLE"}${s.settled ? "" : "!"}`)
              .join("  "),
        );
      }
      for (const p of run.worldPhases) {
        console.log(
          `      canvas ${p.ok ? "world" : "BLANK"} at ${p.phase} — ` +
            `${p.distinct ?? "-"} colours, dark ${p.darkShare ?? "-"}`,
        );
      }
      console.log(
        `      A phase measured while the canvas was BLANK is a measurement of a loading screen.\n` +
          `      Read only the phases above the first BLANK line, and read them as diagnosis.`,
      );
    }
  }
}

// ------------------------------------------------------------ SAMPLE INTEGRITY
// LAST, LOUD, AND UNCONDITIONAL. The report is long; the run that produced C8
// printed its lost iteration into the middle of it and nobody saw. If anything
// was asked for and not delivered, it is repeated here, at the bottom, where the
// exit code is.
const asked = rows.reduce((n, r) => n + (r.iterations ?? 1), 0);
const produced = rows.reduce((n, r) => n + (r.iterationsOk ?? (r.ok ? 1 : 0)), 0);
console.log(`\nSAMPLE INTEGRITY — ${produced} of ${asked} requested runs produced a row`);
if (produced < asked) {
  failed = true;
  for (const r of rows) {
    const want = r.iterations ?? 1;
    const got = r.iterationsOk ?? (r.ok ? 1 : 0);
    if (got >= want) continue;
    console.log(`  LOST ${want - got}/${want}  ${r.route} · ${r.device}`);
    for (const e of r.iterationErrors ?? []) console.log(`      ${e}`);
  }
  console.log(
    `  A missing run is a finding about the MEASUREMENT and fails this sweep. Do not read the\n` +
      `  numbers above as "the app": read them as the best ${produced} of ${asked}.`,
  );
} else {
  console.log("  every requested run produced a row.");
}

console.log("\nUNREACHABLE DETAIL — a control off-screen that no gesture brings back");
for (const r of rows) {
  if (!r.ok) continue;
  for (const [when, list] of [["base", r.unreachable], ["popup", r.overlayUnreachable || []]]) {
    if (list.length === 0) continue;
    console.log(`  ${r.route} · ${r.device} · ${when}`);
    for (const u of list.slice(0, 8)) {
      console.log(`      ${String(u.pastPx).padStart(5)}px past the edge, no scroller  ${(u.label || u.key).slice(0, 60)}`);
    }
  }
}

console.log("\nEDGE / SAFE-AREA DETAIL — BLOCKING ONLY");
for (const r of rows) {
  if (!r.ok) continue;
  const sets = [["base", r.edgeBlocking], ["popup", r.overlayEdgeBlocking || []]];
  for (const [when, list] of sets) {
    if (list.length === 0) continue;
    console.log(`  ${r.route} · ${r.device} · ${when}  (insets ${JSON.stringify(r.insets.effective)})`);
    for (const e of list.slice(0, 10)) {
      const bad = e.edges.filter((x) => x.verdict === "BLOCKING");
      console.log(
        `      ${bad.map((x) => `${x.edge} ${x.gapPx}px`).join(", ").padEnd(30)} ` +
        `${e.interactive ? "[control]" : "[surface]"} ${e.pos}${e.escapesBody ? "/escapes-body" : ""}  ` +
        `${(e.label || e.key).slice(0, 60)}`,
      );
    }
  }
}

console.log("\nEDGE — ADVISORY (double inset / status-bar band)");
for (const r of rows) {
  if (!r.ok) continue;
  const adv = r.edge.filter((e) => !e.blocking && e.edges.some((x) => x.verdict === "advisory:double-inset"));
  if (adv.length === 0) continue;
  console.log(`  ${r.route} · ${r.device}`);
  for (const e of adv.slice(0, 6)) {
    console.log(`      double inset: ${(e.label || e.key).slice(0, 70)}`);
  }
}

console.log("\nMOTION DETAIL");
for (const r of rows) {
  if (!r.ok) continue;
  for (const [what, d] of [["open", r.shiftOnOpen], ["close", r.shiftOnClose], ["toolbar", r.shiftOnToolbar]]) {
    if (!d || (d.moved === 0 && d.resized === 0)) continue;
    console.log(
      `  ${r.route} · ${r.device} · ${what}: ${d.moved}/${d.compared} MOVED (worst ${d.worstPx}px), ` +
      `${d.resized} resized in place`,
    );
    for (const m of d.moves.slice(0, 5)) {
      console.log(`      MOVED dx${m.dx} dy${m.dy}  ${m.label || m.key}`);
    }
    for (const m of d.resizes.slice(0, 3)) {
      console.log(`      resized dw${m.dw} dh${m.dh} (dx0 dy0)  ${m.label || m.key}`);
    }
  }
}

console.log("\nORIENTATION AGREEMENT (portrait | landscape)");
for (const o of orientation) {
  console.log(
    `  ${o.route.padEnd(18)}${o.pair.padEnd(42)}els ${o.elements.padEnd(12)}` +
    `ctrls ${o.interactive.padEnd(10)}edge ${o.edge.padEnd(8)}margins ${o.margins}`,
  );
}

// THE ARTEFACT HAS TO MATCH THE VERDICT THAT WAS PRINTED. `stability.json` was
// written before any of the analysis above ran, so the per-row conclusions the
// table draws — the worst APP settle, the instrument share, whether a phase ever
// came to rest — existed only in the terminal and were absent from the file
// anything downstream reads. Written once early (so a crash still leaves the raw
// rows) and once here, complete.
writeFileSync(join(OUT_DIR, reportName), JSON.stringify({ ...report, failed }, null, 2));

console.log(`\n  captures + json: ${join(OUT_DIR, reportName)}`);
process.exit(failed ? 1 : 0);
