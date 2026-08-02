// -----------------------------------------------------------------------------
// probe.mjs — the in-page measurement. Everything here runs INSIDE WebKit via
// page.evaluate(); nothing in this file may reference Node.
//
// THE RULE THIS FILE ENCODES (founder, verbatim): "at least 85% of the mobile
// screen should remain available for the actual simulator, questions, or exam".
// A previous run reported 87% by counting translucent controls as road on the
// argument that "the wheel and pedals are the car, not page furniture". Its own
// strict figure was 70.3%. So:
//
//        ANY PIXEL A UI ELEMENT PAINTS ON IS NOT FREE. TRANSLUCENT INCLUDED.
//
// "Paints" is decided from computed style, not from opinion — see PAINTS()
// below. opacity:0.02 paints. A backdrop-filter blur paints. A box-shadow
// paints. Text paints, and only over its actual glyph line boxes (measured
// with a Range, not the element box, so a wide flex container full of one
// short word is not charged for the whole row).
//
// HOW THE HEADLINE NUMBER IS BUILT
// ---------------------------------------------------------------------------
//   contentMask  = union of the route's declared content surfaces (the sim
//                  canvas, the question card, ...) clipped to the viewport
//   chromeMask   = union of every painting element that is NOT the content and
//                  NOT one of its layout ancestors
//   freeMask     = contentMask AND NOT chromeMask
//   contentFraction = |freeMask| / viewportArea     <- THE NUMBER
//
// The three buckets are disjoint and sum to 1: free content, chrome, and
// "unclaimed" (bare page backdrop that is neither). Ancestors of a content
// surface are excluded from chrome on purpose — <body> paints the app
// background across the whole screen, and charging that as chrome would score
// every page at 0% while telling you nothing.
//
// WHAT IT DELIBERATELY DOES NOT COUNT
// ---------------------------------------------------------------------------
//  - display:none / visibility:hidden / opacity:0 (or inside an opacity:0
//    subtree) / zero-area / fully-clipped elements: they paint nothing.
//  - An interactive element with no paint of its own — the founder asked for
//    controls that are "absolutely invisible and small". Those are reported
//    separately as `invisibleInteractive` so the trade is visible rather than
//    laundered: it costs no road, but it is still a thing a thumb can hit.
//  - Border-radius corners and box-shadow spill are charged to the border box
//    only (a rounded pill is charged as its rectangle). This OVERSTATES chrome
//    slightly, which is the safe direction for a budget.
//  - Shadow DOM is not traversed (this app has none). If that changes, this
//    function silently under-reports and must be extended.
// -----------------------------------------------------------------------------

/**
 * The probe body. Stringified by Playwright and run in the page.
 * Kept as a single self-contained function on purpose: page.evaluate cannot
 * see this module's other bindings.
 *
 * @param {{
 *   contentSelectors: string[],
 *   mustFit: string[],
 *   safeArea: {top:number,right:number,bottom:number,left:number},
 *   safeEdgeMargin: number,
 *   minTouch: number,
 * }} config
 */
