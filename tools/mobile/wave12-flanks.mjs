#!/usr/bin/env node
// =============================================================================
// wave12-flanks.mjs — HOW MUCH OF THE PICTURE DOES THE UI EAT, AND ARE THE
// FLANKS A BAND OR A DIAGONAL.
//
// The founder judges this screen BY EYE, and the two things his eye reports are
// „the controls read as debris on the road" and „the road is only ~40 % of the
// screen". Both are AREA questions, and no sweep in this project has ever put a
// number on either. So this instrument answers exactly three:
//
//  1. COVER — what percentage of the driving view (the WebGL canvas rect) is
//     covered by DOM that PAINTS. Not „how many elements overlap it": a union
//     rasterised at 2 CSS px per cell, so two panels stacked on the same pixels
//     are counted once, and an invisible 176 px pad is counted ZERO because it
//     paints nothing and his eye cannot see it. INK is the headline number;
//     REACH (the same union including the transparent gesture zones) is printed
//     beside it so nobody can confuse „the thumb owns it" with „it hides the
//     road".
//
//  2. BAND OR DIAGONAL — every flank station's own rect, its inset from the
//     near screen edge, and the two numbers that decide the founder's word
//     „debris": `insetSpread` (max inset − min inset across a flank; a BAND is
//     0, today's arc is 88 px) and the vertical pitch between neighbours. A
//     band is a column of boxes at ONE inset; anything else is a stagger, and
//     a stagger over a moving 3-D scene is what reads as litter.
//
//  3. IS ANYTHING ON TOP OF THEM — `elementFromPoint` at each station's centre
//     AND at the four corners of its 44 px box. „NOTHING may ever cover them"
//     is a constraint, so it is tested as one rather than asserted in a comment.
//
// PLUS the regression guard the last wave paid for: the geometry must NOT be a
// function of viewport height. The sweep measures every station, slides the
// stage 90 px shorter (what Safari's URL bar does), measures again, and prints
// the delta. Inset and pitch must both be 0.
//
//   node tools/mobile/wave12-flanks.mjs --base https://…trycloudflare.com --tag before
//
// NO `page.reload()` and no `?scenario` gate — simulator-client.tsx:129-132
// replaceState's both params away the moment the shell mounts, so a reload asks
// for the MENU and a param gate fails the run that worked. Both cost a previous
// wave a run. Gate on the canvas and on `[data-hud="touch-controls"]`.
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit, chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "before");
const ENGINE_NAME = arg("engine", "webkit");
const MOTION = arg("motion", "allow"); // MANDATORY argument to newDeviceContext
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave12-flanks`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chromium refuses a real GPU in this container; WebKit is the founder's engine
// and needs no flags. Kept so `--engine chromium` remains a usable second
// opinion rather than a swrast slideshow.
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

// Fullscreen is blocked for the same reason as wave 11: Chromium grants a
// fullscreen iOS Safari refuses, and the whole sweep then measures a screen the
// founder's bug cannot occur on.
const NO_FULLSCREEN = () => {
  try {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false, configurable: true });
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("blocked by probe"));
  } catch {
    /* engine without the descriptor — nothing to do */
  }
};

// ---------------------------------------------------------------------------
// THE CENSUS — runs in the page.
// ---------------------------------------------------------------------------
const CENSUS = () => {
  const R = (r) => ({
    x: Math.round(r.left * 10) / 10,
    y: Math.round(r.top * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
  });

  const canvas = document.querySelector("canvas");
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The "driving view" is the canvas if it is real, otherwise the viewport —
  // and which one it was is printed, because a fallback silently changing the
  // denominator is how a coverage number becomes a lie.
  const stage = cr && cr.width > 40 && cr.height > 40 ? cr : new DOMRect(0, 0, vw, vh);
  const stageIsCanvas = !!(cr && cr.width > 40 && cr.height > 40);

  const alpha = (c) => {
    if (!c || c === "transparent") return 0;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return 1;
    const p = m[1].split(",").map((s) => parseFloat(s));
    return p.length >= 4 ? p[3] : 1;
  };

  // Does this element PAINT anything a human would see? Background, border,
  // shadow, backdrop-filter, an image — or its own (non-inherited) text.
  /** The strongest alpha in a colour or gradient string — 0 when there is none. */
  const peakAlpha = (value) => {
    if (!value || value === "none") return 0;
    let peak = 0;
    // `rgb(...)` with no alpha is opaque; `rgba(...)` carries it; a gradient is
    // a list of either. One regex over all of them, biggest stop wins.
    const re = /rgba?\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
      const p = m[1].split(",").map((s) => parseFloat(s));
      peak = Math.max(peak, p.length >= 4 ? (Number.isFinite(p[3]) ? p[3] : 1) : 1);
    }
    // A url()/image gradient we cannot parse counts as opaque rather than free.
    if (peak === 0 && /url\(|gradient/.test(value)) peak = 1;
    return peak;
  };

  const paintsInfo = (el, cs) => {
    const why = [];
    if (alpha(cs.backgroundColor) > 0.02) why.push(`bg${Math.round(alpha(cs.backgroundColor) * 100)}`);
    if (cs.backgroundImage && cs.backgroundImage !== "none") why.push("bgimg");
    if (cs.boxShadow && cs.boxShadow !== "none") why.push("shadow");
    if (cs.backdropFilter && cs.backdropFilter !== "none") why.push("backdrop");
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs[`border${side}Width`]) > 0.4 && alpha(cs[`border${side}Color`]) > 0.02) {
        why.push("border");
        break;
      }
    }
    if (el.tagName === "IMG" || el.tagName === "SVG" || el.tagName === "svg") why.push("img");
    // Own text: a direct text child with visible ink.
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.nodeValue || ""));
    if (ownText && alpha(cs.color) > 0.05) why.push("text");
    return why;
  };

  /** Does this element (or any ancestor) paint behind the in-flow picture? */
  const behind = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const z = getComputedStyle(n).zIndex;
      if (z && z !== "auto" && Number(z) < 0) return true;
      n = n.parentElement;
    }
    return false;
  };

  const hidden = (cs) =>
    cs.display === "none" ||
    cs.visibility === "hidden" ||
    parseFloat(cs.opacity || "1") <= 0.02;

  // Rasterise the union. 2 CSS px cells over the stage: 852x393 → 426x197
  // cells, 84k booleans, and it makes overlapping panels count once.
  const CELL = 2;
  const cols = Math.max(1, Math.ceil(stage.width / CELL));
  const rows = Math.max(1, Math.ceil(stage.height / CELL));
  const inkGrid = new Uint8Array(cols * rows);
  const reachGrid = new Uint8Array(cols * rows);
  // …AND THE SAME UNION WEIGHTED BY HOW OPAQUE IT ACTUALLY IS.
  // A boolean grid scores a 5 %-alpha gradient exactly as it scores a solid
  // panel, and this wave adds a deliberately faint one behind each flank — so
  // a boolean-only headline would report the ghost rail as though it were
  // chrome. `alphaGrid` keeps the STRONGEST alpha any element laid on each
  // cell, so the two numbers together say „how much of the picture has
  // something on it" AND „how much of it is actually obscured".
  const alphaGrid = new Float32Array(cols * rows);

  const mark = (grid, r) => {
    const x0 = Math.max(0, Math.floor((r.left - stage.left) / CELL));
    const x1 = Math.min(cols, Math.ceil((r.right - stage.left) / CELL));
    const y0 = Math.max(0, Math.floor((r.top - stage.top) / CELL));
    const y1 = Math.min(rows, Math.ceil((r.bottom - stage.top) / CELL));
    let n = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = y * cols + x;
        if (!grid[i]) {
          grid[i] = 1;
          n += 1;
        }
      }
    }
    return n;
  };

  const zoneOf = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const h = n.getAttribute && n.getAttribute("data-hud");
      if (h) return h;
      n = n.parentElement;
    }
    return "other";
  };

  const zoneGrids = new Map();
  const zoneGrid = (name) => {
    if (!zoneGrids.has(name)) zoneGrids.set(name, new Uint8Array(cols * rows));
    return zoneGrids.get(name);
  };

  const all = document.body ? document.body.querySelectorAll("*") : [];
  let painters = 0;
  const biggest = [];
  for (const el of all) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|HEAD|META|LINK|TITLE)$/.test(el.tagName)) continue;
    if (el.tagName === "CANVAS") continue; // the stage itself is not UI
    // ── THE INSTRUMENT'S OWN FIRST BUG, FIXED BEFORE IT PUBLISHED A NUMBER ──
    // The first run reported „100.3 % of the driving view is UI" on every
    // profile, which is absurd on its face and is exactly the kind of number
    // six previous waves shipped. The cause: the canvas's own ANCESTORS — the
    // shell, the stage wrapper, <div id="__next"> — are full-bleed boxes with a
    // background colour, so a rect-union counted the page's own backdrop as
    // chrome. An ancestor of the canvas paints BEHIND the canvas and the
    // student never sees a pixel of it. One line, and the metric becomes true.
    if (el.contains(canvas)) continue;
    // ── AND THE SECOND ONE, WHICH THE FIRST FIX EXPOSED ──────────────────────
    // With the ancestors gone the number was STILL 100.3 %, and the „who eats
    // it" line named the culprit in one row:
    //   div.deck.pointer-events-none.fixed.inset-0.-z-10 — 852×393, opaque.
    // A full-bleed backdrop at z-index −10. It is not an ancestor of the canvas
    // and it paints, so a rect test sees chrome; it is BEHIND the canvas, so a
    // student sees nothing of it. Anything at a negative z-index, itself or via
    // an ancestor, is behind the picture and is not UI over it.
    if (behind(el)) continue;
    const cs = getComputedStyle(el);
    if (hidden(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) continue;
    if (r.right <= stage.left || r.left >= stage.right || r.bottom <= stage.top || r.top >= stage.bottom) continue;
    // sr-only idiom: a 1px clip box. Not ink.
    if (r.width <= 1.5 && r.height <= 1.5) continue;
    const interactive = cs.pointerEvents !== "none";
    if (interactive) mark(reachGrid, r);
    const why = paintsInfo(el, cs);
    if (why.length > 0) {
      painters += 1;
      const fresh = mark(inkGrid, r);
      mark(zoneGrid(zoneOf(el)), r);
      // How much of the picture this element actually HIDES. Text is charged a
      // nominal 0.35 of its line box rather than its glyph coverage — a text
      // node's rect is mostly the spaces between letters, and charging it 1.0
      // would make a sentence read like a panel.
      const strength = Math.max(
        peakAlpha(cs.backgroundColor),
        peakAlpha(cs.backgroundImage),
        why.includes("text") ? 0.35 * Math.max(0.2, alpha(cs.color)) : 0,
      );
      if (strength > 0) {
        const x0 = Math.max(0, Math.floor((r.left - stage.left) / CELL));
        const x1 = Math.min(cols, Math.ceil((r.right - stage.left) / CELL));
        const y0 = Math.max(0, Math.floor((r.top - stage.top) / CELL));
        const y1 = Math.min(rows, Math.ceil((r.bottom - stage.top) / CELL));
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = y * cols + x;
            if (alphaGrid[i] < strength) alphaGrid[i] = strength;
          }
        }
      }
      // WHO ACTUALLY EATS THE PICTURE — the elements that contributed NEW
      // cells, biggest first. Without this the headline is a number nobody can
      // argue with, which is how „0 clipped" survived six waves.
      if (fresh > 0) {
        biggest.push({
          tag: el.tagName.toLowerCase(),
          hud: el.getAttribute("data-hud") || zoneOf(el),
          cls: (el.getAttribute("class") || "").slice(0, 70),
          why: why.join("+"),
          rect: R(r),
          freshPct: Math.round(((fresh * CELL * CELL) / (stage.width * stage.height)) * 1000) / 10,
        });
      }
    }
  }
  biggest.sort((a, b) => b.freshPct - a.freshPct);

  const count = (g) => {
    let n = 0;
    for (let i = 0; i < g.length; i += 1) if (g[i]) n += 1;
    return n;
  };
  const cellArea = CELL * CELL;
  const stageArea = stage.width * stage.height;
  const pct = (cells) => Math.round(((cells * cellArea) / stageArea) * 1000) / 10;

  const zoneOut = {};
  for (const [name, g] of zoneGrids) {
    const c = count(g);
    if (c > 0) zoneOut[name] = { pct: pct(c), px2: c * cellArea };
  }

  // ── THE CENTRE CORRIDOR ───────────────────────────────────────────────────
  // „debris ON THE DRIVING VIEW" is not about total ink — it is about ink in
  // the middle, where the lane, the vanishing point and the thing being steered
  // at are. notifyColumn.ts already fixes 0.60 as „off the middle of the road";
  // this is the same idea measured instead of asserted: the central 50 % of the
  // width, full height, counted separately. A control hard against the edge
  // scores 0 here however much ink it has.
  const cx0 = Math.floor(cols * 0.25);
  const cx1 = Math.ceil(cols * 0.75);
  let centreCells = 0;
  let centreTotal = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = cx0; x < cx1; x += 1) {
      centreTotal += 1;
      if (inkGrid[y * cols + x]) centreCells += 1;
    }
  }
  const centrePct = centreTotal ? Math.round((centreCells / centreTotal) * 1000) / 10 : 0;
  let alphaSum = 0;
  for (let i = 0; i < alphaGrid.length; i += 1) alphaSum += alphaGrid[i];
  const obscuredPct = Math.round((alphaSum / (cols * rows)) * 1000) / 10;

  // ── THE FLANK STATIONS ────────────────────────────────────────────────────
  // Read off the DOM, not off the source: `data-arc` is the station marker and
  // it carries its own side and index, so the instrument does not have to know
  // the layout to check it.
  let stationEls = [...document.querySelectorAll("[data-arc]")];
  let stationSource = "data-arc";
  if (stationEls.length === 0) {
    // FALLBACK for a build that predates the marker — which is exactly the
    // BEFORE build, and a probe that can only measure the fix is worthless.
    // A station is an absolutely-positioned ~44 px cell inside the touch HUD
    // holding one button. Stated as a shape so it needs no source knowledge.
    stationSource = "shape (pre-marker build)";
    const hud = document.querySelector('[data-hud="touch-controls"]');
    if (hud) {
      stationEls = [...hud.querySelectorAll("button")]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          if (r.width < 38 || r.width > 64 || r.height < 38 || r.height > 64) return false;
          const p = b.parentElement;
          if (!p || getComputedStyle(p).position !== "absolute") return false;
          // …AND EXACTLY ONE BUTTON IN IT. The first run without this clause
          // reported a FOURTH left station reading «ИзгледПауза» with a 164 px
          // pitch: the TOP RAIL's own absolutely-positioned flex row, which
          // holds three buttons. A station is a one-control cell; a rail is
          // not, and the difference is countable rather than a guess.
          if (p.querySelectorAll("button").length !== 1) return false;
          return p.parentElement === hud;
        })
        .map((b) => b.parentElement);
      stationEls = [...new Set(stationEls)];
    }
  }
  const stations = stationEls.map((el) => {
    const r = el.getBoundingClientRect();
    const btn = el.querySelector("button") || el;
    const br = btn.getBoundingClientRect();
    const side = el.getAttribute("data-arc-side") || (r.left + r.width / 2 < vw / 2 ? "left" : "right");
    const caption = (el.textContent || "").replace(/\s+/g, " ").trim();
    const label = btn.getAttribute("aria-label") || "";
    const cx = Math.round(br.left + br.width / 2);
    const cy = Math.round(br.top + br.height / 2);
    const probe = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return "NONE";
      if (hit === btn || btn.contains(hit) || hit.contains(btn)) return "self";
      return `${hit.tagName.toLowerCase()}${hit.getAttribute("data-hud") ? `[${hit.getAttribute("data-hud")}]` : ""}:${(hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24)}`;
    };
    const inset = side === "left" ? br.left : vw - br.right;
    return {
      side,
      index: Number(el.getAttribute("data-arc") ?? -1),
      caption,
      label,
      box: R(br),
      insetPx: Math.round(inset * 10) / 10,
      bottomPx: Math.round((vh - br.bottom) * 10) / 10,
      minSidePx: Math.round(Math.min(br.width, br.height) * 10) / 10,
      centreHit: probe(cx, cy),
      corners: [
        probe(Math.round(br.left) + 2, Math.round(br.top) + 2),
        probe(Math.round(br.right) - 2, Math.round(br.top) + 2),
        probe(Math.round(br.left) + 2, Math.round(br.bottom) - 2),
        probe(Math.round(br.right) - 2, Math.round(br.bottom) - 2),
      ],
    };
  });

  const perSide = {};
  for (const side of ["left", "right"]) {
    const s = stations.filter((t) => t.side === side).sort((a, b) => b.box.y - a.box.y);
    if (s.length === 0) continue;
    const insets = s.map((t) => t.insetPx);
    const pitches = [];
    for (let i = 1; i < s.length; i += 1) pitches.push(Math.round((s[i - 1].box.y - s[i].box.y) * 10) / 10);
    const bx0 = Math.min(...s.map((t) => t.box.x));
    const bx1 = Math.max(...s.map((t) => t.box.x + t.box.w));
    const by0 = Math.min(...s.map((t) => t.box.y));
    const by1 = Math.max(...s.map((t) => t.box.y + t.box.h));
    perSide[side] = {
      count: s.length,
      order: s.map((t) => t.caption || t.label),
      insets,
      insetSpreadPx: Math.round((Math.max(...insets) - Math.min(...insets)) * 10) / 10,
      pitches,
      minPitchPx: pitches.length ? Math.min(...pitches) : null,
      minHitPx: Math.min(...s.map((t) => t.minSidePx)),
      bandBox: { x: Math.round(bx0), y: Math.round(by0), w: Math.round(bx1 - bx0), h: Math.round(by1 - by0) },
      bandPctOfStage: Math.round((((bx1 - bx0) * (by1 - by0)) / stageArea) * 1000) / 10,
      covered: s.filter((t) => t.centreHit !== "self" || t.corners.some((c) => c !== "self")).map((t) => ({
        caption: t.caption || t.label,
        centreHit: t.centreHit,
        corners: t.corners,
      })),
    };
  }

  return {
    url: location.pathname + location.search,
    viewport: { w: vw, h: vh },
    stageIsCanvas,
    stage: R(stage),
    stagePctOfViewport: Math.round(((stage.width * stage.height) / (vw * vh)) * 1000) / 10,
    hasCanvas: !!canvas,
    touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
    catalogCards: document.querySelectorAll('[data-testid="scenario-card"]').length,
    inkPct: pct(count(inkGrid)),
    obscuredPct,
    centrePct,
    reachPct: pct(count(reachGrid)),
    painters,
    zones: zoneOut,
    biggest: biggest.slice(0, 10),
    stationSource,
    stations,
    perSide,
  };
};

// ---------------------------------------------------------------------------
const line = (s) => console.log(s);
const bar = (p) => {
  const n = Math.max(0, Math.min(40, Math.round(p * 0.4)));
  return `${"█".repeat(n)}${"·".repeat(40 - n)}`;
};

function report(title, c, device) {
  line(`\n  ── ${title} ──`);
  line(`     stage ${c.stage.w}x${c.stage.h} at (${c.stage.x},${c.stage.y})  ${c.stageIsCanvas ? "= THE CANVAS" : "= VIEWPORT FALLBACK (no live canvas!)"}  · ${c.stagePctOfViewport}% of the glass`);
  line(`     UI INK OVER THE DRIVING VIEW   ${String(c.inkPct).padStart(5)}%  ${bar(c.inkPct)}   (${c.painters} painting elements, union, 2px cells)`);
  line(`     …OF WHICH ACTUALLY OBSCURED   ${String(c.obscuredPct).padStart(5)}%  ${bar(c.obscuredPct)}   (the same union weighted by alpha — a ghost is not a panel)`);
  line(`     INK IN THE CENTRE CORRIDOR     ${String(c.centrePct).padStart(5)}%  ${bar(c.centrePct)}   (middle 50% of the width — where the road is)`);
  line(`     stations found via ${c.stationSource} · ${c.stations.length}`);
  line(`     thumb REACH (incl. invisible)  ${String(c.reachPct).padStart(5)}%  ${bar(c.reachPct)}`);
  const zs = Object.entries(c.zones).sort((a, b) => b[1].pct - a[1].pct).slice(0, 8);
  for (const [n, z] of zs) line(`       · ${n.padEnd(24)} ${String(z.pct).padStart(5)}%`);
  line(`     WHO EATS IT (new cells, biggest first):`);
  for (const b of (c.biggest || []).slice(0, 6)) {
    line(`       ${String(b.freshPct).padStart(5)}%  ${b.tag}[${b.hud}] ${b.why}  ${b.rect.w}x${b.rect.h}@(${b.rect.x},${b.rect.y})  ${b.cls}`);
  }
  for (const side of ["left", "right"]) {
    const s = c.perSide[side];
    if (!s) {
      line(`     ${side.toUpperCase()} FLANK · NO STATIONS FOUND`);
      continue;
    }
    const verdict = s.insetSpreadPx <= 2 ? "BAND ✓" : `DIAGONAL ✗ (${s.insetSpreadPx}px stagger)`;
    line(
      `     ${side.toUpperCase()} FLANK ${verdict} · ${s.count} stations · insets [${s.insets.join(", ")}] · pitch [${s.pitches.join(", ")}] · min hit ${s.minHitPx}px · band ${s.bandBox.w}x${s.bandBox.h} = ${s.bandPctOfStage}% of stage`,
    );
    line(`        bottom→top: ${s.order.join("  ")}`);
    if (s.covered.length) {
      for (const cv of s.covered) line(`        ✗ COVERED · ${cv.caption} · centre→${cv.centreHit} · corners ${cv.corners.join(" | ")}`);
    } else {
      line(`        ✓ nothing on top of any station (centre + 4 corners)`);
    }
  }
}

// ---------------------------------------------------------------------------
const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch(ENGINE_NAME === "webkit" ? {} : { args: GL });
line("█".repeat(100));
line(`[w12] FLANKS — how much of the picture the UI eats, and band-or-diagonal`);
line(`[w12] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " — THE FOUNDER'S ENGINE" : " — SECOND OPINION ONLY"}   tag ${TAG}`);
line(`[w12] base ${BASE}`);
line(`[w12] route ${ROUTE}   ← A LESSON, not the menu`);
line(`[w12] motion ${MOTION}`);
line("█".repeat(100));

const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: MOTION, insets: "real" });
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
line(`[w12] signed in ONCE as ${EMAIL}\n`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: MOTION, insets: "real", storageState });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    tag: TAG,
    viewport: { w: device.width, h: device.height },
    insetBanner: insetBanner(device, inset),
    inset,
    states: {},
  };
  line(`\n${"═".repeat(100)}`);
  line(`${device.label}   ${device.width}x${device.height} @dpr${device.dpr}`);
  line(`  ${rec.insetBanner}`);

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6000);

    const shoot = async (name) => {
      const p = `${OUT}/${TAG}-${device.id}-${name}.png`;
      try {
        await page.screenshot({ path: p });
        return p;
      } catch (e) {
        return `${p} FAILED: ${e.message}`;
      }
    };

    // ── STATE 1 · OPENING — the frame he photographed, briefing still up.
    const s1 = await page.evaluate(CENSUS);
    rec.states.opening = s1;
    line(`  GATE · hasCanvas ${s1.hasCanvas} · stageIsCanvas ${s1.stageIsCanvas} · stage ${JSON.stringify(s1.stage)} · touchControls ${s1.touchControls} · url ${s1.url}`);
    if (!s1.hasCanvas || !s1.stageIsCanvas || !s1.touchControls || s1.catalogCards > 0) {
      rec.fatal = `NOT A LIVE LESSON — hasCanvas ${s1.hasCanvas} stageIsCanvas ${s1.stageIsCanvas} touchControls ${s1.touchControls} catalogCards ${s1.catalogCards}`;
      line(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }
    rec.states.opening.shot = await shoot("1-opening");
    report("OPENING (briefing up — the frame he photographed)", s1, device);

    // ── STATE 2 · DRIVING — cards dismissed, the flanks alone over the road.
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
    await sleep(1600);
    const s2 = await page.evaluate(CENSUS);
    rec.states.driving = s2;
    rec.states.driving.shot = await shoot("2-driving");
    report("DRIVING (cards dismissed — the flanks alone over the road)", s2, device);

    // ── STATE 3 · THE HEIGHT GUARD. Slide the stage 90 px shorter, which is
    //    what Safari's URL bar does, and prove the flank geometry does not
    //    move. Last wave fixed exactly this and it must not regress.
    await page.setViewportSize({ width: device.width, height: Math.max(240, device.height - 90) });
    await sleep(1200);
    const s3 = await page.evaluate(CENSUS);
    rec.states.shortStage = s3;
    rec.states.shortStage.shot = await shoot("3-short-stage");
    const drift = {};
    for (const side of ["left", "right"]) {
      const a = s2.perSide[side];
      const b = s3.perSide[side];
      if (!a || !b) continue;
      drift[side] = {
        insetDelta: Math.round((Math.max(...b.insets) - Math.max(...a.insets)) * 10) / 10,
        spreadDelta: Math.round((b.insetSpreadPx - a.insetSpreadPx) * 10) / 10,
        pitchDelta: a.minPitchPx !== null && b.minPitchPx !== null ? Math.round((b.minPitchPx - a.minPitchPx) * 10) / 10 : null,
        countDelta: b.count - a.count,
      };
    }
    rec.heightDrift = drift;
    line(`\n  ── HEIGHT GUARD (stage −90 px, i.e. the URL bar sliding) ──`);
    for (const [side, d] of Object.entries(drift)) {
      const ok = d.insetDelta === 0 && d.spreadDelta === 0 && (d.pitchDelta === 0 || d.pitchDelta === null) && d.countDelta === 0;
      line(`     ${side.toUpperCase()} ${ok ? "✓ geometry unchanged" : "✗ GEOMETRY MOVED"} · inset ${d.insetDelta} · spread ${d.spreadDelta} · pitch ${d.pitchDelta} · count ${d.countDelta}`);
    }
    await page.setViewportSize({ width: device.width, height: device.height });
  } catch (e) {
    rec.fatal = `${e.message}`;
    line(`  FATAL · ${e.message}`);
  }
  results.push(rec);
  await context.close();
}

await browser.close();

// ── THE TABLE ───────────────────────────────────────────────────────────────
line(`\n${"█".repeat(100)}`);
line(`[w12] SUMMARY · tag ${TAG}`);
line("█".repeat(100));
line(
  `${"profile".padEnd(26)}${"ink open".padStart(9)}${"ink drive".padStart(10)}${"obscur".padStart(8)}${"centre".padStart(8)}${"L spread".padStart(10)}${"R spread".padStart(10)}${"minHit".padStart(8)}${"covered".padStart(9)}`,
);
for (const r of results) {
  if (r.fatal) {
    line(`${r.device.padEnd(26)}  FATAL · ${r.fatal}`);
    continue;
  }
  const o = r.states.opening;
  const d = r.states.driving;
  const ls = d.perSide.left?.insetSpreadPx ?? "—";
  const rs = d.perSide.right?.insetSpreadPx ?? "—";
  const mh = Math.min(d.perSide.left?.minHitPx ?? 999, d.perSide.right?.minHitPx ?? 999);
  const cov = (d.perSide.left?.covered.length ?? 0) + (d.perSide.right?.covered.length ?? 0);
  line(
    `${r.device.padEnd(26)}${String(o.inkPct).padStart(9)}${String(d.inkPct).padStart(10)}${String(d.obscuredPct).padStart(8)}${String(d.centrePct).padStart(8)}${String(ls).padStart(10)}${String(rs).padStart(10)}${String(mh).padStart(8)}${String(cov).padStart(9)}`,
  );
}
const path = `${OUT}/${TAG}.json`;
writeFileSync(path, JSON.stringify({ base: BASE, route: ROUTE, engine: ENGINE_NAME, tag: TAG, results }, null, 2));
line(`\n[w12] census → ${path}`);
line(`[w12] frames → ${OUT}`);
