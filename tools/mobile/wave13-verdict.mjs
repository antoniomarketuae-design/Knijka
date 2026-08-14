#!/usr/bin/env node
// =============================================================================
// wave13-verdict.mjs — THE FOUNDER'S OWN CHECKLIST, MEASURED, ON THE DEPLOYED
// BUILD, WITH THE SENTENCE QUOTED BACK.
//
// Seven waves have told him „fixed" and he has refuted every one of them from
// his phone. The difference this file is meant to make is that it does not
// report a COUNT — it reports the STRING. „0 clipped" is what six sweeps said
// while the headline was being cut through the waist of its own letters; a
// quoted sentence cannot lie in the same direction, because he can read it and
// compare it to his screen.
//
// WHAT IT ANSWERS, one pass per profile:
//
//  1 · THE INSTRUCTION. The text the card actually renders, read back character
//      by character against the intersection of every clipping ancestor's
//      padding box AND the viewport, then printed as three separate strings:
//        · WHAT IS IN THE DOM        (what the lesson authored into the card)
//        · WHAT SURVIVES CLIPPING    (what a student's eye can land on)
//        · WHAT IS BELOW THE FOLD    (honest: the window scrolls, so some of
//                                     the briefing is reachable but not shown)
//      Plus the three defects he named, each as a boolean with its evidence:
//        SLICED   — a line box cut horizontally, with the surviving px of its
//                   line height (his „decapitated glyph-tops")
//        ELLIPSIS — `text-overflow: ellipsis` or `-webkit-line-clamp` actually
//                   FIRING, read off the clamping ancestor, never the text node
//        DUPLICATE— the body repeating the headline sentence, which is the
//                   „second greyed copy" he photographed
//
//  2 · THE «ПРОЧЕТИ» SHEET. The surface the card now points at. Same census.
//      If the card is an honest window, the sheet has to hold the whole thing —
//      so it is opened and quoted too, rather than assumed.
//
//  3 · THE EDGE TRADE, AS A PICTURE. `viewportFit: "cover"` hands the stage the
//      whole display, so in landscape the outer 59 px each side sit under the
//      Dynamic Island and the rounded corners. NOTHING IS CHANGED — this
//      captures one annotated frame so he can rule on it. The annotation is an
//      INSTRUMENT OVERLAY injected for exactly one screenshot and then removed,
//      and the census is re-run afterwards to prove the page went back.
//
//  4 · THE REGRESSION GUARDS the last two waves paid for:
//        · the flank geometry does not move when the stage height changes —
//          at −44 px AND at −90 px (wave 12 only ever tested −90)
//        · the absolute drive pad reads EXACTLY 0 held at dead centre
//        · nothing on either flank is under 44 px
//        · «Високо» still reaches the GPU: canvas.width / rect.width === 3
//
// ⚠ THE TWO HARNESS TRAPS THAT HAVE EACH COST A RUN, restated so the next
//   instrument does not pay them a third time:
//     · `?scenario&level` is NOT a usable gate. simulator-client.tsx:129-132
//       history.replaceState's both params away the moment the shell mounts.
//     · `page.reload()` is fatal for the same reason — it asks for a bare
//       /simulator, which is the MENU, and then waits for touch-controls that
//       never come. Gate on the canvas and on [data-hud="touch-controls"].
//
//   node tools/mobile/wave13-verdict.mjs --base https://…trycloudflare.com
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
const TAG = arg("tag", "w13");
const ENGINE_NAME = arg("engine", "webkit");
const MOTION = arg("motion", "allow");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave13-verdict`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (s) => console.log(s);

const NO_FULLSCREEN = () => {
  try {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false, configurable: true });
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("blocked by probe"));
  } catch {
    /* engine without the descriptor */
  }
};

// ---------------------------------------------------------------------------
// THE TEXT CENSUS — runs in the page.
//
// It takes a ROOT selector so the same function can read the peek card and the
// read sheet, and it answers in STRINGS. The character-level test is the whole
// point: `scrollWidth > clientWidth` on the text element is what six waves ran,
// and its only hit on this product was the sr-only skip link.
// ---------------------------------------------------------------------------
const TEXT_CENSUS = (rootSel) => {
  const root = document.querySelector(rootSel);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!root) return { found: false, rootSel };

  const R = (r) => ({
    x: Math.round(r.left * 10) / 10,
    y: Math.round(r.top * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
  });

  /** Every ancestor that can CLIP, intersected — plus the viewport. */
  const clipWindow = (node) => {
    let win = { l: 0, t: 0, r: vw, b: vh };
    let offender = "viewport";
    let el = node.parentElement;
    while (el) {
      const cs = getComputedStyle(el);
      const clips =
        cs.overflowX !== "visible" ||
        cs.overflowY !== "visible" ||
        (cs.webkitLineClamp && cs.webkitLineClamp !== "none");
      if (clips) {
        const r = el.getBoundingClientRect();
        // padding box: the border does not clip content, the padding edge does
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        const box = { l: r.left + bl, t: r.top + bt, r: r.right - br, b: r.bottom - bb };
        if (box.l > win.l || box.t > win.t || box.r < win.r || box.b < win.b) {
          if (box.l > win.l || box.t > win.t || box.r < win.r || box.b < win.b) {
            offender = `${el.tagName.toLowerCase()}${el.getAttribute("data-hud") ? `[${el.getAttribute("data-hud")}]` : ""}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 2).join(".")}` : ""}`;
          }
        }
        win = {
          l: Math.max(win.l, box.l),
          t: Math.max(win.t, box.t),
          r: Math.min(win.r, box.r),
          b: Math.min(win.b, box.b),
        };
      }
      el = el.parentElement;
    }
    return { win, offender };
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\S/.test(n.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });

  // PER-NODE, NOT ONE RUNNING STRING. The first run concatenated the chip and
  // the line into «Коланът не е поставенДвижеше се…», which reads as a missing
  // space in the PRODUCT when it is a missing separator in the INSTRUMENT.
  const nodes = [];
  const domParts = [];
  const visibleParts = [];
  const belowParts = [];
  let slicedChars = 0;
  let invisibleChars = 0;
  let totalChars = 0;
  const slicedLines = [];

  let tn;
  while ((tn = walker.nextNode())) {
    const parent = tn.parentElement;
    if (!parent) continue;
    const pcs = getComputedStyle(parent);
    if (pcs.display === "none" || pcs.visibility === "hidden" || parseFloat(pcs.opacity || "1") <= 0.02) continue;
    const raw = tn.nodeValue || "";
    const { win, offender } = clipWindow(tn);

    // sr-only idiom — a clip box of 1.5 px or less. Detected, EXCLUDED, and
    // COUNTED, because an instrument that cannot tell the visually-hidden
    // idiom from a defect buries the defect.
    if (win.r - win.l <= 1.5 || win.b - win.t <= 1.5) {
      nodes.push({ srOnly: true, text: raw.trim().slice(0, 40) });
      continue;
    }

    domParts.push(raw.replace(/\s+/g, " ").trim());
    let vis = "";
    let below = "";
    let sliced = 0;
    let gone = 0;
    const lineSurvival = new Map();

    for (let i = 0; i < raw.length; i += 1) {
      if (!/\S/.test(raw[i])) {
        // Whitespace rides with whatever came before it — IN BOTH STRINGS.
        // The first run of this file printed the below-fold text as
        // «потегляне—винаги,дориза100метра» because only `vis` got the space,
        // which makes a perfectly good sentence look like a rendering defect.
        if (vis.length && vis[vis.length - 1] !== " ") vis += " ";
        if (below.length && below[below.length - 1] !== " ") below += " ";
        continue;
      }
      totalChars += 1;
      const range = document.createRange();
      range.setStart(tn, i);
      range.setEnd(tn, i + 1);
      const cr = range.getBoundingClientRect();
      range.detach?.();
      if (cr.width === 0 && cr.height === 0) continue;
      const iw = Math.max(0, Math.min(cr.right, win.r) - Math.max(cr.left, win.l));
      const ih = Math.max(0, Math.min(cr.bottom, win.b) - Math.max(cr.top, win.t));
      const lineKey = Math.round(cr.top);
      if (!lineSurvival.has(lineKey)) lineSurvival.set(lineKey, { h: cr.height, vis: ih, n: 0, cut: 0 });
      const ls = lineSurvival.get(lineKey);
      ls.n += 1;
      ls.vis = Math.min(ls.vis, ih);
      if (iw <= 0.5 || ih <= 0.5) {
        gone += 1;
        below += raw[i];
      } else if (ih < cr.height - 0.75) {
        sliced += 1;
        ls.cut += 1;
        vis += raw[i];
      } else {
        vis += raw[i];
      }
    }

    for (const [top, ls] of lineSurvival) {
      if (ls.cut > 0) {
        // ── WHICH KIND OF CUT, AND IT IS NOT A DETAIL ──────────────────────
        // He photographed a line guillotined by a HARD CAP with no way to see
        // the rest. A line fading out at the bottom of a SCROLLABLE window,
        // under a fade mask, is the opposite thing: it is the affordance that
        // says „this continues". Reporting them with one number is how an
        // honest window would get scored as the defect it replaced — so the
        // clipper is asked whether it scrolls, and where the cut is.
        let clipper = tn.parentElement;
        let scrollable = false;
        while (clipper && clipper !== document.body) {
          const cs = getComputedStyle(clipper);
          if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
            scrollable = clipper.scrollHeight > clipper.clientHeight + 1 && /auto|scroll/.test(cs.overflowY);
            break;
          }
          clipper = clipper.parentElement;
        }
        const cutAtTop = top < win.t;
        slicedLines.push({
          topPx: top,
          survivingPx: Math.round(ls.vis * 10) / 10,
          lineHeightPx: Math.round(ls.h * 10) / 10,
          survivingPct: ls.h > 0 ? Math.round((ls.vis / ls.h) * 1000) / 10 : 0,
          chars: ls.cut,
          offender,
          atTop: cutAtTop,
          byViewport: offender === "viewport",
          scrollable,
          kind: offender === "viewport" ? "SCREEN EDGE" : scrollable ? "scroll-window fade (the rest is reachable)" : "HARD CAP — no way to the rest",
        });
      }
    }

    slicedChars += sliced;
    invisibleChars += gone;
    if (vis.trim()) visibleParts.push(vis.replace(/\s+/g, " ").trim());
    if (below.trim()) belowParts.push(below.replace(/\s+/g, " ").trim());

    // ── ELLIPSIS / CLAMP, READ OFF THE CLAMPING ANCESTOR ────────────────────
    let clampFiring = null;
    let el = parent;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
      const ellip = cs.textOverflow === "ellipsis";
      if (clamp && el.scrollHeight > el.clientHeight + 1) {
        clampFiring = { kind: `-webkit-line-clamp:${cs.webkitLineClamp}`, hiddenPx: el.scrollHeight - el.clientHeight, on: el.tagName.toLowerCase() };
        break;
      }
      if (ellip && el.scrollWidth > el.clientWidth + 1) {
        clampFiring = { kind: "text-overflow:ellipsis", hiddenPx: el.scrollWidth - el.clientWidth, on: el.tagName.toLowerCase() };
        break;
      }
      el = el.parentElement;
    }

    nodes.push({
      tag: parent.tagName.toLowerCase(),
      cls: (parent.getAttribute("class") || "").slice(0, 60),
      fontPx: Math.round(parseFloat(pcs.fontSize) * 10) / 10,
      color: pcs.color,
      chars: raw.trim().length,
      sliced,
      invisible: gone,
      clampFiring,
      clipOffender: offender,
      text: raw.replace(/\s+/g, " ").trim(),
      rect: R(parent.getBoundingClientRect()),
    });
  }

  // ── THE SCROLL WINDOW — how much is reachable but not shown ───────────────
  const win = root.matches("[data-sim-overlay-text]") ? root : root.querySelector("[data-sim-overlay-text]");
  const scroll = win
    ? {
        clientH: Math.round(win.clientHeight * 10) / 10,
        scrollH: Math.round(win.scrollHeight * 10) / 10,
        hiddenPx: Math.round((win.scrollHeight - win.clientHeight) * 10) / 10,
        scrollable: win.scrollHeight > win.clientHeight + 1,
      }
    : null;

  // ── THE DUPLICATE TEST ────────────────────────────────────────────────────
  // The defect he photographed was ONE sentence printed twice: bold white, then
  // a grey copy prefixed „1. ". So: does any later text node repeat the first
  // one's opening clause?
  const real = nodes.filter((n) => !n.srOnly && n.text && n.text.length > 12);
  let duplicate = null;
  if (real.length >= 2) {
    const norm = (s) => s.replace(/^\s*\d+\.\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
    const head = norm(real[0].text);
    for (let i = 1; i < real.length; i += 1) {
      const body = norm(real[i].text);
      const probe = head.slice(0, Math.min(40, head.length));
      if (probe.length >= 12 && body.startsWith(probe)) {
        duplicate = { headIndex: 0, bodyIndex: i, sharedPrefix: probe };
        break;
      }
    }
  }

  const anyClamp = nodes.filter((n) => n.clampFiring).map((n) => ({ text: n.text.slice(0, 40), ...n.clampFiring }));

  return {
    found: true,
    rootSel,
    rootRect: R(root.getBoundingClientRect()),
    nodes,
    srOnlyCount: nodes.filter((n) => n.srOnly).length,
    totalChars,
    slicedChars,
    invisibleChars,
    slicedLines,
    ellipsisFiring: anyClamp,
    duplicate,
    scroll,
    domParts,
    visibleParts,
    belowParts,
    domText: domParts.join(" "),
    visibleText: visibleParts.join(" "),
    belowFoldText: belowParts.join(" "),
  };
};

