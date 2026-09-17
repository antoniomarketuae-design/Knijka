/**
 * path-plan.test.mjs — the committed witnesses, and the planners that made them.
 *
 * Run: node --test tools/mobile/__tests__/path-plan.test.mjs
 *
 * DESIGN-v2 §12.3. The planners are Slice 0's, ported verbatim; the synthetic
 * cases below are Slice 0's own `_selftest.mjs` and must reproduce its numbers.
 * Every committed pathref is then pinned from the OUTSIDE: its trace digest, its
 * car, an independent integrator that must reproduce its rows, the lock, a
 * global deviation measure, its classes, its bands, its stop arithmetic, its
 * speed profile — and `policy.mjs COMMITTED` must equal what it holds, because
 * the independent evidence gates against that table and may not read a pathref.
 *
 * The synthetic planner cases cost ≈ 50 s of CPU (the beam search is the point).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VEHICLE, maxSteerAtKmh, yawGainAtKmh } from "../lib/guidance.mjs";
import { samplesDigest, tangents, traceSamples, gearSegments, segmentPoints } from "../lib/path-plan/geom.mjs";
import { dubinsWords, planSegment } from "../lib/path-plan/planner.mjs";
import {
  ACCEPT_MIN_WIDTH_M, ARM_ROLL_ALLOW_M, ARM_ROLL_EXP_M, COMMITTED, CORRIDOR_ALLOWANCE_M, FORWARD_EXPECT, PATH_LESSONS,
  PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M, PRODUCT, REST_BACK_M, REVERSE_LOCK_AUTHORITY, REVERSE_POLICY, TRACK, bayFrame,
} from "../lib/path-plan/policy.mjs";
import { CHASSIS_HALF, FLEET_BODY_HALF, PARKED_WEIGHTS, assignCivilianModel } from "../lib/path-plan/body-screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const DIR = resolve(REPO, "tools", "mobile", "path-refs");
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const REFS = readdirSync(DIR).filter((f) => f.endsWith(".pathref.json")).map((f) => JSON.parse(readFileSync(resolve(DIR, f), "utf8")));
const traceOf = (l) => readFileSync(resolve(REPO, "content", "traces", l, "shadow-correct.trace.json"), "utf8");

/**
 * THE ROW THE PARK BOX IS ASKED OF — which is NOT the row the witness ends on.
 *
 * A reverse aims its final stop at the witness end and comes to rest REST_BACK_M
 * short of it (policy.mjs: the pinned brake model's own unspent coast reserve,
 * the browser's 0.195 m and 78 bench drives at a median of 0.300 m). Until
 * 2026-09-16 every assertion below measured the LAST row, which is the pose the
 * follower aims at and never occupies, so a witness could be pinned «inside the
 * box» while the car it plans for rests outside it — which is exactly what
 * sc-park-wall and sc-park-van did.
 *
 * The index is stored on the witness and RE-DERIVED here from the rows, so a
 * wrong one cannot pass; a witness that carries none is a REFUSAL by name, never
 * a silent fall back to the last row. The six lessons that predate the clearance
 * objective carry neither field and are measured at their end, as before —
 * they are excluded from these assertions a few lines further down anyway.
 */
const gradedRow = (w) => {
  const lastIdx = w.rows.length - 1;
  if (!w.clearancePlan?.objective) return lastIdx;
  assert.equal(typeof w.gradedRowIndex, "number", `witness ${w.startAlongM} carries no gradedRowIndex — the park box would be measured at the row the follower AIMS at, ${REST_BACK_M} m past where the car comes to rest`);
  assert.equal(w.gradedBackM, REST_BACK_M, `witness ${w.startAlongM} was graded ${w.gradedBackM} m back where policy.mjs REST_BACK_M is ${REST_BACK_M}`);
  const target = w.rows[lastIdx][0] - REST_BACK_M;
  let want = 0;
  for (let j = lastIdx; j >= 0; j--) if (w.rows[j][0] <= target + 1e-9) { want = j; break; }
  assert.equal(w.gradedRowIndex, want, `witness ${w.startAlongM} stored gradedRowIndex ${w.gradedRowIndex}, but its own rows put ${REST_BACK_M} m back at ${want}`);
  return want;
};

