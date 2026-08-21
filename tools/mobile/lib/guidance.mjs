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
 * @param {{data:Buffer|Uint8Array,width:number,height:number,channels:number}} img
 * @param {Array<{x:number,y:number,w:number,h:number}>} masks
 */
export function scanBand(img, masks = []) {
  const { data, width: W, height: H, channels: C } = img;
  const rows = new Array(H);
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
    }
    total += n;
    rows[y] = n ? { y, n, cx: sx / n, minX, maxX } : { y, n: 0, cx: null, minX: null, maxX: null };
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
   * Below this the wheel moves the CAMERA and not the car (`CameraRig`'s
   * `steerNorm * COCKPIT_LOOK_INTO_TURN`), so a command here would be recorded
   * as steering while changing nothing about where the car goes.
   */
  MIN_KMH: 2,

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
   * THE ARITHMETIC OF WHY. A 65 ms pulse on a ~700 ms cadence is ~9 % duty. At
   * the 12 км/ч cruise that is an average road-wheel angle of ~0.05 rad and a
   * turning radius near 52 m. A junction needs 8–10 m. The law was not
   * mistuned; it was bounded away from the manoeuvre.
   *
   * SO THE CAP LIFTS ONLY ON REPEATED EVIDENCE, WHICH IS THE WHOLE SAFETY
   * ARGUMENT. `MAX_HOLD_MS` exists so that ONE misread frame cannot put the car
   * sideways, and that property is kept: the wheel is only left down across a
   * sample after `SUSTAIN_CONFIRM` CONSECUTIVE samples have agreed on a large
   * error WITH THE SAME SIGN. A misread frame is not repeatable; a junction is.
   * The hold releases the instant the error drops inside the deadband or
   * changes sign, and `SUSTAIN_MAX` bounds a stuck signal from spinning the car
   * however long it insists. */
  /** |error| that counts as a turn demand rather than a lane correction. */
  SUSTAIN_DEG: 15,
  /** Consecutive same-sign samples over SUSTAIN_DEG before the cap lifts. */
  SUSTAIN_CONFIRM: 2,
  /** Consecutive held samples before the wheel is centred regardless. */
  SUSTAIN_MAX: 4,
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
 * @param {{errDeg:number|null, prevErrDeg:number|null, kmh:number, tune?:object}} a
 * @returns {{dir:"left"|"right"|null, holdMs:number, why:string}}
 */
export function steerCommand({ errDeg, prevErrDeg = null, kmh, sustainRun = 0, confident = true, tune = TUNE }) {
  if (errDeg === null || !Number.isFinite(errDeg)) {
    return { dir: null, holdMs: 0, sustain: false, why: "no aim point — the ribbon was not seen" };
  }
  if (!(kmh >= tune.MIN_KMH)) {
    return { dir: null, holdMs: 0, sustain: false, why: `below ${tune.MIN_KMH} км/ч the wheel moves the camera, not the car` };
  }
  const mag = Math.abs(errDeg);
  if (mag <= tune.DEAD_DEG) {
    return { dir: null, holdMs: 0, sustain: false, why: `inside the ${tune.DEAD_DEG}° deadband` };
  }
  /* THE TURN DEMAND — the only path on which the wheel is left down across a
   * sample. `sustainRun` is how many consecutive PRIOR samples already agreed
   * on this sign at this magnitude, and it is the caller's book: this function
   * cannot see history and must not pretend to. */
  if (confident && mag >= tune.SUSTAIN_DEG && sustainRun >= tune.SUSTAIN_CONFIRM && sustainRun < tune.SUSTAIN_CONFIRM + tune.SUSTAIN_MAX) {
    return {
      dir: errDeg > 0 ? "right" : "left",
      holdMs: 0,
      sustain: true,
      why: `sustained turn: ${errDeg.toFixed(1)}° confirmed over ${sustainRun} consecutive same-sign sample(s)`,
    };
  }
  const dErr = prevErrDeg === null ? 0 : errDeg - prevErrDeg;
  // The damping term opposes the error's own sign when the error is already
  // shrinking, which is what stops the ~0.5 s dead time turning a correction
  // into an oscillation.
  const raw = tune.KP_MS_PER_DEG * (mag - tune.DEAD_DEG) + tune.KD_MS_PER_DEG * Math.sign(errDeg) * dErr;
  if (raw < tune.MIN_HOLD_MS) {
    return { dir: null, holdMs: 0, sustain: false, why: `demand ${Math.round(raw)} ms is under the ${tune.MIN_HOLD_MS} ms floor`, tooSmall: true };
  }
  const holdMs = Math.min(tune.MAX_HOLD_MS, Math.round(raw));
  // POSITIVE ERROR = the ribbon is RIGHT of the image centre = turn RIGHT.
  return { dir: errDeg > 0 ? "right" : "left", holdMs, sustain: false, why: `err ${errDeg.toFixed(1)}° d${dErr.toFixed(1)}°` };
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
export function summariseTracking(samples, tune = TUNE) {
  const moving = samples.filter((s) => s.kmh >= tune.MIN_KMH);
  const seen = moving.filter((s) => s.seen && s.errDeg !== null);
  const errs = seen.map((s) => Math.abs(s.errDeg));
  const movingMs = moving.reduce((a, s) => a + (s.dtMs || 0), 0);
  const offMs = seen.filter((s) => Math.abs(s.errDeg) > tune.OFF_LINE_DEG).reduce((a, s) => a + (s.dtMs || 0), 0);
  const blindMs = moving.filter((s) => !s.seen).reduce((a, s) => a + (s.dtMs || 0), 0);
  const seenFrac = moving.length ? seen.length / moving.length : 0;
  const commands = samples.filter((s) => s.dir !== null);

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
    verdict,
    verdictWhy,
  };
}