// ---------------------------------------------------------------------------
// THE FLANK GEOMETRY — the minimum needed for the height guard and the 44 px
// floor. (The full coverage census is wave12-flanks.mjs; this file does not
// duplicate it, it re-reads the two numbers that must not regress.)
// ---------------------------------------------------------------------------
const FLANK_GEOM = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const els = [...document.querySelectorAll("[data-arc]")];
  const stations = els.map((el) => {
    const btn = el.querySelector("button") || el;
    const br = btn.getBoundingClientRect();
    const side = el.getAttribute("data-arc-side") || (br.left + br.width / 2 < vw / 2 ? "left" : "right");
    const cx = Math.round(br.left + br.width / 2);
    const cy = Math.round(br.top + br.height / 2);
    const probe = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return "NONE";
      if (hit === btn || btn.contains(hit) || hit.contains(btn)) return "self";
      return `${hit.tagName.toLowerCase()}${hit.getAttribute("data-hud") ? `[${hit.getAttribute("data-hud")}]` : ""}:${(hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20)}`;
    };
    return {
      side,
      index: Number(el.getAttribute("data-arc") ?? -1),
      caption: (el.textContent || "").replace(/\s+/g, " ").trim(),
      label: btn.getAttribute("aria-label") || "",
      insetPx: Math.round((side === "left" ? br.left : vw - br.right) * 10) / 10,
      topPx: Math.round(br.top * 10) / 10,
      minSidePx: Math.round(Math.min(br.width, br.height) * 10) / 10,
      // ── ON THE GLASS, OR MERELY IN THE DOM ────────────────────────────────
      // The height guard has always compared INSETS and PITCHES and a COUNT of
      // `[data-arc]` nodes, and called that „geometry unchanged". A station
      // pushed above y = 0 is still in the DOM and still counted — so the guard
      // returned all-zero deltas on a stage where two graded mirror controls
      // had left the screen. Measure the box against the stage instead.
      fullyOnStage: br.top >= -0.5 && br.bottom <= vh + 0.5 && br.left >= -0.5 && br.right <= vw + 0.5,
      clippedBy: br.top < -0.5 ? "TOP EDGE" : br.bottom > vh + 0.5 ? "bottom edge" : br.left < -0.5 ? "left edge" : br.right > vw + 0.5 ? "right edge" : null,
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
    const s = stations.filter((t) => t.side === side).sort((a, b) => b.topPx - a.topPx);
    if (!s.length) continue;
    const insets = s.map((t) => t.insetPx);
    const pitches = [];
    for (let i = 1; i < s.length; i += 1) pitches.push(Math.round((s[i - 1].topPx - s[i].topPx) * 10) / 10);
    perSide[side] = {
      count: s.length,
      order: s.map((t) => t.caption || t.label),
      insets,
      insetSpreadPx: Math.round((Math.max(...insets) - Math.min(...insets)) * 10) / 10,
      pitches,
      minPitchPx: pitches.length ? Math.min(...pitches) : null,
      minHitPx: Math.min(...s.map((t) => t.minSidePx)),
      offStage: s.filter((t) => !t.fullyOnStage).map((t) => ({ caption: t.caption || t.label, clippedBy: t.clippedBy, topPx: t.topPx })),
      covered: s
        .filter((t) => t.centreHit !== "self" || t.corners.some((c) => c !== "self"))
        .map((t) => ({ caption: t.caption || t.label, centreHit: t.centreHit, corners: t.corners })),
    };
  }
  const canvas = document.querySelector("canvas");
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  return {
    viewport: { w: vw, h: vh },
    stations: stations.length,
    perSide,
    canvas: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
    drawingBuffer: canvas ? { w: canvas.width, h: canvas.height } : null,
    appliedDpr: canvas && cr && cr.width > 0 ? Math.round((canvas.width / cr.width) * 100) / 100 : null,
  };
};

