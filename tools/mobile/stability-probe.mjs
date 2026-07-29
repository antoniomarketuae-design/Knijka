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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./lib/pw.mjs";
import { contextOptions, resolveDevices } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";
import { gotoAuthenticated, signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, ".out", "stability");

/** A shift under this is sub-pixel rounding, not motion. */
const SHIFT_TOLERANCE_PX = 0.5;
/** The founder's own number: "nothing sits within 8px of an unsafe edge". */
const EDGE_MARGIN_PX = 8;
/** iOS Safari's collapsing toolbar, portrait. The visual viewport grows by this. */
const TOOLBAR_PX = 90;

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
  const keyCounts = new Map();
  function keyFor(el) {
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
    const base = parts.join(">").slice(0, 200);
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
  const items = [];
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
    if (r.bottom <= 0 || r.top >= VH || r.right <= 0 || r.left >= VW) continue;

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
  const unreachable = [];
  for (const it of items) {
    if (!it.interactive) continue;
    const past = Math.round(Math.max(it.y + it.h - VH, -it.y, it.x + it.w - VW, -it.x));
    if (past <= 1) continue;
    let scrollable = false;
    for (let n = it.el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (
        /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1
      ) { scrollable = true; break; }
      if (
        /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1
      ) { scrollable = true; break; }
      if (n === document.body) break;
    }
    // The document itself scrolling counts too.
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > se.clientHeight + 1) scrollable = true;
    if (!scrollable) unreachable.push({ key: it.key, label: it.label, pastPx: past });
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

  // ------------------------------------------------------------- 4. SCROLL
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
    overlaps,
    occluded,
    // The snapshot itself, for the before/after diff. `el` cannot cross the
    // bridge, so it is stripped here rather than in every caller.
    snapshot: items.map(({ el, ...rest }) => rest),
  };
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

mkdirSync(OUT_DIR, { recursive: true });

const credentials =
  process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
    ? { email: process.env.KNIJKA_MOBILE_EMAIL, password: process.env.KNIJKA_MOBILE_PASSWORD }
    : await ensureHarnessUser();

/** Compile from NODE first: a fetch has no navigation timeout and no service
 *  worker in front of it. See lib/measure.mjs warmRoutes for the long version. */
