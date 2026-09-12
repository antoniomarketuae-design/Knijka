/**
 * perception.test.mjs — THE SHAPE PASS, WATCHED CLAUSE BY CLAUSE.
 *
 * Every assertion here names the mutation it exists to catch, because this
 * programme has measured that 51 of 82 audited repairs shipped a predicate
 * nothing live reads: a test that cannot go red when its clause is deleted is
 * a dead predicate wearing a test's costume.
 *
 * THE SHAPES ARE DRAWN TO THE PRODUCT'S OWN GEOMETRY, AT THE BAND'S OWN SIZE,
 * and both halves of that matter. `RouteGuidance.tsx`'s arrowhead is tip
 * (0.95, 0), wings (−0.55, ±0.85), notch (−0.18, 0); and every threshold in
 * `perception.mjs` is a FRACTION of the scan band, so a test drawn on a
 * 400 × 120 toy canvas measures a different geometry and passes or fails for
 * the wrong reason. The first draft of this file did exactly that and had the
 * classifier calling a chevron a road.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHEVRON_MAX_TIP_MASS,
  CHEVRON_MIN_REACH_RATIO,
  OBJ_DEPTH_FRAC,
  OBJ_ELONGATION,
  OBJ_FILL,
  OBJ_SPAN_FRAC,
  chevronAim,
  classify,
  createFurnitureRegister,
  isPlate,
  labelComponents,
} from "../lib/perception.mjs";
import { CONFIDENT_LINE_PX, aimFrom, readAim, rowsFromPixels, scanBand } from "../lib/guidance.mjs";

/* ── the raster the tests draw on: the `pc` leg's real scan band ──────────── */
const W = 1166;
const H = 210;
const RIBBON = [23, 225, 196];
const ASPHALT = [30, 30, 34];

function canvas(w = W, h = H) {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    data[i * 3] = ASPHALT[0];
    data[i * 3 + 1] = ASPHALT[1];
    data[i * 3 + 2] = ASPHALT[2];
  }
  const img = { data, width: w, height: h, channels: 3 };
  img.set = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    data[i] = RIBBON[0];
    data[i + 1] = RIBBON[1];
    data[i + 2] = RIBBON[2];
  };
  img.rect = (x0, y0, ww, hh) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) img.set(x, y);
  };
  img.disc = (cx, cy, r) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) img.set(cx + x, cy + y);
  };
  /**
   * The arrowhead of RouteGuidance, foreshortened onto the road plane the way
   * the cockpit camera sees it: WIDER THAN TALL, pointing at `dirX`.
   * MEASURED on the recorded frames — the plate grows from 13 × 8 px at the
   * far end of the route to 69 × 40 at the junction and holds an aspect near
   * 1.7 throughout, so `len ≈ 2.3 × halfWidth` reproduces it.
   */
  img.arrow = (cx, cy, len, halfWidth, dirX) => {
    const tipX = Math.round(cx + dirX * len * 0.95);
    const backX = Math.round(cx - dirX * len * 0.55);
    const x0 = Math.min(tipX, backX);
    const x1 = Math.max(tipX, backX);
    for (let y = Math.round(cy - halfWidth); y <= Math.round(cy + halfWidth); y++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.abs(x - tipX) / Math.max(1, Math.abs(tipX - backX)); // 0 at the point, 1 at the wings
        const outer = t * halfWidth;
        const notch = Math.max(0, (t - 0.75) / 0.25) * halfWidth; // the cut-back between the wings
        if (Math.abs(y - cy) <= outer && Math.abs(y - cy) >= notch) img.set(x, y);
      }
    }
  };
  return img;
}

