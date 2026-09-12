/**
 * perception.mjs — WHAT THE TEAL PIXELS ARE, NOT JUST HOW MANY THERE ARE.
 *
 * `guidance.mjs` decides where to aim and how hard to press. This file decides
 * WHAT IT IS LOOKING AT, and it exists because the gate that used to answer
 * that question counted pixels and nothing else.
 *
 * ── THE DEFECT, MEASURED ───────────────────────────────────────────────────
 *
 * `CONFIDENT_BAND_PX = 3000` blocked 1,090 of 1,623 turn demands (67 %) across
 * w30–w33, and it is ANTI-CORRELATED with demand: it clears 45 % of sightings
 * at 0–3° of error, peaks at 66 % at 12–15°, and collapses to 11 % at 30–45°.
 * At a junction the road is edge-on — few pixels — and the nearby glowing
 * furniture of the guidance layer (the turn chevron, the objective pillar, the
 * goal marker) is close, saturated and additively blended, so it carries far
 * more mass per unit of ground than the line does. A MASS THRESHOLD THEREFORE
 * ASKS THE WRONG QUESTION: it lets a compact object in and keeps a road out.
 *
 * Seen in one frame — `sc-junction-left/pc-right`, w33, `04-t059s.png`: the
 * only teal in the scan band is a 199-column blob carrying 8,543 px. It clears
 * the gate comfortably, `aimFrom` returns `confident: true`, and the bearing it
 * reports is +5.8° RIGHT on a frame whose banner reads «Завий наляво». The loop
 * was not blind. It was confidently reading a LEFT ARROW as a RIGHT aim point.
 *
 * ── SO THE SCAN IS SEGMENTED BEFORE IT IS WEIGHED ──────────────────────────
 *
 * Everything here works on the packed ribbon mask that `scanBand` already
 * computes and used to throw away. It labels the mask into connected
 * components and measures each one, so the three questions the control law
 * actually has can be answered separately:
 *
 *   1. IS THIS A ROAD OR AN OBJECT?  `classify` — a road-spanning line and a
 *      compact glowing plate differ in SHAPE, at every distance, and shape is
 *      what nothing measured. See `LINE_ROW_FRAC` and `LINE_ELONGATION`.
 *   2. IS THIS THE WORLD AT ALL?  `createFurnitureRegister` — teal that sits
 *      in the same canvas rectangle frame after frame while the car moves is
 *      page furniture, whatever the DOM says about it.
 *   3. WHICH WAY DOES THE PRODUCT SAY TO TURN?  `chevronAim` — the turn
 *      chevron is an ARROWHEAD and an arrowhead has a direction. The old code
 *      folded it into a centroid, which is the one operation that destroys it.
 *
 * ── THE HONESTY CONSTRAINT THIS FILE IS WRITTEN UNDER ──────────────────────
 *
 * A harness that steers by reading an answer the product computed for the
 * grader is not a driver, and a closure it produces is worse than the UNJUDGED
 * row it replaces. Every signal used here is a thing RouteGuidance paints on
 * the windscreen FOR THE STUDENT TO ACT ON: the ghost ribbon (which the aids
 * literally caption «Следвай синята линия»), and the turn chevron, which the
 * file's own header calls „ONE floating arrow before the next junction where
 * the route turns". Reading the arrow's direction is reading the instruction
 * the student is given, in the same way a student reads it. It is NOT reading
 * a hidden target, a route array, or a verdict.
 *
 * The record has to say so per tick, and it does: every aim carries `source`
 * and every drive carries the `signalMix` counts, so a reader can see how much
 * of a drive was steered by the line and how much by the arrow, and refuse the
 * drive if that mix is not what they will accept.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. CONNECTED COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Components smaller than this are antialiasing, a distant chevron tip, or one
 * lit pixel of something else. Scaled by dpr² at the call site, because a
 * mobile band is 3× linear and the same object is nine times the pixels.
 */
export const MIN_COMPONENT_PX = 24;

const bitAt = (bits, w, x, y) => {
  const k = y * w + x;
  return (bits[k >> 3] & (128 >> (k & 7))) !== 0;
};

