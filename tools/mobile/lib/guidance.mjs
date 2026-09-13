/**
 * guidance.mjs — THE STEERING CONTROL LAW, AND THE RECORD OF HOW WELL IT DROVE.
 *
 * Pure functions only: no browser, no page, no `page.screenshot`. Everything
 * here takes decoded pixels or plain numbers and returns plain numbers, so
 * `__tests__/guidance.test.mjs` can watch each clause fail without a sim.
 *
 * ═══ WHAT THE CAR STEERS AGAINST, AND WHY IT IS THIS ═══════════════════════
 *
 * MEASURED 2026-08-21 on the live lesson page (`tools/mobile/steer-survey.mjs`,
 * dev server 4611160afb1e, iphone16-landscape / WebKit and 1440×900 / Chromium),
 * because round 2's survey was one agent reading the DOM once and this
 * programme has been damaged repeatedly by inherited claims. What the page
 * actually publishes during a drive:
 *
 *   · THE DOM CARRIES NO GEOMETRY. A census of EVERY `data-*`/`aria-*`
 *     attribute in the document returned FOURTEEN that contain a digit, and the
 *     complete list is: two safe-area emulation strings, `data-engine`
 *     ("three.js r185"), the four `data-arc` indices of the rev arc, the
 *     speed/limit/governor aria-labels, and `aria-valuemin/max/now` on the two
 *     touch pads. No heading. No lateral offset. No distance to target. Round 2
 *     was RIGHT about this, and it is confirmed rather than inherited.
 *
 *   · AND THE ONE ATTRIBUTE THAT LOOKS LIKE A WHEEL ANGLE IS A DECORATION.
 *     `[role="slider"][aria-label="Волан — плъзни наляво или надясно"]`
 *     publishes `aria-valuenow={0}` — a literal in TouchControls.tsx, never
 *     updated, on a slider whose knob IS moved (imperatively, through a ref).
 *     It reads 0 with the wheel at full lock. A control law that closed around
 *     it would have measured its own commands as having no effect, for ever.
 *
 *   · `[data-hud="follow-hint"]` IS NOT A SIGNAL. It is a text chip reading
 *     «Следвай синята линия», rendered only when `aids.followHints` is set —
 *     an S1 L1/L2 aid, absent from the curriculum lessons — and it is BINARY:
 *     on or off, no magnitude, no direction. Round 2 put it first. It cannot
 *     hold a lane; at best it says "you already left it".
 *
 *   · THE RIBBON IS REAL AND IT IS PHOTOGRAPHABLE. `RouteGuidance.tsx` paints
 *     the ghost ribbon, the turn chevron and the objective pillar in
 *     `--accent-2` (#17e1c4). Measured on the road band: 10,431–12,637 pixels
 *     of it on an ordinary frame. It is the product's own „follow the line",
 *     drawn for every lesson that has objectives, and it is what a student is
 *     told to follow. THIS IS WHAT THE LOOP CLOSES AROUND.
 *
 *   · AND THE COLOUR SEPARATES CLEANLY FROM THE HUD, WHICH IS THE ONLY REASON
 *     IT IS USABLE. The interface accent is `--accent` #3fa1ff — B (255) > G
 *     (161) — and the ribbon is #17e1c4 — G (225) > B (196). The single test
 *     `G >= B` therefore rejects every blue pill, ring and border on the glass
 *     while keeping the ribbon. See `isRibbonPixel`.
 *
 * ═══ THE OBJECTION THAT MUST TRAVEL WITH EVERY NUMBER THIS FILE PRODUCES ═══
 *
 * THE RIBBON IS A CENTRELINE, NOT A LANE. `guidanceRoute.ts` says so in its own
 * words, at the fix that made lane position expressible at all:
 *
 *     „`ov-keepright-v1` is ONE edge, (0,0)→(0,360): the whole 2+2 boulevard is
 *      a single centreline at x = 0 … `shortestPathRaw` emits pure centreline
 *      geometry, so the derived route ran x = 0.00 at EVERY sample"
 *
 * The lateral shift into the goal's lane is applied ONLY on the final leg,
 * eased over `LANE_ALIGN_RAMP_M` and bounded by `LANE_ALIGN_MAX_M`. Everywhere
 * else the ribbon runs down the middle of the carriageway.
 *
 * SO: a drive that tracks this ribbon perfectly is driving the middle of the
 * road, not the middle of a lane. That is a fact about the SIGNAL, and it means
 * NO FINDING ABOUT LANE POSITION — „drifted into the oncoming lane", „clipped
 * the kerb", „failed to keep right" — MAY BE DRAWN FROM A DRIVE STEERED BY IT.
 * The tracking record says this in words on every drive (`caveat`) so a later
 * reader cannot reach the numbers without reaching the objection first.
 *
 * What the loop CAN honestly claim is direction: the car follows the road the
 * lesson routes it down, round curves and through junctions, instead of
 * travelling in a straight line off the carriageway.
 *
 * ═══ WHY THE AIM POINT IS AHEAD AND NOT UNDER THE BUMPER ═══════════════════
 *
 * Three independent reasons, and they agree:
 *   1. PURE PURSUIT. The actuator has ~0.5 s of dead time (one screenshot).
 *      Nulling the nearest-field offset with that much lag oscillates; aiming
 *      at a look-ahead point is the standard cure and degrades gracefully.
 *   2. THE NEAR FIELD IS OFTEN NOT THERE. Measured over eight samples of one
 *      drive, the bottom third of the band held no ribbon at all in five of
 *      them, while the upper band held it in eight. A controller keyed to the
 *      near field would have been blind most of the time.
 *   3. IT IS THE HONEST READING OF A CENTRELINE. A look-ahead aim point uses
 *      the ribbon for the question it can answer (which way does the road go)
 *      and leans on it least for the one it cannot (which lane).
 *
 * ═══ THE ACTUATOR IS QUANTISED IN TIME, NOT IN AMPLITUDE ═══════════════════
 *
 * `engine/input.ts` computes `out.steer = (left ? 1 : 0) - (right ? 1 : 0)`, so
 * a keyboard can only ever ask for FULL lock or nothing. What makes fine
 * control possible is the rate limiter in `VehicleSim.ts`:
 *
 *     steerTarget = clamp(input.steer, -1, 1) * maxSteer
 *     this.steer  = approach(this.steer, steerTarget, rate * dt)
 *
 * with `STEER_SPEED = 3.2` rad/s toward the target, `STEER_RETURN_SPEED = 4.8`
 * rad/s back to centre, and `STEER_MAX_ANGLE = 0.6` rad at or below 15 км/ч.
 * Full lock is therefore 0.6 / 3.2 = 188 ms away from centre, and a 60 ms tap
 * is ~0.19 rad of road wheel. THE CONTROL VARIABLE IS PULSE WIDTH.
 *
 * That also sets the danger: at the drive's 12 км/ч cruise, full lock is a 3.8 m
 * turning radius — about 50°/s of yaw. An unbounded proportional law would put
 * the car sideways in a second, which is why `MAX_HOLD_MS` is a third of the
 * distance to full lock and the law carries a damping term.
 */

import { MIN_COMPONENT_PX, chevronAim, classify, labelComponents } from "./perception.mjs";

export { MIN_COMPONENT_PX, chevronAim, classify, createFurnitureRegister, labelComponents } from "./perception.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. THE PIXEL TEST
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Is this pixel the guidance ribbon?
 *
 * `--accent-2` is #17e1c4 = (23, 225, 196), emissive and additively blended
 * over asphalt, so what lands on the glass ranges from a dim teal wash to
 * near-white bloom. The test is written as three RELATIONS rather than a
 * distance to that RGB triple, because a distance threshold either misses the
 * bloom or swallows the sky.
 *
 *   G > 110       it is lit at all (dim wash over dark asphalt still clears it)
 *   G - R > 55    it is not white, not grey, not headlight bloom
 *   B - R > 25    it is on the cyan side of green — grass and foliage fail here
 *   G >= B        IT IS NOT THE INTERFACE. `--accent` #3fa1ff has B 255 > G 161;
 *                 every blue pill, ring, border and the shadow-car's own trail
 *                 fail this clause, and the ribbon passes it (225 >= 196).
 *
 * The last clause is the load-bearing one and it was measured: without it the
 * scan picked up the «ПРОЧЕТИ»/«РАЗБРАХ» pills and the demo car's blue path.
 *
 * ── TWO RELAXATIONS WERE PRICED AGAINST w41 AND BOTH WERE REFUSED ─────────
 *
 * 834 of 4,423 moving samples over w41's 82 `right` legs scan the band and
 * find ZERO pixels here (18.86 %). Two loosenings would each move that, and
 * neither pays for itself. Both are pinned by §1b of
 * `tools/mobile/__tests__/guidance.test.mjs`, with the real RGB triples.
 *
 *   · THE WEATHER-WASHED RIBBON. The spray shader on sc-ac-truck-spray takes
 *     #17e1c4 (g−r 202, b−r 173) down to g−r 22-32 / b−r 9-20 — real ribbon,
 *     on the carriageway, refused. `g − r > 20 && b − r > 10` recovers 11 of
 *     the 174 measurable zeros (→ ~17.66 %) and, on 110 frames that already
 *     held a healthy sighting, admits 2.31x the band mass at the median and
 *     more than DOUBLES it on 80 of the 110. CONFIDENT_BAND_PX is a mass
 *     gate; that trade buys four weather lessons and inflates every drive.
 *
 *   · THE SHADOW CAR'S BLUE PATH. It fails only `g >= b`, on the blended edge
 *     by 4 units. Dropping the clause recovers 8 of the 174 (→ ~18.00 %) and
 *     re-admits the whole interface. It would have to be a SEPARATE channel
 *     with its own shape gate, and whether that line may steer the harness at
 *     all is a product decision — the legend calls it «пътят на колата-сянка»
 *     while this scan follows «маршрутът до целта».
 *
 * AND THE BAND ITSELF WAS EXONERATED, so no geometry change follows either:
 * out-of-band teal on pc is a 1,202 px CONSTANT (82 % of 61 frames within
 * 1150-1250) spread over ~20 unrelated lessons — the advisor pill above the
 * canvas and the legend strip below the cowl. Widening the band imports it.
 * On mobile, 66 % of the measurable zeros hold no teal ANYWHERE on a
 * 2556x1179 canvas: the ribbon is not rendered, which is a product bug and
 * not this file's to fix. Zeros are 33.9 % of moving samples on the 36 legs
 * whose run.log records the car off the carriageway and 6.1 % on the other
 * 46 — the blindness is 5.5x downstream of a steering failure, not upstream.
 */