async function warm(target, cookie = "") {
  const t0 = Date.now();
  try {
    const res = await fetch(target, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    await res.arrayBuffer();
    console.log(`[stability] warmed ${target} -> ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`[stability] warm ${target} failed: ${e.message}`);
  }
}

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
      ...contextOptions(device),
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
        const row = { route: surface.id, device: device.id, ok: false };
        try {
          await gotoAuthenticated(page, url, surface);
          if (surface.waitFor) {
            await page.waitForSelector(surface.waitFor, { timeout: 180_000, state: "attached" });
          }
          if (surface.prepare) await surface.prepare(page);
          await page.waitForTimeout(surface.settleMs ?? 1200);

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

          const base = await page.evaluate(stabilityBody, probeArgs(device, "base"));
          Object.assign(row, {
            viewport: base.viewport, insets: base.insets, document: base.document,
            counts: base.counts, edge: base.edge, edgeBlocking: base.edgeBlocking,
            margins: base.margins, overlaps: base.overlaps, occluded: base.occluded,
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
            await page.waitForTimeout(900);
            const open = await page.evaluate(stabilityBody, probeArgs(device, "overlay-open"));
            row.overlayEdge = open.edge;
            row.overlayEdgeBlocking = open.edgeBlocking;
            row.overlayOverlaps = open.overlaps;
            row.overlayOccluded = open.occluded;
            row.shiftOnOpen = diff(base.snapshot, open.snapshot);

            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(900);
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
          await page.waitForTimeout(700);
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
          await page.waitForTimeout(700);
          const restored = await page.evaluate(stabilityBody, probeArgs(device, "toolbar-hidden"));
          row.shiftOnToolbar = diff(base.snapshot, restored.snapshot);

          await page.screenshot({ path: join(OUT_DIR, `${surface.id}__${device.id}.png`) });
          row.ok = true;
        } catch (error) {
          row.error = String(error?.message || error).split("\n")[0];
          await page.screenshot({ path: join(OUT_DIR, `FAILED__${surface.id}__${device.id}.png`) }).catch(() => {});
        }
        rows.push(row);
        console.log(
          row.ok
            ? `  ${row.route.padEnd(18)} ${row.device.padEnd(20)} ` +
              `edge=${row.edgeBlocking.length}/${row.edge.length} ` +
              `+overlay=${row.overlayEdgeBlocking ? row.overlayEdgeBlocking.length : "-"} ` +
              `margins=${row.margins.minLeftPx}/${row.margins.minRightPx} ` +
              `overlap=${row.overlaps.length} occl=${row.occluded.length} ` +
              `shift(open)=${row.shiftOnOpen ? row.shiftOnOpen.worstPx : "-"} ` +
              `shift(close)=${row.shiftOnClose ? row.shiftOnClose.worstPx : "-"} ` +
              `shift(toolbar)=${row.shiftOnToolbar.worstPx} clip=${row.toolbar.clippedPinned}/${row.toolbar.clippedFlow}`
            : `  ${row.route.padEnd(18)} ${row.device.padEnd(20)} ERROR ${row.error}`,
        );
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

const report = { engine: engine.name, baseUrl: url, at: new Date().toISOString(), rows, orientation };
writeFileSync(join(OUT_DIR, "stability.json"), JSON.stringify(report, null, 2));

// ----------------------------------------------------------------- the table
console.log(`\nSTABILITY — ${engine.name} @ ${url}\n`);
const H = ["route", "device", "edge!", "+ovl!", "margins L/R", "ovlp", "occl", "open", "close", "bar", "clip"];
console.log(
  `  ${H[0].padEnd(18)}${H[1].padEnd(20)}${H[2].padEnd(7)}${H[3].padEnd(7)}${H[4].padEnd(14)}` +
  `${H[5].padEnd(6)}${H[6].padEnd(6)}${H[7].padEnd(7)}${H[8].padEnd(7)}${H[9].padEnd(6)}${H[10]}`,
);
let failed = false;
for (const r of rows) {
  if (!r.ok) { failed = true; console.log(`  ${r.route.padEnd(18)}${r.device.padEnd(20)}ERROR ${r.error}`); continue; }
  const overlayEdge = r.overlayEdgeBlocking ? r.overlayEdgeBlocking.length : 0;
  const bad =
    r.edgeBlocking.length > 0 || overlayEdge > 0 ||
    r.overlaps.length > 0 || r.occluded.length > 0 ||
    (r.shiftOnOpen?.worstPx ?? 0) > 0 || (r.shiftOnClose?.worstPx ?? 0) > 0 ||
    r.shiftOnToolbar.worstPx > 0 || r.toolbar.clippedPinned > 0 ||
    (r.margins.deltaPx ?? 0) > 2;
  if (bad) failed = true;
  console.log(
    `  ${r.route.padEnd(18)}${r.device.padEnd(20)}` +
    `${String(r.edgeBlocking.length).padEnd(7)}` +
    `${String(r.overlayEdgeBlocking ? overlayEdge : "-").padEnd(7)}` +
    `${`${r.margins.minLeftPx}/${r.margins.minRightPx}`.padEnd(14)}` +
    `${String(r.overlaps.length).padEnd(6)}${String(r.occluded.length).padEnd(6)}` +
    `${String(r.shiftOnOpen ? r.shiftOnOpen.worstPx : "-").padEnd(7)}` +
    `${String(r.shiftOnClose ? r.shiftOnClose.worstPx : "-").padEnd(7)}` +
    `${String(r.shiftOnToolbar.worstPx).padEnd(6)}${r.toolbar.clippedPinned}` +
    (bad ? "   <--" : ""),
  );
}
console.log("\n  edge! = BLOCKING safe-area findings (nothing in the CSS pays that inset).");
console.log("  +ovl! = the same, measured with the popup open. Advisory findings are below.");

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

console.log(`\n  captures + json: ${OUT_DIR}`);
process.exit(failed ? 1 : 0);