/** the turn chevron at the size the corpus shows it near a junction */
const CHEVRON = { len: 30, halfWidth: 13 };
const comps = (img) => labelComponents(scanBand(img, [], { keepMask: true }).mask, img.width, img.height, { minPx: 24 });

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 CONNECTED COMPONENTS
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§1 labelComponents separates things that are not touching", () => {
  it("finds two blobs as two components, not one centroid between them", () => {
    // THE WHOLE DEFECT IN ONE ASSERTION. `scanBand`'s per-row centroid puts a
    // road on the left and an arrow on the right at the AVERAGE of the two —
    // a point where there is nothing at all. MUTATION WATCHED: let the flood
    // fill jump a gap and this collapses to one.
    const img = canvas();
    img.rect(60, 40, 90, 80);
    img.rect(900, 40, 90, 80);
    const cs = comps(img);
    assert.equal(cs.length, 2);
    for (const c of cs) assert.ok(c.cx < 200 || c.cx > 850, `component at ${c.cx.toFixed(0)} is between the two blobs`);
  });

  it("orders by area, so the caller can reach the biggest thing first", () => {
    const img = canvas();
    img.rect(60, 40, 30, 30);
    img.rect(600, 40, 180, 120);
    const cs = comps(img);
    assert.ok(cs[0].n > cs[1].n);
  });

  it("drops specks under minPx rather than letting them vote", () => {
    const img = canvas();
    img.rect(10, 10, 3, 3);
    assert.equal(comps(img).length, 0);
  });

  it("survives a component large enough to blow a recursive fill's stack", () => {
    // The mobile band is 2556 × 378 and a wet-night ribbon is one component of
    // ~300,000 pixels. MUTATION WATCHED: rewrite the fill recursively.
    const img = canvas(700, 500);
    img.rect(0, 0, 700, 500);
    const cs = labelComponents(scanBand(img, [], { keepMask: true }).mask, 700, 500, { minPx: 24 });
    assert.equal(cs.length, 1);
    assert.equal(cs[0].n, 700 * 500);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 A LINE IS NOT AN OBJECT
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§2 classify tells the road from the plate", () => {
  it("calls a road-spanning streak a LINE even though it is 12 px tall", () => {
    // The junction case: the carriageway crossing the windscreen edge-on. It
    // is a handful of pixels and it is still the road.
    const img = canvas();
    img.rect(180, 60, 611, 12);
    const c = comps(img)[0];
    assert.equal(classify(c), "line");
  });

  it("calls the NEAR ribbon a LINE, the case that killed the first draft", () => {
    // Under the bumper on a left turn the ribbon is a fat 176 × 109 blob with
    // an elongation near 2.5 — every plate clause but DEPTH. MUTATION WATCHED:
    // delete the depth clause from `isPlate` and this goes red.
    const img = canvas();
    for (let y = 88; y < 197; y++) img.rect(0, y, Math.round(20 + (y - 88) * 1.4), 1);
    const c = comps(img)[0];
    assert.ok(c.depthFrac > OBJ_DEPTH_FRAC, `depth ${c.depthFrac.toFixed(2)} should exceed the plate's ceiling`);
    assert.ok(c.elongation < OBJ_ELONGATION, `elongation ${c.elongation.toFixed(2)} is inside the plate's range`);
    assert.equal(classify(c), "line");
  });

  it("calls the turn chevron an OBJECT, at both ends of the route", () => {
    for (const scale of [0.3, 1, 1.4]) {
      const img = canvas();
      img.arrow(583, 60, CHEVRON.len * scale, CHEVRON.halfWidth * scale, -1);
      const c = comps(img)[0];
      assert.ok(isPlate(c), `scale ${scale}: span ${c.spanFrac.toFixed(3)} depth ${c.depthFrac.toFixed(3)} fill ${c.fill.toFixed(2)} elong ${c.elongation.toFixed(2)}`);
      assert.equal(classify(c), "object");
    }
  });

  it("keeps a thin outline OUT of the plate class — a card border is not a plate", () => {
    // The advisor card's `border-accent-2/60` is a 312 × 34 rounded rectangle
    // filling 3 % of its own box, and a recorded pc frame carries exactly that
    // at band x 834. MUTATION WATCHED: drop the fill clause and the HUD's own
    // hairline starts being treated as a compact object.
    const img = canvas();
    img.rect(834, 4, 312, 1);
    img.rect(834, 37, 312, 1);
    img.rect(834, 4, 1, 34);
    img.rect(1145, 4, 1, 34);
    const c = comps(img)[0];
    assert.ok(c.fill < OBJ_FILL, `fill ${c.fill.toFixed(2)} should be under ${OBJ_FILL}`);
    assert.equal(isPlate(c), false);
  });

  it("requires ALL FOUR clauses, so no single measurement can admit a road", () => {
    const ok = { elongation: 1.9, fill: 0.5, spanFrac: 0.05, depthFrac: 0.19 };
    assert.equal(isPlate(ok), true);
    assert.equal(isPlate({ ...ok, spanFrac: OBJ_SPAN_FRAC + 0.01 }), false);
    assert.equal(isPlate({ ...ok, depthFrac: OBJ_DEPTH_FRAC + 0.01 }), false);
    assert.equal(isPlate({ ...ok, fill: OBJ_FILL - 0.01 }), false);
    assert.equal(isPlate({ ...ok, elongation: OBJ_ELONGATION + 0.1 }), false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 THE SCREEN-FIXED FURNITURE
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§3 the furniture register subtracts what does not move", () => {
  const plateAt = (x) => {
    const img = canvas();
    img.arrow(x, 60, CHEVRON.len, CHEVRON.halfWidth, 1);
    return comps(img);
  };
  const reg = () => createFurnitureRegister({ w: W, h: H, cellPx: 4, minFrames: 4, minFrac: 0.8, window: 8 });

  it("marks a plate that has not moved for a window of frames", () => {
    const r = reg();
    for (let i = 0; i < 8; i++) r.observe(plateAt(583), { moving: true });
    assert.ok(r.stats().fixedCells > 0);
    assert.equal(r.isFixed(583, 60), true);
  });

  it("does NOT mark a plate that moves — that is the world going past", () => {
    const r = reg();
    for (let i = 0; i < 8; i++) r.observe(plateAt(200 + i * 90), { moving: true });
    assert.equal(r.isFixed(583, 60), false);
  });

  it("does not count STILL ticks — a parked car sees a static world", () => {
    // MUTATION WATCHED: drop the `moving` guard and every lane that waits at a
    // red light subtracts the road it was stopped on.
    const r = reg();
    for (let i = 0; i < 20; i++) r.observe(plateAt(583), { moving: false });
    assert.equal(r.frames(), 0);
    assert.equal(r.isFixed(583, 60), false);
  });

  it("REFUSES to call a road furniture, however still it looks", () => {
    // The vanishing point does not move. MUTATION WATCHED: delete `roadEver`
    // and a straight motorway's own line becomes screen-fixed and is deleted.
    const img = canvas();
    img.rect(180, 60, 611, 12);
    const road = comps(img);
    assert.equal(classify(road[0]), "line");
    const r = reg();
    for (let i = 0; i < 8; i++) r.observe(road, { moving: true });
    assert.equal(r.isFixed(400, 64), false);
  });

  it("forgets: a card that has gone stops being subtracted", () => {
    // The window is the whole reason this exists — MEASURED, a cell occupied in
    // ≥80 % of ALL of a lane's moving frames exists on 11 of 284 recorded lanes,
    // because the advisor card is up for PART of a drive. MUTATION WATCHED:
    // make the counter whole-drive and this goes red.
    const r = createFurnitureRegister({ w: W, h: H, cellPx: 4, minFrames: 4, minFrac: 0.8, window: 6 });
    for (let i = 0; i < 6; i++) r.observe(plateAt(583), { moving: true });
    assert.equal(r.isFixed(583, 60), true);
    for (let i = 0; i < 6; i++) r.observe([], { moving: true });
    assert.equal(r.isFixed(583, 60), false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 THE CHEVRON IS READ, NOT WEIGHED
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§4 chevronAim recovers the direction the arrow points", () => {
  for (const [name, dir] of [["left", -1], ["right", 1]]) {
    it(`reads an arrow pointing ${name} as ${name}`, () => {
      const img = canvas();
      img.arrow(583, 60, CHEVRON.len, CHEVRON.halfWidth, dir);
      const c = comps(img)[0];
      const r = chevronAim(c, { bandWidth: W });
      assert.equal(r.isChevron, true, r.why);
      assert.equal(r.dirSign, dir);
      assert.equal(Math.sign(r.lean), dir);
    });
  }

  it("agrees with the solved geometry of the product's own arrowhead", () => {
    // Tip 0.877 from the area centroid, wings 0.623 — a reach ratio of 1.41 —
    // and 45.3 % of the area beyond the centroid on the tip side. The recorded
    // chevrons read 1.29–1.40 and 0.45–0.47. If the rasterised shape does not
    // land in that window, the model is not describing the thing the product
    // paints and every direction read off it is a coincidence.
    const img = canvas();
    img.arrow(583, 60, CHEVRON.len, CHEVRON.halfWidth, 1);
    const c = comps(img)[0];
    assert.ok(c.reachRatio > 1.2 && c.reachRatio < 1.7, `reach ${c.reachRatio.toFixed(2)}`);
    assert.ok(c.tipMassFrac > 0.35 && c.tipMassFrac < 0.5, `tip mass ${c.tipMassFrac.toFixed(2)}`);
  });

  it("REFUSES a symmetric blob — a disc has no direction to read", () => {
    // MUTATION WATCHED: drop the reach-ratio clause and every round marker in
    // the scene starts voting on which way to turn. Measured: the reach clause
    // is the sole blocker on 321 of 6,426 plate-shaped components.
    const img = canvas();
    img.disc(583, 60, 18);
    const c = comps(img)[0];
    assert.ok(c.reachRatio < CHEVRON_MIN_REACH_RATIO, `reach ${c.reachRatio.toFixed(2)}`);
    assert.equal(chevronAim(c, { bandWidth: W }).isChevron, false);
  });

  it("REFUSES a club — the far end must be the LIGHT end, or it is not a point", () => {
    // SYNTHETIC ON PURPOSE, and the reason is itself a measurement: on the
    // recorded corpus this clause is the SOLE blocker on 26 of 6,426
    // plate-shaped components, so a natural raster that isolates it is rare.
    // The class is real — 588 components read a far-end mass above 0.55 — and
    // the clause is wired, which is what this asserts. MUTATION WATCHED: delete
    // the clause and a lit post with a heavy base votes on the turn.
    const club = { axisDefined: true, elongation: 2.0, spanFrac: 0.05, depthFrac: 0.19, fill: 0.5, reachRatio: 1.4, tipMassFrac: CHEVRON_MAX_TIP_MASS + 0.05, cx: 600, cy: 60, axisX: 1, axisY: 0, forward: 1, reachTip: 30 };
    const r = chevronAim(club, { bandWidth: W });
    assert.equal(r.isChevron, false);
    assert.match(String(r.why), /club/);
    // …and the same shape with a LIGHT far end is accepted, so the assertion
    // above is about this clause and not about one of the other three.
    assert.equal(chevronAim({ ...club, tipMassFrac: 0.45 }, { bandWidth: W }).isChevron, true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 THE WIRING — readAim, and the refusals it must keep
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§5 readAim", () => {
  it("is EXACTLY aimFrom when the scan kept no mask", () => {
    // A caller that has not opted in must not be silently switched onto a
    // different perception. MUTATION WATCHED: remove the early return.
    const img = canvas();
    img.rect(700, 50, 120, 90);
    const plain = scanBand(img);
    const a = aimFrom(plain);
    const b = readAim(plain);
    assert.equal(b.signal, "mass");
    assert.equal(b.aimPx, a.aimPx);
    assert.equal(b.confident, a.confident);
  });

  it("still returns seen:false on an empty band, never a zero", () => {
    const a = readAim(scanBand(canvas(), [], { keepMask: true }));
    assert.equal(a.seen, false);
    assert.equal(a.aimPx, null);
  });

  it("aims at the ROAD and not at a glowing object's mass", () => {
    // The objective marker is a bright disc close to the camera; the road is a
    // dim streak away to the left. Under the mass gate the disc drags the
    // centroid across the image. MUTATION WATCHED: feed `aimFrom` the whole
    // scan instead of the line components and this flips sign.
    const img = canvas();
    img.rect(120, 45, 300, 25); // the road, left of centre
    img.disc(950, 70, 26); // a marker, right of centre, saturated
    const a = readAim(scanBand(img, [], { keepMask: true }));
    assert.equal(a.signal, "line");
    assert.ok(a.aimPx < 0, `aim ${a.aimPx.toFixed(0)} should be LEFT of centre`);
    assert.ok(a.shape.objects >= 1 && a.shape.lines >= 1, JSON.stringify(a.shape));
  });

  it("uses the CHEVRON when the ribbon has left the windscreen", () => {
    // MUTATION WATCHED: delete the chevron branch and this returns
    // `source: "fragment"`, which can never authorise a manoeuvre — which is
    // exactly the junction the harness cannot drive.
    const img = canvas();
    img.arrow(420, 60, CHEVRON.len, CHEVRON.halfWidth, -1);
    const a = readAim(scanBand(img, [], { keepMask: true }));
    assert.equal(a.signal, "chevron");
    assert.equal(a.chevron.dirSign, -1);
    assert.equal(a.confident, true);
    assert.ok(a.aimPx < 0);
  });

  it("follows the ARROW when the ribbon disagrees, and RECORDS the disagreement", () => {
    // Measured over 4,870 recorded frames: arrow-first authorises 285 turn
    // demands of which 235 agree with the correct drive, against the line-only
    // 263/193 and the mass gate's 254/188. The disagreement is still written
    // down, because a run of them is a finding about the guidance layer.
    // MUTATION WATCHED: drop `conflict` and the record stops saying that two of
    // the product's own signals contradicted each other.
    const img = canvas();
    img.rect(800, 45, 300, 25); // road to the RIGHT
    img.arrow(300, 60, CHEVRON.len, CHEVRON.halfWidth, -1); // arrow pointing LEFT
    const a = readAim(scanBand(img, [], { keepMask: true }));
    assert.equal(a.signal, "chevron");
    assert.equal(a.conflict, true);
    assert.ok(a.aimPx < 0);
  });

  it("REFUSES a manoeuvre on fragments — the loud refusal this loop lost twice", () => {
    const img = canvas();
    for (let i = 0; i < 6; i++) img.rect(200 + i * 90, 60 + i * 3, 7, 7);
    const a = readAim(scanBand(img, [], { keepMask: true }));
    assert.equal(a.confident, false);
    assert.equal(a.signal, "fragment");
    assert.match(String(a.why), /road or an arrow/);
  });

  it("counts the road ALONE toward confidence, not the road plus the furniture", () => {
    // The point of the whole pass: `CONFIDENT_LINE_PX` is a statement about how
    // much ROAD is on the glass. MUTATION WATCHED: sum `legacy.total` instead
    // of `linePx` and a lane whose only teal is a bright marker reads confident.
    const img = canvas();
    img.rect(560, 45, 8, 45); // 360 px of road, well under the floor
    img.disc(900, 70, 26); // plus a big bright marker, ~2,100 px
    const s = scanBand(img, [], { keepMask: true });
    const a = readAim(s);
    assert.ok(s.total > CONFIDENT_LINE_PX, `the frame as a whole (${s.total} px) clears the floor`);
    assert.ok(a.shape.linePx < CONFIDENT_LINE_PX, `road alone ${a.shape.linePx} px`);
    assert.equal(a.signal, "line");
    assert.equal(a.confident, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 rowsFromPixels — the reduction the filtered aim is built on
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("§6 rowsFromPixels", () => {
  it("reproduces scanBand's rows when handed every component", () => {
    // If the two disagree, every filtered aim is measured on a different ruler
    // from the unfiltered one and no before/after number means anything.
    const img = canvas();
    img.rect(300, 40, 200, 90);
    img.disc(900, 120, 30);
    const s = scanBand(img, [], { keepMask: true });
    const cs = labelComponents(s.mask, W, H, { minPx: 24 });
    const r = rowsFromPixels(cs.map((c) => c.px), W, H);
    assert.equal(r.total, s.total);
    for (let y = 0; y < H; y++) {
      assert.equal(r.rows[y].n, s.rows[y].n, `row ${y} count`);
      if (s.rows[y].n) assert.ok(Math.abs(r.rows[y].cx - s.rows[y].cx) < 1e-9, `row ${y} centroid`);
    }
  });
});
