#!/usr/bin/env node
// =============================================================================
// wave11-seeing-eye.mjs — AN INSTRUMENT THAT SEES WHAT A HUMAN SEES.
//
// SIX SWEEPS REPORTED „0 clipped text" ON A SCREEN THAT, OPENED AND LOOKED AT,
// SHOWS LETTERS SLICED THROUGH THE MIDDLE. The instrument was the bug, and the
// bug is one line. Every previous sweep asked:
//
//     el.scrollWidth > el.clientWidth        (wave6-cards.mjs:383, `clipsOwnText`)
//
// That question is „does this box overflow ITSELF". It is STRUCTURALLY
// INCAPABLE of seeing the three defects the founder photographed:
//
//   1. A PARENT clips the text. The <p> is 180×34 and fits its own content
//      exactly — scrollWidth === clientWidth — while the panel two levels up is
//      `overflow:hidden` and 20px shorter than the <p> needs. The <p> is not
//      clipping itself. Nothing in the old test looks at the parent. → 0.
//   2. THE VIEWPORT clips the text. A panel positioned at top:-18px has a <p>
//      whose rect starts at y = −6. The <p> fits itself perfectly. The document
//      does not scroll. Every box in the chain is internally consistent. The
//      SCREEN is what cuts it, and the screen is not in the ancestor chain. → 0.
//   3. ELLIPSIS / LINE-CLAMP. `text-overflow:ellipsis` is not a defect of the
//      text node — the node has no box. It is a property of the BLOCK, and the
//      block is exactly as wide as it is allowed to be. → 0.
//
// So this file does not ask a box about itself. It asks, for EVERY text node in
// the document, the question a student's eye asks:
//
//     WHICH OF THESE CHARACTERS CAN I ACTUALLY READ?
//
// and it answers it CHARACTER BY CHARACTER, with a Range, against the
// intersection of every clipping ancestor's padding box AND the viewport box.
// The output is not a count. It is the string the student sees — which is how
// «Завърти телефона хоризонтално» is allowed to come back as „авърт / елефон /
// изонта" instead of as `clippedCount: 0`.
//
// FIVE INDEPENDENT DETECTORS, because each of the founder's five frames fails a
// different one and any single test would return zero on four of them:
//
//   A. ANCESTOR CLIP   every text rect vs. the padding box of EVERY ancestor
//                      whose overflow-x/y is hidden|clip|auto|scroll, with the
//                      innermost offender named. Scrollable ancestors are
//                      reported separately from `hidden` ones: content you can
//                      scroll to is hidden-now, content under `hidden` is gone.
//   B. VIEWPORT CLIP   every text rect vs. {0,0,innerWidth,innerHeight}. This is
//                      the one that catches „the top is also eaten": a panel
//                      that extends above y=0.
//   C. GLYPH SLICE     per LINE BOX, the visible fraction. A line at 0.42 is not
//                      „mostly fine" — it is a row of letters cut through the
//                      waist, which is exactly what his landscape frame shows.
//                      Reported as a separate class from „line fully gone".
//   D. TRUNCATION      `text-overflow:ellipsis` and `-webkit-line-clamp` on the
//                      CLAMPING ANCESTOR (never on the text element), plus the
//                      full string vs. the rendered string, so the report can
//                      print what the student is not being told.
//   E. OVERPRINT       pairwise intersection of text rects belonging to
//                      unrelated elements. „ДЯСН printed across the dial
//                      numbers" and „80/40/120/160 on top of one another" are
//                      not clipping at all; no clipping test could ever see
//                      them, and six sweeps duly did not.
//
// AND THE HONEST LIMIT, STATED IN THE OUTPUT, NOT IN A FOOTNOTE: detectors A–E
// see the DOM. Anything painted INSIDE the WebGL canvas — the cockpit's own
// analogue dial and its numbers — is a texture, not a node. This instrument
// CANNOT see it, and where the founder's defect is in there the report says so
// and points at the pixels. That is why every profile is also SCREENSHOT, at
// device scale, with crops of every edge band, and why the sweep is not
// finished until a human has looked at them.
//
//   node tools/mobile/wave11-seeing-eye.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium, webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "live");
const ENGINE_NAME = arg("engine", "webkit");
const MOTION = arg("motion", "allow"); // MANDATORY argument to newDeviceContext
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave11-seeing-eye`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--block-fullscreen",
];

// Chromium hands out a fullscreen iOS Safari refuses (see commit c077fe8); the
// founder's phone never gets it, so neither does this sweep.
const NO_FULLSCREEN = () => {
  const deny = () => Promise.reject(new Error("blocked by wave11 harness"));
  try {
    Element.prototype.requestFullscreen = deny;
    Element.prototype.webkitRequestFullscreen = deny;
  } catch {
    /* frozen prototype — nothing to do */
  }
  try {
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false, configurable: true });
  } catch {
    /* ditto */
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CENSUS. Runs in the page. Returns every text node it can see, with the
// verdict of all five detectors.
// ─────────────────────────────────────────────────────────────────────────────
const CENSUS = () => {
  const R1 = (n) => Math.round(n * 10) / 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const VIEWPORT = { left: 0, top: 0, right: vw, bottom: vh };

  const inter = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });
  const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const out = (b) => ({ l: R1(b.left), t: R1(b.top), r: R1(b.right), b: R1(b.bottom), w: R1(b.right - b.left), h: R1(b.bottom - b.top) });

  // The PADDING box — what `overflow` actually clips to. Not the border box:
  // a 1px border would forgive a 1px slice, and slices are the defect.
  const paddingBox = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: r.left + (parseFloat(cs.borderLeftWidth) || 0),
      top: r.top + (parseFloat(cs.borderTopWidth) || 0),
      right: r.right - (parseFloat(cs.borderRightWidth) || 0),
      bottom: r.bottom - (parseFloat(cs.borderBottomWidth) || 0),
    };
  };

  const CLIPS = /^(hidden|clip|auto|scroll|overlay)$/;

  const describe = (el) => {
    if (!el || el.nodeType !== 1) return "?";
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push(`#${el.id}`);
    const hud = el.getAttribute("data-hud");
    if (hud) bits.push(`[data-hud="${hud}"]`);
    const al = el.getAttribute("aria-label");
    if (al) bits.push(`[aria-label="${al.slice(0, 44)}"]`);
    const role = el.getAttribute("role");
    if (role) bits.push(`[role=${role}]`);
    const cls = (el.getAttribute("class") || "").trim();
    if (cls) bits.push(`.${cls.split(/\s+/).slice(0, 8).join(".")}`);
    return bits.join("");
  };

  /** The nearest ancestor-or-self carrying a data-hud, so the report can name the panel. */
  const hudOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const h = n.getAttribute("data-hud");
      if (h) return h;
      const al = n.getAttribute("aria-label");
      if (al) return `aria:${al.slice(0, 40)}`;
      n = n.parentElement;
    }
    return null;
  };

  // ── walk every text node ───────────────────────────────────────────────────
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!/\S/.test(n.nodeValue || "")) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  const range = document.createRange();
  const records = [];
  const paintedRects = []; // for detector E

  for (const node of nodes) {
    const parent = node.parentElement;
    // display:none / visibility:hidden / opacity:0 — not a clipping defect, and
    // counting it as one is how a report drowns. Skipped, but COUNTED.
    let hiddenBy = null;
    for (let a = parent; a && a.nodeType === 1; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none") { hiddenBy = `display:none on ${describe(a)}`; break; }
      if (cs.visibility === "hidden" || cs.visibility === "collapse") { hiddenBy = `visibility:${cs.visibility} on ${describe(a)}`; break; }
      if (parseFloat(cs.opacity) === 0) { hiddenBy = `opacity:0 on ${describe(a)}`; break; }
      if (a === document.body) break;
    }

    range.selectNodeContents(node);
    const lineRects = [...range.getClientRects()]
      .filter((r) => r.width > 0.5 && r.height > 0.5)
      .map(box);
    if (lineRects.length === 0) {
      records.push({ text: (node.nodeValue || "").trim().slice(0, 120), noRects: true, hiddenBy, el: describe(parent) });
      continue;
    }
    if (hiddenBy) {
      records.push({ text: (node.nodeValue || "").trim().slice(0, 120), hiddenBy, el: describe(parent), skipped: true });
      continue;
    }

    const union = lineRects.reduce(
      (acc, r) => ({
        left: Math.min(acc.left, r.left), top: Math.min(acc.top, r.top),
        right: Math.max(acc.right, r.right), bottom: Math.max(acc.bottom, r.bottom),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );

    // ── DETECTOR A — every clipping ancestor, innermost first ────────────────
    const clippers = [];
    let srOnly = null;
    for (let a = parent; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cx = CLIPS.test(cs.overflowX);
      const cy = CLIPS.test(cs.overflowY);
      if (!cx && !cy) continue;
      const pb = paddingBox(a);
      // THE `sr-only` PATTERN IS NOT A DEFECT AND MUST NOT BE COUNTED AS ONE.
      // `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0)`
      // is the standard visually-hidden idiom — the skip link, live regions,
      // labels for icon buttons. Every one of them is 100% "clipped" by the
      // definition above, and a report that lists them has buried the real
      // defect under boilerplate. A 1px box is the signature; nothing legible
      // is ever laid out in one.
      if (pb.right - pb.left <= 1.5 || pb.bottom - pb.top <= 1.5) {
        srOnly = describe(a);
      }
      // An axis that does NOT clip must not be allowed to bound that axis.
      const clipBox = {
        left: cx ? pb.left : -Infinity,
        right: cx ? pb.right : Infinity,
        top: cy ? pb.top : -Infinity,
        bottom: cy ? pb.bottom : Infinity,
      };
      clippers.push({
        el: describe(a),
        overflow: `${cs.overflowX}/${cs.overflowY}`,
        scrollableX: a.scrollWidth > a.clientWidth + 1,
        scrollableY: a.scrollHeight > a.clientHeight + 1,
        recoverable: /^(auto|scroll|overlay)$/.test(cs.overflowY) || /^(auto|scroll|overlay)$/.test(cs.overflowX),
        box: clipBox,
        boxOut: out(pb),
      });
    }

    // ── the effective visible window: every clipper ∩ the SCREEN ─────────────
    let effective = { ...VIEWPORT };
    for (const c of clippers) effective = inter(effective, c.box);

    // ── DETECTOR C — per LINE BOX, how much of it survives ───────────────────
    const lines = lineRects.map((r) => {
      const visAll = inter(r, effective);
      const visViewportOnly = inter(r, VIEWPORT);
      const a0 = area(r) || 1;
      const cuts = [];
      if (r.top < effective.top - 0.5) cuts.push("top");
      if (r.bottom > effective.bottom + 0.5) cuts.push("bottom");
      if (r.left < effective.left - 0.5) cuts.push("left");
      if (r.right > effective.right + 0.5) cuts.push("right");
      return {
        rect: out(r),
        visibleFraction: R1((area(visAll) / a0) * 100) / 100,
        viewportFraction: R1((area(visViewportOnly) / a0) * 100) / 100,
        cutSides: cuts,
        // how many px of the line's HEIGHT survive — a line whose glyphs are
        // sliced through the waist keeps its full width and half its height
        visibleHeightPx: R1(Math.max(0, Math.min(r.bottom, effective.bottom) - Math.max(r.top, effective.top))),
        heightPx: R1(r.bottom - r.top),
        visibleWidthPx: R1(Math.max(0, Math.min(r.right, effective.right) - Math.max(r.left, effective.left))),
        widthPx: R1(r.right - r.left),
      };
    });

    const worst = lines.reduce((w, l) => (l.visibleFraction < w.visibleFraction ? l : w), lines[0]);
    const anyCut = lines.some((l) => l.visibleFraction < 0.995);

    // ── who is responsible: viewport, or a named ancestor ────────────────────
    const blamed = [];
    for (const side of ["top", "bottom", "left", "right"]) {
      const cut = lines.some((l) => l.cutSides.includes(side));
      if (!cut) continue;
      const vpCuts =
        (side === "top" && union.top < VIEWPORT.top - 0.5) ||
        (side === "bottom" && union.bottom > VIEWPORT.bottom + 0.5) ||
        (side === "left" && union.left < VIEWPORT.left - 0.5) ||
        (side === "right" && union.right > VIEWPORT.right + 0.5);
      const anc = clippers.find((c) => {
        if (side === "top") return union.top < c.box.top - 0.5;
        if (side === "bottom") return union.bottom > c.box.bottom + 0.5;
        if (side === "left") return union.left < c.box.left - 0.5;
        return union.right > c.box.right + 0.5;
      });
      blamed.push({
        side,
        byViewport: vpCuts,
        byAncestor: anc ? anc.el : null,
        ancestorOverflow: anc ? anc.overflow : null,
        recoverableByScrolling: anc ? anc.recoverable : false,
      });
    }

    // ── the answer a human gives: WHICH LETTERS CAN I READ? ──────────────────
    // Character by character, with a Range, against `effective`. Only for nodes
    // that already failed, and capped, because this is O(chars) reflow queries.
    let seen = null;
    if (anyCut) {
      const s = node.nodeValue || "";
      const cap = Math.min(s.length, 400);
      let visible = "";
      let lost = "";
      let sliced = "";
      for (let i = 0; i < cap; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const cr = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0)[0];
        if (!cr) { visible += s[i]; continue; }
        const iv = inter(cr, effective);
        const av = area(iv);
        const ac = area(cr) || 1;
        if (av / ac >= 0.985) visible += s[i];
        else if (av <= 0) { lost += s[i]; visible += "·"; }
        else { sliced += s[i]; visible += s[i]; }
      }
      seen = {
        full: s.trim().slice(0, 400),
        // '·' marks a character with NO pixels on screen
        rendered: visible.trim(),
        charsFullyGone: lost.length,
        charsSliced: sliced.length,
        slicedSample: sliced.slice(0, 60),
        truncatedProbe: s.length > cap,
      };
      range.selectNodeContents(node);
    }

    // ── DETECTOR D — ellipsis / line-clamp on the CLAMPING ANCESTOR ──────────
    let truncation = null;
    for (let a = parent; a && a.nodeType === 1 && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const clampRaw = cs.webkitLineClamp || cs.getPropertyValue("-webkit-line-clamp");
      const clamp = clampRaw && clampRaw !== "none" ? parseInt(clampRaw, 10) : null;
      const ellipsis = cs.textOverflow === "ellipsis";
      if (!clamp && !ellipsis) continue;
      const overW = a.scrollWidth - a.clientWidth;
      const overH = a.scrollHeight - a.clientHeight;
      const fires = (ellipsis && overW > 1) || (clamp && overH > 1);
      if (!fires && !clamp && !ellipsis) continue;
      truncation = {
        el: describe(a),
        kind: clamp ? `-webkit-line-clamp:${clamp}` : "text-overflow:ellipsis",
        whiteSpace: cs.whiteSpace,
        firing: !!fires,
        overflowXPx: overW,
        overflowYPx: overH,
        fullText: (a.textContent || "").trim().slice(0, 400),
        fullLen: (a.textContent || "").trim().length,
      };
      break;
    }

    // record only what matters, plus everything for the JSON
    const rec = {
      text: (node.nodeValue || "").trim().slice(0, 160),
      el: describe(parent),
      hud: hudOf(parent),
      union: out(union),
      lineCount: lines.length,
      lines,
      clippers: clippers.map((c) => ({ el: c.el, overflow: c.overflow, box: c.boxOut, recoverable: c.recoverable, scrollableX: c.scrollableX, scrollableY: c.scrollableY })),
      effective: out(effective),
      worstVisibleFraction: worst.visibleFraction,
      clipped: anyCut,
      blamed,
      seen,
      truncation,
      srOnly,
      // the OLD, BLIND test, run side by side so the report can print both
      legacyClipsOwnText: parent.scrollWidth > parent.clientWidth + 1 && parent.clientWidth > 0,
    };
    rec.clipped = anyCut && !srOnly;
    records.push(rec);

    // ── what detector E is allowed to compare ────────────────────────────────
    // THE RECTS THAT ACTUALLY PAINT, not the raw line boxes. The first run of
    // this probe reported 21 overprints on the landscape iPhone, and 17 of them
    // were the SAME sentence in the two stacked panels "overlapping" — because
    // a `line-clamp-6` paragraph still HAS line boxes for the lines it does not
    // paint, sitting exactly where the next panel's text is. Comparing raw
    // rects therefore invents collisions between ink that does not exist. So
    // every rect is intersected with its own effective clip window first, and
    // anything with no surviving ink is not a participant.
    if (!hiddenBy && !srOnly) {
      for (const r of lineRects) {
        const painted = inter(r, effective);
        if (area(painted) <= 4) continue;
        paintedRects.push({ rect: painted, el: describe(parent), hud: hudOf(parent), text: (node.nodeValue || "").trim().slice(0, 40), node: parent });
      }
    }
  }

  // ── DETECTOR E — TEXT PRINTED OVER TEXT ────────────────────────────────────
  const overprints = [];
  for (let i = 0; i < paintedRects.length; i += 1) {
    for (let j = i + 1; j < paintedRects.length; j += 1) {
      const A = paintedRects[i];
      const B = paintedRects[j];
      if (A.node === B.node) continue;
      if (A.node.contains(B.node) || B.node.contains(A.node)) continue;
      const ov = area(inter(A.rect, B.rect));
      if (ov <= 2) continue;
      const frac = ov / Math.min(area(A.rect) || 1, area(B.rect) || 1);
      if (frac < 0.12) continue;
      overprints.push({
        a: { text: A.text, el: A.el, hud: A.hud, rect: out(A.rect) },
        b: { text: B.text, el: B.el, hud: B.hud, rect: out(B.rect) },
        overlapPx: Math.round(ov),
        overlapFraction: R1(frac * 100) / 100,
      });
    }
  }

  // ── the canvas, and how much of it the hardware eats ───────────────────────
  let canvas = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!canvas || r.width * r.height > canvas.w * canvas.h) canvas = { w: R1(r.width), h: R1(r.height), x: R1(r.left), y: R1(r.top) };
  }

  // ── PROOF WE ARE IN A LESSON, not on the menu ──────────────────────────────
  // `?scenario&level` IS NOT A USABLE GATE: simulator-client.tsx:129-132
  // deliberately `history.replaceState`s both params away the moment the shell
  // mounts, so a correct run reports `/simulator` with an empty search. Reading
  // the URL therefore fails the run that WORKED. What proves a lesson is the
  // play shell itself — the driving HUD, a live canvas, and the lesson's own
  // words on screen.
  const briefing = document.querySelector('[aria-label="Инструкции за упражнението"]');
  const proof = {
    playMenu: !!document.querySelector('[data-hud="play-menu"]'),
    touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
    briefingCard: !!briefing,
    briefingText: briefing ? (briefing.textContent || "").trim().slice(0, 200) : null,
    // If the catalog is on screen we are on the MENU, whatever else is true.
    catalogCards: document.querySelectorAll('[data-testid="scenario-card"], [data-hud="lesson-select"]').length,
  };

  return {
    viewport: { w: vw, h: vh, dpr: window.devicePixelRatio },
    url: location.pathname + location.search,
    canvas,
    hasCanvas: canvas !== null,
    proof,
    touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
    textNodes: nodes.length,
    records,
    overprints,
    docScroll: {
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch(ENGINE_NAME === "webkit" ? {} : { args: GL });
console.log(`${"█".repeat(100)}`);
console.log(`[w11] AN INSTRUMENT THAT SEES WHAT A HUMAN SEES`);
console.log(`[w11] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " — THE FOUNDER'S ENGINE (Playwright WebKit ≠ Safari: no notch, no dynamic chrome, no per-site zoom)" : " — SECOND OPINION ONLY"}`);
console.log(`[w11] base ${BASE}`);
console.log(`[w11] route ${ROUTE}   ← A LESSON, not the menu`);
console.log(`[w11] motion ${MOTION}`);
console.log(`${"█".repeat(100)}`);

const { context: authCtx } = await newDeviceContext(browser, devices[0], {
  motion: MOTION,
  insets: "real",
});
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w11] signed in ONCE as ${EMAIL}\n`);

const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: MOTION,
    insets: "real",
    storageState,
  });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    viewport: { w: device.width, h: device.height },
    insetBanner: insetBanner(device, inset),
    inset,
    states: {},
  };
  console.log(`\n${"═".repeat(100)}`);
  console.log(`${device.label}   ${device.width}×${device.height} @dpr${device.dpr}`);
  console.log(`  ${rec.insetBanner}`);

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6000);

    // THE PICTURES ARE THE VERDICT. Six sweeps have published numbers; the
    // numbers were wrong every time and the frames were right every time. So:
    // the whole screen at device scale (3×, sharp enough to see a glyph cut
    // through the waist), the whole screen at CSS scale (1:1 with every
    // coordinate in this report), an EDGE BAND per side — which is where a
    // screen-clip lives and where a full-frame thumbnail hides it — and a crop
    // around every single text node the census flagged.
    const shoot = async (name, state) => {
      state.shots = [];
      const add = async (suffix, opts) => {
        const p = `${OUT}/${TAG}-${device.id}-${name}-${suffix}.png`;
        try {
          await page.screenshot({ path: p, ...opts });
          state.shots.push(p);
        } catch (e) {
          state.shots.push(`${p} FAILED: ${e.message}`);
        }
      };
      await add("full", { scale: "device" });
      await add("full1x", { scale: "css" });
      const W = device.width;
      const H = device.height;
      const BAND = Math.min(96, Math.round(H / 3));
      const SIDE = Math.min(120, Math.round(W / 3));
      await add("edge-top", { scale: "device", clip: { x: 0, y: 0, width: W, height: BAND } });
      await add("edge-bottom", { scale: "device", clip: { x: 0, y: H - BAND, width: W, height: BAND } });
      await add("edge-left", { scale: "device", clip: { x: 0, y: 0, width: SIDE, height: H } });
      await add("edge-right", { scale: "device", clip: { x: W - SIDE, y: 0, width: SIDE, height: H } });
      // one crop per flagged node, so nothing is judged from a thumbnail
      const flagged = state.records.filter((r) => r.clipped || (r.truncation && r.truncation.firing));
      let i = 0;
      for (const r of flagged) {
        i += 1;
        const u = r.union;
        if (!u) continue;
        const x = Math.max(0, Math.floor(u.l) - 10);
        const y = Math.max(0, Math.floor(u.t) - 14);
        const w = Math.min(W - x, Math.ceil(u.w) + 20);
        const h = Math.min(H - y, Math.ceil(u.h) + 28);
        if (w < 4 || h < 4) continue;
        await add(`flag${i}`, { scale: "device", clip: { x, y, width: w, height: h } });
        r.cropIndex = i;
      }
      return state.shots;
    };

    // ── STATE 1 — THE FRAME A LESSON OPENS ON. This is the frame the founder
    //    photographed: the briefing card is UP, the rotate hint is UP. Six
    //    sweeps dismissed these first and then measured an empty screen.
    const s1 = await page.evaluate(CENSUS);
    rec.states.opening = s1;
    console.log(
      `  GATE(opening) · hasCanvas ${s1.hasCanvas} · canvas ${JSON.stringify(s1.canvas)} · touchControls ${s1.touchControls} · url ${s1.url}`,
    );
    if (!s1.hasCanvas || !s1.canvas || s1.canvas.w < 40 || s1.canvas.h < 40 || !s1.touchControls) {
      rec.fatal = `NO LIVE CANVAS (${JSON.stringify(s1.canvas)}) OR NO TOUCH CONTROLS — refusing to report a screen that is not the product`;
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }
    console.log(`  PROOF(lesson) · ${JSON.stringify(s1.proof)}`);
    if (!s1.proof.touchControls || s1.proof.catalogCards > 0) {
      rec.fatal = `NOT IN A LESSON — proof ${JSON.stringify(s1.proof)}`;
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }
    await shoot("1-opening", s1);
    report("OPENING FRAME (briefing + hints up — the frame he photographed)", s1, device, inset);

    // ── STATE 2 — after the pre-drive cards are dismissed, i.e. driving.
    for (let i = 0; i < 8; i += 1) {
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(420);
    }
    await sleep(1400);
    const s2 = await page.evaluate(CENSUS);
    rec.states.driving = s2;
    await shoot("2-driving", s2);
    console.log(
      `  GATE(driving) · hasCanvas ${s2.hasCanvas} · canvas ${JSON.stringify(s2.canvas)} · touchControls ${s2.touchControls}`,
    );
    report("DRIVING FRAME (pre-drive cards dismissed)", s2, device, inset);

    // ── STATE 3 — «ЗАЩО» OPEN. THE STATE A STUDENT IS FORCED INTO.
    //    The peek card truncates the instruction, so the ONLY way to read it is
    //    to press «Защо» — and that opens `data-hud="overlay-read"`, a sheet
    //    anchored `bottom: var(--sim-dash-h)` that GROWS UPWARD, capped by
    //    `--sim-vh`. Every previous sweep measured the peek and stopped.
    // NO `page.reload()` HERE, AND THE FIRST DRAFT OF THIS PROBE PROVED WHY.
    // simulator-client.tsx:129-132 strips `?scenario&level` with
    // `history.replaceState` the moment the shell mounts, so a reload asks for
    // a bare `/simulator` — the MENU — and then waits 240 s for a
    // `[data-hud="touch-controls"]` that will never appear. That cost the first
    // deep run its first profile before it was caught. The card is still up in
    // the driving frame; the sheet is one press away from here.
    const whyAt = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((n) => /^(Защо|Списък)$/.test((n.textContent || "").trim()));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (whyAt) {
      await page.mouse.move(whyAt.x, whyAt.y);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      await sleep(1200);
      const s3 = await page.evaluate(CENSUS);
      s3.sheetOpen = await page.evaluate(() => !!document.querySelector('[data-hud="overlay-read"]'));
      rec.states.whyOpen = s3;
      await shoot("3-why-open", s3);
      console.log(`  SHEET · data-hud="overlay-read" present: ${s3.sheetOpen}`);
      report('«ЗАЩО» SHEET OPEN (the only way to read a truncated instruction)', s3, device, inset);

      // ── STATE 4 — SAFARI'S URL BAR RETRACTING, WHICH PLAYWRIGHT DOES NOT HAVE.
      //    The sheet's cap is `calc(var(--sim-vh) - var(--sim-dash-h) - .75rem)`
      //    and `--sim-vh` is the shell's reading of `visualViewport.height`. In
      //    this harness the glass never changes, so vv.height ≡ innerHeight and
      //    the cap can never exceed the stage — the overrun is UNREACHABLE
      //    here BY CONSTRUCTION. On the founder's phone the bar retracts and
      //    vv.height GROWS past the stage. Driving vv.height through the app's
      //    own hook is the closest this engine can get, and whether it
      //    reproduces or not is a finding either way.
      const grew = await page.evaluate((h) => {
        const vv = window.visualViewport;
        if (!vv) return { ok: false, why: "no visualViewport in this engine" };
        Object.defineProperty(vv, "height", { configurable: true, get: () => h });
        vv.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("resize"));
        return { ok: true, height: vv.height, innerHeight: window.innerHeight };
      }, device.height + 90);
      await sleep(900);
      const s4 = await page.evaluate(CENSUS);
      s4.vvDriver = grew;
      s4.simVh = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--sim-vh").trim() ||
        getComputedStyle(document.body).getPropertyValue("--sim-vh").trim() || null,
      );
      rec.states.urlBarRetracted = s4;
      await shoot("4-urlbar-retracted", s4);
      console.log(`  URL BAR · drove visualViewport.height to ${device.height + 90} (glass still ${device.height}) → ${JSON.stringify(grew)} · --sim-vh «${s4.simVh}»`);
      report(`URL BAR RETRACTED — visualViewport ${device.height}→${device.height + 90}, glass unchanged`, s4, device, inset);
    } else {
      rec.states.whyOpen = { skipped: "no «Защо» button on this frame" };
      console.log(`  SHEET · NO «Защо» BUTTON FOUND — cannot open the read sheet on this profile`);
    }
  } catch (err) {
    rec.error = String(err && err.message ? err.message : err);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  await context.close();
}

function report(title, s, device, inset) {
  const clipped = s.records.filter((r) => r.clipped);
  const truncated = s.records.filter((r) => r.truncation && r.truncation.firing);
  const legacy = s.records.filter((r) => r.legacyClipsOwnText);
  const srOnly = s.records.filter((r) => r.srOnly);
  const byScreen = clipped.filter((r) => r.blamed.some((b) => b.byViewport));
  const byScreenTop = clipped.filter((r) => r.blamed.some((b) => b.byViewport && b.side === "top"));
  console.log(`\n  ── ${title} ──`);
  console.log(
    `  text nodes ${s.textNodes} · THE OLD TEST (el.scrollWidth>el.clientWidth) says ${legacy.length} ` +
      `· THIS INSTRUMENT says ${clipped.length} clipped + ${truncated.length} truncated + ${s.overprints.length} overprints ` +
      `(+${srOnly.length} sr-only, excluded on purpose)`,
  );
  console.log(
    `  of the ${clipped.length} clipped: ${byScreen.length} cut by THE SCREEN ITSELF, of which ${byScreenTop.length} by the TOP EDGE`,
  );
  // THE EDGE TRADE — viewportFit:"cover" means the hardware, not the layout,
  // owns these bands. Reported, never decided here.
  if (s.canvas) {
    const eaten = inset.left + inset.right;
    console.log(
      `  EDGE TRADE · viewportFit:"cover" → canvas ${s.canvas.w}×${s.canvas.h} at (${s.canvas.x},${s.canvas.y}); ` +
        `device insets l${inset.left} r${inset.right} t${inset.top} b${inset.bottom} = ${eaten}px of ${device.width} ` +
        `(${Math.round((eaten / device.width) * 1000) / 10}% of the width) of PICTURE under the Island and the rounded corners. ` +
        `No control is in there — the ROAD is. FOUNDER'S CALL, not this sweep's.`,
    );
  }
  for (const r of clipped) {
    const sides = r.blamed
      .map((b) => `${b.side}←${b.byViewport ? "THE SCREEN" : b.byAncestor || "?"}${b.recoverableByScrolling ? " (scrollable)" : ""}`)
      .join(", ");
    console.log(`  ✂ CLIPPED  [${r.hud || "—"}] «${r.text}»`);
    console.log(`      rect ${JSON.stringify(r.union)} · effective window ${JSON.stringify(r.effective)}`);
    console.log(`      cut on ${sides}`);
    for (const l of r.lines) {
      if (l.visibleFraction >= 0.995) continue;
      const kind =
        l.visibleFraction === 0
          ? "LINE ENTIRELY OFF SCREEN"
          : l.visibleHeightPx < l.heightPx - 0.5 && l.visibleHeightPx > 0
            ? `GLYPHS SLICED HORIZONTALLY — ${l.visibleHeightPx} of ${l.heightPx}px of the line height survives`
            : `${Math.round(l.visibleFraction * 100)}% of the line visible`;
      console.log(`      · line @y${l.rect.t} ${kind} (visible ${Math.round(l.visibleFraction * 100)}%, cut ${l.cutSides.join("+") || "—"})`);
    }
    if (r.seen) {
      console.log(`      FULL     «${r.seen.full}»`);
      console.log(`      RENDERED «${r.seen.rendered}»   (· = a character with no pixels on screen)`);
      console.log(`      ${r.seen.charsFullyGone} characters invisible, ${r.seen.charsSliced} sliced${r.seen.slicedSample ? ` («${r.seen.slicedSample}»)` : ""}`);
    }
    console.log(`      the old test would have said: ${r.legacyClipsOwnText ? "clipped" : "NOT CLIPPED  ← this is the blind spot"}`);
  }
  for (const r of truncated) {
    console.log(`  … TRUNCATED [${r.hud || "—"}] ${r.truncation.kind} on ${r.truncation.el}`);
    console.log(`      FULL  (${r.truncation.fullLen} chars) «${r.truncation.fullText}»`);
    console.log(`      overflow x${r.truncation.overflowXPx}px y${r.truncation.overflowYPx}px — the student is shown less than this and is not told`);
  }
  for (const o of s.overprints) {
    console.log(`  ▓ OVERPRINT «${o.a.text}» [${o.a.hud || "—"}] over «${o.b.text}» [${o.b.hud || "—"}] — ${Math.round(o.overlapFraction * 100)}% of the smaller box`);
    console.log(`      ${JSON.stringify(o.a.rect)}  ∩  ${JSON.stringify(o.b.rect)}`);
  }
  if (clipped.length === 0 && truncated.length === 0 && s.overprints.length === 0) {
    console.log(`  (nothing — and this instrument CAN fail: it names ${s.records.length} text nodes and their clip chains in the JSON)`);
  }
}

writeFileSync(`${OUT}/${TAG}-${ENGINE_NAME}.json`, JSON.stringify(results, null, 2));
console.log(`\n[w11] wrote ${OUT}/${TAG}-${ENGINE_NAME}.json`);
console.log(`[w11] SCREENSHOTS ARE THE VERDICT. ${OUT}`);
await browser.close();