// ---------------------------------------------------------------------------
// THE EDGE-TRADE ANNOTATION — injected for ONE screenshot, then removed.
// It is an INSTRUMENT OVERLAY and it is labelled as one in the frame itself so
// nobody can mistake it for product chrome in six months.
// ---------------------------------------------------------------------------
// NOTE: ONE argument. `page.evaluate(fn, a, b)` passes only `a` in Playwright,
// and a probe that silently annotates `undefined` px is a probe that publishes
// a frame with no bands on it and calls the trade zero.
const ANNOTATE_EDGES = ({ left, right }) => {
  const d = document.createElement("div");
  d.id = "__w13_edge_annotation";
  d.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:700 11px/1.2 system-ui,sans-serif";
  const band = (side, px) => {
    if (!px) return "";
    return (
      `<div style="position:absolute;top:0;bottom:0;${side}:0;width:${px}px;` +
      `background:repeating-linear-gradient(135deg,rgba(255,0,64,.42) 0 8px,rgba(255,0,64,.14) 8px 16px);` +
      `border-${side === "left" ? "right" : "left"}:2px solid #ff0040"></div>` +
      `<div style="position:absolute;top:50%;${side}:2px;transform:translateY(-50%) rotate(${side === "left" ? -90 : 90}deg);` +
      `transform-origin:center;color:#fff;text-shadow:0 0 4px #000;white-space:nowrap">${px}px UNDER THE HARDWARE</div>`
    );
  };
  d.innerHTML =
    band("left", left) +
    band("right", right) +
    `<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;` +
    `padding:4px 8px;border-radius:4px">wave13 INSTRUMENT OVERLAY — viewportFit:"cover" edge trade · ` +
    `${left + right}px of ${window.innerWidth}px = ${Math.round(((left + right) / window.innerWidth) * 1000) / 10}% of the picture</div>`;
  document.body.appendChild(d);
};
const DEANNOTATE = () => {
  document.getElementById("__w13_edge_annotation")?.remove();
};