/**
 * Label a packed 1-bit mask into 8-connected components, with the moments each
 * classifier below needs.
 *
 * ITERATIVE, WITH AN EXPLICIT STACK, and that is not a style preference: a
 * mobile band is 2556 × 378 and a ribbon on a wet night is one component of
 * ~300,000 pixels, which is about 300,000 frames of recursion.
 *
 * @param {Buffer|Uint8Array} bits row-major, one bit per pixel, MSB first
 * @param {number} w @param {number} h
 * @param {{minPx?:number}} o
 * @returns {Array<object>} components, largest first
 */
export function labelComponents(bits, w, h, { minPx = MIN_COMPONENT_PX } = {}) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const k0 = y0 * w + x0;
      if (seen[k0] || !bitAt(bits, w, x0, y0)) continue;
      let sp = 0;
      stack[sp++] = k0;
      seen[k0] = 1;
      const px = [];
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let sx = 0;
      let sy = 0;
      while (sp > 0) {
        const k = stack[--sp];
        const y = (k / w) | 0;
        const x = k - y * w;
        px.push(k);
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
            const nk = ny * w + nx;
            if (seen[nk] || !bitAt(bits, w, nx, ny)) continue;
            seen[nk] = 1;
            stack[sp++] = nk;
          }
        }
      }
      if (px.length < minPx) continue;
      const n = px.length;
      const cx = sx / n;
      const cy = sy / n;
      let m20 = 0;
      let m11 = 0;
      let m02 = 0;
      for (let i = 0; i < n; i++) {
        const k = px[i];
        const y = (k / w) | 0;
        const dx = k - y * w - cx;
        const dy = y - cy;
        m20 += dx * dx;
        m11 += dx * dy;
        m02 += dy * dy;
      }
      m20 /= n;
      m11 /= n;
      m02 /= n;
      out.push({ n, cx, cy, minX, maxX, minY, maxY, m20, m11, m02, px, w, h });
    }
  }
  out.sort((a, b) => b.n - a.n);
  return out.map((c) => decorate(c, w, h));
}