describe("§1 the Slice 0 planners reproduce their own self-test", () => {
  const mk = (f, L) => {
    const n = Math.floor(L / 0.05) + 1;
    const X = new Float64Array(n);
    const Y = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const [x, y] = f(Math.min(L, k * 0.05));
      X[k] = x;
      Y[k] = y;
    }
    return { X, Y, n, ds: 0.05, L };
  };
  const box = { posM: 0.5, yawDeg: 10 };
  const R4 = 4.3;
  const cases = [
    ["a straight reverse", mk((u) => [0, 10 - u], 10), -1, { x: 0, y: 10, psi: 0 }, { x: 0, y: 0, psi: 0 }, 0.0],
    ["a reverse R 4.3 m quarter arc with NO lead", mk((u) => { const p = u / R4; return [R4 - R4 * Math.cos(p), -R4 * Math.sin(p)]; }, (R4 * Math.PI) / 2), -1, { x: 0, y: 0, psi: 0 }, { x: R4, y: -R4, psi: -90 }, 0.98],
    ["the same arc after a 2.5 m straight lead", mk((u) => { if (u <= 2.5) return [0, -u]; const p = (u - 2.5) / R4; return [R4 - R4 * Math.cos(p), -2.5 - R4 * Math.sin(p)]; }, 2.5 + (R4 * Math.PI) / 2), -1, { x: 0, y: 0, psi: 0 }, { x: R4, y: -2.5 - R4, psi: -90 }, 0.08],
    ["a forward R 5 m quarter arc", mk((u) => { const p = u / 5; return [5 - 5 * Math.cos(p), 5 * Math.sin(p)]; }, (5 * Math.PI) / 2), 1, { x: 0, y: 0, psi: 0 }, { x: 5, y: 5, psi: 90 }, 0.1],
    ["a forward R 3.0 m arc (tighter than the car)", mk((u) => { if (u <= 3) return [0, u]; const p = (u - 3) / 3; return [3 - 3 * Math.cos(p), 3 + 3 * Math.sin(p)]; }, 3 + (3 * Math.PI) / 2), 1, { x: 0, y: 0, psi: 0 }, { x: 3, y: 6, psi: 90 }, null],
  ];
  for (const [name, ref, sigma, start, end, want] of cases) {
    it(`${name}: ${want === null ? "no witness" : `${want.toFixed(2)} m`}`, () => {
      const r = planSegment({ ref, T: tangents(ref), sigma, start, end, box, vAtArc: () => 3 }, { quick: true });
      if (want === null) assert.equal(r.best, null);
      else assert.ok(Math.abs(r.best.maxDevM - want) <= 0.01, `${r.best?.maxDevM} vs ${want}`);
    });
  }

  it("Dubins words land on the goal pose for 300 random pairs", () => {
    let s = 5;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const alpha = rnd() * 2 * Math.PI;
      const beta = rnd() * 2 * Math.PI;
      const d = 0.5 + rnd() * 6;
      const words = dubinsWords(alpha, beta, d);
      assert.ok(words.length >= 1);
      for (const [name, t, p, q] of words) {
        let x = 0;
        let y = 0;
        let th = alpha;
        for (const [ch, len] of [[name[0], t], [name[1], p], [name[2], q]]) {
          if (ch === "S") { x += len * Math.cos(th); y += len * Math.sin(th); continue; }
          const sgn = ch === "L" ? 1 : -1;
          const th1 = th + sgn * len;
          x += sgn * (Math.sin(th1) - Math.sin(th));
          y += sgn * (-Math.cos(th1) + Math.cos(th));
          th = th1;
        }
        assert.ok(Math.hypot(x - d, y) < 1e-6, `${name} ends ${x.toFixed(4)},${y.toFixed(4)} not ${d},0`);
        const dth = Math.atan2(Math.sin(th - beta), Math.cos(th - beta));
        assert.ok(Math.abs(dth) < 1e-6, `${name} heading off by ${dth}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 300);
  });
});

/** An INDEPENDENT integrator (not build-pathrefs.mjs's): rear axle a unicycle, centre 1.28 m ahead. */
function reintegrate(rows, sigma, kappaScale) {
  const L = VEHICLE.WHEELBASE_M;
  const a = L / 2;
  const h = 0.1;
  let psi = rows[0][5];
  let rx = rows[0][1] - a * Math.sin(psi * RAD);
  let ry = -rows[0][2] - a * Math.cos(psi * RAD);
  let worst = 0;
  for (let k = 1; k < rows.length; k++) {
    const d = rows[k][6];
    const v = rows[k][8];
    const dpsi = ((sigma * yawGainAtKmh(v) * kappaScale * Math.tan(d)) / L) * h * DEG;
    const mid = (psi + dpsi / 2) * RAD;
    rx += sigma * Math.sin(mid) * h;
    ry += sigma * Math.cos(mid) * h;
    psi += dpsi;
    const cx = rx + a * Math.sin(psi * RAD);
    const cz = -(ry + a * Math.cos(psi * RAD));
    worst = Math.max(worst, Math.hypot(cx - rows[k][1], cz - rows[k][2]));
  }
  return worst;
}

/** Global point-to-segment distance of a point to a polyline (no window). */
function globalDist(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * vx - px, az + t * vz - pz));
  }
  return best;
}

/** An independent 15-line moving-median profile (§6.2, N3). */
function medianProfile(samples, i0, i1) {
  const bins = [];
  let arc = 0;
  for (let i = i0; i <= i1; i++) {
    if (i > i0) arc += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    (bins[Math.floor(arc)] ??= []).push(Math.abs(samples[i].speedKmh));
  }
  const med = Array.from({ length: bins.length }, (_, i) => bins[i]).map((b) => { const m = (b ?? []).filter((x) => x > 1).sort((p, q) => p - q); return m.length ? m[(m.length - 1) >> 1] : null; });
  return med.map((v, b) => {
    if (v !== null) return Math.round(v * 100) / 100;
    for (let dd = 1; dd < med.length; dd++) {
      const c = [med[b - dd], med[b + dd]].filter((x) => x !== null && x !== undefined);
      if (c.length) return Math.round(Math.min(...c) * 100) / 100;
    }
    return null;
  });
}

describe("§2 every committed pathref, from the outside", () => {
  it("there is one per Slice 1 lesson and none has a problem", () => {
    assert.deepEqual(REFS.map((r) => r.lesson).sort(), [...PATH_LESSONS].sort());
    for (const r of REFS) assert.deepEqual(r.problems, [], `${r.lesson}: ${r.problems.join(" | ")}`);
  });

  for (const ref of REFS) {
    describe(ref.lesson, () => {
      const text = traceOf(ref.lesson);
      const doc = JSON.parse(text);

      it("is not stale, and its car is VEHICLE", () => {
        assert.equal(ref.trace.samplesDigest, samplesDigest(text));
        assert.equal(ref.car.L, VEHICLE.WHEELBASE_M);
        assert.equal(ref.car.lock, VEHICLE.MAX_ANGLE_RAD);
        assert.equal(ref.car.minLock, VEHICLE.MIN_ANGLE_RAD);
        assert.equal(ref.car.fullLockKmh, VEHICLE.FULL_LOCK_KMH);
        assert.equal(ref.car.minLockKmh, VEHICLE.MIN_LOCK_KMH);
        assert.equal(ref.car.steerRate, VEHICLE.STEER_SPEED);
        assert.equal(ref.generator.kappaScale, 0.95);
      });

      /* THE REVERSE WHEEL THE CAR HAS (2026-09-16). A witness integrated at κ 0.95 that
       * turns the wheel to the product's lock asks the car for more curvature than it
       * delivers in reverse (policy.mjs REVERSE_LOCK_AUTHORITY, 0.892 measured), and a
       * saturated follower cannot correct what that costs. The builder records the
       * authority it planned with in `generator.reverseAuthority`; the rows are checked
       * against it here with this file's own arithmetic, not the planner's `lockFor`.
       * A pathref with a reverse segment and NO recorded authority is not silently
       * passed: it must be one of the lessons named as built before the cap existed. */
      it("its reverse witnesses never ask for more wheel than the car has in reverse", () => {
        const PLANNED_BEFORE_THE_CAP = ["sc-park-wall", "sc-park-judge", "sc-park-45-rev", "sc-pk-driveway", "sc-ed-poligon-chain", "sc-park-gap-short", "sc-park-bay-exit-rev"];
        const reverse = ref.segments.filter((sg) => sg.gear === -1);
        if (!reverse.length) return; // nothing to cap: a lesson with no reverse segment
        const auth = ref.generator.reverseAuthority;
        if (auth === undefined) {
          assert.ok(PLANNED_BEFORE_THE_CAP.includes(ref.lesson), `${ref.lesson} has reverse segments and records no generator.reverseAuthority — UNREADABLE: nobody can say what wheel its reverse witnesses were allowed`);
          return;
        }
        assert.equal(auth, REVERSE_LOCK_AUTHORITY, `${ref.lesson} was planned with a reverse authority of ${auth}, policy.mjs holds ${REVERSE_LOCK_AUTHORITY}`);
        assert.ok(!PLANNED_BEFORE_THE_CAP.includes(ref.lesson), `${ref.lesson} is named as planned before the cap but records one — take it off the list`);
        let rows = 0;
        for (const sg of reverse) {
          for (const w of sg.witnesses) {
            for (const row of w.rows) {
              const cap = Math.atan((auth / ref.generator.kappaScale) * Math.tan(maxSteerAtKmh(row[8])));
              assert.ok(Math.abs(row[6]) <= cap + 5e-5 + 1e-12, `${ref.lesson} R${sg.k} witness ${w.startAlongM} s ${row[0]}: |δ| ${row[6]} > the reverse cap ${cap.toFixed(5)} (stored δ is rounded to 1e-4)`);
              rows += 1;
            }
          }
        }
        assert.ok(rows > 0, `${ref.lesson}: no reverse row was checked`);
      });

      it("every witness is reproduced by an independent integrator within 0.01 m and never exceeds lock(v)", () => {
        for (const sg of ref.segments) {
          for (const w of sg.witnesses) {
            assert.ok(reintegrate(w.rows, sg.gear, ref.generator.kappaScale) <= 0.01, `${ref.lesson} seg ${sg.k} witness ${w.startAlongM}`);
            for (const row of w.rows) assert.ok(Math.abs(row[6]) <= maxSteerAtKmh(row[8]) + 1e-9, `${ref.lesson} seg ${sg.k}: |δ| ${row[6]} > lock(${row[8]})`);
          }
        }
      });

      it("the stored worst deviation agrees with a global point-to-segment measure", () => {
        const S = traceSamples(doc);
        const segs = gearSegments(S);
        for (const sg of ref.segments) {
          const g = segs.find((x) => x.k === sg.k);
          const base = segmentPoints(S, g).map(([x, y]) => [x, -y]);
          for (const w of sg.witnesses) {
            if (sg.micro) continue;
            const h0 = { x: Math.sin(sg.authoredStart.psi * RAD), z: -Math.cos(sg.authoredStart.psi * RAD) };
            const h1 = { x: Math.sin(sg.authoredEnd.psi * RAD), z: -Math.cos(sg.authoredEnd.psi * RAD) };
            const poly = sg.gear === -1
              ? [[base[0][0] + 3 * h0.x, base[0][1] + 3 * h0.z], ...base]
              : [...base, [base[base.length - 1][0] + 12 * h1.x, base[base.length - 1][1] + 12 * h1.z]];
            const from = sg.acquiredFrom ? 100 : 0;
            let worst = 0;
            for (let i = from; i < w.rows.length; i++) worst = Math.max(worst, globalDist(w.rows[i][1], w.rows[i][2], poly));
            assert.ok(worst <= w.worstDevM + 0.025, `${ref.lesson} seg ${sg.k} witness ${w.startAlongM}: global ${worst.toFixed(3)} > stored ${w.worstDevM} + 0.025`);
          }
        }
      });

      it("its classes are the policy's, its bands' corners are in corridor, its stop arithmetic holds", () => {
        for (const sg of ref.segments) {
          if (sg.gear === 1) {
            const exp = FORWARD_EXPECT[ref.lesson]?.[sg.k];
            if (exp && !sg.acquiredFrom) assert.equal(sg.class, exp[0], `${ref.lesson} F${sg.k}`);
            continue;
          }
          const p = REVERSE_POLICY[ref.lesson][sg.k];
          assert.equal(sg.class, p.classAtAuthored);
          for (const w of sg.witnesses) {
            const e = p.expect[String(w.startAlongM)];
            if (e && !p.designedNegative) assert.equal(w.class, e[0], `${ref.lesson} R${sg.k} grid ${w.startAlongM}`);
          }
          if (p.designedNegative) {
            assert.equal(sg.designedNegative, true);
            continue;
          }
          for (const c of sg.armBand.corners.filter((x) => sg.armBand.alongM.includes(x.along) && sg.armBand.latM.includes(x.lat) && sg.armBand.yawDeg.includes(x.yaw))) {
            assert.ok(c.worstDevM <= c.corridorM, `${ref.lesson} R${sg.k} corner ${c.along}/${c.lat}/${c.yaw}: ${c.worstDevM} > ${c.corridorM}`);
          }
          const [alongMin, alongMax] = sg.armBand.alongM;
          const st = sg.stopTarget;
          assert.deepEqual(st.acceptAlongM, [Math.round((alongMin + ARM_ROLL_ALLOW_M) * 1000) / 1000, alongMax]);
          assert.ok(st.acceptAlongM[1] - st.acceptAlongM[0] >= ACCEPT_MIN_WIDTH_M - 1e-9);
          const want = Math.min(Math.max(p.policyStartTargetM + ARM_ROLL_EXP_M, st.acceptAlongM[0] + 0.4), alongMax - 0.5);
          assert.ok(Math.abs(st.alongM - want) <= 1e-3, `${ref.lesson} R${sg.k} stop target ${st.alongM} vs ${want}`);
          assert.ok(st.alongM - ARM_ROLL_ALLOW_M >= alongMin - 1e-9, "a stop on target that rolls the full allowance still starts inside the screened band");
        }
      });

      it("its speed profiles are the trace's, with no empty bin", () => {
        for (const sg of ref.segments) {
          assert.ok(sg.speed.movingMedianKmh.every((b) => b !== null));
          assert.equal(sg.speed.movingMedianKmh.length > 0, true);
          // the builder bins from the segment's first sample index (i0), which the trace segmentation owns
          const S = traceSamples(doc);
          const g = gearSegments(S).find((x) => x.k === sg.k);
          assert.deepEqual(sg.speed.movingMedianKmh, medianProfile(doc.samples, g.i0, g.i1), `${ref.lesson} seg ${sg.k}`);
        }
      });

      it("its graded stop is inside BOTH park rules, and never worse than the drive it was planned from", () => {
        // TWO rules read this box and they are not the same rule: the product
        // credits a park on a RECTANGLE (objectives.ts:5792-5795), the harness judges
        // it on a RADIUS — the debrief's «отместване X м» against centerTolM
        // (path-follow.mjs productParkWitness) — and a stop outside THAT books the
        // segment UNJUDGED, which is the one outcome these legs cannot afford.
        // Measured on a build gated on the rectangle alone: three of nine stops sat
        // at a radius of 0.51–0.53 m against a 0.5 m tolerance.
        //
        // Two lessons' demonstrations stop short of their own painted bay
        // (sc-park-gap-short lon −0.624 m, sc-park-judge −0.744 m), so the product
        // box cannot be asked of a plan that must reach the authored goal. The floor
        // there is the DEMONSTRATION: each tolerance below is the larger of the
        // product's and what the authored end itself achieves, so a committed stop
        // can never be worse than both. A build that declared the box simply
        // «non-binding» for those two put sc-park-gap-short's stops at 12.4–12.9° off
        // the bay axis where its demonstration is 2.96°.
        const park = PRODUCT[ref.lesson]?.park;
        if (!park) return;
        const lastR = [...ref.segments].reverse().find((s) => s.gear === -1);
        const k = park.seg === "last" ? lastR?.k : park.seg;
        const seg = ref.segments.find((s) => s.k === k);
        if (!seg || seg.gear !== -1) return;
        const b = park.bay;
        const ah = Math.sin(b.headingDeg * RAD);
        const bh = Math.cos(b.headingDeg * RAD);
        const lonTol = Math.max(park.centerTolM, b.lengthM / 2 - PLAYER_HALF_LENGTH_M);
        const latTol = Math.min(park.centerTolM, b.widthM / 2 - PLAYER_HALF_WIDTH_M);
        const at = (cx, cy, psi) => {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const d = Math.abs(((((psi - b.headingDeg + 180) % 360) + 360) % 360) - 180);
          const lon = dx * ah + dy * bh;
          const lat = dx * bh - dy * ah;
          return { lon, lat, radiusM: Math.hypot(lon, lat), headingOffsetDeg: Math.min(d, 180 - d) };
        };
        const e = at(seg.authoredEnd.x, -seg.authoredEnd.z, seg.authoredEnd.psi);
        const cap = {
          lon: Math.max(lonTol, Math.abs(e.lon)),
          lat: Math.max(latTol, Math.abs(e.lat)),
          radius: Math.max(park.centerTolM, e.radiusM),
          heading: Math.max(park.headingTolDeg, e.headingOffsetDeg),
        };
        const inProduct = Math.abs(e.lon) <= lonTol + 1e-9 && Math.abs(e.lat) <= latTol + 1e-9 && e.headingOffsetDeg <= park.headingTolDeg + 1e-9 && e.radiusM <= park.centerTolM + 1e-9;
        // The five lessons the body screen refused were re-planned with clearance in
        // the objective and are held to everything below. The rest predate it and were
        // never held to it — and one measurably fails it: sc-park-judge R1 witness 0
        // stops at a radius of 0.771 m where its own demonstration reaches 0.744, 27 mm
        // worse. Both are outside the 0.5 m the harness judges with, so that segment's
        // park is UNJUDGED either way and the 27 mm changes nothing; it is named here
        // so it cannot spread to a lesson that WAS re-planned without anyone noticing.
        const NOT_REPLANNED = ["sc-park-judge", "sc-park-45-rev", "sc-pk-driveway", "sc-ed-poligon-chain", "sc-park-gap-long", "sc-park-bay-exit-rev"];
        for (const w of seg.witnesses) {
          const last = w.rows[gradedRow(w)];
          const q = at(last[1], -last[2], last[5]);
          const rule = w.clearancePlan?.stopRule ?? "(no clearance plan — this witness predates the objective)";
          if (!w.clearancePlan?.objective) {
            assert.ok(NOT_REPLANNED.includes(ref.lesson), `${ref.lesson} R${k} witness ${w.startAlongM} was re-planned with the clearance objective but carries no clearance plan`);
            continue;
          }
          const where = `lon ${q.lon.toFixed(3)}/${cap.lon.toFixed(3)}, lat ${q.lat.toFixed(3)}/${cap.lat.toFixed(3)}, radius ${q.radiusM.toFixed(3)}/${cap.radius.toFixed(3)}, heading ${q.headingOffsetDeg.toFixed(2)}/${cap.heading.toFixed(2)} — stop rule: ${rule}`;
          assert.ok(q.radiusM <= cap.radius + 1e-9, `${ref.lesson} R${k} witness ${w.startAlongM} stops outside the RADIUS the harness judges with (${where})`);
          assert.ok(Math.abs(q.lon) <= cap.lon + 1e-9, `${ref.lesson} R${k} witness ${w.startAlongM} stops deeper than the product box and than the demonstration (${where})`);
          assert.ok(Math.abs(q.lat) <= cap.lat + 1e-9, `${ref.lesson} R${k} witness ${w.startAlongM} stops wider than the product box and than the demonstration (${where})`);
          assert.ok(q.headingOffsetDeg <= cap.heading + 1e-9, `${ref.lesson} R${k} witness ${w.startAlongM} stops further off the bay axis than the product box and than the demonstration (${where})`);
          if (!inProduct) continue;
          // where the product box IS reachable, the drive still has to be able to land
          // in it: 0.088 m is the worst following error ever measured (BODY_FLOOR_M's
          // first term), and a stop that leaves less than that is credited on paper only.
          const room = Math.min(lonTol - Math.abs(q.lon), latTol - Math.abs(q.lat), park.centerTolM - q.radiusM);
          assert.ok(room >= 0.088 - 1e-9, `${ref.lesson} R${k} witness ${w.startAlongM} leaves only ${room.toFixed(3)} m of room, under the 0.088 m a drive spends tracking it (${where})`);
        }
      });

      /* THE MISS IS MEASURED AND IT IS NEVER SILENT (2026-09-16).
       *
       * The test above caps a stop against the DEMONSTRATION where the product box
       * is out of reach, which is the right acceptance rule and is also why two of
       * sc-park-gap-short's three committed stops sat outside the product's own box
       * for weeks without anything saying so. Two DIFFERENT rules read that box —
       * the product credits a park on a RECTANGLE, the harness judges it on a
       * RADIUS — and a stop outside either wastes the drive: outside the rectangle
       * the product may not credit the park, outside the radius the harness books
       * the segment UNJUDGED, «THE HARNESS MISSED THE BOX».
       *
       * So every committed stop now CARRIES where it landed by both rules, and a
       * witness that misses must be named in the pathref's own `caveats` — which
       * `lesson-audit.mjs` prints into every path drive's run.log as «CAVEAT: …», so
       * the drive that will be judged on that stop carries the warning itself. */
      it("every committed stop carries where it landed in BOTH park rules, and a miss is a caveat on the pathref", () => {
        const park = PRODUCT[ref.lesson]?.park;
        if (!park) return;
        const lastR = [...ref.segments].reverse().find((x) => x.gear === -1);
        const k = park.seg === "last" ? lastR?.k : park.seg;
        const seg = ref.segments.find((x) => x.k === k);
        if (!seg) return;
        const b = park.bay;
        const lonTol = Math.max(park.centerTolM, b.lengthM / 2 - PLAYER_HALF_LENGTH_M);
        const latTol = Math.min(park.centerTolM, b.widthM / 2 - PLAYER_HALF_WIDTH_M);
        const ah = Math.sin((b.headingDeg * Math.PI) / 180);
        const bh = Math.cos((b.headingDeg * Math.PI) / 180);
        for (const w of seg.witnesses) {
          if (!w.clearancePlan?.objective) continue; // predates the objective; measured by the test above
          assert.ok(w.endParkBox, `${ref.lesson} R${k} witness ${w.startAlongM} carries no endParkBox — the miss would be invisible again`);
          assert.equal(typeof w.endInsideParkBox, "boolean", `${ref.lesson} R${k} witness ${w.startAlongM} endInsideParkBox`);
          // the stored measurement is re-derived here from the rows, independently
          const last = w.rows[gradedRow(w)];
          const dx = last[1] - b.x;
          const dy = -last[2] - b.y;
          const lon = dx * ah + dy * bh;
          const lat = dx * bh - dy * ah;
          const dd = Math.abs((((last[5] - b.headingDeg) % 360) + 540) % 360 - 180);
          const hd = Math.min(dd, 180 - dd);
          const radiusM = Math.hypot(lon, lat);
          const inRect = Math.abs(lon) <= lonTol + 1e-9 && Math.abs(lat) <= latTol + 1e-9 && radiusM <= park.centerTolM + 1e-9 && hd <= park.headingTolDeg + 1e-9;
          const inRad = radiusM <= park.centerTolM + 1e-9;
          assert.ok(Math.abs(w.endParkBox.lonM - lon) < 2e-3, `${ref.lesson} w${w.startAlongM} stored lon ${w.endParkBox.lonM} vs measured ${lon.toFixed(3)}`);
          assert.ok(Math.abs(w.endParkBox.radiusM - radiusM) < 2e-3, `${ref.lesson} w${w.startAlongM} stored radius ${w.endParkBox.radiusM} vs measured ${radiusM.toFixed(3)}`);
          assert.equal(w.endInsideParkBox, inRect && inRad, `${ref.lesson} w${w.startAlongM} stored endInsideParkBox ${w.endInsideParkBox} vs measured rect ${inRect} radius ${inRad}`);
          // THE PRODUCT GATE IS THE INTERSECTION. A rung-2 stop passed the product
          // gate, so it must be inside the RADIUS too — the bug this replaced tested
          // the rectangle and the heading and not the radius.
          if (w.stopRung === 1 || w.stopRung === 2) {
            assert.ok(inRad, `${ref.lesson} w${w.startAlongM} took rung ${w.stopRung} (the PRODUCT box) and still stops at a radius of ${radiusM.toFixed(3)} m against ${park.centerTolM}`);
            assert.equal(w.endInsideParkBox, true, `${ref.lesson} w${w.startAlongM} took rung ${w.stopRung} but is not inside both rules`);
          }
          // AND A MISS IS NEVER SILENT
          if (w.endInsideParkBox === false) {
            assert.ok(
              (ref.caveats ?? []).some((pr) => pr.includes("OUTSIDE the product park box") && pr.includes(`witness ${w.startAlongM}`)),
              `${ref.lesson} R${k} witness ${w.startAlongM} stops outside the product park box and the pathref carries no caveat saying so: ${JSON.stringify(ref.caveats)}`,
            );
          }
        }
      });

      it("policy.mjs COMMITTED holds exactly this pathref's surviving bands and corridors", () => {
        const table = COMMITTED[ref.lesson];
        assert.ok(table, `COMMITTED has no ${ref.lesson}`);
        for (const sg of ref.segments) {
          const row = table[sg.k];
          assert.ok(row, `COMMITTED ${ref.lesson} ${sg.k}`);
          const corridor = sg.gear === -1
            ? Math.max(...sg.witnesses.map((w) => w.corridorM))
            : Math.round(Math.min(1.5, (sg.witnesses[0].worstDevIncludingAcquisitionM ?? sg.witnesses[0].worstDevM) + CORRIDOR_ALLOWANCE_M) * 1000) / 1000;
          assert.equal(row.corridorM, corridor, `${ref.lesson} seg ${sg.k} corridor`);
          if (sg.gear === -1) {
            const band = sg.designedNegative ? sg.spawnBand : sg.armBand;
            assert.deepEqual(row.band, { alongM: band.alongM, latM: band.latM, yawDeg: band.yawDeg });
          } else assert.equal(row.band, undefined);
        }
      });
    });
  }

  it("the reverse authority is LIVE: the lessons planned with it have rows standing on the cap, not merely under it", () => {
    // A cap no row reaches would pass the per-lesson test above whether or not the planner
    // ever read it. The planner saturates a clearance-maximising reverse, so if the cap is
    // what it saturates against, rows sit ON it (stored δ is rounded to 1e-4).
    let capped = 0;
    let onCap = 0;
    for (const ref of REFS) {
      const auth = ref.generator.reverseAuthority;
      if (auth === undefined) continue;
      capped += 1;
      for (const sg of ref.segments.filter((x) => x.gear === -1)) {
        for (const w of sg.witnesses) {
          for (const row of w.rows) {
            const cap = Math.atan((auth / ref.generator.kappaScale) * Math.tan(maxSteerAtKmh(row[8])));
            if (Math.abs(Math.abs(row[6]) - cap) <= 5e-5) onCap += 1;
          }
        }
      }
    }
    assert.ok(capped >= 1, "no committed pathref records a reverse authority — the cap is unexercised");
    assert.ok(onCap > 0, `${capped} pathref(s) record a reverse authority and not one reverse row stands on its cap — nothing shows the planner read it`);
  });

  it("sc-park-bay-exit-rev R0's re-planned witness ends inside Задача 1's zone (r 2.5 m around (1.0, −3.03))", () => {
    const ref = REFS.find((r) => r.lesson === "sc-park-bay-exit-rev");
    const w = ref.segments[0].witnesses[0];
    const last = w.rows[w.rows.length - 1];
    assert.ok(Math.hypot(last[1] - 1.0, -last[2] - -3.03) <= 2.5, `ends at ${last[1]}, ${-last[2]}`);
    assert.equal(ref.segments[0].designedNegative, true);
    assert.equal(TRACK, "FEASIBLE-TRACK");
  });
});

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

/* ═══════════ §5 THE BAY IS THE PRODUCT'S OWN, AND THE CHASSIS IS ONE BOX ═══════════
 *
 * WHAT §5 USED TO BE, AND WHERE ITS JOB WENT (2026-09-16). This block re-derived
 * `policy.mjs BAY_FLANKS` — a hand-kept scalar face per side of each bay — from the
 * district JSON and the three platform sources that mount and size the bodies, so that a
 * moved constant could not leave the table silently stale. The TABLE is retired: it was a
 * proxy for body clearance, and `body-screen.mjs mountedBodies` now derives every body from
 * those same sources AT RUN TIME instead of keeping a copy to check. Its verification job
 * moved with it, and is larger there than it was here — `__tests__/path-body-screen.test.mjs`
 * re-measures the fleet half extents off the shipped GLBs (§2), refuses an unreadable
 * district, a non-array `bays` and an occupied bay with no finite pose by name, and pins that
 * the mounted model is a deterministic function of the bay's index.
 *
 * TWO THINGS §5 CHECKED THAT LIVE NOWHERE ELSE, SO THEY STAY HERE. */
describe("§5 the bay is the product's own, and the chassis is one box", () => {
  it("PRODUCT[lesson].park.bay IS the district's target bay — the harness never parks against a bay it invented", () => {
    const WORLDS = {
      "sc-park-left": "lot-left-v1", "sc-park-wall": "lot-wall-v1", "sc-park-van": "lot-van-v1",
      "sc-park-45-rev": "lot-45rev-v1", "sc-pk-driveway": "pk-drive-v1", "sc-park-gap-short": "lot-gap-short-v1",
      "sc-park-zebra": "lot-zebra-v1", "sc-park-judge": "lot-gap-judge-v1", "sc-park-gap-long": "lot-gap-long-v1",
    };
    let checked = 0;
    for (const [lesson, world] of Object.entries(WORLDS)) {
      const sc = JSON.parse(readFileSync(resolve(REPO, "content", "world", `${world}.json`), "utf8")).meta?.scenario;
      const bay = PRODUCT[lesson]?.park?.bay;
      assert.ok(bay, `${lesson}: PRODUCT carries no park bay`);
      if (!sc?.targetBayId) continue;                       // a district that names no target
      const t = (sc.bays ?? []).find((b) => b.id === sc.targetBayId);
      assert.ok(t, `${lesson}: ${world} names targetBayId ${sc.targetBayId} and has no such bay — UNRESOLVED, not "no target"`);
      assert.deepEqual({ x: t.x, y: t.y, headingDeg: t.headingDeg, widthM: t.widthM, lengthM: t.lengthM }, bay, `${lesson}: PRODUCT's bay is not the district's target bay`);
      checked += 1;
    }
    assert.ok(checked >= 5, `only ${checked} lessons had a target bay to check — the districts changed shape, re-read this test`);
  });

  it("the parallel kerb slots really have no flank: their occupants stand fore and aft of the bay axis", () => {
    for (const [lesson, world] of Object.entries({ "sc-park-gap-short": "lot-gap-short-v1", "sc-park-zebra": "lot-zebra-v1", "sc-park-judge": "lot-gap-judge-v1", "sc-park-gap-long": "lot-gap-long-v1" })) {
      const w = JSON.parse(readFileSync(resolve(REPO, "content", "world", `${world}.json`), "utf8"));
      const bay = PRODUCT[lesson].park.bay;
      const occupied = w.meta.scenario.bays.filter((x) => x.occupied);
      assert.ok(occupied.length >= 1, `${lesson}: no occupied bay read`);
      for (const b of occupied) near(bayFrame(bay, b.x, -b.y).latM, 0, 1e-9, `${lesson} ${b.id}`);
    }
  });

  it("the player chassis is ONE box: policy.mjs's half extents are body-screen.mjs's CHASSIS_HALF", () => {
    // policy.mjs keeps its own copy because it is imported by everything and body-screen.mjs
    // reads the filesystem; the two must never drift, and this is where that is enforced.
    assert.equal(PLAYER_HALF_WIDTH_M, CHASSIS_HALF.across);
    assert.equal(PLAYER_HALF_LENGTH_M, CHASSIS_HALF.along);
  });
});