export function isRibbonPixel(r, g, b) {
  return g > 110 && g - r > 55 && b - r > 25 && g >= b;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. READING A BAND OF PIXELS INTO A PER-ROW CENTROID
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reduce a decoded RGBA/RGB band to one centroid per row.
 *
 * `masks` are rectangles in the band's OWN pixel space that must be ignored —
 * the bounding boxes of every painting HUD element. They are not cosmetic: the
 * survey measured a persistent 2,483-pixel blob at a fixed x that did not move
 * while the car did 59 км/ч, i.e. page furniture being read as world. A
 * controller that steered toward a screen-fixed object would drive in a circle
 * and its tracking record would call the circle competent.
 *
 * `keepMask` ALSO RETURNS THE BITS, and that is the whole of the perception
 * rebuild's cost at this level. Everything `lib/perception.mjs` does — telling
 * a road from a plate, subtracting the screen-fixed furniture, reading the turn
 * chevron's direction instead of weighing it — needs to know WHICH pixels, not
 * how many per row, and the per-row reduction is exactly the step that destroys
 * that. One bit per pixel is 30 KB on the `pc` band and 121 KB on mobile, set
 * in the loop that was already touching every pixel, so it costs a bitwise OR
 * per hit and no extra pass. It is opt-in because a caller that does not ask
 * for shape should not pay for it, and because every existing assertion about
 * this function describes the object it returns today.
 *
 * @param {{data:Buffer|Uint8Array,width:number,height:number,channels:number}} img
 * @param {Array<{x:number,y:number,w:number,h:number}>} masks
 * @param {{keepMask?:boolean}} o
 */
export function scanBand(img, masks = [], { keepMask = false } = {}) {
  const { data, width: W, height: H, channels: C } = img;
  const rows = new Array(H);
  const mask = keepMask ? Buffer.alloc(Math.ceil((W * H) / 8)) : null;
  let total = 0;
  // Row-major mask lookup, built once: for each row, the x-spans to skip.
  const spans = new Array(H);
  for (let y = 0; y < H; y++) spans[y] = null;
  for (const m of masks) {
    const y0 = Math.max(0, Math.floor(m.y));
    const y1 = Math.min(H, Math.ceil(m.y + m.h));
    const x0 = Math.max(0, Math.floor(m.x));
    const x1 = Math.min(W, Math.ceil(m.x + m.w));
    if (x1 <= x0) continue;
    for (let y = y0; y < y1; y++) (spans[y] ??= []).push([x0, x1]);
  }
  for (let y = 0; y < H; y++) {
    let n = 0;
    let sx = 0;
    let minX = W;
    let maxX = -1;
    const sp = spans[y];
    for (let x = 0; x < W; x++) {
      if (sp !== null) {
        let masked = false;
        for (let k = 0; k < sp.length; k++) if (x >= sp[k][0] && x < sp[k][1]) { masked = true; break; }
        if (masked) continue;
      }
      const i = (y * W + x) * C;
      if (!isRibbonPixel(data[i], data[i + 1], data[i + 2])) continue;
      n++;
      sx += x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (mask !== null) {
        const k = y * W + x;
        mask[k >> 3] |= 128 >> (k & 7);
      }
    }
    total += n;
    rows[y] = n ? { y, n, cx: sx / n, minX, maxX } : { y, n: 0, cx: null, minX: null, maxX: null };
  }
  return mask === null ? { rows, total, width: W, height: H } : { rows, total, width: W, height: H, mask };
}

/**
 * The same per-row reduction, over a SUBSET of the pixels — the one the shape
 * pass decided are the road.
 *
 * It exists so `aimFrom` can be reused verbatim on the filtered scan instead of
 * being reimplemented with a filter inside it. Every clause `aimFrom` carries —
 * the per-row floor, the look-ahead window, the whole-band fallback, the
 * refusal that returns `seen:false` rather than 0 — then applies to the road
 * alone with no second copy to keep in step.
 */
export function rowsFromPixels(pixelLists, W, H) {
  const nRow = new Int32Array(H);
  const sRow = new Float64Array(H);
  const minRow = new Int32Array(H).fill(W);
  const maxRow = new Int32Array(H).fill(-1);
  let total = 0;
  for (const px of pixelLists) {
    for (let i = 0; i < px.length; i++) {
      const k = px[i];
      const y = (k / W) | 0;
      const x = k - y * W;
      nRow[y] += 1;
      sRow[y] += x;
      if (x < minRow[y]) minRow[y] = x;
      if (x > maxRow[y]) maxRow[y] = x;
      total += 1;
    }
  }
  const rows = new Array(H);
  for (let y = 0; y < H; y++) {
    rows[y] = nRow[y]
      ? { y, n: nRow[y], cx: sRow[y] / nRow[y], minX: minRow[y], maxX: maxRow[y] }
      : { y, n: 0, cx: null, minX: null, maxX: null };
  }
  return { rows, total, width: W, height: H };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. THE AIM POINT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * How many ribbon pixels a row needs before its centroid is believed. Below
 * this a row is antialiasing, a distant chevron tip, or one stray lit pixel of
 * something else entirely, and its centroid is noise with a plausible value —
 * the shape this programme keeps finding bugs inside.
 */
export const MIN_ROW_PX = 6;
/** A whole scan under this many pixels is not a sighting. */
export const MIN_BAND_PX = 120;
/**
 * …AND SEEING THE LINE IS NOT THE SAME AS SEEING IT WELL ENOUGH TO TURN ON.
 *
 * MEASURED on sc-junction-left, 2026-08-21. An ordinary sample of that drive
 * carried 9,043 – 88,803 ribbon pixels. The two samples that triggered the
 * first sustained turn carried 1,684 and 549 — a sliver, at the moment the
 * route left the forward view — and reported −25.73° and −43.87°. The centroid
 * of a sliver is not an aim point: it is wherever the last surviving fragment
 * happens to be, which on that lane was the objective pillar off to one side.
 * The drive scored 20 penalty points against the 10 it scored without the
 * sustain.
 *
 * So confidence is a SECOND tier, not a stricter first one. A thin sighting is
 * still used — bounded, as a `MAX_HOLD_MS` pulse, which no single frame can
 * turn into a manoeuvre — but it may not lift the cap. `thin` travels into the
 * record so a reader can see how much of a drive ran on fragments.
 *
 * The floor is an order of magnitude below an ordinary sample and three times
 * the worst artifact measured. It is not tuned to make any lesson pass; the
 * junction still fails with it in place.
 *
 * ═══ AND SINCE 2026-09-10 THIS IS THE BINDING CONSTRAINT ON THE LOOP ═══════
 *
 * Written down here, at the constant, because the next person to work on this
 * should start from it and not rediscover it.
 *
 * MEASURED over 1,623 turn-demand samples of w30–w33, by replaying
 * `steerCommand`'s own four conditions and attributing each refusal:
 *
 *     CONFIDENT_BAND_PX alone           499   30.7 %
 *     CONFIDENT + SUSTAIN_CONFIRM       380   23.4 %
 *     SUSTAIN_CONFIRM alone             373   23.0 %
 *     CONFIDENT + already exhausted     211   13.0 %
 *     SUSTAIN_MAX ALONE                  12    0.7 %
 *     the branch actually fired         148    9.1 %
 *     ── confidence, total blocked    1,090   67.2 %
 *
 * AND IT IS STRUCTURALLY ANTI-CORRELATED WITH DEMAND. Median ribbon pixels by
 * |err|, with the fraction clearing this floor: 0–3° 2,598 px / 45 %; 3–6°
 * 3,911 / 55 %; 6–9° 3,626 / 55 %; 9–12° 5,629 / 60 %; 12–15° 9,114 / 67 %;
 * 15–20° 8,619 / 62 %; 20–30° 1,738 / 41 %; 30–45° 404 / 11 %. The gate opens
 * as the error grows to 15° and then slams shut: at a junction-sized demand
 * NINE SIGHTINGS IN TEN ARE REFUSED A MANOEUVRE, because the ribbon swings out
 * of the 75.4° cockpit FOV at exactly the moment the turn starts. THE EVIDENCE
 * REQUIRED TO AUTHORISE THE TURN IS DESTROYED BY THE TURN.
 *
 * The consequence is measurable on the bench, and the figure below is a
 * RE-MEASUREMENT: the line that stood here („1,021 turn-authorised presses
 * under perfect perception and 152 under the measured confidence rate, over
 * 431 lanes") cited a `steer-bench.mjs` that was never committed. The bench
 * exists now. Over 90 lanes of w34–w37, three seeds, `--compare` issues 361
 * turn-authorised presses under perfect sight and 106/122/113 under the
 * measured perception — a THIRD, not a seventh, but the same conclusion in the
 * same direction. The rung is built; this gate is what throttles it.
 *
 * AND THE GATE'S OWN PREMISE DOES NOT SURVIVE THE CORPUS. Joining the recorded
 * `confident` flag to the shadow-trace truth over 462 lanes, the sightings
 * this floor ACCEPTS are less accurate than the ones it refuses: |residual|
 * p50 8.0° / p90 21.9° when confident, 3.0° / 19.1° when thin. Mass is not
 * accuracy. That is the perception rebuild's finding arriving from a
 * completely different direction — out of the recorded corpus rather than out
 * of the pixels — and it is the strongest argument on file that the cure is
 * upstream of this constant.
 *
 * ── WHAT WAS TRIED AND REFUTED, so nobody re-proposes it ───────────────────
 *
 *  · LOWERING THE FLOOR. Refuted by the measurement above the line: 549 px and
 *    1,684 px are the sightings that produced −25.73° and −43.87° on
 *    sc-junction-left, and the centroid of a sliver is wherever the last
 *    surviving fragment happens to be. It is not a weak aim point, it is a
 *    different object.
 *  · LETTING AN ALREADY-ARMED TURN CONTINUE THROUGH A FRAGMENT. Arming would
 *    still have required `confident`; only continuation would have been
 *    allowed, for a bounded number of consecutive thin samples, WITH THE PRESS
 *    SIZED FROM THE LAST CONFIDENT MAGNITUDE so a fragment could fail to
 *    contradict but never revise. It was implemented and measured over 204
 *    lanes at carry lengths 0–4, under both an independent and a sticky (0.7)
 *    confidence model — because thinness is geometric and comes in runs, and
 *    an independent coin per tick hands any carry rule a gap it can always
 *    bridge. IT BOUGHT ALMOST NOTHING: on-line 67 → 68 of 204, median max
 *    cross-track unchanged at 2.81 m, p90 cross-track slightly WORSE (66.6 →
 *    68.8 m), and only 6–16 of ~118 turn presses were carried at all. The
 *    gaps in the confidence signal are longer than a carry can honestly span.
 *    The clause was removed rather than shipped at zero: a constant nothing
 *    reaches is a dead predicate, and this file has already deleted one.
 *
 * WHAT IS NOT YET TRIED, and is where the next round should look: the gate is
 * a statement about WHERE THE CODE REFUSES, not about where the cure goes. The
 * signal itself is the problem — a road CENTRELINE read through a fixed
 * forward FOV — and the honest fixes are upstream of this constant.
 */
export const CONFIDENT_BAND_PX = 3000;

/**
 * Where to aim, in band pixels from the band's centre (negative = LEFT).
 *
 * The look-ahead window is expressed as fractions of band height from the TOP
 * (0 = furthest ahead, 1 = closest to the bumper), because a row of a
 * forward-looking camera over flat ground is a ground distance.
 *
 * RETURNS `seen: false` RATHER THAN 0. A scan that found nothing must never
 * produce a zero error, because zero error is indistinguishable from a car
 * perfectly on the line — the exact silence-reads-as-success conflation that
 * hid the missing steering for 376 drives. The caller is required to branch.
 */
export function aimFrom(scan, { lookLo = 0.18, lookHi = 0.52, minRowPx = MIN_ROW_PX, minBandPx = MIN_BAND_PX, confidentPx = CONFIDENT_BAND_PX } = {}) {
  const { rows, total, height: H, width: W } = scan;
  const half = W / 2;
  const band = (a, b) => {
    let n = 0;
    let s = 0;
    let used = 0;
    for (let y = Math.max(0, Math.floor(a * H)); y < Math.min(H, Math.ceil(b * H)); y++) {
      const r = rows[y];
      if (!r || r.n < minRowPx) continue;
      n += r.n;
      s += r.cx * r.n;
      used++;
    }
    return n ? { px: s / n - half, n, rowsUsed: used } : null;
  };
  const look = band(lookLo, lookHi);
  const near = band(0.66, 1.0);
  const far = band(0.0, 0.34);
  if (total < minBandPx) {
    return { seen: false, confident: false, why: `only ${total} ribbon px in the band (floor ${minBandPx})`, total, aimPx: null, nearPx: null, farPx: null, source: null };
  }
  // The look-ahead window first; the whole band only if that window is empty,
  // and the fallback is NAMED so the record can say which drove.
  const src = look ?? band(0, 1);
  if (!src) {
    return { seen: false, confident: false, why: `${total} ribbon px, but no row cleared ${minRowPx} px`, total, aimPx: null, nearPx: null, farPx: null, source: null };
  }
  return {
    seen: true,
    /** enough of the line is on the glass to command a MANOEUVRE, not just a
     *  bounded nudge — see CONFIDENT_BAND_PX for the measurement. */
    confident: total >= confidentPx,
    why: null,
    total,
    aimPx: src.px,
    aimRows: src.rowsUsed,
    aimN: src.n,
    nearPx: near ? near.px : null,
    farPx: far ? far.px : null,
    source: look ? "lookahead" : "wholeband",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3b. THE SHAPE PASS — WHAT THE TEAL IS, BEFORE ANYTHING WEIGHS IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `aimFrom` above is a MASS instrument: it sums pixels, divides by pixels, and
 * compares the sum to `CONFIDENT_BAND_PX`. Measured over 1,623 turn demands of
 * w30–w33 that gate blocked 67 % of them, and it is ANTI-CORRELATED WITH
 * DEMAND — 45 % of sightings clear it at 0–3° of error, 66 % at 12–15°, and
 * 11 % at 30–45°. The reason is geometric and no threshold can fix it: at a
 * junction the road is edge-on, so the LINE is a handful of pixels, while the
 * guidance layer's own nearby furniture — the turn chevron, the objective
 * pillar, the goal marker — is close, saturated and additively blended, and
 * carries hundreds of pixels per metre of ground. A mass threshold lets the
 * object in and keeps the road out.
 *
 * `readAim` asks the three questions separately instead, using
 * `lib/perception.mjs`:
 *
 *   A. IS IT A LINE OR AN OBJECT — segment the mask into connected components
 *      and classify each by SHAPE. A line 40 m away is thin in pixels and
 *      still reaches across or down the band; a sign post two metres away is
 *      fat and still does not.
 *   B. IS IT THE WORLD AT ALL — teal that occupies the same canvas cell frame
 *      after frame while the car moves is page furniture. Subtracted per lane,
 *      before the gate sees it.
 *   C. WHICH WAY DOES THE PRODUCT SAY TO GO — the turn chevron is an
 *      ARROWHEAD, and the old code folded it into a centroid, which is the one
 *      operation that destroys a direction. Its tip is read instead.
 *
 * ── THE HONESTY CONSTRAINT, WHICH OUTRANKS THE CAPABILITY ──────────────────
 *
 * A harness that steers by reading the answer the product would have given is
 * not a driver. A blind harness produces UNJUDGED rows, which is honest; a
 * self-referential one produces CLOSURES, which is far worse. Both signals
 * here are things `RouteGuidance.tsx` paints on the windscreen FOR A STUDENT TO
 * ACT ON — the ghost ribbon, which the S1 aids caption «Следвай синята линия»,
 * and the turn chevron, „ONE floating arrow before the next junction where the
 * route turns". Neither is a route array, a target coordinate or a verdict.
 * `source` on every sample and `signalMix` on every drive say which of them
 * steered which ticks, so a reader can refuse the drive on the mix alone.
 *
 * ── AND IT STILL REFUSES LOUDLY ────────────────────────────────────────────
 *
 * This loop has shipped a neutralised refusal twice. So: an empty band is
 * `seen: false` exactly as before; a band holding neither a line nor a chevron
 * — only fragments — is `seen: true, confident: false, source: "fragment"`,
 * which is the bounded-nudge path and can never authorise a manoeuvre; and a
 * frame where the line and the chevron POINT DIFFERENT WAYS is demoted to
 * unconfident with `conflict: true`, because two of the product's own signals
 * disagreeing is not evidence, whatever their pixel counts say.
 */

/**
 * Line pixels needed before the road may authorise a manoeuvre.
 *
 * It replaces `CONFIDENT_BAND_PX` on the line path and it is an order of
 * magnitude smaller, which is the point: 3,000 was sized against a total that
 * INCLUDED the chevron, the pillar, the marker and the unmasked HUD, so most of
 * the budget was being met by things that are not the road. Once the road is
 * the only thing counted, the same evidential standard is a much smaller
 * number. Fitted on the recorded corpus by `perception-bench.mjs --sweep`,
 * against both the turn demands it must admit and the false commands it must
 * not produce.
 */
export const CONFIDENT_LINE_PX = 1000;

/**
 * THE SAME RULER ON TWO CAMERAS THAT DIFFER 4.8x IN DENSITY — added 2026-09-13.
 *
 * Both floors above are raw device-pixel counts, and the two legs photograph the
 * same road at very different densities. Measured over all 131 legs of w41:
 *
 *   drivable glass   mobile 2556x393.8 = 1,006,553 px   pc 1166x179.7 = 209,504   4.80x
 *   median sighting  mobile 6,679 (n=1,200)             pc 1,375 (n=1,264)        4.86x
 *
 * So the median pc sighting sits 2.2x UNDER CONFIDENT_BAND_PX while the median
 * mobile sighting sits 2.2x OVER it. Same world, same ribbon, opposite verdicts,
 * decided by the ruler. The gate at :290-300 already records itself blocking
 * 67.2% of turn demands, and the blindness split follows: sc-pk-driveway 11% on
 * mobile against 64% on pc, sc-park-judge 15% vs 62%.
 *
 * The principle is already in this file — :550 scales MIN_COMPONENT_PX by
 * dpr*dpr. The confidence floors were never given it.
 *
 * BAND AREA, NOT dpr². dpr² would say 9x; the bands are 966,168 and 244,860
 * device px, a ratio of 3.95, because pc's CSS band is wider even at dpr 1. The
 * band's own area needs no assumption about how the device got there.
 *
 * MOBILE IS THE REFERENCE AND DOES NOT MOVE. Its floors are the ones fitted on
 * the corpus by perception-bench.mjs --sweep, and it is the leg that behaves.
 * scaleFor() returns exactly 1 on a mobile-sized band, so those numbers are
 * unchanged to the pixel; only pc's come down to the same share of its own band.
 *
 * AND IT RAISES NO REFUSAL. MIN_ROW_PX and MIN_BAND_PX — the floors that decide
 * whether anything was SEEN — are deliberately not scaled here. A loop that sees
 * more because it refuses less is a regression wearing a fix's clothes. This
 * changes only whether a sighting already accepted as real is trusted enough to
 * turn on.
 */
export const REFERENCE_BAND_PX = 2556 * 378;

/**
 * How much of the reference band this one is, clamped so a probe that returns a
 * nonsense geometry cannot silently disable the floors. The upper clamp of 1 is
 * the load-bearing half: a band LARGER than the reference must not RAISE the
 * floor above the value the corpus was fitted against.
 */
export function bandScale(bandW, bandH) {
  const area = Number(bandW) * Number(bandH);
  if (!Number.isFinite(area) || area <= 0) return 1;
  return Math.min(1, Math.max(0.15, area / REFERENCE_BAND_PX));
}

/** The two confidence floors, at this band's density. */
export function confidenceFloors(bandW, bandH) {
  const k = bandScale(bandW, bandH);
  return {
    scale: k,
    confidentBandPx: Math.round(CONFIDENT_BAND_PX * k),
    confidentLinePx: Math.round(CONFIDENT_LINE_PX * k),
  };
}
/** …and the chevron's own floor. Below this the arrowhead is a few pixels at
 *  the far end of the route and its axis is noise with a plausible value.
 *  Measured: 100 px is where the corpus stops changing — 50 and 24 give the
 *  same 285/234 as 100, and 500 and 1000 give back most of the gain. */
export const CONFIDENT_CHEVRON_PX = 100;
/** How much of a component must sit in screen-fixed cells before the whole
 *  component is furniture. Not 100 %: a card border is antialiased and its
 *  outer pixels wander by one. */
export const FURNITURE_COMPONENT_FRAC = 0.7;
/** The chevron's tip must lean this far off its own centroid, in fractions of
 *  the band width, before it is allowed to vote on a direction. Below it the
 *  arrow is pointing near enough along the line of sight that its projected
 *  tip is decided by perspective rather than by the turn. */
export const CHEVRON_MIN_LEAN_FRAC = 0.006;
/** …and its axis must be this horizontal. An arrow pointing away from or
 *  toward the camera projects to a mostly VERTICAL axis, and that is exactly
 *  the case where perspective can make the near wings out-reach the far tip
 *  and invert the reading. Refused rather than guessed. */
export const CHEVRON_MIN_AXIS_X = 0.8;

/**
 * The aim point, read from a scan that kept its mask.
 *
 * Behaves EXACTLY like `aimFrom` when handed a scan without a mask, so a
 * caller that has not opted into `keepMask` is not silently switched onto a
 * different perception.
 *
 * @param {object} scan from `scanBand(img, masks, { keepMask: true })`
 * @param {{register?:object, moving?:boolean, dpr?:number, perception?:object,
 *          lookLo?:number, lookHi?:number, minRowPx?:number, minBandPx?:number,
 *          confidentPx?:number}} o
 *        `register` is a `createFurnitureRegister` for THIS LANE — see B. It is
 *        the caller's book for the same reason `sustainRun` is: this function
 *        is pure and cannot see the previous frame.
 */
export function readAim(scan, o = {}) {
  // THE FLOORS ARE DERIVED FROM THIS SCAN'S OWN BAND, not from a constant fitted
  // on the other device. mobile and pc photograph the same road at 4.8x
  // different density, and a raw pixel count means opposite things on the two —
  // the median pc sighting was 2.2x under a floor the median mobile sighting was
  // 2.2x over. bandScale() returns exactly 1 on a mobile-sized band, so the leg
  // that behaves is unchanged to the pixel.
  //
  // An explicit override still wins: perception-bench.mjs --sweep varies these,
  // and a bench that could not set them could not have fitted them.
  const derived = confidenceFloors(scan.width, scan.height);
  const withFloors = {
    ...o,
    confidentPx: o.confidentPx ?? derived.confidentBandPx,
    perception: {
      ...(o.perception ?? {}),
      confidentLinePx: (o.perception ?? {}).confidentLinePx ?? derived.confidentLinePx,
    },
  };
  const legacy = aimFrom(scan, withFloors);
  if (!scan.mask) return { ...legacy, signal: "mass", shape: null, bandScale: derived.scale };
  const { width: W, height: H } = scan;
  o = withFloors;
  const dpr = o.dpr ?? 1;
  const P = o.perception ?? {};
  // Carried onto the sample so run.log can say WHICH ruler judged it. A
  // confidence verdict whose floor is invisible cannot be re-checked later.
  const bandScaleUsed = confidenceFloors(W, H).scale;
  const comps = labelComponents(scan.mask, W, H, { minPx: Math.round(MIN_COMPONENT_PX * dpr * dpr) });

  /* ── B. THE SCREEN-FIXED FURNITURE, SUBTRACTED ─────────────────────────── */
  const reg = o.register ?? null;
  if (reg) reg.observe(comps, { moving: o.moving !== false });
  let fixedPx = 0;
  const live = [];
  for (const c of comps) {
    if (!reg) {
      live.push(c);
      continue;
    }
    let hit = 0;
    for (let i = 0; i < c.px.length; i++) {
      const k = c.px[i];
      const y = (k / W) | 0;
      if (reg.isFixed(k - y * W, y)) hit++;
    }
    if (hit / c.px.length >= (P.furnitureFrac ?? FURNITURE_COMPONENT_FRAC)) {
      fixedPx += c.n;
      continue;
    }
    live.push(c);
  }

  /* ── A. A LINE IS NOT AN OBJECT ────────────────────────────────────────── */
  const lines = [];
  const objects = [];
  for (const c of live) (classify(c, P) === "line" ? lines : objects).push(c);
  const linePx = lines.reduce((a, c) => a + c.n, 0);
  const objectPx = objects.reduce((a, c) => a + c.n, 0);

  /* ── C. THE CHEVRON, READ RATHER THAN WEIGHED ──────────────────────────── */
  let chev = null;
  for (const c of objects) {
    if (Math.abs(c.axisX) < (P.chevronMinAxisX ?? CHEVRON_MIN_AXIS_X)) continue;
    const r = chevronAim(c, { bandWidth: W, opts: P });
    if (!r.isChevron) continue;
    if (Math.abs(r.lean) < (P.chevronMinLeanFrac ?? CHEVRON_MIN_LEAN_FRAC) * W) continue;
    if (chev === null || c.n > chev.comp.n) chev = { comp: c, ...r };
  }

  const shape = {
    components: comps.length,
    lines: lines.length,
    objects: objects.length,
    linePx,
    objectPx,
    fixedPx,
    furnitureFrames: reg ? reg.frames() : 0,
    chevronPx: chev ? chev.comp.n : 0,
  };

  /* ── AND THE DECISION, IN ONE PLACE, WITH ITS REASON ─────────────────────
   *
   * THE ARROW OUTRANKS THE RIBBON WHENEVER THE ARROW IS THERE, and that order
   * was measured rather than assumed. Four arbitrations were replayed over
   * 4,870 recorded frames against the shadow-trace truth (turn demands ≥15°,
   * confidently authorised / of those agreeing with the correct drive):
   *
   *     the mass gate today                  254 / 188
   *     the line only                        263 / 193
   *     the line, with the arrow as a VETO   226 / 176
   *     the line, the arrow only in the gaps 274 / 203
   *     THE ARROW FIRST                      285 / 235
   *
   * It is also the honest order. `RouteGuidance.tsx` shows this arrow only
   * „before the next junction where the route turns"; away from a junction
   * there is nothing to outrank. Where it IS on the glass it is the product
   * telling the student, in one glyph, which way to go, and the ribbon at that
   * same moment is the thing that has swung out of a 75.4° field of view.
   *
   * THE AIM POINT IS THE PLATE, NOT THE TIP, and that too is measured: the
   * plate stands ON the carriageway at the junction, so it is a place to drive
   * to, while the tip is a projected direction on a camera whose pitch the
   * product does not publish. Centroid against tip, same gates: 235 vs 233
   * correct on the failing lessons, and 18 vs 23 wrong on the shipping regime.
   * The ORIENTATION is what earns the plate the right to be an aim point at
   * all — dropping the arrowhead test and accepting any glowing plate reads
   * 252 correct on the failing lessons but takes the shipping regime's
   * wrong-way commands from 18 to 30. Reading the arrow is what keeps this
   * from being "steer at the nearest bright thing". */
  if (legacy.seen === false) return { ...legacy, signal: "none", shape };

  const lineAim = lines.length ? aimFrom(rowsFromPixels(lines.map((c) => c.px), W, H), o) : null;

  if (chev) {
    const confident = chev.comp.n >= (P.confidentChevronPx ?? CONFIDENT_CHEVRON_PX);
    // Recorded even though the arrow wins: a reader has to be able to see that
    // the two signals disagreed on this tick, and a run of disagreements is a
    // finding about the guidance layer whichever of them turns out to be right.
    const conflict = Boolean(lineAim && lineAim.seen && chev.dirSign !== 0 && Math.abs(lineAim.aimPx) > 4 && Math.sign(lineAim.aimPx) !== chev.dirSign);
    return {
      seen: true,
      confident,
      conflict,
      why: confident ? null : `the turn chevron is only ${chev.comp.n} px (floor ${P.confidentChevronPx ?? CONFIDENT_CHEVRON_PX})`,
      total: legacy.total,
      aimPx: chev.comp.cx - W / 2,
      aimRows: chev.comp.rows,
      aimN: chev.comp.n,
      nearPx: legacy.nearPx,
      farPx: legacy.farPx,
      source: "chevron",
      signal: "chevron",
      chevron: {
        lean: Number(chev.lean.toFixed(1)),
        dirSign: chev.dirSign,
        tipPx: Number((chev.aimPx).toFixed(1)),
        reachRatio: Number(chev.reachRatio.toFixed(2)),
        why: chev.why,
      },
      shape,
    };
  }

  if (lineAim && lineAim.seen) {
    const confident = linePx >= (P.confidentLinePx ?? CONFIDENT_LINE_PX);
    return {
      ...lineAim,
      total: legacy.total,
      confident,
      conflict: false,
      signal: "line",
      shape,
      why: confident ? null : `only ${linePx} px of road on the glass (floor ${P.confidentLinePx ?? CONFIDENT_LINE_PX})`,
    };
  }

  /* NEITHER. The band holds teal and none of it is a road or an arrow —
   * fragments, a marker, a distant pillar. It is still USED, bounded, exactly
   * as a thin sighting has always been, and it may NEVER authorise a
   * manoeuvre. This is the branch that keeps the refusal loud. */
  return {
    ...legacy,
    confident: false,
    conflict: false,
    signal: "fragment",
    source: "fragment",
    shape,
    why: `${legacy.total} teal px in the band and none of it is a road or an arrow (${lines.length} line / ${objects.length} object components, ${fixedPx} px screen-fixed)`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. PIXELS TO DEGREES
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The cockpit's horizontal field of view, radians — `vehicle/tuning.ts`
 * `COCKPIT_HFOV_RAD`, held constant across window shapes. Duplicated here
 * because the harness may not import from the product; `degPerPxAtCentre`
 * is the same arithmetic the round-3 steering proof uses, and that probe's
 * agreement with `COCKPIT_LOOK_INTO_TURN` to a quarter of a degree is the
 * evidence that the chain is right.
 */
export const COCKPIT_HFOV_DEG = 75.4;

/**
 * Degrees per device pixel AT THE CENTRE of the image.
 *
 * STATED AS AN APPROXIMATION ON PURPOSE: a pinhole projection is not a linear
 * ruler, so this UNDERSTATES angles away from the centre. It is used for
 * reporting and for the deadband, both of which are near the centre by
 * construction, and never for a claim that needs the tails.
 */
export function degPerPxAtCentre(canvasDevicePxWide, hfovDeg = COCKPIT_HFOV_DEG) {
  return ((2 * Math.tan((hfovDeg * Math.PI) / 360)) / canvasDevicePxWide) * (180 / Math.PI);
}

/**
 * THE BIAS THIS DOES NOT CORRECT, STATED SO NOBODY HAS TO REDISCOVER IT.
 *
 * `COCKPIT_EYE` is (0.24, 0.71, −0.255): the eye sits 0.24 m to the car's LEFT,
 * because the car is left-hand drive. A point on the car's own centreline
 * therefore appears 0.24 m to the RIGHT of the image centre, and a car
 * perfectly on the ribbon reads a small positive error.
 *
 * The magnitude, at the look-ahead distances this loop uses: atan(0.24 / 10 m)
 * = 1.4°, atan(0.24 / 20 m) = 0.7°. Both are INSIDE `DEAD_DEG`, which is why
 * the law does not correct for it — correcting would mean inferring ground
 * distance from a row index, which needs the camera pitch, which is not
 * published. It is named here and in the record instead of being silently
 * absorbed into a constant.
 */
export const EYE_OFFSET_M = 0.24;

/* ═══════════════════════════════════════════════════════════════════════════
 * 4b. THE ACTUATOR, SOLVED — WHAT A PULSE OF LENGTH h IS WORTH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE 52 m FIGURE IN THE HEADER WAS WRONG IN BOTH DIRECTIONS ────────────
 *
 * The old SUSTAIN note computed „~9 % duty × full lock 0.6 rad = 0.05 rad mean
 * = a turning radius near 52 m". It multiplied the duty cycle by FULL LOCK,
 * and a 65 ms pulse never reaches full lock: 0.6 rad at STEER_SPEED 3.2 rad/s
 * is 188 ms away, so 65 ms peaks at 0.208 rad and STEER_RETURN_SPEED 4.8 rad/s
 * erases it before the next sample. It also assumed a ~700 ms cadence; the
 * corpus median over 20,592 samples of w30–w33 is 518 ms.
 *
 * Corrected — and cross-checked against a headless run of the real
 * VehicleSim + Rapier, which read 0.0240 rad and R ≈ 106 m for the same pulse:
 *
 *     THE TWO RUNGS THE OLD LADDER COULD REACH — at the MEASURED 1,021 ms
 *     period between steering samples, NOT the `dtMs` field, which is a
 *     different and much smaller number (see `TUNE.TICK_MS_ASSUMED`)
 *       a 65 ms pulse (MAX_HOLD_MS)          mean ≈ 0.011 rad         R ≈ 232 m
 *       the wheel left down across the scan  mean ≈ 0.55–0.57 rad     R ≈ 4.2 m
 *
 *     WHAT THE CORPUS'S OWN SHADOW LINES DEMAND, solved from their geometry
 *       sc-junction-gap / -stop            R = 18.1 m
 *       sc-junction-left / -rhr / sc-rb-*  R = 17.0 m
 *       sc-turn-left-oncoming              R = 14.2 m
 *       sc-merge-from-property             R = 10.0 m
 *       sc-ov-oneway / sc-rb-lane-choice   R =  9.5 m   ← the tightest
 *
 * EVERY JUNCTION IN THE CORPUS LIVES IN THE GAP BETWEEN THE TWO RUNGS. That is
 * the defect: not that the wheel was too weak, and not that `SUSTAIN_MAX`
 * retired it — measured, `SUSTAIN_MAX` was the sole binding gate on 12 of 1,623
 * turn demands (0.7 %) — but that the ladder had a 55× step in it with nothing
 * on the step. At the measured period the presses those radii need are 270 ms
 * (for 18.1 m) to 479 ms (for 9.5 m), and `MAX_HOLD_MS` forbids the shortest
 * of them by a factor of four.
 *
 * A drive answered a junction either with 232 m of near-straight line or with
 * a 4 m hard-over, and route-fidelity scores both the same way: 0 of 101
 * sustain-fired lanes was on-line, and the ones that did fire turned TIGHTER
 * than the correct line (achieved/required radius median 0.79, p10 0.43).
 *
 * ── SO THE RUNG IS BUILT, AND IT IS BUILT BY SOLVING, NOT BY TASTE ────────
 *
 * The wheel is a rate-limited integrator (`VehicleSim.ts:380-388`): it winds
 * out at STEER_SPEED, saturates at maxSteer, and returns at
 * STEER_RETURN_SPEED. So a press of h ms inside a tick of T ms puts a known
 * AREA under the road-wheel-angle curve, and the mean angle over the tick —
 * which is what bends the path — is that area over T. `meanAngleForHold`
 * computes it; `holdMsForHold`'s inverse, `holdMsForMeanAngle`, is what the
 * control law actually calls. Both are closed-form and both are checked
 * against a step-wise integration of the same rate limiter in
 * `steer-bench.mjs` (which never imports them), because a closed form that
 * agrees with nothing is a number with a derivation attached.
 */

/** Product constants, duplicated because the harness may not import the app.
 *  `platform/src/modules/sim/vehicle/tuning.ts` is the source; the bench
 *  asserts these still match it (`steer-bench.mjs --self-check`). */
export const VEHICLE = Object.freeze({
  /** WHEEL_POSITIONS z: 1.28 − (−1.28). */
  WHEELBASE_M: 2.56,
  /** STEER_MAX_ANGLE, available at or below `FULL_LOCK_KMH`. */
  MAX_ANGLE_RAD: 0.6,
  /** STEER_MIN_ANGLE — all that is left at or above `MIN_LOCK_KMH`. */
  MIN_ANGLE_RAD: 0.14,
  /** STEER_FULL_SPEED_KMH — at or below this the whole 0.6 rad is available. */
  FULL_LOCK_KMH: 15,
  /** STEER_MIN_SPEED_KMH — at or above this only `MIN_ANGLE_RAD` is. */
  MIN_LOCK_KMH: 110,
  /** STEER_SPEED — toward the target. */
  STEER_SPEED: 3.2,
  /** STEER_RETURN_SPEED — back to centre, quicker, like a caster. */
  RETURN_SPEED: 4.8,
});

/**
 * THE LOCK THAT IS ACTUALLY AVAILABLE AT THIS SPEED — AND THE FIRST OF TWO
 * THINGS THE RECOVERED LADDER GOT WRONG BY TREATING THE CAR AS A CONSTANT.
 *
 * `VehicleSim.update` does not offer 0.6 rad at every speed. It lerps the
 * limit from `STEER_MAX_ANGLE` at `STEER_FULL_SPEED_KMH` down to
 * `STEER_MIN_ANGLE` at `STEER_MIN_SPEED_KMH` (`VehicleSim.ts:389-392`), and
 * the ladder's plateau term assumed the wheel could sit at 0.6 rad whatever
 * the dial said. The plateau is where a turn press spends most of its length,
 * so the error is not a rounding one.
 *
 * MEASURED against the product's own physics — the real `VehicleSim` on a real
 * Rapier world, headless in Node, no browser (`steer-bench.mjs --actuator`).
 * Mean road-wheel angle over a 1,021 ms tick, closed form against the rig:
 *
 *     press   speed   rig      closed form @0.6   closed form @lock(v)
 *     300 ms  10 км/ч 0.1587   0.1579  (−0.5 %)   0.1579  (−0.5 %)
 *     300 ms  22 км/ч 0.1523   0.1579  (+3.7 %)   0.1506  (−1.1 %)
 *     300 ms  30 км/ч 0.1433   0.1579  (+10.2 %)  0.1417  (−1.1 %)
 *     300 ms  44 км/ч 0.1259   0.1579  (+25.4 %)  0.1249  (−0.8 %)
 *
 * Below `FULL_LOCK_KMH` the two are the same number and this function changes
 * nothing, which is where 88 % of the corpus's turn demands live — so this is
 * a GUARD, not the fix. It is here because the 6 % of demands above 20 км/ч
 * are the ones on the fast approaches, and a ladder that silently over-reads
 * its own top rung by a quarter has no way to notice.
 */
export function maxSteerAtKmh(kmh, v = VEHICLE) {
  const f = Math.min(1, Math.max(0, (Math.abs(kmh ?? 0) - v.FULL_LOCK_KMH) / (v.MIN_LOCK_KMH - v.FULL_LOCK_KMH)));
  return v.MAX_ANGLE_RAD + (v.MIN_ANGLE_RAD - v.MAX_ANGLE_RAD) * f;
}

/** The vehicle constants with the lock this speed actually has. Hand this to
 *  `meanAngleForHold` / `holdMsForMeanAngle` instead of the bare `VEHICLE`. */
export function vehicleAtKmh(kmh, v = VEHICLE) {
  return { ...v, MAX_ANGLE_RAD: maxSteerAtKmh(kmh, v) };
}

/**
 * THE YAW GAIN — HOW MUCH OF THE KINEMATIC TURN THE CAR ACTUALLY MAKES, AND
 * THE SECOND THING THE RECOVERED LADDER GOT WRONG.
 *
 * `radiusForMeanAngle` is the kinematic bicycle: `R = L / tan δ`, no tyres in
 * it. The product is a raycast vehicle with a slip-limited tyre model, and
 * above about 15 км/ч it does not achieve the kinematic yaw rate — it
 * understeers, by a factor that reaches 2.7× before 45 км/ч. A ladder that
 * converts „I want R = 9 m" into a press through the kinematic identity
 * therefore commands a turn the car will not make and has no way to know.
 *
 * MEASURED TWO INDEPENDENT WAYS, and they agree.
 *
 *  1. THE PRODUCT'S OWN PHYSICS, headless (`steer-bench.mjs --yaw-gain`):
 *     33 runs, three press lengths (200/300/450 ms) at eleven speeds, four
 *     ticks each, achieved radius (arc / Δyaw) over kinematic radius computed
 *     from the rig's OWN mean `steerRad`, so the speed-sensitive lock above is
 *     already divided out and what is left is slip alone. The gain is flat in
 *     press length (the three columns agree within 5 %) and a clean monotone
 *     function of speed — which is why this is a table in one variable.
 *
 *  2. THE RECORDED CORPUS, 462 lanes of w34–w37. Regressing the chassis-probe
 *     heading change against the heading change the recorded commands should
 *     have produced gives a slope of 0.57–0.60 over the corpus's whole speed
 *     mix (r = 0.71, sign agreement 86 %, 94 % on the large turns) — squarely
 *     inside the table below once weighted by where those commands happened.
 *     The two methods share no code and no artefact.
 *
 * AND THEN THE MEASUREMENT SAID THIS IS A GUARD AND NOT THE FIX, which is the
 * reason it is documented at this length instead of celebrated. The corpus's
 * turn demands (|errDeg| ≥ 15°) sit at a median of 10 км/ч, and on the 14
 * named failing lessons 94 % of them are under 20 км/ч, where the gain is
 * 0.97–1.03. Demand-weighted over those lessons it is 0.926: a press sized for
 * R = 9 m really drives R = 9.7 m. The correction is worth ~7 % where the work
 * is, and 2–3× on the 6 % of demands taken fast.
 *
 * Values are `kinematicRadius / achievedRadius`, i.e. MULTIPLY the demanded
 * curvature by this to get the curvature to command. Interpolated linearly;
 * clamped to the end values outside the measured range, because an
 * extrapolated tyre model is a guess and this one says so.
 */
export const YAW_GAIN_TABLE = Object.freeze([
  [0, 1.02], [5, 1.02], [8, 1.02], [10, 1.03], [12, 1.03], [15, 0.97],
  [18, 0.88], [22, 0.75], [26, 0.65], [30, 0.56], [36, 0.47], [45, 0.38],
]);

/** Linear interpolation into `YAW_GAIN_TABLE`, clamped at both ends. */
export function yawGainAtKmh(kmh) {
  const v = Math.abs(kmh ?? 0);
  const t = YAW_GAIN_TABLE;
  if (v <= t[0][0]) return t[0][1];
  if (v >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 1; i < t.length; i++) {
    if (v <= t[i][0]) {
      const [x0, y0] = t[i - 1];
      const [x1, y1] = t[i];
      return y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

/** Milliseconds for the wheel to fall from full lock to centre once released.
 *  A hold longer than `dtMs − this` is still winding down when the next scan
 *  starts, i.e. a car turning with nothing watching. It is the reason the
 *  turn hold has a bound that follows the box's tick and not only a constant. */
export const FULL_RETURN_MS = (VEHICLE.MAX_ANGLE_RAD / VEHICLE.RETURN_SPEED) * 1000;

/**
 * Mean road-wheel angle (rad) over one tick of `dtMs`, for a press of
 * `holdMs` starting at centre and released.
 *
 * Three pieces: the ramp out (area = peak²/2·ss), the plateau if the press
 * outlasts full lock, and the return (area = peak²/2·rs). The return is
 * TRUNCATED at the tick boundary rather than allowed to spill, because area
 * after the tick belongs to the next tick's mean, not to this one.
 */
export function meanAngleForHold(holdMs, dtMs, v = VEHICLE) {
  const T = Math.max(1e-6, dtMs / 1000);
  const h = Math.max(0, Math.min(holdMs / 1000, T));
  const rampT = v.MAX_ANGLE_RAD / v.STEER_SPEED;
  const peak = h <= rampT ? v.STEER_SPEED * h : v.MAX_ANGLE_RAD;
  const areaUp = (peak * peak) / (2 * v.STEER_SPEED);
  const plateau = h <= rampT ? 0 : v.MAX_ANGLE_RAD * (h - rampT);
  const returnT = peak / v.RETURN_SPEED;
  const tail = Math.min(returnT, Math.max(0, T - h));
  // Area of the return ramp over `tail` seconds: peak·tail − rs·tail²/2.
  const areaDown = peak * tail - (v.RETURN_SPEED * tail * tail) / 2;
  return (areaUp + plateau + areaDown) / T;
}

/**
 * The inverse: the shortest press that delivers `meanRad` over a `dtMs` tick.
 *
 * IT CAN RETURN A PRESS LONGER THAN THE TICK, and that is deliberate — the
 * doc-comment here used to claim it „returns `Infinity` when the tick is too
 * short", which it never did. Returning the honest over-length number is what
 * lets the caller CLAMP AND SAY IT CLAMPED (`cappedBy`); an `Infinity` would
 * have collapsed „needs 40 ms more than the tick" and „needs four seconds"
 * into the same refusal.
 *
 * IT IS AN EXACT INVERSE OF `meanAngleForHold` ONLY WHERE THE RETURN RAMP FITS
 * INSIDE THE TICK, because that function truncates the tail at the tick
 * boundary and this one does not model the truncation. The caller's
 * `dtMs − FULL_RETURN_MS` bound is what guarantees it: at full lock the return
 * takes exactly `FULL_RETURN_MS`, and below full lock it takes less, so a
 * press inside that bound always has room to come back. Outside it the two
 * disagree, which is one more reason the bound is not optional.
 */
export function holdMsForMeanAngle(meanRad, dtMs, v = VEHICLE) {
  if (!(meanRad > 0)) return 0;
  const T = Math.max(1e-6, dtMs / 1000);
  const need = meanRad * T;
  const rampOnly = 1 / (2 * v.STEER_SPEED) + 1 / (2 * v.RETURN_SPEED);
  const maxRampArea = v.MAX_ANGLE_RAD * v.MAX_ANGLE_RAD * rampOnly;
  if (need <= maxRampArea) {
    const peak = Math.sqrt(need / rampOnly);
    return (peak / v.STEER_SPEED) * 1000;
  }
  const rampT = v.MAX_ANGLE_RAD / v.STEER_SPEED;
  const h = rampT + (need - maxRampArea) / v.MAX_ANGLE_RAD;
  return h * 1000;
}

/** Turning radius (m) for a mean road-wheel angle, kinematic bicycle. This is
 *  a statement about geometry and NOT about this car — see `yawGainAtKmh`,
 *  and prefer `realRadiusForMeanAngle` anywhere a reader will take the number
 *  for what the car did. */
export function radiusForMeanAngle(meanRad, v = VEHICLE) {
  const t = Math.tan(Math.abs(meanRad));
  return t <= 1e-9 ? Infinity : v.WHEELBASE_M / t;
}

/** …and the radius the car ACTUALLY drives at that angle and that speed. */
export function realRadiusForMeanAngle(meanRad, kmh, v = VEHICLE) {
  return radiusForMeanAngle(meanRad, v) / yawGainAtKmh(kmh);
}

/** The mean road-wheel angle that makes the car drive a REAL radius of
 *  `radiusM` at `kmh`, inverting both the kinematic identity and the slip. */
export function meanAngleForRealRadius(radiusM, kmh, v = VEHICLE) {
  return Math.atan(v.WHEELBASE_M / Math.max(0.1, radiusM * yawGainAtKmh(kmh)));
}

/**
 * PURE PURSUIT — the demanded MEAN road-wheel angle for a bearing error.
 *
 * The header already argues for a look-ahead aim point on three independent
 * grounds; this is the law that goes with it, and it is the standard one:
 * a circle through the car that passes through a point `Ld` metres ahead has
 * radius `Ld / (2 sin α)`, so `δ = atan(L / R) = atan(2 L sin α / Ld)`.
 *
 * WHY THIS AND NOT THE OLD `KP_MS_PER_DEG` RAMP. The old law was linear in
 * MILLISECONDS OF PRESS, and milliseconds of press are not linear in angle
 * (the ramp is quadratic until full lock, then linear). Its stated 3.0°
 * deadband was therefore a fiction: with `KP 7 ms/°` and a `MIN_HOLD_MS 45`
 * floor, the first millisecond of wheel arrived at 3 + 45/7 = 9.43° and
 * MAX_HOLD_MS saturated at 12.29° — 2.86° of proportional authority in the
 * whole law, and 2,538 of 5,746 past-deadband samples (44 %) got no wheel at
 * all, median refused error 5.96°. This law is monotone in angle from the
 * deadband to the cap and its deadband is the one it prints.
 *
 * `LOOKAHEAD_M` is the one fitted number in this file and it is fitted on the
 * corpus, in the open: `steer-bench.mjs --sweep-lookahead` runs every lane at
 * 8/10/12/15/20/25 m and prints the route-fidelity of each. It is not derivable
 * from the band geometry, because that needs the camera pitch and the product
 * does not publish it (see `degPerPxAtCentre`).
 */
export function pursuitMeanAngle(errDeg, { lookaheadM, maxMeanRad, wheelbaseM = VEHICLE.WHEELBASE_M, yawGain = 1 } = {}) {
  const a = (Math.abs(errDeg) * Math.PI) / 180;
  /* `yawGain` turns the pursuit circle's KINEMATIC angle into the angle that
   * makes THIS car drive that circle — see `yawGainAtKmh`. To achieve a real
   * radius R the wheel has to be set for a kinematic R·gain, and since pure
   * pursuit's radius is `Ld / (2 sin α)`, scaling the radius by the gain is
   * exactly scaling `Ld` by it — which is why the correction lands inside this
   * one atan and not in a second multiplication downstream. It defaults to 1
   * so the textbook geometry stays readable on its own, and the control law
   * passes the measured value. */
  const demanded = Math.atan((2 * wheelbaseM * Math.sin(a)) / (lookaheadM * yawGain));
  return Math.min(demanded, maxMeanRad);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. THE CONTROL LAW
 * ═══════════════════════════════════════════════════════════════════════════ */

export const TUNE = {
  /** No command inside this. Wider than the eye-offset bias (≤1.4°) on purpose. */
  DEAD_DEG: 3.0,
  /** Pulse milliseconds per degree of error past the deadband. */
  KP_MS_PER_DEG: 7,
  /** Damping, milliseconds per degree of error CHANGE between samples. */
  KD_MS_PER_DEG: 4,
  /**
   * A press shorter than this is not worth issuing: two CDP round trips for a
   * wheel deflection under 0.1 rad that the return spring erases before the
   * next sample. Counted as `tooSmall` rather than sent.
   */
  MIN_HOLD_MS: 45,
  /**
   * A THIRD OF THE WAY TO FULL LOCK, AND THAT IS THE SAFETY ARGUMENT. Full
   * lock is 188 ms of hold (0.6 rad at 3.2 rad/s) and gives a 3.8 m turning
   * radius at the 12 км/ч cruise. Capping the hold at 65 ms bounds one
   * correction to ~0.21 rad of road wheel, so no single sample — including one
   * taken from a misread frame — can put the car sideways.
   */
  MAX_HOLD_MS: 65,
  /**
   * THE TICK THE LAW SIZES ITSELF AGAINST WHEN THE CALLER DOES NOT SAY — AND
   * IT IS NOT `dtMs`. THIS IS THE CONSTRAINT THAT WAS BINDING.
   *
   * Every duty-cycle figure ever computed in this programme — this file's old
   * „~700 ms", the 518 ms median that replaced it, both handed-in
   * measurements — used `guidance.samples[].dtMs`. THAT FIELD IS NOT THE
   * PERIOD BETWEEN TWO STEERING SAMPLES. `lesson-audit.mjs` computes it as
   * `now - lastTickAt` with `lastTickAt` assigned at the END of the previous
   * tick body, so the current tick's OWN work — the mask read, the screenshot,
   * the pixel scan, the press itself — is charged to no interval at all. The
   * file already says this about the odometer („THE ODOMETER GETS ITS OWN
   * CLOCK") and nobody carried it across to the control law.
   *
   * MEASURED THREE WAYS ON w33, and they agree:
   *
   *   1. `tSec` deltas between consecutive samples inside a roll phase, over
   *      65 lanes and 4,423 gaps: 879 of 0 s, 2,763 of 1 s, 590 of 2 s, 191 of
   *      3 s — a mean of 1,021 ms. `tSec` is wall clock from `t0`, so this is
   *      independent of `dtMs` entirely.
   *   2. `dtMs + scanMs`, the field plus the cost it excludes: 546 + 533 =
   *      1,079 ms median.
   *   3. THE ODOMETER. Integrating the dial against `dtMs` gives 0.49 of the
   *      witness's own path length across 67 lanes; against `dtMs + scanMs` it
   *      gives 0.84, and the witness path is a CHORD SUM over ~1 Hz poses, so
   *      it under-reads a curve by exactly about that much.
   *
   * WHAT IT COSTS. At the true period a 65 ms pulse is 6.4 % duty, not 12.5 %:
   * mean road-wheel angle 0.011 rad and a turning radius of 232 m — not the
   * 52 m the old comment claimed, and not the 92–118 m the corrected 518 ms
   * arithmetic claimed either. THE LADDER'S STEP IS 232 m TO 4.2 m, 55×, and
   * every junction in the corpus (18.1 m down to 9.5 m) lives inside it. It
   * also means a law that sizes a press against `dtMs` delivers 55 % of the
   * bend it asked for and has no way to notice.
   *
   * So the caller passes the REAL period, measured wall-clock at the top of
   * consecutive `guideTick` calls, and this constant is only the fallback.
   */
  TICK_MS_ASSUMED: 1021,
  /**
   * Below this the wheel moves the CAMERA and not the car — CORRECTED 2026-09-10.
   *
   * The old value was 2 and the reason given was `CameraRig`'s
   * `steerNorm * COCKPIT_LOOK_INTO_TURN`. HALF OF THAT IS TRUE and the half
   * that is not was costing the loop its evidence. Measured on a headless run
   * of the real VehicleSim + Rapier:
   *
   *   · at 0 км/ч the road wheels reach 0.600 rad — FULL LOCK, the same as at
   *     14 км/ч — and the heading moves 0.000° over 2 s. Nothing anywhere in
   *     `platform/src` gates steering on speed; what is absent at a standstill
   *     is YAW, because a stationary raycast vehicle makes no lateral tyre
   *     force. That is correct physics, and a command there really would be
   *     recorded as steering while changing nothing.
   *   · but the band 0–2 км/ч is NOT that. At a mean 1.02 км/ч, wheel held,
   *     the car turns on a 4.95 m forward radius and 4.91 m in reverse, and
   *     sweeping the threshold gives 4.16 m at 1.0 км/ч against 4.19 m at
   *     2.1 км/ч — FLAT ACROSS THE OLD THRESHOLD. It refused a band in which
   *     steering works perfectly.
   *
   * RE-MEASURED INDEPENDENTLY, because this was one of the changes recovered
   * from a stash and „it improves the probe regime and regresses the shipping
   * one" is not a reason to take a physics claim on trust. Same rig, own run:
   * at a standstill the wheel reaches 0.600 rad and the heading moves −0.000°
   * over two seconds; the achieved radius with the wheel held reads 4.28 m at
   * 0.8 км/ч, 4.30 m at 1.0, 4.31 m at 1.5, 4.32 m at 2.1 and 4.33 m at 3.0.
   * Flat across the old threshold to within 1 %, and inert at zero. Both
   * halves of the original claim reproduce.
   *
   * The dial rounds `Math.abs(v)`, so a displayed 1 is 0.5–1.49 км/ч (moving,
   * always) and a displayed 0 may be a standstill (where the measurement above
   * says a command is inert). 1 is therefore the lowest honest floor, and
   * `commandsBelow2Kmh` publishes how much of a drive came from the band this
   * change admitted, so nobody has to take the gain on trust.
   */
  MIN_KMH: 1,
  /**
   * …AND WHAT COUNTS AS A MOVING SAMPLE FOR THE RECORD IS A SEPARATE NUMBER.
   *
   * `summariseTracking` divides by „moving samples", and every `seenFrac`,
   * `blindMs` and verdict ever published used 2 км/ч. Reusing MIN_KMH here
   * would have moved every historical rate the moment the control-law floor
   * moved — a harness change wearing the costume of a product change, which is
   * the failure this programme has already paid for (memory: „a harness change
   * is not a repair"). The analysis threshold stays where it was.
   */
  MOVING_KMH: 2,

  /* ── THE SUSTAINED TURN, AND THE EVIDENCE IT IS GATED ON ─────────────────
   *
   * MEASURED ON sc-junction-left, 2026-08-21, dev server 4611160afb1e. The
   * loop SAW the turn and could not answer it:
   *
   *     t43s   5 км/ч  err −12.75°   → left  65 ms
   *     t45s  15 км/ч  err −22.01°   → left  65 ms
   *     t50s   5 км/ч  err −23.16°   → left  65 ms
   *     t51s  16 км/ч  ribbon 0 px   → (the line is gone; the car is past it)
   *
   * and the drive finished НЕИЗДЪРЖАН with «Завий наляво и излез от
   * кръстовището на запад» uncredited and a collision. The witness put the
   * whole 77.7 m at a straightness of 0.998 — a straight line through a
   * junction the lesson asks to turn at.
   *
   * THE ARITHMETIC OF WHY — REPLACED 2026-09-10, BECAUSE IT WAS WRONG.
   *
   * It used to read: „A 65 ms pulse on a ~700 ms cadence is ~9 % duty … an
   * average road-wheel angle of ~0.05 rad and a turning radius near 52 m."
   * Duty × FULL LOCK is not what a 65 ms pulse delivers — see section 4b — and
   * the cadence is 518 ms, not 700. The corrected rung is ~0.024 rad and
   * R ≈ 92–118 m (a headless VehicleSim replay read 0.0240 rad, R = 106 m).
   * The conclusion survives the correction and gets worse: the wheel was not
   * bounded away from the manoeuvre by a factor of five, it was bounded away
   * by a factor of TEN.
   *
   * AND THE CURE THE FIRST DRAFT REACHED FOR WAS THE WRONG ONE. „Leave the key
   * down across the scan" jumps from 92 m to 4.0 m — past every radius the
   * corpus demands (18.1 m down to 9.5 m), which is why the drives that DID
   * sustain turned too tight: achieved/required radius median 0.79, p10 0.43,
   * and 0 of 101 sustain-fired lanes finished on-line. The ladder had two
   * rungs and every junction was in the gap.
   *
   * CONFIRMED INDEPENDENTLY on the product's own physics
   * (`steer-bench.mjs --actuator`): at 9.8 км/ч a 1,021 ms tick with the key
   * held down reads a mean road-wheel angle of 0.5128 rad and an ACHIEVED
   * radius of 5.0 m, against 242.9 m for a 65 ms pulse in the same tick. The
   * 4.2 m in the old note was the kinematic figure; the car's own is 5.0 m,
   * and the 48× step between the two rungs is the defect either way.
   *
   * SO THE CAP DOES NOT „LIFT" ANY MORE — IT MOVES TO A SECOND, DERIVED CAP,
   * AND THE WHEEL IS ALWAYS RELEASED INSIDE THE TICK. On confirmed evidence
   * the press is sized by pure pursuit (`pursuitMeanAngle`) and converted to
   * milliseconds by the actuator solution (`holdMsForMeanAngle`), then bounded
   * three ways:
   *
   *   · by `TURN_RADIUS_MIN_M` — the tightest radius any shadow line in the
   *     corpus demands, with margin. A demand tighter than this is not a
   *     junction, it is a misread.
   *   · by `dtMs − FULL_RETURN_MS` — so the wheel is back at centre BEFORE the
   *     next scan, on every box, always. This is strictly stronger than what
   *     it replaces: the old sustained branch was the one path in this loop
   *     that deliberately left a key down with nothing watching, and
   *     `guideLeaveRoll` exists only to clean up after it.
   *   · by `TURN_HOLD_MAX_MS` — a hard ceiling, so a corrupt `dtMs` cannot
   *     turn into a two-second key-down.
   *
   * THE SAFETY ARGUMENT IS UNCHANGED AND IS NOW CHEAPER TO MAKE. `MAX_HOLD_MS`
   * still bounds every UNCONFIRMED command, so one misread frame still cannot
   * put the car sideways; the second cap is reachable only after
   * `SUSTAIN_CONFIRM` consecutive same-sign samples over `SUSTAIN_DEG` on
   * CONFIDENT sightings. A misread frame is not repeatable; a junction is.
   *
   * ═══ AND HERE IS WHAT THIS BRANCH IS WORTH, MEASURED BOTH WAYS ════════════
   *
   * `steer-bench.mjs --compare --lessons named` drives the 14 named failing
   * lessons closed-loop on the product's own physics and grades them with
   * `route-fidelity.mjs`. Turning THIS BRANCH OFF (`--tune SUSTAIN_MAX=0`,
   * which makes the turn demand unreachable and leaves only bounded pulses)
   * is the control:
   *
   *                          branch ON            branch OFF
   *     perfect sight     17/23 on-line          0/23 on-line
   *                       med x-track 2.71 m     36.97 m
   *                       coverage 91 %          72 %
   *     measured sight     0/23                  0/23
   *     +A+B+C sight       0/23                  0/23
   *
   * TWO THINGS FOLLOW AND THEY POINT OPPOSITE WAYS, WHICH IS WHY BOTH ARE
   * WRITTEN HERE.
   *
   *  1. THIS BRANCH IS THE ONLY THING THAT CAN EVER DRIVE A JUNCTION. Without
   *     it not one named lane finishes on-line even with a PERFECT sight of
   *     the road; with it, seventeen of twenty-three do. Anybody proposing to
   *     remove it should read that row first.
   *  2. AND IT CANNOT REACH THAT UNDER THE PERCEPTION THE HARNESS HAS. Zero of
   *     twenty-three, before and after the perception rebuild. On the wider
   *     90-lane corpus the branch is net NEGATIVE under measured sight (20
   *     on-line against 27 with it disabled) — a cost paid entirely on lanes
   *     with no turn in them, where a misread ≥15° authorises a manoeuvre the
   *     lesson never wanted. The wrong-way rate among authorised turns is
   *     20.7 % measured, and a wrong TURN costs far more than a wrong pulse.
   *
   * So the rung is right and it is starved. The next lever is not in this
   * file: it is whatever raises the fraction of a turn the loop can actually
   * see, which the corpus puts at 28 % of the true angle today. */
  /** |error| that counts as a turn demand rather than a lane correction. */
  SUSTAIN_DEG: 15,
  /**
   * Consecutive same-sign samples over SUSTAIN_DEG before the cap lifts.
   *
   * ── RAISING IT WAS TRIED AND REFUTED, so nobody re-proposes it ───────────
   *
   * The obvious answer to „20.7 % of authorised turns are the wrong way" is to
   * demand more evidence, and on the wide corpus it looks like it works:
   * `steer-bench.mjs --compare --tune SUSTAIN_CONFIRM=N`, 90 lanes, measured
   * sight, two seeds — on-line 20/17 at 2, 25/18 at 3, 26/18 at 4, with the
   * median max cross-track falling monotonically 13.5 → 12.1 → 11.5 m.
   *
   * IT IS PAID FOR OUT OF THE PRIZE. The same sweep over the 14 NAMED failing
   * lessons under PERFECT sight — the lanes the whole programme is about, and
   * the only regime in which any of them can be driven at all:
   *
   *     SUSTAIN_CONFIRM   2      3      4
   *     named on-line   17/23  15/23   9/23
   *
   * A junction is over in five or six ticks. Every extra tick of confirmation
   * is about three metres of the approach spent going straight, and the turn
   * that starts late finishes outside the corridor. The aggregate gain is
   * entirely on lanes that HAVE no turn, where a slower trigger suppresses
   * spurious authorisations — so raising this constant buys tidiness on the
   * easy lanes with the twenty-eight audit rows that are the point.
   *
   * 2 stays. The wrong-way rate is a perception problem and has to be paid for
   * where it is made.
   */
  SUSTAIN_CONFIRM: 2,
  /**
   * Consecutive turn-authorised samples before the wheel drops back to bounded
   * pulses regardless. RAISED FROM 4 TO 40, and the old value was not wrong so
   * much as sized against a different actuator.
   *
   * MEASURED FIRST, so the raise is not a guess: replaying `guideTick`'s own
   * bookkeeping over 398 lanes, `SUSTAIN_MAX` was the SOLE binding gate on 12
   * of 1,623 turn demands — 0.7 %. (The counter that made it look guilty,
   * `sustainExhausted`, incremented without re-checking `confident`: 223 hits,
   * only 12 of which could ever have armed the branch. An 18.6× bias, fixed at
   * its call site.) So 4 was innocent of the defect it was blamed for.
   *
   * IT WOULD NOT HAVE STAYED INNOCENT. With the rung above built, a
   * turn-authorised sample bends the path by v·T/R — at the corpus's 10 км/ч
   * demand speed, the MEASURED 1,021 ms period and the 9 m floor, about 18°.
   * A 90° junction therefore needs ~5 consecutive turn-authorised samples and
   * a three-quarter roundabout exit needs ~15. A cap of 4 would have retired
   * the branch before the first junction finished — the same defect one rung
   * higher up the ladder. 20 samples is 360° of commanded heading at that
   * cadence: a demand that outlasts a full circle is a stuck signal, not a
   * manoeuvre, and `sustainExhausted` says so out loud.
   *
   * The run still resets on ANYTHING that breaks the evidence — the error
   * entering the deadband, a sign change, a blind sample, a thin sighting — so
   * this bounds only an unbroken, confident, same-signed 20-sample demand.
   *
   * CONFIRMED INERT, WHICH IS WHY THE RAISE IS FREE AND NOT A RISK.
   * `steer-bench.mjs --compare --tune SUSTAIN_MAX=N` over 90 lanes, both
   * perception regimes, seed 1: N = 20, 8 and 4 give IDENTICAL results to the
   * decimal (20/90 and 23/90 on-line, medXt 13.54 and 10.32). The evidence
   * chain breaks long before twenty consecutive confident same-signed
   * sightings, exactly as the 0.7 % measurement above says. The only value of
   * N that changes anything is 0, which makes the branch unreachable — and
   * that is used as the CONTROL in the block above, not as a candidate. */
  SUSTAIN_MAX: 20,
  /**
   * The tightest turning radius (m) a confirmed turn may command.
   *
   * DERIVED FROM THE CORPUS, not chosen: the tightest radius any shadow line
   * in `content/traces` demands is 9.5 m (`sc-ov-oneway`, `sc-rb-lane-choice`),
   * solved from the ramp/plateau/return integral against their geometry. 9.0
   * clears it with margin and stops well short of the 4.0 m hard-over that the
   * old across-the-scan hold produced and that route-fidelity measured as a
   * 0.43× overshoot at p10.
   */
  TURN_RADIUS_MIN_M: 9.0,
  /**
   * Hard ceiling on any single press, whatever the period says. At the
   * measured 1,021 ms period `TURN_RADIUS_MIN_M` asks for 479 ms and at the
   * p90 period (1,464 ms) it asks for 709 ms, so 800 is past both and this
   * bound does not normally bite; it exists so a corrupt period cannot turn
   * into a multi-second key-down.
   *
   * IT IS STRICTLY TIGHTER THAN WHAT IT REPLACES, and that is worth stating
   * plainly because the number looks large. The OLD sustained branch returned
   * `holdMs: 0, sustain: true` and the caller did not release: consecutive
   * sustained samples left the key down CONTINUOUSLY, so a four-sample sustain
   * was ~4 s of unbroken full lock with no scan in between. This bound caps
   * one press at 0.8 s and the `period − FULL_RETURN_MS` bound guarantees the
   * wheel is back at centre before the next scan, always.
   *
   * AND LOWERING IT BUYS NOTHING, so „commit less per press" is not the answer
   * to the wrong-way rate. `--tune TURN_HOLD_MAX_MS=300` over 90 lanes, two
   * seeds: on-line 20/17 against 20/17 at 800, medXt 12.91/13.05 against
   * 13.54/13.22. Inside the noise. Same for `TURN_RADIUS_MIN_M=16` (20/17,
   * medXt 13.54/13.22 — identical). The damage a misread does is in its
   * DIRECTION, not its size, and neither of these bounds can see direction.
   */
  TURN_HOLD_MAX_MS: 800,
  /**
   * Pure pursuit's look-ahead distance, metres. THE ONE FITTED NUMBER IN THIS
   * FILE — see `pursuitMeanAngle` — and it is fitted in the open, because it
   * is not derivable: recovering it from the band geometry needs the camera
   * pitch and the product does not publish it (see `degPerPxAtCentre`).
   *
   * ── THE TABLE THAT USED TO BE HERE WAS UNREPRODUCIBLE, AND ITS SHAPE
   *    SURVIVED THE RE-RUN ────────────────────────────────────────────────
   *
   * It read „185 187 189 188 176 138 on-line over 431 lanes of w28–w33" and
   * cited `steer-bench.mjs`, WHICH DID NOT EXIST — the tool was never
   * committed and never stashed, so four numbers in this file were attributed
   * to something not on disk. The bench exists now and the sweep was re-run;
   * these are its numbers, 60 lanes of w34–w37 through the real
   * `route-fidelity.mjs`, and the OLD table's shape is reproduced even though
   * its absolutes cannot be:
   *
   *                        LOOKAHEAD_M   8    10    12    15    20    25
   *     perfect sight  on-line / 60     47    43    45    44    39    34
   *                    p90 x-track    9.77  7.19  5.17  3.70  4.02  4.93  m
   *     measured sight on-line / 60     10    10    12    12    13    15
   *                    med x-track   26.89 24.77 18.64 14.25 13.49 12.91  m
   *
   * THE OPTIMUM IS FLAT FROM 8 TO 15 AND THAT IS THE POINT. A knife-edge fit
   * would mean the change works for one lane shape and not the corpus; four
   * candidates within four lanes of each other means the gain is the RUNG, not
   * the tuning. 15 is chosen inside that plateau on the p90 under perfect
   * sight (3.70 m, the best of the six) because the tail is where the junction
   * failures live.
   *
   * AND THE TWO REGIMES DISAGREE ABOUT THE FAR END, which is worth leaving
   * visible rather than averaging away: under the MEASURED perception a longer
   * look-ahead keeps helping (25 m reads 15 on-line and the lowest median
   * cross-track), because a car that is often blind is better served by a
   * target it cannot overshoot. That is a statement about blindness, not about
   * pursuit, and tuning this constant to it would be tuning the law to the
   * defect the perception rebuild exists to remove.
   */
  LOOKAHEAD_M: 15,
  /**
   * THE SUB-FLOOR ACCUMULATOR, AND THE 44 % OF DEMANDS IT EXISTS FOR.
   *
   * `MIN_HOLD_MS` refuses a press too short to be worth two CDP round trips,
   * and that refusal is right. What was wrong is that the refused demand was
   * THROWN AWAY: a 6° error that persists for twenty ticks is twenty refusals
   * and no wheel, and the car leaves the line at ~0.09 m a tick. Measured on
   * the corpus, that is 2,538 of 5,746 past-deadband samples (44 %) with a
   * median refused error of 5.96° — and it matches where route-fidelity finds
   * the damage on EASY lanes: the 0–5° demand bucket holds 126 lanes at a
   * median 5.79 m off the line.
   *
   * So a refused demand is BANKED instead, and when the bank reaches the floor
   * one `MIN_HOLD_MS` press is issued and the bank is debited to zero. This is
   * what a quantised actuator is supposed to do; it issues FEWER round trips
   * than a lower floor would, not more.
   *
   * IT NEEDS NO CEILING CONSTANT, AND THE FIRST DRAFT SHIPPED ONE. A
   * `CARRY_MAX_MS: 65` sat here for a while with a comment about „a long quiet
   * stretch cannot hoard a lurch", and the mutation harness refused it: the
   * bank is spent the instant it reaches `MIN_HOLD_MS`, and only a sub-floor
   * `raw` is ever added to it, so the STORED value is bounded below
   * `MIN_HOLD_MS` by construction and no cap above that can ever bind. A
   * constant nothing can reach is a dead predicate wearing a safety
   * argument — this programme has a name for that class — so it was deleted
   * and the structural bound is asserted instead.
   *
   * The bank is cleared by a sign change, a blind sample or a deadband
   * sample — the same evidence rules as the run.
   */
  /** |error| above this is "off the line" for the time-off-line accounting. */
  OFF_LINE_DEG: 12,
  /**
   * A drive that saw the ribbon on fewer than this fraction of its moving
   * samples was not closed-loop, whatever its error numbers say.
   */
  MIN_SEEN_FRAC: 0.5,
  /**
   * …AND CLEARING THAT FLOOR IS NOT THE SAME AS TRACKING. A drive may only be
   * called `tracked` if the loop was closed for this much of it.
   *
   * MEASURED ON sc-junction-scan, 2026-08-21, and this constant exists because
   * that lane was stamped `tracked` by the first draft:
   *
   *     ribbon seen on 37/66 moving samples (56%)
   *     |err| median 6.03°  p90 33.49°  worst 40.2°
   *     off-line 6s of 37s        → 16 %, under the intermittent threshold
   *     witness path 457.2 m   net 116.0 m   straightness 0.254
   *
   * Forty-four per cent of the moving drive had NO SIGNAL, the car covered
   * 457 m to move 116 m, and the one word a skimming judge reads said the drive
   * was competent. The median was honest and the verdict was not: a median
   * computed over the 56 % it could see says nothing whatever about the 44 % it
   * could not. `tracked` now requires the loop to have been closed nearly
   * throughout, and everything between the two fractions is `intermittent`.
   */
  TRACKED_SEEN_FRAC: 0.85,
};

/**
 * One control decision.
 *
 * `carryMs` is the sub-floor bank (see THE SUB-FLOOR ACCUMULATOR in TUNE) and, like
 * `sustainRun`, it is the CALLER'S BOOK: this function is pure, cannot see
 * history, and must not pretend to. It returns the bank's new value and the
 * caller stores it. A caller that ignores the return value gets exactly the
 * old behaviour, which is why the default is 0 and why every existing
 * assertion in `__tests__/guidance.test.mjs` §4 still describes this function.
 *
 * @param {{errDeg:number|null, prevErrDeg:number|null, kmh:number, dtMs?:number,
 *          sustainRun?:number, confident?:boolean, carryMs?:number, tune?:object}} a
 * @returns {{dir:"left"|"right"|null, holdMs:number, sustain:boolean, carryMs:number, why:string}}
 */
export function steerCommand({
  errDeg,
  prevErrDeg = null,
  kmh,
  dtMs = TUNE.TICK_MS_ASSUMED,
  sustainRun = 0,
  confident = true,
  carryMs = 0,
  tune = TUNE,
}) {
  if (errDeg === null || !Number.isFinite(errDeg)) {
    return { dir: null, holdMs: 0, sustain: false, carryMs: 0, why: "no aim point — the ribbon was not seen" };
  }
  if (!(kmh >= tune.MIN_KMH)) {
    return {
      dir: null,
      holdMs: 0,
      sustain: false,
      carryMs: 0,
      why: `below ${tune.MIN_KMH} км/ч the wheel moves the camera, not the car`,
    };
  }
  const mag = Math.abs(errDeg);
  if (mag <= tune.DEAD_DEG) {
    return { dir: null, holdMs: 0, sustain: false, carryMs: 0, why: `inside the ${tune.DEAD_DEG}° deadband` };
  }
  const dir = errDeg > 0 ? "right" : "left";
  /* THE TURN DEMAND — the only path that may exceed `MAX_HOLD_MS`. It no
   * longer leaves the wheel down across the scan; see the SUSTAIN block in
   * TUNE for why that was the wrong rung and what replaced it. `sustainRun` is
   * how many consecutive PRIOR samples already agreed on this sign at this
   * magnitude.
   *
   * ⚠ THIS BRANCH IS INERT UNTIL THE CALLER IS UPDATED, AND WHILE IT IS INERT
   * IT NARRATES A PRESS NOBODY MAKES. `lesson-audit.mjs`'s `guideTick` still
   * has the OLD sustained branch: it calls `steer(cmd.dir)` and does not
   * release, so the key stays down across the scan (the 5 m rung) while the
   * `why` string below says „270 ms press, R 17.8 m". A reader of run.log
   * would be told a radius the car never drove. The caller's half of the
   * change is the other file in the same stash and has to land with this one;
   * `guidance.samples[].holdMs` on a `sustain: true` sample is the field to
   * check — if every one of them is 0, the caller is still the old one. */
  if (confident && mag >= tune.SUSTAIN_DEG && sustainRun >= tune.SUSTAIN_CONFIRM && sustainRun < tune.SUSTAIN_CONFIRM + tune.SUSTAIN_MAX) {
    /* ── THE CAR IS NOT A CONSTANT, AND THE FIRST DRAFT OF THIS BRANCH TREATED
     *    IT AS ONE ─────────────────────────────────────────────────────────
     * Two speed-dependent facts enter here, both measured on the product's own
     * physics (`maxSteerAtKmh`, `yawGainAtKmh`): the lock that exists at this
     * speed, and the fraction of the kinematic turn the tyres deliver. Below
     * 15 км/ч — where 88 % of the corpus's turn demands are — both are ~1 and
     * this is byte-for-byte the old arithmetic. Above it they are the
     * difference between a press that means what it says and one that reads
     * 9 m while driving 24. */
    const veh = vehicleAtKmh(kmh);
    const gain = yawGainAtKmh(kmh);
    // The tightest REAL radius allowed, expressed as an angle — and then
    // clamped by the lock that physically exists, because a demand past full
    // lock is not a tighter turn, it is an unreachable one.
    const maxMeanRad = Math.min(meanAngleForRealRadius(tune.TURN_RADIUS_MIN_M, kmh, veh), veh.MAX_ANGLE_RAD);
    const wanted = pursuitMeanAngle(errDeg, { lookaheadM: tune.LOOKAHEAD_M, maxMeanRad, wheelbaseM: veh.WHEELBASE_M, yawGain: gain });
    const wantedMs = holdMsForMeanAngle(wanted, dtMs, veh);
    // The three bounds, computed apart so the record can name which one bit.
    const tickBound = dtMs - FULL_RETURN_MS;
    const holdMs = Math.round(Math.max(0, Math.min(wantedMs, tune.TURN_HOLD_MAX_MS, tickBound)));
    if (holdMs >= tune.MIN_HOLD_MS) {
      const capped = holdMs + 0.5 < wantedMs;
      const meanRad = meanAngleForHold(holdMs, dtMs, veh);
      const realR = realRadiusForMeanAngle(meanRad, kmh, veh);
      return {
        dir,
        holdMs,
        sustain: true,
        carryMs: 0,
        meanRad: Number(meanRad.toFixed(4)),
        /** THE RADIUS THE CAR WILL DRIVE, not the one a textbook would. The
         *  kinematic figure is kept beside it so the two can never be
         *  confused by a reader who only skims one of them. */
        radiusM: Number(realR.toFixed(1)),
        kinRadiusM: Number(radiusForMeanAngle(meanRad, veh).toFixed(1)),
        yawGain: Number(gain.toFixed(3)),
        lockRad: Number(veh.MAX_ANGLE_RAD.toFixed(3)),
        cappedBy: !capped ? null : holdMs === Math.round(tickBound) ? "tick" : holdMs === tune.TURN_HOLD_MAX_MS ? "ceiling" : "radius",
        why:
          `sustained turn: ${errDeg.toFixed(1)}° confirmed over ${sustainRun} consecutive same-sign sample(s) — ` +
          `${holdMs} ms press, mean ${meanRad.toFixed(3)} rad, R ${realR.toFixed(1)} m` +
          (gain < 0.97 ? ` (kinematic ${radiusForMeanAngle(meanRad, veh).toFixed(1)} m × yaw gain ${gain.toFixed(2)} at ${Math.round(kmh)} км/ч)` : ""),
      };
    }
    // A tick so short that even a confirmed turn cannot be pressed inside it
    // falls through to the bounded pulse rather than being pressed anyway —
    // and the fall-through is not silent, it is `tooSmall` below.
  }
  const dErr = prevErrDeg === null ? 0 : errDeg - prevErrDeg;
  // The damping term opposes the error's own sign when the error is already
  // shrinking, which is what stops the ~0.5 s dead time turning a correction
  // into an oscillation.
  const raw = tune.KP_MS_PER_DEG * (mag - tune.DEAD_DEG) + tune.KD_MS_PER_DEG * Math.sign(errDeg) * dErr;
  if (raw < tune.MIN_HOLD_MS) {
    /* ── THE REFUSED DEMAND IS BANKED, NOT BINNED ─────────────────────────
     * See THE SUB-FLOOR ACCUMULATOR in TUNE. The refusal itself is unchanged and still
     * counted (`tooSmall`); what changed is that the millisecond it refused
     * is remembered, so a persistent small error eventually earns one press
     * instead of nothing forever. A NEGATIVE raw — the damping term saying
     * the error is already closing fast — banks nothing and is not allowed to
     * withdraw either: the bank is a record of unanswered demand, not a
     * signed integral that could quietly command the opposite way. */
    const bank = carryMs + Math.max(0, raw);
    if (bank >= tune.MIN_HOLD_MS) {
      return {
        dir,
        holdMs: tune.MIN_HOLD_MS,
        sustain: false,
        carryMs: 0,
        carried: true,
        why: `err ${errDeg.toFixed(1)}° — ${Math.round(bank)} ms of sub-floor demand banked over prior samples, spent as one ${tune.MIN_HOLD_MS} ms press`,
      };
    }
    return {
      dir: null,
      holdMs: 0,
      sustain: false,
      carryMs: bank,
      why: `demand ${Math.round(raw)} ms is under the ${tune.MIN_HOLD_MS} ms floor (${Math.round(bank)} ms banked)`,
      tooSmall: true,
    };
  }
  const holdMs = Math.min(tune.MAX_HOLD_MS, Math.round(raw));
  // POSITIVE ERROR = the ribbon is RIGHT of the image centre = turn RIGHT.
  return { dir, holdMs, sustain: false, carryMs: 0, why: `err ${errDeg.toFixed(1)}° d${dErr.toFixed(1)}°` };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. THE TRACKING RECORD — THE DELIVERABLE THAT KEEPS THIS ROUND HONEST
 * ═══════════════════════════════════════════════════════════════════════════ */

const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};

/**
 * Turn the per-sample log into something a later reader can judge the drive by
 * WITHOUT rerunning it. That sentence is the whole specification.
 *
 * A judge reading a failed objective has to be able to answer one question:
 * did the product refuse a competent drive, or did the harness drive badly?
 * Every field below exists to answer some form of it.
 *
 * @param {Array<{tSec:number,kmh:number,seen:boolean,errDeg:number|null,
 *                nearDeg:number|null,dir:string|null,holdMs:number,dtMs:number}>} samples
 */
export function summariseTracking(all, tune = TUNE) {
  /* ── POSE-ONLY SAMPLES ARE EVIDENCE ABOUT WHERE THE CAR WENT, AND ABOUT
   *    NOTHING ELSE — 2026-09-10 ─────────────────────────────────────────────
   *
   * `guidePose` writes a sample on every tick of the phases the steering loop
   * does NOT run in: the stop, the reverse leg, and the whole `flat` law of a
   * MODE=«wrong» lane. It carries `wx/wz` and nothing else, because it turns
   * no wheel and takes no scan. It exists because `route-fidelity.mjs`
   * reconstructs the car's path out of `guidance.samples` and NOTHING ELSE, so
   * before it existed every parking lane's cross-track was computed on the
   * forward approach with the manoeuvre itself absent — 19,094 reverse ticks,
   * about half of every parking drive's control ticks, invisible, with a
   * verdict printed over the gap.
   *
   * THEY ARE EXCLUDED FROM EVERY RATE BELOW, and that exclusion is the point.
   * Folding ticks the loop never ran on into `seenFrac` would drive every
   * parking lane to `blind` for a reason that has nothing to do with the
   * product — a harness change wearing a repair's costume. `poseOnlySamples`
   * publishes how many were set aside so the exclusion cannot be mistaken for
   * silence. */
  const poseOnly = all.filter((s) => s.loop === false);
  const samples = poseOnly.length ? all.filter((s) => s.loop !== false) : all;
  // `?? tune.MIN_KMH` because this function takes a caller-supplied `tune` and
  // a partial one used to be complete. Without the fallback a `{MIN_KMH: 2}`
  // handed in by a probe makes `tune.MOVING_KMH` undefined, every comparison
  // false, `moving` empty — and the verdict comes back NEVER-MOVED for a car
  // that drove. A missing threshold must not read as "nothing moved".
  const movingKmh = tune.MOVING_KMH ?? tune.MIN_KMH;
  const moving = samples.filter((s) => s.kmh >= movingKmh);
  const seen = moving.filter((s) => s.seen && s.errDeg !== null);
  const errs = seen.map((s) => Math.abs(s.errDeg));
  const movingMs = moving.reduce((a, s) => a + (s.dtMs || 0), 0);
  const offMs = seen.filter((s) => Math.abs(s.errDeg) > tune.OFF_LINE_DEG).reduce((a, s) => a + (s.dtMs || 0), 0);
  const blindMs = moving.filter((s) => !s.seen).reduce((a, s) => a + (s.dtMs || 0), 0);
  const seenFrac = moving.length ? seen.length / moving.length : 0;
  const commands = samples.filter((s) => s.dir !== null);
  /* ── WHAT THE WHEEL ACTUALLY DID, PUBLISHED BECAUSE A CEILING WAS RAISED ──
   * The turn hold may exceed `MAX_HOLD_MS`, so „how long was the longest
   * press" and „how many presses were turn-authorised" stop being derivable
   * from the constants and have to be counted. A reader who wants to know
   * whether a drive looked steered because it WAS reads these, not the law. */
  /* ── WHICH SIGNAL STEERED WHICH TICKS, IN THE DRIVE'S OWN WORDS ──────────
   *
   * The perception can now close the loop around two different things the
   * product paints: the ghost ribbon, and the turn chevron. Both are painted
   * for the student and neither is a hidden answer — but the two are not
   * interchangeable as EVIDENCE, and a reader must not have to reverse-engineer
   * which one drove.
   *
   * This is the anti-neutralisation clause of the whole rebuild. A harness that
   * quietly switched to a second signal and reported one number would be a
   * harness whose closures nobody can audit. So the mix is counted, and it is
   * appended to `verdictWhy`, which `lesson-audit.mjs` already prints verbatim
   * into run.log on every drive.
   *
   * `mass` means the shape pass did not run on that tick — an older record, or
   * a caller that did not ask `scanBand` to keep the mask. */
  const signalMix = { line: 0, chevron: 0, fragment: 0, mass: 0, none: 0 };
  for (const s of moving) signalMix[s.signal ?? "mass"] = (signalMix[s.signal ?? "mass"] ?? 0) + 1;
  const chevCommands = commands.filter((s) => s.signal === "chevron").length;
  const conflicts = moving.filter((s) => s.conflict === true).length;
  const mixCaveat =
    signalMix.chevron === 0
      ? null
      : `SIGNAL MIX: ${signalMix.chevron} of ${moving.length} moving samples were steered by the TURN CHEVRON rather than the ` +
        `ribbon (${chevCommands} of ${commands.length} commands), because the ribbon had left the windscreen or the arrow was ` +
        `on it. The chevron is RouteGuidance's own arrow, painted for the student and read here the way a student reads it — ` +
        `its direction, not its pixel count — and it comes from the same derived route as the ribbon, so it widens nothing. ` +
        (conflicts ? `On ${conflicts} sample(s) the ribbon and the arrow pointed OPPOSITE ways and the arrow was followed; a run of those is a finding about the guidance layer. ` : "") +
        `A reader who will not accept a drive steered partly by the arrow should refuse this one on this line.`;

  const turnHolds = commands.filter((s) => s.sustain === true);
  const holdHistogram = { "1-64": 0, "65": 0, "66-149": 0, "150-249": 0, "250+": 0 };
  for (const c of commands) {
    const h = c.holdMs || 0;
    if (h >= 250) holdHistogram["250+"] += 1;
    else if (h >= 150) holdHistogram["150-249"] += 1;
    else if (h > 65) holdHistogram["66-149"] += 1;
    else if (h === 65) holdHistogram["65"] += 1;
    else if (h > 0) holdHistogram["1-64"] += 1;
  }

  /* THE VERDICT WORD, AND WHY IT REFUSES BEFORE IT PRAISES.
   *
   * The order of these branches is the safety argument. „Competent" is only
   * reachable after the drive has proved it could SEE — a drive that never saw
   * the ribbon has a median error of `null`, not of 0, and must land on
   * `blind`. Reversing these two branches is exactly how a straight-line drive
   * in disguise would be certified as a good one. */
  let verdict;
  let verdictWhy;
  if (!samples.length) {
    /* ── „NEVER MOVED" AND „NEVER ASKED" ARE OPPOSITE DIAGNOSES — 2026-08-22 ──
     *
     * MEASURED, and it is a lie about a whole mode of the corpus. `guideTick`
     * is called only inside `if (phase === "roll")`, and `lesson-audit.mjs`
     * starts every MODE≠"right" drive at `phase = "flat"` — a phase no branch
     * of the tick loop handles and no transition ever leaves. So on every
     * „wrong" lane the loop is never invoked once, `samples` is empty, and the
     * old branch below published «the car never got above the speed at which
     * the wheel does anything» about a car that was held FLAT OUT on the
     * throttle for the whole drive. The reassuring direction again: a judge
     * reads „never-moved" and stops, when the truth is „drove at speed, with
     * no steering loop watching, and nothing here measured it."
     *
     * It is also the verdict with no `loud()` behind it, so the drive class
     * carrying the LEAST evidence was the one that raised no alarm. */
    verdict = "not-invoked";
    verdictWhy =
      "THE STEERING LOOP WAS NEVER INVOKED ON THIS DRIVE — not one sample was taken, so nothing in this record is a " +
      "measurement of the car, and «no error» here does not mean «no error». The drive path only runs the loop in its " +
      "`roll` phase; a drive with no roll phase (every MODE=«wrong» lane, which holds the throttle flat) never reaches " +
      "it. THE CAR MAY WELL HAVE BEEN MOVING FAST. It was UNSTEERED, and unmeasured.";
  } else if (!moving.length && samples.every((s) => !(s.kmh >= 0))) {
    /* …AND „THE SPEED PROBE COULD NOT READ" IS A THIRD THING AGAIN. The drive
     * harness publishes −1 км/ч for „unreadable", and −1 fails `>= MIN_KMH`
     * exactly the way a stationary car does. MEASURED on a lane whose lesson
     * page had crashed into its error boundary: 98 samples, every one −1, and
     * the record asserted the car „never got above" a speed — a confident fact
     * about the world derived from an instrument that was saying it could not
     * see. This harness already keeps that distinction for the verdict surface
     * («absent» vs «no-pill»); it has to keep it here. */
    verdict = "speed-unreadable";
    verdictWhy =
      `the speed probe never returned a readable value on any of the ${samples.length} samples (it publishes −1 for ` +
      "«unreadable»), so whether the car moved is UNKNOWN — not «no». Nothing about tracking was measured, and the " +
      "reason is an instrument failure on this lane, not a stationary car.";
  } else if (!moving.length) {
    verdict = "never-moved";
    verdictWhy = "the car never got above the speed at which the wheel does anything, so nothing about tracking was measured";
  } else if (seenFrac < tune.MIN_SEEN_FRAC) {
    verdict = "blind";
    verdictWhy =
      `the guidance ribbon was visible on only ${seen.length} of ${moving.length} moving samples ` +
      `(${(seenFrac * 100).toFixed(0)}%, floor ${(tune.MIN_SEEN_FRAC * 100).toFixed(0)}%) — for most of this drive the ` +
      "control loop was OPEN and the car was travelling in a straight line. Treat it as an unsteered drive.";
  } else if (median(errs) > tune.OFF_LINE_DEG) {
    verdict = "wandered";
    verdictWhy =
      `the median absolute tracking error was ${median(errs).toFixed(1)}°, past the ${tune.OFF_LINE_DEG}° off-line ` +
      "threshold — this drive was not on the line it was steering toward, and no finding about where the car ended up " +
      "may be attributed to the product without accounting for that.";
  } else if (seenFrac < tune.TRACKED_SEEN_FRAC) {
    verdict = "intermittent";
    verdictWhy =
      `the loop was CLOSED for only ${(seenFrac * 100).toFixed(0)}% of the moving drive (a drive may be called tracked at ` +
      `${(tune.TRACKED_SEEN_FRAC * 100).toFixed(0)}%). The error figures below are computed over the ${seen.length} samples ` +
      `that saw the ribbon and say NOTHING about the ${moving.length - seen.length} that did not — the car was steering ` +
      "blind for that part of the drive, and where it went then is not evidence about the product.";
  } else if (offMs > movingMs * 0.25) {
    verdict = "intermittent";
    verdictWhy =
      `the median error was acceptable (${median(errs).toFixed(1)}°) but the car spent ${Math.round(offMs / 1000)}s of ` +
      `${Math.round(movingMs / 1000)}s moving with more than ${tune.OFF_LINE_DEG}° of error — it recovered, repeatedly, ` +
      "from being off the line rather than holding it.";
  } else {
    verdict = "tracked";
    verdictWhy =
      `the ribbon was in view for ${(seenFrac * 100).toFixed(0)}% of the moving drive and the median absolute error was ` +
      `${median(errs).toFixed(1)}° (p90 ${quantile(errs, 0.9)?.toFixed(1)}°, worst ${Math.max(...errs).toFixed(1)}°).`;
  }

  return {
    samples: samples.length,
    movingSamples: moving.length,
    seenSamples: seen.length,
    seenFrac: Number(seenFrac.toFixed(3)),
    blindMs,
    movingMs,
    medianAbsDeg: errs.length ? Number(median(errs).toFixed(2)) : null,
    p90AbsDeg: errs.length ? Number(quantile(errs, 0.9).toFixed(2)) : null,
    worstAbsDeg: errs.length ? Number(Math.max(...errs).toFixed(2)) : null,
    /** Signed median: a drive that sat consistently to one side reads here and
     *  not in `medianAbsDeg`, and „always 8° left" is a different defect from
     *  „±8° either way". */
    medianSignedDeg: seen.length ? Number(median(seen.map((s) => s.errDeg)).toFixed(2)) : null,
    timeOffLineMs: offMs,
    offLineFrac: movingMs ? Number((offMs / movingMs).toFixed(3)) : 0,
    commands: commands.length,
    commandMs: commands.reduce((a, s) => a + s.holdMs, 0),
    /** ticks the loop did not run on, carried for their pose alone and kept
     *  out of every rate above. See the block at the head of this function. */
    poseOnlySamples: poseOnly.length,
    poseOnlyPhases: [...new Set(poseOnly.map((s) => s.phase).filter(Boolean))].sort(),
    /** presses authorised by confirmed, confident, repeated evidence — the
     *  only ones allowed past MAX_HOLD_MS. */
    turnHolds: turnHolds.length,
    turnHoldMs: turnHolds.reduce((a, s) => a + (s.holdMs || 0), 0),
    /** the longest single press this drive issued. If this reads ≤ MAX_HOLD_MS
     *  on a lane with junctions, the rung was never reached and the drive is a
     *  straight line whatever else this record says. */
    maxHoldMsIssued: commands.length ? Math.max(...commands.map((s) => s.holdMs || 0)) : 0,
    holdHistogram,
    /** presses paid for out of the sub-floor bank — see THE SUB-FLOOR
     *  ACCUMULATOR in TUNE. Each is exactly MIN_HOLD_MS. */
    carriedPulses: commands.filter((s) => s.carried === true).length,
    /** commands issued in the 1–2 км/ч band the corrected MIN_KMH admitted.
     *  Published so the correction can be audited rather than believed. */
    commandsBelow2Kmh: commands.filter((s) => s.kmh >= 0 && s.kmh < 2).length,
    /** WHICH SIGNAL STEERED WHICH TICKS — see `signalCaveat`. */
    signalMix,
    signalCaveat: mixCaveat,
    verdict,
    // …AND THE MIX IS APPENDED TO THE SENTENCE THE DRIVE LOG ALREADY PRINTS,
    // not filed in a field a reader has to know to open. `lesson-audit.mjs`
    // notes `tr.verdictWhy` verbatim on every drive, so a disclosure that
    // lives here reaches run.log with no call site to change and no reader to
    // remember.
    verdictWhy: mixCaveat ? `${verdictWhy} ${mixCaveat}` : verdictWhy,
  };
}

/**
 * CAN THE CONTROL LOOP AFFORD TO RUN ON THIS LEG, AND IS THAT STILL TRUE?
 *
 * A screenshot was measured at ~360-790 ms on the mobile leg and 11,999 ms on
 * the pc leg. At twelve seconds a frame a control law corrects the car once
 * every twelve seconds, which is not a control law — it is a straight line
 * with occasional flinches that would look STEERED in the status file. So the
 * loop measures its own cost and refuses when it cannot afford to run.
 *
 * THE REFUSAL IS RIGHT. Two properties of HOW it was decided were not, and
 * both are fixed here rather than in the caller, so that a test can reach
 * them:
 *
 *  1. IT WAS DECIDED ON THE FIRST THREE SCANS A DRIVE EVER TOOK. Those land
 *     while every shard is starting, each WebKit is compiling its first route
 *     and one 7200 rpm disk serves them all. That is a measurement of the
 *     STARTUP, generalised to the next several minutes. `warmup` scans are
 *     now recorded and then thrown away.
 *
 *  2. IT WAS PERMANENT. Nothing anywhere cleared `unaffordable`, so a box
 *     that freed up ten seconds later still drove straight to the end. Cost
 *     is a property of the BOX AT A MOMENT, not of the lane, so the verdict
 *     expires and is re-measured. It may refuse again — this makes the
 *     verdict revisable, not weaker.
 *
 * Measured consequence of the old shape, w29: 50 of 127 open audit rows came
 * back UNJUDGED, 27 of the 49 remaining criticals among them, overwhelmingly
 * on legs whose log reads «0 trace commands — THIS DRIVE DID NOT STEER».
 */
export const COST = {
  /** scans thrown away before the cost is believed */
  warmupScans: 3,
  /** …and how many are then measured. Odd, because it is a median. */
  sample: 5,
  /** past this, a control loop is not a control loop */
  budgetMs: 1500,
  /** how often a refusal is reconsidered */
  recheckEverySec: 20,
};

/**
 * The affordability verdict, or null while there is not yet enough evidence.
 *
 * `scanCostMs` is every scan the drive has taken, oldest first, INCLUDING the
 * warm-up ones — the caller keeps recording them because every refusal in this
 * loop records itself, and a decision made on samples nobody can see is the
 * same silence in a smaller place.
 *
 * Returns `{ medianMs, affordable }` once `warmup + sample` scans exist, and
 * judges on the MOST RECENT `sample` of the post-warm-up window so a later
 * re-measurement is not dragged back by the samples that produced the refusal.
 */
export function costVerdict(scanCostMs, opts = {}) {
  const { warmupScans, sample, budgetMs } = { ...COST, ...opts };
  const window = scanCostMs.slice(warmupScans);
  if (window.length < sample) return null;
  const recent = window.slice(-sample);
  const medianMs = [...recent].sort((a, b) => a - b)[sample >> 1];
  return { medianMs, affordable: medianMs <= budgetMs };
}

/**
 * Has a refusal stood long enough to be worth one scan to re-test?
 *
 * A null decision time means nothing has been decided yet, which is not the
 * same as a decision that has expired — but the caller only asks this while
 * already refusing, and a refusal with no timestamp is a bug that should
 * re-measure rather than persist forever. So: expired.
 */
export function refusalExpired(decidedAtMs, nowMs, everySec = COST.recheckEverySec) {
  if (decidedAtMs === null || decidedAtMs === undefined) return true;
  return nowMs - decidedAtMs >= everySec * 1000;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. WHERE THE CAR ACTUALLY WENT, IN THE PRODUCT'S OWN FRAME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. Twenty-one open rows — eleven of them critical — are all
 * UNJUDGED for one reason: nobody could establish where the car was RELATIVE
 * TO THE ROAD. The first attempt at it was reverted, and correctly: it measured
 * displacement from the car's own prior chord, a line through its own last
 * 25 m, while every positional detector in the product measures from the road
 * (`rules/types.ts laneOffsetM` is "offset FROM LANE CENTER";
 * `runtime/spatial.ts OFF_ROAD_DISTANCE_M` is distance from an edge
 * centreline). A car driving dead straight while the road curves away reads
 * ~0 m on the chord scale and hundreds of metres on the product's. The
 * proposed replacement was a new dev-only `__roadProbe` in the product.
 *
 * NO NEW INSTRUMENT IS NEEDED, AND THAT IS THE POINT OF THIS BLOCK. Both
 * halves have been recorded on every drive for weeks and were thrown away at
 * the reporting layer:
 *
 *   · `guidance.samples[].wx/wz` — the chassis pose from `__camProbe`, read on
 *     EVERY tick including the ones where the loop did nothing.
 *   · `content/traces/<id>/shadow-correct.trace.json` — 20 Hz `x, y,
 *     headingDeg` of a drive whose authoring rule is «must replay with ZERO
 *     violations», in the same frame (district y = −world z).
 *
 * So the reference line is not the car's own history and not this harness's
 * opinion: it is the route the LESSON says is correct, authored by the
 * product, validated by the product. The distance between them is a
 * road-referenced measurement of the only kind that was missing.
 *
 * MEASURED ON w43 THE DAY THIS LANDED, over 79 `right` legs: 39 of them (49 %)
 * put the car MORE THAN 8 m from its own lesson's correct line at some point,
 * only 11 (14 %) never left 3 m of it, and the worst reached 185 m. That is
 * the real state of the instrument, and until now no artefact said it.
 *
 * WHAT IT MAY AND MAY NOT BE USED FOR. It says where the car was. It does NOT
 * say the product was wrong to be silent, or right to charge — the governing
 * rule is unchanged: the instrument supplies the behaviour, the product decides
 * whether that place was forbidden. Its use is the OTHER direction: a leg whose
 * car was never on the route cannot support a finding about what the product
 * did or did not credit ALONG that route, and `routeDeviationRefusal` below
 * says so in one sentence a judge can act on.
 */

/** Perpendicular distance from a point to a polyline, in the polyline's units. */
export function distanceToPolyline(px, pz, poly) {
  if (!Array.isArray(poly) || poly.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const ax = poly[i - 1][0], az = poly[i - 1][1];
    const bx = poly[i][0], bz = poly[i][1];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    let t = L2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qz = az + t * dz;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}

/**
 * The authored correct line as a `[x, z]` polyline in `__camProbe`'s frame.
 *
 * THE SIGN IS THE WHOLE OF IT. The trace is authored in DISTRICT coordinates
 * and the probe reports WORLD; they differ by `z = −y` and nothing else. Get
 * that backwards and every number below is a plausible-looking measurement of
 * a mirrored road, which is worse than no number — so it is one line, named,
 * rather than an inline negation somebody later "tidies".
 */
export function authoredLinePolyline(trace) {
  const s = trace?.samples;
  if (!Array.isArray(s) || s.length < 2) return null;
  const poly = [];
  for (const p of s) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    poly.push([p.x, -p.y]);
  }
  return poly.length >= 2 ? poly : null;
}

/** Deviation thresholds, in metres. `NEAR` is about a lane's worth of slack;
 *  `OFF` is past any lane of any carriageway this product builds, so a car
 *  beyond it is not "wide in its lane", it is somewhere else. */
export const ROUTE_NEAR_M = 3;
export const ROUTE_OFF_M = 8;

/**
 * Fold the drive's poses against the authored line.
 *
 * MOVING SAMPLES ONLY, and that is not a convenience. A car parked 40 m from
 * the line before it is allowed to start would otherwise dominate the median
 * and describe the drive by the place it had not left yet.
 *
 * Returns `null` when there is nothing to say — no line on disk, or too few
 * poses — and the caller must print that rather than a zero. A missing
 * measurement and a measurement of zero are opposite claims about a drive.
 */
export function routeDeviation(samples, poly, { minSamples = 5, minKmh = 1 } = {}) {
  if (!Array.isArray(samples) || !Array.isArray(poly) || poly.length < 2) return null;
  const d = [];
  for (const s of samples) {
    if (!Number.isFinite(s?.wx) || !Number.isFinite(s?.wz)) continue;
    if (!((s.kmh ?? 0) > minKmh)) continue;
    const m = distanceToPolyline(s.wx, s.wz, poly);
    if (m !== null) d.push(m);
  }
  if (d.length < minSamples) return null;
  const sorted = d.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const pct = (m) => Math.round((100 * d.filter((x) => x > m).length) / d.length);
  const r2 = (x) => Number(x.toFixed(2));
  return {
    n: d.length,
    medianM: r2(at(0.5)),
    p90M: r2(at(0.9)),
    maxM: r2(sorted[sorted.length - 1]),
    pctOverNear: pct(ROUTE_NEAR_M),
    pctOverOff: pct(ROUTE_OFF_M),
    onRoute: sorted[sorted.length - 1] <= ROUTE_OFF_M,
  };
}

/**
 * The one sentence a judge needs, or `null` when the drive stayed on its route.
 *
 * It is deliberately narrow. It does NOT say the drive proves nothing — a leg
 * that left the route can still witness a HUD defect, a debrief contradiction
 * or a card that never mounted. It says the drive cannot witness what the
 * product did ALONG a route the car was not on, which is precisely the class
 * that has been mis-filed: «the task never ticked», «the offence never fired»,
 * «the route credit never came».
 */
export function routeDeviationRefusal(dev) {
  if (dev === null || dev === undefined) {
    return "NO AUTHORED LINE TO MEASURE AGAINST — this drive's position relative to the road is UNKNOWN, not zero. No route-position finding may be filed from it.";
  }
  if (dev.onRoute) return null;
  return (
    `THIS CAR LEFT ITS OWN LESSON'S CORRECT LINE — ${dev.maxM} m at worst, ` +
    `${dev.pctOverOff}% of moving samples beyond ${ROUTE_OFF_M} m (median ${dev.medianM} m over ${dev.n} samples), ` +
    `measured against content/traces/<lesson>/shadow-correct.trace.json in the product's own frame. ` +
    `NO FINDING ABOUT WHAT THE PRODUCT DID ALONG THIS ROUTE — a task that never ticked, an offence that never fired, ` +
    `route credit that never came — MAY BE DRAWN FROM THIS LEG: the car was not there to be graded. ` +
    `Findings about the HUD, the debrief or a card that never mounted are unaffected.`
  );
}