/** The derived shape numbers every decision below reads. */
function decorate(c, w, h) {
  // Principal axis from the second moments. `major`/`minor` are the RMS radii
  // along the eigenvectors, so `elongation` is scale-free.
  const t = c.m20 + c.m02;
  const d = Math.sqrt(Math.max(0, (c.m20 - c.m02) * (c.m20 - c.m02) + 4 * c.m11 * c.m11));
  const l1 = (t + d) / 2;
  const l2 = Math.max(1e-9, (t - d) / 2);
  const major = Math.sqrt(Math.max(0, l1));
  const minor = Math.sqrt(l2);
  // Eigenvector for l1. `m11 === 0 && m20 === m02` is a disc: the axis is
  // undefined, and saying "0 rad" there would invent a direction out of noise.
  const axisDefined = !(Math.abs(c.m11) < 1e-9 && Math.abs(c.m20 - c.m02) < 1e-9);
  let ux = 1;
  let uy = 0;
  if (axisDefined) {
    const vx = l1 - c.m02;
    const vy = c.m11;
    const len = Math.hypot(vx, vy) || 1;
    // (l1 - m02, m11) degenerates when m11 is 0 and m20 < m02 (a vertical bar):
    // fall back to the other standard form, which is well conditioned there.
    if (len < 1e-6) {
      ux = 0;
      uy = 1;
    } else {
      ux = vx / len;
      uy = vy / len;
    }
  }
  // Extremes along the axis, measured from the centroid. An ARROWHEAD is
  // asymmetric about its own centroid — its point reaches further than its
  // wings do — and that asymmetry is what `chevronAim` reads.
  let tMax = 0;
  let tMin = 0;
  let nTip = 0;
  let nRear = 0;
  for (let i = 0; i < c.px.length; i++) {
    const k = c.px[i];
    const y = (k / w) | 0;
    const p = (k - y * w - c.cx) * ux + (y - c.cy) * uy;
    if (p > tMax) tMax = p;
    if (p < tMin) tMin = p;
  }
  const forward = Math.abs(tMax) >= Math.abs(tMin) ? 1 : -1;
  for (let i = 0; i < c.px.length; i++) {
    const k = c.px[i];
    const y = (k / w) | 0;
    const p = ((k - y * w - c.cx) * ux + (y - c.cy) * uy) * forward;
    if (p > 0) nTip++;
    else nRear++;
  }
  const reachTip = forward > 0 ? tMax : -tMin;
  const reachRear = forward > 0 ? -tMin : tMax;
  const bw = c.maxX - c.minX + 1;
  const bh = c.maxY - c.minY + 1;
  // How many of the component's own rows carry it: a line threading down the
  // band occupies nearly every row of its bbox; a plate does too, so this is
  // NOT the line test — it is here because a broken, dashed remnant is neither.
  const rowsSeen = new Set();
  for (let i = 0; i < c.px.length; i++) rowsSeen.add((c.px[i] / w) | 0);
  return {
    n: c.n,
    cx: c.cx,
    cy: c.cy,
    minX: c.minX,
    maxX: c.maxX,
    minY: c.minY,
    maxY: c.maxY,
    bboxW: bw,
    bboxH: bh,
    rows: rowsSeen.size,
    /** fraction of the band's WIDTH this component reaches across */
    spanFrac: bw / w,
    /** fraction of the band's HEIGHT it reaches down */
    depthFrac: bh / h,
    /** fraction of the band's rows it actually occupies */
    rowFrac: rowsSeen.size / h,
    /** how much of its own bounding box it fills — a plate is dense, a line is not */
    fill: c.n / Math.max(1, bw * bh),
    axisX: ux,
    axisY: uy,
    axisDefined,
    major,
    minor,
    elongation: major / Math.max(1e-6, minor),
    /** ±1: which end of the axis reaches further from the centroid */
    forward,
    reachTip,
    reachRear,
    /** >1 means one end reaches further than the other — an arrowhead's signature */
    reachRatio: reachTip / Math.max(1e-6, reachRear),
    /** …and the far end must ALSO be the lighter one, or it is a tail, not a point */
    tipMassFrac: nTip / Math.max(1, nTip + nRear),
    touchesBottom: c.maxY >= h - 2,
    touchesTop: c.minY <= 1,
    touchesLeft: c.minX <= 1,
    touchesRight: c.maxX >= w - 2,
    px: c.px,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. A LINE IS NOT AN OBJECT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE TEST IS WRITTEN THE OTHER WAY ROUND FROM THE OBVIOUS ONE, AND THAT WAS
 * MEASURED RATHER THAN CHOSEN.
 *
 * The first draft asked "does this look like a road?" and kept only what said
 * yes. On the recorded corpus that is a bad trade in a way the shape of the
 * error explains: the ribbon does not have ONE appearance. Forty metres away
 * it is a hairline; crossing the windscreen at a junction it is a 600 px
 * horizontal streak with an elongation of 60; and under the bumper on a left
 * turn it is a fat 176 × 109 blob with an elongation of 2.49 — which the
 * road-shaped test threw away as an object. Measured, that draft LOST ground:
 * confident turn demands 289 → 296 but the ones that agreed with the correct
 * drive fell 220 → 211.
 *
 * A GLOWING PLATE, by contrast, has exactly one appearance, and it is tight.
 * Across every pc lane sampled, the turn chevron measures elongation
 * 1.71–2.01, bbox fill 0.47–0.53, width ≤ 6 % of the band and height ≤ 19 % of
 * it, and it holds those numbers from 13 × 8 px at the far end of the route to
 * 69 × 40 px at the junction — because it is one flat plate under a fixed
 * camera pitch, and scale is the only thing that changes. That is a signature
 * the road never wears.
 *
 * So the classifier POSITIVELY IDENTIFIES THE OBJECT and calls everything else
 * road. It can therefore only ever remove teal that looks like the plate; it
 * cannot silently discard a road it failed to recognise, which is the failure
 * that made the first draft worse than the gate it replaced.
 *
 * ── THE FOUR CLAUSES, and what each one alone lets through ─────────────────
 *  · ELONGATION ≤ 3.0 — a hairline of road has elongation in the tens.
 *  · FILL ≥ 0.35 — the card border and the ribbon's far edge are outlines,
 *    filling 3–17 % of their own bounding box. An arrowhead fills about half.
 *  · SPAN ≤ 0.12 of the band width — the chevron is never wide. A road
 *    crossing the windscreen is nothing else.
 *  · DEPTH ≤ 0.28 of the band height — this is the clause that saves the near
 *    ribbon: it reaches from the bumper up the glass and the plate does not.
 *
 * ALL FOUR MUST HOLD. The thresholds sit at roughly 1.5× the widest measured
 * chevron on every axis, so the class is defined by the object's own geometry
 * and not by where a corpus happened to put a boundary.
 */
export const OBJ_ELONGATION = 3.0;
export const OBJ_FILL = 0.35;
export const OBJ_SPAN_FRAC = 0.12;
export const OBJ_DEPTH_FRAC = 0.28;

/** Does this component wear the compact-glowing-plate signature? */
export function isPlate(c, o = {}) {
  return (
    c.elongation <= (o.objElongation ?? OBJ_ELONGATION) &&
    c.fill >= (o.objFill ?? OBJ_FILL) &&
    c.spanFrac <= (o.objSpanFrac ?? OBJ_SPAN_FRAC) &&
    c.depthFrac <= (o.objDepthFrac ?? OBJ_DEPTH_FRAC)
  );
}

/**
 * Classify one component. Returns `"line" | "object"`.
 * @param {object} c a component from `labelComponents`
 */
export function classify(c, o = {}) {
  return isPlate(c, o) ? "object" : "line";
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. THE SCREEN-FIXED FURNITURE
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * TEAL THAT DOES NOT MOVE WHILE THE CAR DOES IS NOT THE WORLD.
 *
 * `lesson-audit.mjs` already masks the HUD, from the DOM, by bounding box, and
 * that mask is good. It has three gaps that a pixel test does not:
 *
 *   · A BOX SHADOW PAINTS OUTSIDE THE BOX. `getBoundingClientRect` returns the
 *     border box; `box-shadow`, `filter: drop-shadow` and an emissive glow all
 *     bleed past it, and `--accent-2` glows are all over this HUD.
 *   · AN ELEMENT OUTSIDE THE SELECTOR PAINTS ANYWAY. The mask's roots are
 *     `[data-hud]`, `[data-sim-overlay]`, the dialog/status roles and
 *     `[role="slider"]`. Anything teal that is none of those is invisible to it.
 *   · THE MASK IS READ BEFORE THE SCREENSHOT. Two CDP round trips apart, on a
 *     box where a screenshot has been measured at 12 s; a card that appears
 *     between them is unmasked in the picture that is scanned.
 *
 * So this is a SECOND, INDEPENDENT defence with a different failure mode, and
 * it is deliberately conservative: it only ever removes a pixel that has been
 * teal in most of the frames THE CAR WAS MOVING THROUGH. A parked car sees a
 * static world, so a still tick is not evidence and is not counted.
 *
 * IT CANNOT DELETE THE ROAD, and the reason is worth stating because "subtract
 * what does not move" sounds like it could. The ribbon is drawn along the
 * carriageway from under the bumper to the horizon; as the car advances, every
 * pixel of it flows outward and down. The only part that holds still is the
 * vanishing point, which is one or two rows at the very top of the band. The
 * register therefore also refuses to mark a pixel that belongs to a component
 * classified as a line in the same frame — a road may not be furniture, ever,
 * however still it looks.
 */
export const FURNITURE_MIN_FRAMES = 4;
export const FURNITURE_MIN_FRAC = 0.8;
/**
 * …OVER A SLIDING WINDOW, AND THE FIRST DRAFT'S WHOLE-DRIVE COUNTER WAS WRONG.
 *
 * MEASURED on 284 recorded lanes: a cell occupied in ≥80 % of ALL of a lane's
 * moving frames exists on 11 lanes and 12 frames, median 37 px — nothing. The
 * furniture this is for is not up for the whole drive: the advisor card, the
 * violation card and the teach layer appear, are read, and go. A whole-drive
 * counter cannot see a rectangle that held still for eight frames and then
 * left, which is exactly what page furniture does.
 *
 * A window also matches what the live loop can actually do: it is causal, it
 * costs one ring buffer, and it forgets. Sized so a decision needs several
 * consecutive sightings (at the measured ~1,021 ms period, about twelve
 * seconds of history) and so a card that has gone stops being subtracted
 * within the same span.
 */
export const FURNITURE_WINDOW = 12;
/** A HUD element may jitter by a subpixel between frames; a road does not
 *  merely jitter. The occupancy test is done on a coarse grid for that reason,
 *  and the cell is sized in CSS pixels so it means the same thing at dpr 3. */
export const FURNITURE_CELL_CSS_PX = 4;

/**
 * @param {{w:number,h:number,dpr?:number,minFrames?:number,minFrac?:number}} o
 * @returns {{observe:function, rects:function, stats:function}}
 */
export function createFurnitureRegister({
  w,
  h,
  dpr = 1,
  minFrames = FURNITURE_MIN_FRAMES,
  minFrac = FURNITURE_MIN_FRAC,
  cellPx = FURNITURE_CELL_CSS_PX,
  window = FURNITURE_WINDOW,
  isObject = null,
} = {}) {
  const cell = Math.max(1, Math.round(cellPx * dpr));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const nCells = gw * gh;
  /** the last `window` moving frames, each a cell-occupancy bitmap */
  const ring = [];
  /** running per-cell count over the ring, so `isFixed` is O(1) */
  const hits = new Uint16Array(nCells);
  /** cells any LINE component has ever occupied — a road may not be furniture */
  const roadEver = new Uint8Array(nCells);
  let frames = 0;
  const objOf = isObject ?? ((c) => classify(c) !== "line");

  return {
    cell,
    gw,
    gh,
    /**
     * Fold one MOVING frame into the register.
     * @param {Array<object>} components from `labelComponents`
     * @param {{moving:boolean}} o a still tick is not evidence; it is skipped.
     */
    observe(components, { moving = true } = {}) {
      if (!moving) return;
      frames += 1;
      const touched = new Uint8Array(nCells);
      for (const c of components) {
        const obj = objOf(c);
        for (let i = 0; i < c.px.length; i++) {
          const k = c.px[i];
          const y = (k / w) | 0;
          const g = ((y / cell) | 0) * gw + (((k - y * w) / cell) | 0);
          if (!obj) roadEver[g] = 1;
          else touched[g] = 1;
        }
      }
      ring.push(touched);
      for (let g = 0; g < nCells; g++) if (touched[g]) hits[g] += 1;
      if (ring.length > window) {
        const gone = ring.shift();
        for (let g = 0; g < nCells; g++) if (gone[g]) hits[g] -= 1;
      }
    },
    /** How many moving frames have been folded in, in total. */
    frames: () => frames,
    /** …and how many are in the window the decision is made over. */
    windowFrames: () => ring.length,
    /** Is this pixel screen-fixed furniture? */
    isFixed(x, y) {
      if (ring.length < minFrames) return false;
      const g = ((y / cell) | 0) * gw + ((x / cell) | 0);
      return roadEver[g] === 0 && hits[g] >= Math.ceil(minFrac * ring.length);
    },
    /** The register, summarised, for the record and for the bench. */
    stats() {
      let fixed = 0;
      if (ring.length >= minFrames) {
        const need = Math.ceil(minFrac * ring.length);
        for (let g = 0; g < nCells; g++) if (roadEver[g] === 0 && hits[g] >= need) fixed += 1;
      }
      return { frames, windowFrames: ring.length, cells: nCells, fixedCells: fixed, cell, gw, gh };
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. THE CHEVRON SAYS WHICH WAY, AND IT WAS BEING WEIGHED INSTEAD OF READ
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The turn chevron is an extruded arrowhead — `RouteGuidance.tsx`,
 * `arrowGeoArgs`: tip (0.95, 0), wings (−0.55, ±0.85), notch (−0.18, 0) — laid
 * on the road with `rotation.order = "YXZ"` so the yaw points it ALONG THE EXIT
 * DIRECTION of the junction ahead. It is painted in the same `--accent-2` as
 * the ribbon, which is why the scan sees it, and it is painted FOR THE STUDENT:
 * the file calls it „ONE floating arrow before the next junction where the
 * route turns".
 *
 * ITS ORIENTATION IS RECOVERABLE FROM ITS OWN PIXELS, and this is the part the
 * old centroid threw away. Solve the shape's area centroid: with the tip at
 * x = +0.95 and the wing line at x = −0.55, the centroid sits at x = +0.0733,
 * so the point reaches 0.877 from the centroid and the wings reach 0.623 — a
 * ratio of 1.41, and the ratio is preserved by any affine map, which is what a
 * small object's projection is to within a few percent. The far end is
 * therefore the POINT, and it is also the LIGHTER end: 45.3 % of the area lies
 * beyond the centroid on the tip side against 54.7 % behind it.
 *
 * Both tests must agree before a direction is returned. A blob that reaches
 * further one way AND is heavier that way is a tail, a smear or two things
 * touching, and gets no vote.
 *
 * WHAT THIS IS NOT. It is not a heading, and it must never be treated as one:
 * the chevron lies on the road plane under a camera whose pitch the product
 * does not publish, so the angle its axis makes on the glass is not the angle
 * the car must turn through. What it carries is a SIGN and a rough magnitude of
 * bearing to the point it indicates, which is exactly what a student reads off
 * it, and it is used here only where the alternative is no signal at all.
 */
export const CHEVRON_MIN_REACH_RATIO = 1.15;
export const CHEVRON_MAX_TIP_MASS = 0.5;
export const CHEVRON_MIN_ELONGATION = 1.25;

/**
 * WHICH CLAUSE ACTUALLY BINDS, MEASURED — because this file has a rule about
 * constants nothing reaches, and a shape test is where they breed.
 *
 * Over 6,426 plate-shaped components of the recorded corpus, 898 are accepted
 * as chevrons. Each clause's total failures, and how often it was the ONLY
 * thing standing between a component and acceptance:
 *
 *     axis is defined                2 fail
 *     |axisX| ≥ 0.8              3,457 fail
 *     elongation ≥ 1.25          2,013 fail
 *     reach ratio ≥ 1.15         3,630 fail   sole blocker on 321
 *     far end ≤ 50 % of the mass 1,362 fail   sole blocker on  26
 *     |lean| ≥ 0.006 × band      4,096 fail   sole blocker on 106
 *
 * AND A SPAN CLAUSE WAS DELETED FROM THIS FUNCTION RATHER THAN SHIPPED AT
 * ZERO. It read `spanFrac > 0.45` and it failed exactly 0 times, because the
 * only components this is ever called on have already passed `isPlate`, which
 * requires `spanFrac ≤ 0.12`. It was structurally unreachable — the dead
 * predicate wearing a safety argument this programme keeps finding — so the
 * precondition is asserted in the doc instead and the clause is gone.
 *
 * The tip-mass clause is the weakest at 26, and it survives because 26 is not
 * zero and because the class it names is real: the histogram of `tipMassFrac`
 * across those 6,426 has a peak of 2,264 at 0.45 — the arrowhead's solved
 * 0.453, arriving out of the pixels — a mode of 2,913 at 0.50 (symmetric bars,
 * where the reach clause does the work) and a tail of 588 above 0.55, which is
 * the club this clause is for.
 *
 * PRECONDITION: `c` has passed `isPlate`. Calling it on a road-sized component
 * is not wrong, it is meaningless.
 */

/**
 * Read a component as a turn chevron.
 * @returns {{isChevron:boolean, why:string, tipX?:number, tipY?:number,
 *            aimPx?:number, dirSign?:-1|0|1, reachRatio?:number}}
 */
export function chevronAim(c, { bandWidth, opts = {} } = {}) {
  const minReach = opts.minReachRatio ?? CHEVRON_MIN_REACH_RATIO;
  const maxTipMass = opts.maxTipMass ?? CHEVRON_MAX_TIP_MASS;
  const minElong = opts.minElongation ?? CHEVRON_MIN_ELONGATION;
  if (!c.axisDefined) return { isChevron: false, why: "no principal axis — the blob is a disc" };
  if (c.elongation < minElong) return { isChevron: false, why: `elongation ${c.elongation.toFixed(2)} — round, not pointed` };
  if (c.reachRatio < minReach) return { isChevron: false, why: `reach ratio ${c.reachRatio.toFixed(2)} — symmetric, so no point` };
  if (c.tipMassFrac > maxTipMass) return { isChevron: false, why: `the far end carries ${(c.tipMassFrac * 100) | 0}% of the mass — a club, not a point` };
  const tipX = c.cx + c.axisX * c.forward * c.reachTip;
  const tipY = c.cy + c.axisY * c.forward * c.reachTip;
  const aimPx = tipX - bandWidth / 2;
  // The tip's horizontal displacement FROM THE PLATE, not from the image
  // centre: it is the arrow's own statement, and it survives the plate itself
  // drifting across the glass as the car moves.
  const lean = c.axisX * c.forward * c.reachTip;
  return {
    isChevron: true,
    why: `arrowhead: reach ${c.reachRatio.toFixed(2)}×, far end carries ${(c.tipMassFrac * 100) | 0}% of the mass`,
    tipX,
    tipY,
    aimPx,
    lean,
    dirSign: Math.abs(lean) < 1 ? 0 : Math.sign(lean),
    reachRatio: c.reachRatio,
  };
}