// ---------------------------------------------------------------------------
const q = (s) => (s ? `«${s}»` : "«»");
const chunk = (s, w = 92) => {
  const out = [];
  let cur = "";
  for (const word of String(s).split(/\s+/)) {
    if ((cur + " " + word).trim().length > w) {
      out.push(cur.trim());
      cur = word;
    } else cur = `${cur} ${word}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

function reportText(title, c) {
  line(`\n  ── ${title} ──`);
  if (!c.found) {
    line(`     ✗ ROOT NOT FOUND (${c.rootSel})`);
    return;
  }
  const hard = c.slicedLines.filter((s) => s.kind !== "scroll-window fade (the rest is reachable)");
  const verdictSlice =
    c.slicedChars === 0
      ? "✓ NOTHING SLICED"
      : hard.length === 0
        ? `✓ NOTHING GUILLOTINED (${c.slicedChars} chars fade at the bottom of a scrolling window — the rest is reachable)`
        : `✗ ${hard.reduce((n, s) => n + s.chars, 0)} CHARACTERS GUILLOTINED BY A HARD EDGE`;
  const verdictEll = c.ellipsisFiring.length === 0 ? "✓ NO ELLIPSIS FIRING" : `✗ ${c.ellipsisFiring.length} ELLIPSIS/CLAMP FIRING`;
  const verdictDup = c.duplicate ? `✗ DUPLICATE COPY (shares «${c.duplicate.sharedPrefix.slice(0, 30)}…»)` : "✓ NO DUPLICATE COPY";
  line(`     ${verdictSlice}   ${verdictEll}   ${verdictDup}`);
  line(`     ${c.totalChars} characters examined · ${c.invisibleChars} entirely invisible · ${c.srOnlyCount} sr-only nodes excluded`);
  if (c.scroll) {
    line(
      `     scroll window ${c.scroll.clientH}px tall, content ${c.scroll.scrollH}px → ` +
        `${c.scroll.hiddenPx}px BELOW THE FOLD (reachable by scrolling and by «Прочети»)`,
    );
  }
  for (const s of c.slicedLines) {
    const mark = s.kind === "scroll-window fade (the rest is reachable)" ? "·" : "✗";
    line(
      `     ${mark} line at y=${s.topPx}: ${s.survivingPx} of ${s.lineHeightPx}px survives (${s.survivingPct}%), ${s.chars} chars, ` +
        `cut ${s.atTop ? "AT THE TOP" : "at the bottom"} by ${s.offender} — ${s.kind}`,
    );
  }
  for (const e of c.ellipsisFiring) {
    line(`     ✗ ${e.kind} on <${e.on}> hiding ${Math.round(e.hiddenPx)}px — «${e.text}…»`);
  }
  line(`     THE SENTENCE AS IT RENDERS (visible to the eye, ${c.visibleText.length} chars, row by row):`);
  for (const part of c.visibleParts) {
    const ls = chunk(part);
    line(`       │ ${ls[0] ?? ""}`);
    for (const l of ls.slice(1)) line(`       │   ${l}`);
  }
  if (c.belowParts.length) {
    line(`     BELOW THE FOLD (${c.belowFoldText.length} chars — IN the card, reachable by scrolling and by the read control):`);
    for (const part of c.belowParts) {
      for (const l of chunk(part).slice(0, 4)) line(`       ┊ ${l}`);
    }
  }
}

// ---------------------------------------------------------------------------
const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch(ENGINE_NAME === "webkit" ? {} : {});
line("█".repeat(100));
line(`[w13] THE FOUNDER'S CHECKLIST — the instruction quoted, the guards re-read`);
line(`[w13] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " — THE FOUNDER'S ENGINE" : " — SECOND OPINION ONLY"}`);
line(`[w13] base ${BASE}`);
line(`[w13] route ${ROUTE}   ← A LESSON, not the menu`);
line(`[w13] motion ${MOTION}   tag ${TAG}`);
line("█".repeat(100));

const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: MOTION, insets: "real" });
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
line(`[w13] signed in ONCE as ${EMAIL}\n`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: MOTION, insets: "real", storageState });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    viewport: { w: device.width, h: device.height },
    insetBanner: insetBanner(device, inset),
    inset,
  };
  line(`\n${"═".repeat(100)}`);
  line(`${device.label}   ${device.width}x${device.height} @dpr${device.dpr}`);
  line(`  ${rec.insetBanner}`);

  const shoot = async (name, opts = {}) => {
    const p = `${OUT}/${TAG}-${device.id}-${name}.png`;
    try {
      await page.screenshot({ path: p, ...opts });
      return p;
    } catch (e) {
      return `FAILED: ${e.message}`;
    }
  };

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6500);

    // ── GATE ────────────────────────────────────────────────────────────────
    const gate = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c ? c.getBoundingClientRect() : null;
      return {
        hasCanvas: !!c,
        canvasRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        catalogCards: document.querySelectorAll('[data-testid="scenario-card"]').length,
        url: location.pathname + location.search,
      };
    });
    rec.gate = gate;
    line(`  GATE · canvas ${gate.hasCanvas} ${JSON.stringify(gate.canvasRect)} · touch-controls ${gate.touchControls} · catalogCards ${gate.catalogCards} · url ${gate.url}`);
    if (!gate.hasCanvas || !gate.touchControls || gate.catalogCards > 0 || !gate.canvasRect?.w) {
      rec.fatal = "NOT A LIVE LESSON";
      line(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }

    rec.openingShot = await shoot("0-opening");

    // ══ 1 · WALK THE CARD QUEUE UNTIL «ИНСТРУКЦИИ» ═══════════════════════════
    //
    // The first run of this file censused whatever card happened to be on top
    // at +6.5 s and reported it as „the instruction". It was the SEATBELT
    // fault, with a «+1» badge showing the instruction queued behind it. A
    // probe that quotes the wrong card back to him is worth less than no probe,
    // so the queue is WALKED and every card is censused and named.
    rec.cards = [];
    for (let step = 0; step < 6; step += 1) {
      const head = await page.evaluate(() => {
        const card = document.querySelector("[data-sim-overlay-card]");
        if (!card) return null;
        const chip = card.querySelector("span.uppercase");
        const r = card.getBoundingClientRect();
        return {
          chip: (chip?.textContent || "").replace(/\s+/g, " ").trim(),
          ariaLabel: card.getAttribute("aria-label") || "",
          queued: (() => {
            const b = card.querySelector('[aria-label^="още "]');
            return b ? (b.textContent || "").trim() : "";
          })(),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
      if (!head) break;

      const census = await page.evaluate(TEXT_CENSUS, "[data-sim-overlay-text]");
      const isInstruction = /ИНСТРУКЦИ/i.test(head.chip);
      const slug = isInstruction ? "instruction" : `card${step}`;
      const shotFull = await shoot(`1-${slug}-full`);
      let shotZoom = null;
      if (census.found && census.rootRect.w > 0) {
        const r = head.rect;
        const pad = 12;
        shotZoom = await shoot(`1-${slug}-zoom`, {
          clip: {
            x: Math.max(0, r.x - pad),
            y: Math.max(0, r.y - pad),
            width: Math.min(device.width - Math.max(0, r.x - pad), r.w + pad * 2),
            height: Math.min(device.height - Math.max(0, r.y - pad), r.h + pad * 2),
          },
          scale: "device",
        });
      }
      const entry = { step, chip: head.chip, queued: head.queued, isInstruction, census, shotFull, shotZoom };
      rec.cards.push(entry);
      reportText(`CARD ${step} — chip «${head.chip}»${head.queued ? ` (${head.queued} more queued)` : ""}${isInstruction ? "   ◄◄◄ THE INSTRUCTION" : ""}`, census);

      if (isInstruction) {
        rec.instruction = entry;

        // ══ 2 · ITS OWN READ SHEET ═════════════════════════════════════════
        const opened = await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((n) =>
            /^(Прочети|Защо|Разбери|Списък)$/i.test((n.textContent || "").trim()),
          );
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: (b.textContent || "").trim() };
        });
        if (opened) {
          await page.mouse.click(opened.x, opened.y);
          await sleep(1200);
          rec.sheetLabel = opened.label;
          rec.sheet = await page.evaluate(TEXT_CENSUS, '[role="dialog"], [data-sim-overlay-sheet], [data-hud="notify-column"]');
          rec.sheetShot = await shoot("2-sheet");
          reportText(`THE «${opened.label}» SHEET — the honest path to the rest`, rec.sheet);
          // CLOSE IT BY aria-label. The first run matched on textContent and the
          // ✕ is an aria-hidden GLYPH, so the sheet stayed open and every
          // measurement after it was taken in read mode — where the driving HUD
          // is not mounted at all. That is how this file first reported
          // „NO STATIONS" on a build whose flanks are demonstrably fine.
          const closed = await page.evaluate(() => {
            const b = document.querySelector('button[aria-label="Затвори"]');
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          });
          if (closed) {
            await page.mouse.click(closed.x, closed.y);
            await sleep(900);
          }
        } else {
          line(`     ✗ NO READ CONTROL ON THE INSTRUCTION CARD`);
          rec.sheetLabel = null;
        }
        break;
      }

      // advance: the ack, else the ✕, else the card itself when it IS the button
      const advanced = await page.evaluate(() => {
        const pick =
          [...document.querySelectorAll("button")].find((n) =>
            /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim()),
          ) ||
          document.querySelector('button[aria-label="Скрий известието"]') ||
          document.querySelector('button[data-sim-overlay-card]');
        if (!pick) return null;
        const r = pick.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!advanced) break;
      await page.mouse.click(advanced.x, advanced.y);
      await sleep(900);
    }
    if (!rec.instruction) line(`\n  ⚠ THE «ИНСТРУКЦИИ» CARD WAS NEVER REACHED IN 6 STEPS — see the frames above`);

    // ══ clear the queue so the flanks stand alone over the road ═════════════
    for (let i = 0; i < 12; i += 1) {
      const c = await page.evaluate(() => {
        const pick =
          [...document.querySelectorAll("button")].find((n) =>
            /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim()),
          ) || document.querySelector('button[aria-label="Скрий известието"]');
        if (!pick) return null;
        const r = pick.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.click(c.x, c.y);
      await sleep(430);
    }
    await sleep(1500);

    // ══ 4a · THE HEIGHT GUARD at −44 AND −90 ════════════════════════════════
    const g0 = await page.evaluate(FLANK_GEOM);
    rec.flanksRest = g0;
    rec.drivingShot = await shoot("3-driving");
    // A ZERO HERE IS AN INSTRUMENT FAULT UNTIL PROVEN OTHERWISE. The driving
    // HUD is not mounted in read mode, so „0 stations" almost always means a
    // sheet is still up rather than that the flanks vanished. Say which, and
    // keep the frame that shows it, instead of publishing a zero.
    if (g0.stations === 0) {
      rec.flanksZeroDiagnosis = await page.evaluate(() => ({
        sheetOpen: !!document.querySelector('[role="dialog"]'),
        cardUp: !!document.querySelector("[data-sim-overlay-card]"),
        hud: !!document.querySelector('[data-hud="touch-controls"]'),
        inert: !!document.querySelector("[data-sim-touch-inert]"),
        visibleButtons: [...document.querySelectorAll("button")].slice(0, 12).map((b) => (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30)),
      }));
      line(`\n  ⚠ 0 FLANK STATIONS — diagnosis ${JSON.stringify(rec.flanksZeroDiagnosis)}`);
    }
    line(`\n  ── THE FLANKS AT REST ──`);
    for (const side of ["left", "right"]) {
      const s = g0.perSide[side];
      if (!s) {
        line(`     ${side.toUpperCase()} · NO STATIONS`);
        continue;
      }
      line(
        `     ${side.toUpperCase()} ${s.insetSpreadPx <= 2 ? "BAND ✓" : `DIAGONAL ✗ (${s.insetSpreadPx}px)`} · ${s.count} stations · insets [${s.insets.join(", ")}] · pitch [${s.pitches.join(", ")}] · min hit ${s.minHitPx}px`,
      );
      line(`        bottom→top: ${s.order.join("  ")}`);
      line(`        ${s.covered.length === 0 ? "✓ nothing on top (centre + 4 corners)" : `✗ ${s.covered.length} COVERED: ${s.covered.map((c) => c.caption).join(", ")}`}`);
      line(`        ${s.offStage.length === 0 ? "✓ every station fully on the glass" : `✗ ${s.offStage.length} OFF THE GLASS: ${s.offStage.map((o) => `«${o.caption}» ${o.clippedBy}`).join(", ")}`}`);
    }

    rec.heightGuard = {};
    for (const delta of [44, 90]) {
      await page.setViewportSize({ width: device.width, height: Math.max(240, device.height - delta) });
      await sleep(1300);
      const g = await page.evaluate(FLANK_GEOM);
      const d = {};
      for (const side of ["left", "right"]) {
        const a = g0.perSide[side];
        const b = g.perSide[side];
        if (!a || !b) continue;
        d[side] = {
          insetDelta: Math.round((Math.max(...b.insets) - Math.max(...a.insets)) * 10) / 10,
          spreadDelta: Math.round((b.insetSpreadPx - a.insetSpreadPx) * 10) / 10,
          spreadAfter: b.insetSpreadPx,
          pitchDelta: a.minPitchPx !== null && b.minPitchPx !== null ? Math.round((b.minPitchPx - a.minPitchPx) * 10) / 10 : null,
          countDelta: b.count - a.count,
          minHitPx: b.minHitPx,
          offStage: b.offStage,
        };
      }
      rec.heightGuard[`minus${delta}`] = d;
      line(`\n  ── HEIGHT GUARD · stage −${delta}px ──`);
      for (const [side, x] of Object.entries(d)) {
        const ok = x.insetDelta === 0 && x.spreadDelta === 0 && (x.pitchDelta === 0 || x.pitchDelta === null) && x.countDelta === 0;
        line(`     ${side.toUpperCase()} ${ok ? "✓ geometry unchanged" : "✗ GEOMETRY MOVED"} · inset Δ${x.insetDelta} · spread Δ${x.spreadDelta} (now ${x.spreadAfter}) · pitch Δ${x.pitchDelta} · count Δ${x.countDelta} · min hit ${x.minHitPx}px`);
        if (x.offStage.length) {
          line(`        ✗✗ ${x.offStage.length} STATION(S) NO LONGER ON THE GLASS: ${x.offStage.map((o) => `«${o.caption}» off the ${o.clippedBy} (top ${o.topPx}px)`).join(" · ")}`);
        } else {
          line(`        ✓ every station still fully on the glass`);
        }
      }
    }
    await page.setViewportSize({ width: device.width, height: device.height });
    await sleep(1200);

    // ══ 3 · THE EDGE TRADE, AS A PICTURE (landscape only) ═══════════════════
    //
    // IT IS TAKEN HERE, ON THE CLEAN DRIVING VIEW, AND NOT AT THE END. The
    // first run captured it after the «Високо» step and the lesson menu was
    // still up, so the frame showed the MENU rather than the road under the
    // hardware — a picture of the wrong thing is worse than no picture,
    // because it looks like evidence.
    if (device.orientation === "landscape" && (inset.left > 0 || inset.right > 0)) {
      const before = await page.evaluate(FLANK_GEOM);
      await page.evaluate(ANNOTATE_EDGES, { left: inset.left, right: inset.right });
      await sleep(400);
      rec.edgeShot = await shoot("5-edge-trade");
      await page.evaluate(DEANNOTATE);
      await sleep(400);
      const back = await page.evaluate(FLANK_GEOM);
      rec.edgeTrade = {
        leftPx: inset.left,
        rightPx: inset.right,
        totalPx: inset.left + inset.right,
        stagePx: device.width,
        pctOfPicture: Math.round(((inset.left + inset.right) / device.width) * 1000) / 10,
        annotationRemoved: back.stations === before.stations && JSON.stringify(back.canvas) === JSON.stringify(before.canvas),
      };
      line(
        `\n  ── THE EDGE TRADE (viewportFit:"cover") ──\n     ${rec.edgeTrade.leftPx}px left + ${rec.edgeTrade.rightPx}px right = ${rec.edgeTrade.totalPx} of ${rec.edgeTrade.stagePx}px = ${rec.edgeTrade.pctOfPicture}% of the landscape picture under the hardware\n     annotation removed cleanly: ${rec.edgeTrade.annotationRemoved ? "✓" : "✗"}   NOTHING WAS CHANGED — this is a frame for his ruling`,
      );
    }

    // ══ 4b · THE ABSOLUTE PAD READS EXACTLY 0 AT DEAD CENTRE ════════════════
    const pad = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="slider"]')].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
        label: el.getAttribute("aria-label"),
      };
    });
    rec.pad = pad;
    if (pad) {
      await page.mouse.move(pad.x, pad.y);
      await page.mouse.down();
      await sleep(950);
      rec.absoluteZero = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[role="slider"]')].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
        const steer = [...document.querySelectorAll('[role="slider"]')].find((e) => /^Волан|^Кормил/.test(e.getAttribute("aria-label") || ""));
        const sp = document.querySelector('[aria-label^="Скорост "]');
        const m = sp ? /Скорост (\d+(?:[.,]\d+)?)/.exec(sp.getAttribute("aria-label")) : null;
        return {
          driveValuenow: el ? Number(el.getAttribute("aria-valuenow")) : null,
          steerValuenow: steer ? Number(steer.getAttribute("aria-valuenow")) : null,
          speedKmh: m ? Number(m[1].replace(",", ".")) : null,
        };
      });
      await page.mouse.up();
      await sleep(600);
      const z = rec.absoluteZero;
      line(
        `\n  ── THE ABSOLUTE PAD AT DEAD CENTRE ──\n     ${z.driveValuenow === 0 ? "✓" : "✗"} «${pad.label}» held at its own centre → aria-valuenow ${z.driveValuenow} · speed ${z.speedKmh} km/h`,
      );
    } else {
      line(`\n  ── THE ABSOLUTE PAD ──\n     ✗ NO DRIVE PAD FOUND`);
    }

    // ══ 4c · «ВИСОКО» STILL REACHES THE GPU ═════════════════════════════════
    rec.quality = { dprBefore: (await page.evaluate(FLANK_GEOM)).appliedDpr };
    const menuBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button,[role='button']")].find(
        (n) => /^Меню на урока$/.test(n.getAttribute("aria-label") || ""),
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    rec.quality.menuFound = !!menuBtn;
    if (menuBtn) {
      await page.mouse.click(menuBtn.x, menuBtn.y);
      await sleep(900);
      for (let i = 0; i < 6; i += 1) {
        const row = await page.evaluate(() => {
          // The row lives in QualityPresetSelector with aria-label
          // «Качество на графиката». Scoping the lookup to the menu ELEMENT was
          // right, but it must not depend on the menu's own aria-label being
          // spelled the way one call site spells it.
          const menu = document.querySelector('[role="menu"]') || document.body;
          const el = [...menu.querySelectorAll("[aria-label]")].find((e) => /^Качество/.test(e.getAttribute("aria-label") || ""));
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            label: el.getAttribute("aria-label"),
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
          };
        });
        if (!row) break;
        rec.quality.row = row.label;
        if (/Високо/.test(row.label)) break;
        await page.mouse.click(row.x, row.y);
        await sleep(900);
      }
      await sleep(2200);
      const after = await page.evaluate(FLANK_GEOM);
      rec.quality.dprAfter = after.appliedDpr;
      rec.quality.drawingBuffer = after.drawingBuffer;
      rec.quality.canvas = after.canvas;
      line(
        `\n  ── «ВИСОКО» → THE DRAWING BUFFER ──\n     row ${q(rec.quality.row)} · buffer ${after.drawingBuffer?.w}x${after.drawingBuffer?.h} over css ${after.canvas?.w}x${after.canvas?.h} → applied dpr ${after.dprAfter ?? after.appliedDpr} ${after.appliedDpr === 3 ? "✓ dpr 3" : "✗ NOT 3"}`,
      );
      rec.qualityShot = await shoot("4-quality-high");
      // shut the menu
      // The toggle's OPEN-state label is «Затвори менюто на урока»
      // (LessonPlayShell:1158). The first run anchored the regex to the end of
      // the string, matched nothing, fell through to Escape — which this menu
      // does not answer — and left the menu up over every frame taken after it.
      const closeMenu = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^Затвори менюто/.test((n.getAttribute("aria-label") || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (closeMenu) {
        await page.mouse.click(closeMenu.x, closeMenu.y);
        await sleep(700);
      } else {
        await page.keyboard.press("Escape");
        await sleep(600);
      }
    } else {
      line(`\n  ── «ВИСОКО» ──\n     ✗ NO «Меню на урока» BUTTON FOUND`);
    }

  } catch (e) {
    rec.fatal = e.message;
    line(`  FATAL · ${e.message}`);
  }
  results.push(rec);
  await context.close();
}