export function probeBody(config) {
  const {
    contentSelectors = [],
    mustFit = [],
    safeArea = { top: 0, right: 0, bottom: 0, left: 0 },
    safeEdgeMargin = 8,
    minTouch = 44,
  } = config || {};

  const VW = Math.round(window.innerWidth);
  const VH = Math.round(window.innerHeight);
  const AREA = VW * VH;

  // ---------------------------------------------------------------- helpers
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Short, stable, human-readable path for a node — for the report only. */
  function describe(el) {
    if (!el || el.nodeType !== 1) return "?";
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth += 1) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${node.id}`;
        parts.unshift(part);
        break;
      }
      const cls = (node.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
      if (cls) part += `.${cls}`;
      const testid = node.getAttribute("data-testid");
      if (testid) part += `[data-testid="${testid}"]`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ").slice(0, 220);
  }

  function alpha(color) {
    if (!color) return 0;
    if (color === "transparent") return 0;
    const m = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!m) return 1; // named colours, colour functions -> assume opaque
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    const a = Number.parseFloat(parts[3]);
    return Number.isFinite(a) ? a : 1;
  }

  /** Effective opacity of the element including ancestors (cached). */
  const opacityCache = new Map();
  function effectiveOpacity(el) {
    if (opacityCache.has(el)) return opacityCache.get(el);
    const cs = getComputedStyle(el);
    const own = Number.parseFloat(cs.opacity);
    const parent = el.parentElement;
    const value =
      (Number.isFinite(own) ? own : 1) * (parent ? effectiveOpacity(parent) : 1);
    opacityCache.set(el, value);
    return value;
  }

  /**
   * Intersection of every ancestor clip (overflow != visible) with the
   * viewport. Cached per element; this is what keeps a 4000px-tall list inside
   * a scroll container from being charged for pixels it cannot paint on.
   */
  const clipCache = new Map();
  function clipFor(el) {
    if (clipCache.has(el)) return clipCache.get(el);
    const parent = el.parentElement;
    let rect = parent
      ? { ...clipFor(parent) }
      : { left: 0, top: 0, right: VW, bottom: VH };
    if (parent) {
      const cs = getComputedStyle(parent);
      const clipped =
        cs.overflowX !== "visible" ||
        cs.overflowY !== "visible" ||
        cs.contain.includes("paint");
      if (clipped) {
        const pr = parent.getBoundingClientRect();
        rect = {
          left: Math.max(rect.left, pr.left),
          top: Math.max(rect.top, pr.top),
          right: Math.min(rect.right, pr.right),
          bottom: Math.min(rect.bottom, pr.bottom),
        };
      }
    }
    clipCache.set(el, rect);
    return rect;
  }

  /**
   * The screen-reader-only idiom paints NOTHING: Tailwind's `.sr-only` is
   * `width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap`.
   * Its box is 1x1 but its text line box is as wide as the sentence, so a naive
   * text measurement charged the skip link ("Към съдържанието") with 0.89% of
   * an iPhone screen it does not put a single pixel on.
   */
  function isClippedAway(cs) {
    if (/^rect\((0px,?\s*){4}\)$/.test((cs.clip || "").replace(/\s+/g, " ").trim())) return true;
    if ((cs.clipPath || "") === "inset(50%)") return true;
    return false;
  }

  /** Does this element clip its own children (and its own text)? */
  function selfClips(cs) {
    return cs.overflowX !== "visible" || cs.overflowY !== "visible";
  }

  /** Border-box rects for an element, clipped to ancestors + viewport. */
  function paintedBoxes(el, expand = 0) {
    const clip = clipFor(el);
    const out = [];
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      const left = clamp(Math.floor(Math.max(r.left - expand, clip.left)), 0, VW);
      const top = clamp(Math.floor(Math.max(r.top - expand, clip.top)), 0, VH);
      const right = clamp(Math.ceil(Math.min(r.right + expand, clip.right)), 0, VW);
      const bottom = clamp(Math.ceil(Math.min(r.bottom + expand, clip.bottom)), 0, VH);
      if (right > left && bottom > top) out.push({ left, top, right, bottom });
    }
    return out;
  }

  /** Glyph line boxes for the element's OWN text children (not descendants'). */
  function textBoxes(el, cs) {
    let clip = clipFor(el);
    // An element's own overflow clips its TEXT even though it does not clip its
    // own border box — this is what keeps a nowrap label inside a narrow pill
    // from being charged for the width of the sentence.
    if (cs && selfClips(cs)) {
      const own = el.getBoundingClientRect();
      clip = {
        left: Math.max(clip.left, own.left),
        top: Math.max(clip.top, own.top),
        right: Math.min(clip.right, own.right),
        bottom: Math.min(clip.bottom, own.bottom),
      };
    }
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue; // Node.TEXT_NODE
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        const left = clamp(Math.floor(Math.max(r.left, clip.left)), 0, VW);
        const top = clamp(Math.floor(Math.max(r.top, clip.top)), 0, VH);
        const right = clamp(Math.ceil(Math.min(r.right, clip.right)), 0, VW);
        const bottom = clamp(Math.ceil(Math.min(r.bottom, clip.bottom)), 0, VH);
        if (right > left && bottom > top) out.push({ left, top, right, bottom });
      }
      range.detach?.();
    }
    return out;
  }

  const REPLACED = new Set([
    "IMG", "SVG", "CANVAS", "VIDEO", "IFRAME", "INPUT", "SELECT", "TEXTAREA",
    "PROGRESS", "METER", "HR", "OBJECT", "EMBED",
  ]);

  /**
   * Does this element paint anything on its own box? Style-derived, so
   * "translucent" and "barely visible" both count — the founder's rule.
   * Returns 0 when it paints nothing, otherwise the outline/expansion in px.
   */
  function boxPaint(el, cs) {
    if (REPLACED.has(el.tagName)) return 0;
    if (alpha(cs.backgroundColor) > 0) return 0;
    if (cs.backgroundImage && cs.backgroundImage !== "none") return 0;
    if (cs.backdropFilter && cs.backdropFilter !== "none") return 0;
    if (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") return 0;
    if (cs.boxShadow && cs.boxShadow !== "none") return 0;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = Number.parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      if (w > 0 && style !== "none" && style !== "hidden" && alpha(cs[`border${side}Color`]) > 0) {
        return 0;
      }
    }
    const outlineWidth = Number.parseFloat(cs.outlineWidth);
    if (outlineWidth > 0 && cs.outlineStyle !== "none" && alpha(cs.outlineColor) > 0) {
      return outlineWidth + (Number.parseFloat(cs.outlineOffset) || 0);
    }
    return -1; // paints nothing on its box
  }

  // ------------------------------------------------------- element inventory
  const all = Array.from(document.querySelectorAll("*")).filter(
    (el) => el.tagName !== "SCRIPT" && el.tagName !== "STYLE" && el.tagName !== "LINK" &&
      el.tagName !== "META" && el.tagName !== "TITLE" && el.tagName !== "HEAD" &&
      el.tagName !== "NOSCRIPT" && el.tagName !== "TEMPLATE",
  );

  // Content surfaces + their layout ancestors (the app backdrop).
  const contentEls = [];
  for (const selector of contentSelectors) {
    let matches = [];
    try {
      matches = Array.from(document.querySelectorAll(selector));
    } catch {
      matches = [];
    }
    for (const el of matches) if (!contentEls.includes(el)) contentEls.push(el);
  }
  const contentSet = new Set(contentEls);
  const backdropSet = new Set();
  for (const el of contentEls) {
    let node = el.parentElement;
    while (node) {
      backdropSet.add(node);
      node = node.parentElement;
    }
  }
  const isContent = (el) => {
    for (let n = el; n; n = n.parentElement) if (contentSet.has(n)) return true;
    return false;
  };

  /**
   * NEGATIVE z-index IS THE DEFINITION OF "BEHIND", NOT A HEURISTIC.
   *
   * The dashboard layout paints its horizon with
   * `<div aria-hidden class="haze pointer-events-none fixed inset-0 -z-10" />`.
   * It is a full-viewport painting element and it is NOT an ancestor of
   * #main-content, so a naive "everything that is not content is chrome" rule
   * charged it with 99.11% of the screen and scored the theory hub at 0% — a
   * number that says nothing about the layout and everything about the probe.
   *
   * CSS is unambiguous here: within a stacking context, negative-z-index
   * descendants paint BEFORE (behind) the in-flow content. A pixel behind the
   * content surface does not take a pixel of road away from it. So a negative
   * effective z-index disqualifies an element — and its subtree — from being
   * chrome. Nothing a designer would ever put a control in has one.
   */
  const behindCache = new Map();
  function isBehind(el) {
    if (behindCache.has(el)) return behindCache.get(el);
    const cs = getComputedStyle(el);
    const z = Number.parseFloat(cs.zIndex);
    const own = Number.isFinite(z) && z < 0;
    const parent = el.parentElement;
    const value = own || (parent ? isBehind(parent) : false);
    behindCache.set(el, value);
    return value;
  }

  // ------------------------------------------------------------- rasterizing
  const contentMask = new Uint8Array(AREA);
  const chromeMask = new Uint8Array(AREA);
  function fill(mask, boxes) {
    let painted = 0;
    for (const b of boxes) {
      for (let y = b.top; y < b.bottom; y += 1) {
        const row = y * VW;
        for (let x = b.left; x < b.right; x += 1) {
          const i = row + x;
          if (!mask[i]) {
            mask[i] = 1;
            painted += 1;
          }
        }
      }
    }
    return painted;
  }
  const boxArea = (boxes) =>
    boxes.reduce((sum, b) => sum + (b.right - b.left) * (b.bottom - b.top), 0);

  for (const el of contentEls) fill(contentMask, paintedBoxes(el));

  const contributors = [];
  const invisibleInteractive = [];

  const INTERACTIVE_SELECTOR =
    'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],' +
    '[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],' +
    '[role="option"],[role="slider"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const interactiveSet = new Set(Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)));

  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (effectiveOpacity(el) <= 0) continue;
    if (isClippedAway(cs)) continue;

    const expand = boxPaint(el, cs);
    const boxes = expand >= 0 ? paintedBoxes(el, expand) : [];
    const texts = alpha(cs.color) > 0 ? textBoxes(el, cs) : [];
    const mine = boxes.concat(texts);

    if (mine.length === 0) {
      if (interactiveSet.has(el)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < VH && r.right > 0 && r.left < VW) {
          invisibleInteractive.push({
            path: describe(el),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          });
        }
      }
      continue;
    }

    if (isContent(el)) continue; // the content surface and everything in it
    if (backdropSet.has(el)) continue; // app background behind the content
    if (isBehind(el)) continue; // negative z-index: painted BEHIND the content

    const added = fill(chromeMask, mine);
    if (added > 0) {
      contributors.push({
        path: describe(el),
        tag: el.tagName.toLowerCase(),
        fixed: cs.position === "fixed" || cs.position === "sticky",
        addedPx: added,
        ownPx: boxArea(mine),
        addedPct: Number(((added / AREA) * 100).toFixed(2)),
      });
    }
  }

  // ------------------------------------------------------------ content USE
  // A CONTENT SURFACE THAT STRETCHES IS NOT THE SAME AS A SCREEN THAT IS USED.
  //
  // Row C4 (doc 87:240): the practice runner's screen share „recovered" from
  // 51.6% to 86.4% — and the frame still shows the question, four answers and
  // «Провери» ending around 60% of the way down, with the rest of the card
  // empty. Both statements are true, because `PracticeSession.tsx` gives the
  // card `max-sm:flex-1 short:flex-1`: it grows to the bottom of the phone
  // whether or not anything is in it. This file's own README says „a budget you
  // can satisfy by growing a <div> is not a budget" — that was written about
  // measuring the WRAPPER instead of the card, and the same trick then arrived
  // one level down.
  //
  // So: where does the ink actually stop inside the declared surface? This is
  // reported, never gated. It is a fact about density, not about chrome, and
  // the founder's sentence („85% of the screen available for the questions") is
  // genuinely satisfied by empty space inside the card. Rows are owed the
  // number so nobody has to argue from a screenshot again.
  let inkBottom = -1;
  let surfaceTop = Number.POSITIVE_INFINITY;
  let surfaceBottom = -1;
  // Row occupancy over the whole viewport height: 1 where SOMETHING inside the
  // content surface puts ink on that scanline. The tail alone is not the
  // answer — on the practice runner the action bar is pinned to the card's
  // bottom edge, so the tail is 22 px while the hole is in the MIDDLE, between
  // the last answer and that bar. `largestGapPx` is the number row C4 is about.
  const inkRow = new Uint8Array(VH);
  for (const el of contentEls) {
    const r = el.getBoundingClientRect();
    surfaceTop = Math.min(surfaceTop, Math.max(0, r.top));
    surfaceBottom = Math.max(surfaceBottom, Math.min(VH, r.bottom));
    for (const node of [el, ...el.querySelectorAll("*")]) {
      const cs = getComputedStyle(node);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (Number.parseFloat(cs.opacity) <= 0) continue;
      const boxes = [];
      if (REPLACED.has(node.tagName) || boxPaint(node, cs) > 0) {
        boxes.push(...paintedBoxes(node));
      }
      boxes.push(...textBoxes(node, cs));
      for (const b of boxes) {
        if (b.bottom > inkBottom) inkBottom = b.bottom;
        for (let y = Math.max(0, b.top); y < Math.min(VH, b.bottom); y += 1) inkRow[y] = 1;
      }
    }
  }
  const usedBottom = inkBottom < 0 ? surfaceTop : inkBottom;
  const emptyTailPx =
    surfaceBottom < 0 ? 0 : Math.max(0, Math.round(surfaceBottom - usedBottom));

  // The tallest run of scanlines INSIDE the surface that carries nothing.
  let largestGapPx = 0;
  let gapTopPx = null;
  if (Number.isFinite(surfaceTop) && surfaceBottom > surfaceTop) {
    let run = 0;
    for (let y = Math.round(surfaceTop); y < Math.round(surfaceBottom); y += 1) {
      if (inkRow[y]) {
        run = 0;
        continue;
      }
      run += 1;
      if (run > largestGapPx) {
        largestGapPx = run;
        gapTopPx = y - run + 1;
      }
    }
  }

  let contentPx = 0;
  let chromePx = 0;
  let freePx = 0;
  let chromeOverContentPx = 0;
  for (let i = 0; i < AREA; i += 1) {
    const c = contentMask[i];
    const u = chromeMask[i];
    if (c) contentPx += 1;
    if (u) chromePx += 1;
    if (c && u) chromeOverContentPx += 1;
    if (c && !u) freePx += 1;
  }

  // Where the chrome sits, as a coarse row profile — this is what turns
  // "48% is controls" into "the bottom 188px is a solid band".
  const BANDS = 12;
  const bandRows = Math.ceil(VH / BANDS);
  const bands = [];
  for (let b = 0; b < BANDS; b += 1) {
    const y0 = b * bandRows;
    const y1 = Math.min(VH, y0 + bandRows);
    if (y1 <= y0) break;
    let covered = 0;
    for (let y = y0; y < y1; y += 1) {
      const row = y * VW;
      for (let x = 0; x < VW; x += 1) if (chromeMask[row + x]) covered += 1;
    }
    bands.push({
      y0,
      y1,
      chromePct: Number(((covered / ((y1 - y0) * VW)) * 100).toFixed(1)),
    });
  }

  // ------------------------------------------------------------- fold test
  const scrollingEl = document.scrollingElement || document.documentElement;
  const docOverflowPx = Math.max(
    0,
    Math.round(scrollingEl.scrollHeight - scrollingEl.clientHeight),
  );
  const foldItems = [];
  for (const raw of mustFit) {
    // "first:<selector>" checks only the first match. Without it, a selector
    // like `article:first-of-type` matches every card in a long list and the
    // fold verdict becomes "a list is longer than a screen" — true, useless,
    // and it drowns the case that matters (is the FIRST topic reachable
    // without scrolling). Everything else is all-or-nothing: on the practice
    // runner, EVERY answer has to be on screen.
    const firstOnly = raw.startsWith("first:");
    const selector = firstOnly ? raw.slice("first:".length) : raw;
    let matches = [];
    try {
      matches = Array.from(document.querySelectorAll(selector));
    } catch {
      matches = [];
    }
    if (matches.length === 0) {
      foldItems.push({ selector: raw, found: 0, fits: false, reason: "not found" });
      continue;
    }
    if (firstOnly) matches = matches.slice(0, 1);
    let worstOverflow = 0;
    let scrollNeeded = 0;
    for (const el of matches) {
      const r = el.getBoundingClientRect();
      const below = Math.max(0, Math.round(r.bottom - VH));
      const above = Math.max(0, Math.round(-r.top));
      const right = Math.max(0, Math.round(r.right - VW));
      const left = Math.max(0, Math.round(-r.left));
      worstOverflow = Math.max(worstOverflow, below, above, right, left);
      // How far a user would have to scroll a container to reveal it.
      for (let n = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) {
          scrollNeeded = Math.max(scrollNeeded, n.scrollHeight - n.clientHeight);
        }
      }
    }
    foldItems.push({
      selector: raw,
      found: matches.length,
      fits: worstOverflow === 0,
      overflowPx: worstOverflow,
      containerScrollPx: Math.round(scrollNeeded),
    });
  }

  // -------------------------------------------------------- touch targets
  const touchViolations = [];
  let touchChecked = 0;
  for (const el of interactiveSet) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (effectiveOpacity(el) <= 0) continue;
    if (el.disabled) continue;
    // A `.sr-only` <input type="radio"> is 1x1 by construction and is NOT the
    // thing a thumb aims at — the <label> wrapping it is, and that label is
    // audited on its own. Flagging the input would report ten 1x1 "violations"
    // on every practice question and bury the real ones.
    if (isClippedAway(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom <= 0 || r.top >= VH || r.right <= 0 || r.left >= VW) continue;

    // THE THING A THUMB AIMS AT IS THE LABEL, NOT THE BOX INSIDE IT.
    //
    // The practice runner draws a real 16x16 <input> inside a `min-h-11` label
    // that spans the option row, and clicking ANYWHERE in that label activates
    // the input — that is the browser's behaviour, not a convention. The probe
    // was reporting four "16x16 violations" per question that describe nothing
    // a thumb can miss, and they sorted to the top of the list and buried the
    // 38x38 hamburger that was real.
    //
    // So a form control wrapped by its own <label> inherits that label's hit
    // box. Strictly the WRAPPING case: a `for=`-linked
    // label somewhere else on the page does NOT make a small control reachable
    // at the control's own position, and must keep failing. The label is
    // audited on its own, so nothing is being excused — the audit just happens
    // once, against the box that actually receives the tap.
    let hit = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const wrappingLabel =
      typeof el.closest === "function" ? el.closest("label") : null;
    // `label.control === el` is the exact test: this label labels THIS control.
    // A stray small button that merely happens to sit inside a label keeps
    // failing, because tapping the label would not activate it.
    if (wrappingLabel && wrappingLabel !== el && wrappingLabel.control === el) {
      const lr = wrappingLabel.getBoundingClientRect();
      if (lr.width > 0 && lr.height > 0) {
        hit = {
          left: Math.min(hit.left, lr.left),
          top: Math.min(hit.top, lr.top),
          right: Math.max(hit.right, lr.right),
          bottom: Math.max(hit.bottom, lr.bottom),
        };
      }
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
      if (ps.pointerEvents === "none") continue;
      const px = (v) => {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };
      hit = {
        left: Math.min(hit.left, r.left + px(ps.left)),
        top: Math.min(hit.top, r.top + px(ps.top)),
        right: Math.max(hit.right, r.right - px(ps.right)),
        bottom: Math.max(hit.bottom, r.bottom - px(ps.bottom)),
      };
    }
    const w = Math.round((hit.right - hit.left) * 10) / 10;
    const h = Math.round((hit.bottom - hit.top) * 10) / 10;
    touchChecked += 1;
    if (w < minTouch || h < minTouch) {
      touchViolations.push({
        path: describe(el),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48),
        w,
        h,
        rect: { x: Math.round(hit.left), y: Math.round(hit.top) },
      });
    }
  }

  // ------------------------------------------------------------ safe areas
  const envProbe = document.createElement("div");
  envProbe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:0;height:0;" +
    "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
    "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
  document.documentElement.appendChild(envProbe);
  const envCs = getComputedStyle(envProbe);
  const envInsets = {
    top: Number.parseFloat(envCs.paddingTop) || 0,
    right: Number.parseFloat(envCs.paddingRight) || 0,
    bottom: Number.parseFloat(envCs.paddingBottom) || 0,
    left: Number.parseFloat(envCs.paddingLeft) || 0,
  };
  envProbe.remove();

  // Does the app even reference env()? A page that never mentions
  // safe-area-inset cannot be honouring a notch by accident.
  let usesEnv = false;
  try {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of rules) {
        if (rule.cssText && rule.cssText.includes("safe-area-inset")) {
          usesEnv = true;
          break;
        }
      }
      if (usesEnv) break;
    }
  } catch {
    /* ignore */
  }

  // The insets that MATTER are the device's, not the desktop WebKit build's
  // (which reports 0 because there is no notch). The profile supplies them.
  const unsafe = {
    top: Math.max(safeArea.top, envInsets.top),
    right: Math.max(safeArea.right, envInsets.right),
    bottom: Math.max(safeArea.bottom, envInsets.bottom),
    left: Math.max(safeArea.left, envInsets.left),
  };
  const safeViolations = [];
  for (const el of interactiveSet) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (effectiveOpacity(el) <= 0) continue;
    if (isClippedAway(cs)) continue; // sr-only: nothing is painted at that edge
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom <= 0 || r.top >= VH || r.right <= 0 || r.left >= VW) continue;
    const edges = [];
    if (unsafe.top > 0 && r.top < unsafe.top + safeEdgeMargin) {
      edges.push({ edge: "top", gapPx: Math.round(r.top - unsafe.top) });
    }
    if (unsafe.bottom > 0 && VH - r.bottom < unsafe.bottom + safeEdgeMargin) {
      edges.push({ edge: "bottom", gapPx: Math.round(VH - r.bottom - unsafe.bottom) });
    }
    if (unsafe.left > 0 && r.left < unsafe.left + safeEdgeMargin) {
      edges.push({ edge: "left", gapPx: Math.round(r.left - unsafe.left) });
    }
    if (unsafe.right > 0 && VW - r.right < unsafe.right + safeEdgeMargin) {
      edges.push({ edge: "right", gapPx: Math.round(VW - r.right - unsafe.right) });
    }
    if (edges.length > 0) {
      safeViolations.push({
        path: describe(el),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        edges,
      });
    }
  }

  contributors.sort((a, b) => b.addedPx - a.addedPx);
  touchViolations.sort((a, b) => a.w * a.h - b.w * b.h);

  return {
    viewport: {
      width: VW,
      height: VH,
      dpr: window.devicePixelRatio,
      visual: window.visualViewport
        ? {
            width: Math.round(window.visualViewport.width),
            height: Math.round(window.visualViewport.height),
            scale: window.visualViewport.scale,
          }
        : null,
      areaPx: AREA,
    },
    coverage: {
      contentSelectors,
      contentSurfacesFound: contentEls.length,
      contentPx,
      chromePx,
      chromeOverContentPx,
      freeContentPx: freePx,
      unclaimedPx: AREA - freePx - chromePx,
      contentFraction: Number((freePx / AREA).toFixed(4)),
      chromeFraction: Number((chromePx / AREA).toFixed(4)),
      unclaimedFraction: Number(((AREA - freePx - chromePx) / AREA).toFixed(4)),
      bands,
      // Reported, not gated — see the „content USE" note above.
      contentUse: {
        surfaceTopPx: Number.isFinite(surfaceTop) ? Math.round(surfaceTop) : null,
        surfaceBottomPx: surfaceBottom < 0 ? null : Math.round(surfaceBottom),
        lastInkBottomPx: inkBottom < 0 ? null : Math.round(inkBottom),
        emptyTailPx,
        emptyTailFraction: Number((emptyTailPx / VH).toFixed(4)),
        largestGapPx,
        largestGapTopPx: gapTopPx,
        largestGapFraction: Number((largestGapPx / VH).toFixed(4)),
      },
      topContributors: contributors.slice(0, 15),
      invisibleInteractive: invisibleInteractive.slice(0, 20),
    },
    fold: {
      documentOverflowPx: docOverflowPx,
      scrolls: docOverflowPx > 1,
      items: foldItems,
      pass: docOverflowPx <= 1 && foldItems.every((i) => i.fits),
    },
    touch: {
      minTouch,
      checked: touchChecked,
      violations: touchViolations,
      pass: touchViolations.length === 0,
    },
    safeArea: {
      profileInsets: safeArea,
      envInsets,
      effectiveInsets: unsafe,
      stylesheetsReferenceEnv: usesEnv,
      marginPx: safeEdgeMargin,
      violations: safeViolations,
      pass: safeViolations.length === 0,
    },
  };
}

/** The probe as a string, for callers that prefer page.evaluate(string). */
export const probeSource = probeBody.toString();
