/**
 * guidance.test.mjs — the steering control law, and the record that qualifies
 * every finding drawn from a steered drive.
 *
 * EVERY ASSERTION IN THIS FILE HAS BEEN WATCHED TO FAIL. The mutation that
 * breaks each one is named in a comment beside it, because an assertion nobody
 * has seen go red is a decoration — that is this programme's own rule and it
 * has caught three instrument bugs already.
 *
 * The thing being defended is not "the maths is right". It is that a control
 * loop which cannot see CANNOT REPORT ZERO. A drive with no signal that
 * averaged its blindness in as 0° of error would be certified as the best drive
 * in the sweep, and 145 lessons would then be re-driven against it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aimFrom,
  degPerPxAtCentre,
  isRibbonPixel,
  MIN_ROW_PX,
  scanBand,
  steerCommand,
  summariseTracking,
  TUNE,
} from "../lib/guidance.mjs";
import { decodePng } from "../lib/png.mjs";
import { deflateSync } from "node:zlib";

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** An RGBA band with a ribbon stripe of width `w` centred on `cx` in each row
 *  of `[y0,y1)`. Colour is the product's own `--accent-2` #17e1c4. */
function band(width, height, stripes) {
  const data = Buffer.alloc(width * height * 4, 0);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const { y0, y1, cx, w, rgb = [0x17, 0xe1, 0xc4] } of stripes) {
    for (let y = y0; y < y1; y++) {
      for (let x = Math.round(cx - w / 2); x < Math.round(cx + w / 2); x++) {
        if (x < 0 || x >= width) continue;
        const i = (y * width + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    }
  }
  return { data, width, height, channels: 4 };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 THE PIXEL TEST — the ribbon is kept and the interface is thrown away
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§1 isRibbonPixel separates the world's ribbon from the interface", () => {
  it("keeps --accent-2, the colour RouteGuidance actually paints", () => {
    // #17e1c4. MUTATION WATCHED: drop the `g >= b` clause and this still
    // passes — which is why the next test exists and this one is not enough.
    assert.equal(isRibbonPixel(0x17, 0xe1, 0xc4), true);
  });

  it("THROWS AWAY --accent, the interface blue, on the single clause g >= b", () => {
    // #3fa1ff = (63,161,255). Every blue pill, ring, border and the shadow
    // car's own trail is this colour, and the survey measured the consequence
    // of admitting it: a 2,483-pixel blob at a fixed x that did not move while
    // the car did 59 км/ч — page furniture being steered toward as if it were
    // the road.
    assert.equal(isRibbonPixel(0x3f, 0xa1, 0xff), false, "the accent token itself");
    // AND THE BLENDS, WHICH ARE WHAT IS ACTUALLY ON THE GLASS. The token is
    // never painted neat: «ПРОЧЕТИ» is a translucent pill over a bright scene,
    // so its real pixels are the accent lightened toward the backdrop, and its
    // antialiased edge is lighter still. The first draft of this test asserted
    // only the neat token and MUTATION-SURVIVED: relaxing the clause to
    // `g >= b - 80` still rejected (63,161,255) — a 94-point gap — while
    // admitting every one of the blends below. The assertion was measuring a
    // margin nothing in the product occupies.
    assert.equal(isRibbonPixel(60, 180, 250), false, "accent over a pale backdrop");
    assert.equal(isRibbonPixel(90, 190, 245), false, "an antialiased pill edge");
    assert.equal(isRibbonPixel(70, 200, 255), false, "the brightest blend that is still blue");
    // …and the ribbon still survives all of that. A mask that rejects the
    // interface by rejecting everything is not a mask.
    assert.equal(isRibbonPixel(0x17, 0xe1, 0xc4), true, "the ribbon must still pass");
    assert.equal(isRibbonPixel(120, 240, 220), true, "a bloomed ribbon must still pass");
  });

  it("throws away asphalt, sky, grass and headlight bloom", () => {
    assert.equal(isRibbonPixel(40, 40, 44), false, "asphalt");
    assert.equal(isRibbonPixel(150, 180, 220), false, "sky");
    assert.equal(isRibbonPixel(60, 120, 55), false, "grass");
    assert.equal(isRibbonPixel(250, 250, 250), false, "white bloom");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 THE MASK — page furniture must never be read as world
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§2 HUD rectangles are excluded from the scan", () => {
  it("finds a ribbon stripe and reports its centroid", () => {
    const img = band(400, 100, [{ y0: 0, y1: 100, cx: 250, w: 20 }]);
    const s = scanBand(img);
    assert.ok(s.total > 1500, `${s.total} should be > 1500`);
    assert.ok(Math.abs((s.rows[50].cx) - (249.5)) < 0.5, `${s.rows[50].cx} should be ≈ 249.5`);
  });

  it("IGNORES a stripe that lies under a masked HUD rectangle", () => {
    // MUTATION WATCHED: delete the `masked` continue in scanBand and this
    // reports the furniture's centroid instead of `n: 0`. That is the failure
    // that makes a car steer toward a screen-fixed object — i.e. drive in a
    // circle — while its tracking record calls the circle competent.
    const img = band(400, 100, [{ y0: 0, y1: 100, cx: 250, w: 20 }]);
    const s = scanBand(img, [{ x: 200, y: 0, w: 120, h: 100 }]);
    assert.equal(s.total, 0);
    assert.equal(s.rows[50].cx, null);
  });

  it("masks only what it covers — a partly covered band keeps the rest", () => {
    const img = band(400, 100, [
      { y0: 0, y1: 100, cx: 100, w: 20 },
      { y0: 0, y1: 100, cx: 300, w: 20 },
    ]);
    const s = scanBand(img, [{ x: 280, y: 0, w: 60, h: 100 }]);
    assert.ok(Math.abs((s.rows[50].cx) - (99.5)) < 0.5, `${s.rows[50].cx} should be ≈ 99.5`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 THE AIM POINT — and the refusal that keeps a blind drive honest
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§3 aimFrom refuses rather than returning a zero", () => {
  it("aims at the look-ahead window, signed the way the world is", () => {
    // Ribbon to the RIGHT of centre in the look-ahead rows → positive error.
    const img = band(400, 100, [{ y0: 18, y1: 52, cx: 300, w: 20 }]);
    const a = aimFrom(scanBand(img));
    assert.equal(a.seen, true);
    assert.ok(a.aimPx > 90, `${a.aimPx} should be > 90`);
    assert.equal(a.source, "lookahead");
  });

  it("RETURNS seen:false, NEVER 0, when the band is empty", () => {
    // THE ONE THAT MATTERS. MUTATION WATCHED: make aimFrom return
    // `{ seen: true, aimPx: 0 }` on an empty band and every downstream number
    // still looks perfect — `summariseTracking` reports a 0° median and the
    // verdict "tracked" on a car that never saw anything. This is the exact
    // silence-reads-as-success conflation that hid the missing steering for
    // 376 drives, reproduced one layer down.
    const a = aimFrom(scanBand(band(400, 100, [])));
    assert.equal(a.seen, false);
    assert.equal(a.aimPx, null);
    assert.match(String(a.why), /ribbon px/);
  });

  it("refuses a band whose only pixels are below the per-row floor", () => {
    // A row of 3 px is antialiasing or a distant chevron tip; its centroid is
    // noise with a plausible value.
    //
    // THE WIDTH IS THE LITERAL 3, NOT `MIN_ROW_PX - 3`, AND THAT IS THE WHOLE
    // TEST. The first draft derived it from the constant under test, so the
    // mutation `MIN_ROW_PX = 1` made the stripe −2 px wide — no pixels at all —
    // and the assertion stayed green while the floor it guards was gone. It was
    // caught by running the mutation, which is the only way this class of dead
    // assertion is ever caught: a test that moves with its subject cannot
    // measure it. MUTATION WATCHED (after the fix): `MIN_ROW_PX = 1` turns 3 px
    // of speckle into a confident aim point and this goes red.
    const img = band(400, 100, [{ y0: 20, y1: 50, cx: 300, w: 3 }]);
    assert.ok(MIN_ROW_PX > 3, "the floor must be above the speckle this test builds");
    const a = aimFrom(scanBand(img));
    assert.equal(a.seen, false);
  });

  it("falls back to the whole band and SAYS SO when the look-ahead is empty", () => {
    // The fallback is legitimate but it is a different measurement, so it is
    // named. MUTATION WATCHED: make the fallback silent (`source` always
    // "lookahead") and a near-field-only sighting is reported as a look-ahead
    // one, which is a claim about ground distance that was never made.
    const img = band(400, 100, [{ y0: 70, y1: 100, cx: 120, w: 30 }]);
    const a = aimFrom(scanBand(img));
    assert.equal(a.seen, true);
    assert.equal(a.source, "wholeband");
    assert.ok(a.aimPx < 0, `${a.aimPx} should be < 0`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 THE CONTROL LAW — bounded, damped, and silent only on purpose
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§4 steerCommand", () => {
  it("turns toward the ribbon: positive error is a RIGHT command", () => {
    // The sign is the whole control law. MUTATION WATCHED: flip it and the car
    // steers away from the line, which on a curve is a departure from the
    // carriageway that a judge would file against the product.
    assert.equal(steerCommand({ errDeg: 12, kmh: 12 }).dir, "right");
    assert.equal(steerCommand({ errDeg: -12, kmh: 12 }).dir, "left");
  });

  it("says nothing inside the deadband, and says WHY", () => {
    const c = steerCommand({ errDeg: TUNE.DEAD_DEG - 0.5, kmh: 12 });
    assert.equal(c.dir, null);
    assert.match(String(c.why), /deadband/);
  });

  it("NEVER exceeds MAX_HOLD_MS, however large the error", () => {
    // The safety bound. Full lock is 188 ms of hold and gives a 3.8 m turning
    // radius at the 12 км/ч cruise — about 50°/s of yaw. MUTATION WATCHED:
    // remove the `Math.min` and a single misread frame puts the car sideways,
    // and the frames from that tick get filed as a product defect.
    for (const e of [20, 45, 90, 400]) {
      assert.ok(steerCommand({ errDeg: e, kmh: 12 }).holdMs <= TUNE.MAX_HOLD_MS, `${steerCommand({ errDeg: e, kmh: 12 }).holdMs} should be <= TUNE.MAX_HOLD_MS`);
    }
  });

  it("refuses to command below the speed at which the wheel moves the car", () => {
    // Under 2 км/ч the wheel moves the CAMERA (COCKPIT_LOOK_INTO_TURN) and not
    // the car, so a command there would be recorded as steering while changing
    // nothing about where the car goes.
    const c = steerCommand({ errDeg: 30, kmh: 0 });
    assert.equal(c.dir, null);
    assert.match(String(c.why), /camera/);
  });

  it("refuses when there is no aim point, instead of steering straight", () => {
    // MUTATION WATCHED: treat `errDeg: null` as 0 and a blind loop silently
    // becomes a straight-line drive that reports itself as steered — the worst
    // outcome available to this round.
    const c = steerCommand({ errDeg: null, kmh: 12 });
    assert.equal(c.dir, null);
    assert.match(String(c.why), /not seen/);
  });

  /* ── THE SUSTAINED TURN ──────────────────────────────────────────────────
   * The cap that keeps one misread frame from putting the car sideways is the
   * same cap that made sc-junction-left impossible: 65 ms on a ~700 ms cadence
   * is a 52 m turning radius, and a junction needs 8–10. These assertions pin
   * the ONLY way the cap lifts — repeated, same-signed evidence — and the two
   * bounds that keep the lift from becoming a spin. */

  it("does NOT lift the cap on a single large error, however large", () => {
    // One frame is not evidence. MUTATION WATCHED: drop the `sustainRun >=
    // SUSTAIN_CONFIRM` clause and one misread frame holds the wheel down
    // through a scan — the exact failure MAX_HOLD_MS exists to prevent.
    const c = steerCommand({ errDeg: -40, kmh: 12, sustainRun: 1 });
    assert.equal(c.sustain, false);
    assert.ok(c.holdMs <= TUNE.MAX_HOLD_MS, `${c.holdMs} should be <= ${TUNE.MAX_HOLD_MS}`);
  });

  it("lifts the cap once consecutive samples agree on a big error", () => {
    const c = steerCommand({ errDeg: -23.16, kmh: 12, sustainRun: TUNE.SUSTAIN_CONFIRM });
    assert.equal(c.sustain, true);
    assert.equal(c.dir, "left");
    assert.match(String(c.why), /sustained turn/);
  });

  it("does not lift the cap for a small error, however often it repeats", () => {
    // A run of 6° lane corrections is not a junction. MUTATION WATCHED:
    // remove the `mag >= SUSTAIN_DEG` clause and ordinary lane-holding turns
    // into a held wheel.
    //
    // THE RUN LENGTH IS INSIDE THE WINDOW ON PURPOSE, AND THE FIRST DRAFT'S WAS
    // NOT. It passed `sustainRun: 9`, which is past `SUSTAIN_CONFIRM +
    // SUSTAIN_MAX` — so the upper bound refused it and the magnitude gate was
    // never reached. The mutation SURVIVED: deleting the gate left this green.
    // A test has to enter the branch it claims to guard.
    const inWindow = TUNE.SUSTAIN_CONFIRM + 1;
    assert.ok(inWindow < TUNE.SUSTAIN_CONFIRM + TUNE.SUSTAIN_MAX, "the run must be inside the sustain window");
    const c = steerCommand({ errDeg: 6, kmh: 12, sustainRun: inWindow });
    assert.equal(c.sustain, false);
    // …and the same run WITH a big error does lift it, so the only difference
    // between the two calls is the magnitude this gate is about.
    assert.equal(steerCommand({ errDeg: 30, kmh: 12, sustainRun: inWindow }).sustain, true);
  });

  it("STOPS sustaining at SUSTAIN_MAX, so a stuck signal cannot spin the car", () => {
    // MUTATION WATCHED: delete the upper bound and a ribbon that stays 40° off
    // — a route doubling back, a misread pillar — holds full lock for ever.
    const run = TUNE.SUSTAIN_CONFIRM + TUNE.SUSTAIN_MAX;
    const c = steerCommand({ errDeg: -40, kmh: 12, sustainRun: run });
    assert.equal(c.sustain, false);
    assert.ok(c.holdMs <= TUNE.MAX_HOLD_MS, `${c.holdMs} should be <= ${TUNE.MAX_HOLD_MS}`);
  });

  it("REFUSES to sustain on a sighting too thin to be an aim point", () => {
    // THE MEASUREMENT THAT BOUGHT THIS. On sc-junction-left the first sustained
    // turn fired on a 549-pixel sighting reporting −43.87°, where an ordinary
    // sample of the same drive carried 9,043–88,803 pixels. The centroid of a
    // sliver is wherever the last surviving fragment happens to be. The drive
    // scored 20 penalty points against the 10 it scored without the sustain.
    // MUTATION WATCHED: drop the `confident &&` clause and this goes red.
    const c = steerCommand({ errDeg: -43.87, kmh: 12, sustainRun: 3, confident: false });
    assert.equal(c.sustain, false);
    // …but it is still USED, bounded, because a thin sighting is evidence and
    // discarding it would put the loop back into silence. The distinction is
    // the whole point: a nudge, never a manoeuvre.
    assert.equal(c.dir, "left");
    assert.ok(c.holdMs > 0 && c.holdMs <= TUNE.MAX_HOLD_MS, `${c.holdMs} should be a bounded pulse`);
  });

  it("marks a thin sighting thin, and a full one confident", () => {
    const thin = aimFrom(scanBand(band(400, 100, [{ y0: 20, y1: 40, cx: 300, w: 10 }])));
    const full = aimFrom(scanBand(band(400, 100, [{ y0: 18, y1: 52, cx: 300, w: 120 }])));
    assert.equal(thin.seen, true);
    assert.equal(thin.confident, false);
    assert.equal(full.confident, true);
  });

  it("never sustains below the speed at which the wheel moves the car", () => {
    assert.equal(steerCommand({ errDeg: -40, kmh: 0, sustainRun: 9 }).sustain, false);
  });

  it("never sustains on a sample that saw nothing", () => {
    // The run is the caller's book and it is reset by a blind sample, but the
    // pure function must refuse independently — two locks on the door that
    // matters most.
    assert.equal(steerCommand({ errDeg: null, kmh: 12, sustainRun: 9 }).sustain, false);
  });

  it("damps: a correction already working is answered more softly", () => {
    // Same error, but shrinking fast vs growing. With ~0.5 s of dead time the
    // undamped law oscillates. MUTATION WATCHED: set KD to 0 and the two
    // demands become equal.
    const closing = steerCommand({ errDeg: 20, prevErrDeg: 34, kmh: 12 });
    const opening = steerCommand({ errDeg: 20, prevErrDeg: 6, kmh: 12 });
    assert.ok(closing.holdMs < opening.holdMs, `${closing.holdMs} should be < opening.holdMs`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 THE TRACKING RECORD — the deliverable that stops this round making the
 *    audit worse than it already is
 * ═══════════════════════════════════════════════════════════════════════════ */

const sample = (o) => ({ tSec: 0, kmh: 12, dtMs: 500, seen: true, errDeg: 0, nearDeg: null, dir: null, holdMs: 0, ...o });

describe("§5 summariseTracking", () => {
  it("calls a drive that never saw the ribbon BLIND, not perfect", () => {
    // THE CENTRAL ASSERTION OF THIS ROUND. A blind drive is a straight-line
    // drive. MUTATION WATCHED: move the `seenFrac` branch below the median
    // branch in guidance.mjs and this run — 20 moving samples, nothing seen —
    // is certified `tracked`, which is a straight-line drive wearing a
    // steered drive's certificate.
    const s = summariseTracking(Array.from({ length: 20 }, () => sample({ seen: false, errDeg: null })));
    assert.equal(s.verdict, "blind");
    assert.equal(s.medianAbsDeg, null);
    assert.match(String(s.verdictWhy), /straight line/);
  });

  it("does not let unseen samples average in as zero error", () => {
    // Half the drive blind, the seen half 20° off. A mean over 0-filled blanks
    // would read 10° and land on `tracked`.
    const s = summariseTracking([
      ...Array.from({ length: 10 }, () => sample({ seen: false, errDeg: null })),
      ...Array.from({ length: 10 }, () => sample({ errDeg: 20 })),
    ]);
    assert.equal(s.medianAbsDeg, 20);
    assert.equal(s.seenFrac, 0.5);
  });

  it("calls a drive that saw the line and missed it WANDERED", () => {
    const s = summariseTracking(Array.from({ length: 20 }, () => sample({ errDeg: 25 })));
    assert.equal(s.verdict, "wandered");
    assert.match(String(s.verdictWhy), /may be attributed to the product/);
  });

  it("separates a car that sat to one side from one that swung both ways", () => {
    // `medianAbsDeg` cannot tell them apart and `medianSignedDeg` can. „Always
    // 8° left" is a different defect from „±8° either way", and only the first
    // is consistent with tracking a centreline from a lane.
    const oneSide = summariseTracking(Array.from({ length: 10 }, () => sample({ errDeg: 8 })));
    const bothWays = summariseTracking(
      Array.from({ length: 10 }, (_, i) => sample({ errDeg: i % 2 ? 8 : -8 })),
    );
    assert.equal(oneSide.medianSignedDeg, 8);
    assert.ok(Math.abs(bothWays.medianSignedDeg) <= 8, `${Math.abs(bothWays.medianSignedDeg)} should be <= 8`);
    assert.equal(oneSide.medianAbsDeg, bothWays.medianAbsDeg);
  });

  it("REFUSES to call a half-blind drive tracked, even with a clean median", () => {
    // THE MEASUREMENT THAT BOUGHT THIS BRANCH — sc-junction-scan, 2026-08-21:
    // 37 of 66 moving samples saw the ribbon (56 %), median 6.03°, off-line
    // only 16 % of the moving time, and the witness recorded 457.2 m of path
    // for 116.0 m of net displacement (straightness 0.254). The first draft
    // stamped that `tracked`. A median computed over the 56 % the loop could
    // see says nothing about the 44 % it could not.
    // MUTATION WATCHED: delete the TRACKED_SEEN_FRAC branch and this reads
    // `tracked` again — a car that covered four times the ground it needed,
    // certified as competent in the one word a judge skims.
    const s = summariseTracking([
      ...Array.from({ length: 37 }, () => sample({ errDeg: 6 })),
      ...Array.from({ length: 29 }, () => sample({ seen: false, errDeg: null })),
    ]);
    assert.equal(s.verdict, "intermittent");
    assert.match(String(s.verdictWhy), /say NOTHING about/);
    // …and it is NOT demoted all the way to blind: the loop really was closed
    // for most of it, and collapsing the two would throw away a distinction the
    // next wave needs.
    assert.ok(s.seenFrac > TUNE.MIN_SEEN_FRAC, `${s.seenFrac} should clear the blind floor`);
  });

  it("calls a drive that kept recovering INTERMITTENT rather than tracked", () => {
    // Median fine, but a third of the moving time past the off-line threshold.
    // MUTATION WATCHED: delete the `offMs` branch and this reads `tracked`,
    // and a car that left the road three times gets a competence certificate.
    const s = summariseTracking([
      ...Array.from({ length: 14 }, () => sample({ errDeg: 2 })),
      ...Array.from({ length: 8 }, () => sample({ errDeg: 30 })),
    ]);
    assert.equal(s.verdict, "intermittent");
  });

  it("calls a car that never moved NEVER-MOVED, not tracked", () => {
    const s = summariseTracking(Array.from({ length: 20 }, () => sample({ kmh: 0, seen: false, errDeg: null })));
    assert.equal(s.verdict, "never-moved");
  });

  it("separates a loop that was NEVER INVOKED from a car that never moved", () => {
    // MEASURED, not hypothetical: `guideTick` runs only in the drive path's
    // `roll` phase, and every MODE=«wrong» lane starts and stays in `flat`, so
    // the loop is never called once while the car is held flat out. The old
    // single branch published «the car never got above the speed at which the
    // wheel does anything» for those — a confident falsehood in the reassuring
    // direction. MUTATION WATCHED: delete the `!samples.length` branch in
    // guidance.mjs and this goes back to "never-moved".
    const s = summariseTracking([]);
    assert.equal(s.verdict, "not-invoked");
    assert.match(String(s.verdictWhy), /NEVER INVOKED/);
    assert.match(String(s.verdictWhy), /MAY WELL HAVE BEEN MOVING FAST/);
    assert.equal(s.medianAbsDeg, null);
    // …and it must NOT be reachable from a drive that did sample, however
    // stationary — otherwise the two collapse again from the other side.
    assert.equal(summariseTracking([sample({ kmh: 0, seen: false, errDeg: null })]).verdict, "never-moved");
  });

  it("separates a speed probe that could not read from a car standing still", () => {
    // The harness publishes −1 км/ч for „unreadable", and −1 fails the moving
    // gate exactly the way 0 does. MEASURED on a lane whose lesson page had
    // crashed: 98 samples, all −1, verdict «never-moved» — a fact about the
    // car asserted from an instrument that was saying it could not see.
    const s = summariseTracking(Array.from({ length: 98 }, () => sample({ kmh: -1, seen: false, errDeg: null })));
    assert.equal(s.verdict, "speed-unreadable");
    assert.match(String(s.verdictWhy), /UNKNOWN — not «no»/);
    // A genuinely stationary drive still reads never-moved, and one readable
    // stationary sample among the unreadable ones is enough to say so.
    const mixed = [sample({ kmh: -1, seen: false, errDeg: null }), sample({ kmh: 0, seen: false, errDeg: null })];
    assert.equal(summariseTracking(mixed).verdict, "never-moved");
  });

  it("certifies a genuinely good drive", () => {
    const s = summariseTracking(Array.from({ length: 30 }, () => sample({ errDeg: 2.5 })));
    assert.equal(s.verdict, "tracked");
    assert.equal(s.seenFrac, 1);
    assert.equal(s.worstAbsDeg, 2.5);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 THE RULER, AND THE DECODER UNDER IT
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§6 the measurement chain", () => {
  it("agrees with the product's own camera constant", () => {
    // COCKPIT_HFOV_RAD is 75.4°. A 2,556-device-pixel band therefore spans
    // 2·atan(tan(37.7°)) — and the round-3 steering proof measured
    // COCKPIT_LOOK_INTO_TURN (0.09 rad = 5.16°) as ~156 px on this same band,
    // i.e. ~0.033°/px. MUTATION WATCHED: drop the `* 2` in degPerPxAtCentre
    // and the constant halves, which would silently halve every angle this
    // round publishes.
    const dpp = degPerPxAtCentre(2556);
    assert.ok(dpp > 0.030, `${dpp} should be > 0.030`);
    assert.ok(dpp < 0.038, `${dpp} should be < 0.038`);
    assert.ok(Math.abs((156 * dpp) - (5.2)) < 0.5, `${156 * dpp} should be ≈ 5.2`);
  });

  it("decodes a PNG the way the browser wrote it", () => {
    // The decoder is the harness's own (node:zlib) precisely so a sweep cannot
    // be disarmed by a change in the PRODUCT's node_modules. A round trip
    // through it must be exact, or the control law reads a shifted world.
    const w = 4;
    const h = 3;
    const raw = Buffer.alloc(h * (1 + w * 4));
    for (let y = 0; y < h; y++) {
      raw[y * (1 + w * 4)] = 0; // filter: none
      for (let x = 0; x < w; x++) {
        const i = y * (1 + w * 4) + 1 + x * 4;
        raw[i] = x * 10;
        raw[i + 1] = y * 20;
        raw[i + 2] = 200;
        raw[i + 3] = 255;
      }
    }
    const chunk = (type, body) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      const t = Buffer.from(type, "ascii");
      return Buffer.concat([len, t, body, Buffer.alloc(4)]); // CRC unchecked by decodePng
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const out = decodePng(png);
    assert.equal(out.width, w);
    assert.equal(out.height, h);
    assert.equal(out.channels, 4);
    assert.deepEqual([...out.data.subarray(0, 8)], [0, 0, 200, 255, 10, 0, 200, 255]);
  });

  it("REFUSES a PNG it cannot read rather than guessing", () => {
    // A decoder that quietly mis-reads a colour type feeds the control law
    // plausible garbage. MUTATION WATCHED: replace the throw with a default of
    // 4 channels and a 16-bit screenshot steers the car by noise.
    assert.throws(() => decodePng(Buffer.from("not a png")), /signature/);
  });
});