await browser.close();

// ── THE TABLE ───────────────────────────────────────────────────────────────
/** Stations that left the glass on a shortened stage, both flanks. */
const offCount = (guard) => {
  if (!guard) return "—";
  return ["left", "right"].reduce((n, side) => n + (guard[side]?.offStage?.length ?? 0), 0);
};
line(`\n${"█".repeat(100)}`);
line(`[w13] SUMMARY — the founder's checklist, one row per phone`);
line("█".repeat(100));
line(
  `${"profile".padEnd(28)}${"guillo".padStart(8)}${"ellips".padStart(8)}${"dup".padStart(6)}${"shown".padStart(7)}${"fold".padStart(6)}${"sheetOK".padStart(9)}${"Lspr".padStart(6)}${"Rspr".padStart(6)}${"minHit".padStart(8)}${"pad0".padStart(6)}${"dpr".padStart(5)}${"off@-44".padStart(9)}${"off@-90".padStart(9)}`,
);
for (const r of results) {
  if (r.fatal) {
    line(`${r.device.padEnd(28)}  FATAL · ${r.fatal}`);
    continue;
  }
  const c = r.instruction?.census;
  const hard = c ? c.slicedLines.filter((s) => s.kind !== "scroll-window fade (the rest is reachable)") : null;
  const sheetOK = r.sheet
    ? r.sheet.slicedChars === 0 && r.sheet.ellipsisFiring.length === 0 && !r.sheet.duplicate
      ? "clean"
      : "SEE LOG"
    : "—";
  line(
    `${r.device.padEnd(28)}` +
      `${String(hard ? hard.reduce((n, s) => n + s.chars, 0) : "—").padStart(8)}` +
      `${String(c?.ellipsisFiring?.length ?? "—").padStart(8)}` +
      `${String(c ? (c.duplicate ? "YES" : "no") : "—").padStart(6)}` +
      `${String(c?.visibleText?.length ?? "—").padStart(7)}` +
      `${String(c?.belowFoldText?.length ?? "—").padStart(6)}` +
      `${String(sheetOK).padStart(9)}` +
      `${String(r.flanksRest?.perSide?.left?.insetSpreadPx ?? "—").padStart(6)}` +
      `${String(r.flanksRest?.perSide?.right?.insetSpreadPx ?? "—").padStart(6)}` +
      `${String(Math.min(r.flanksRest?.perSide?.left?.minHitPx ?? 999, r.flanksRest?.perSide?.right?.minHitPx ?? 999)).padStart(8)}` +
      `${String(r.absoluteZero?.driveValuenow ?? "—").padStart(6)}` +
      `${String(r.quality?.dprAfter ?? r.quality?.dprBefore ?? "—").padStart(5)}` +
      `${String(offCount(r.heightGuard?.minus44)).padStart(9)}` +
      `${String(offCount(r.heightGuard?.minus90)).padStart(9)}`,
  );
}

const path = `${OUT}/${TAG}.json`;
writeFileSync(path, JSON.stringify({ base: BASE, route: ROUTE, engine: ENGINE_NAME, motion: MOTION, tag: TAG, results }, null, 2));
line(`\n[w13] census → ${path}`);
line(`[w13] frames → ${OUT}`);
