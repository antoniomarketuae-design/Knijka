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
  ACCEPT_MIN_WIDTH_M, ARM_ROLL_ALLOW_M, ARM_ROLL_EXP_M, BAY_CLEARANCE_MARGIN_M, BAY_FLANKS, BAY_MOUTH_INSET_M, COMMITTED, CORRIDOR_ALLOWANCE_M, FORWARD_EXPECT, PATH_LESSONS,
  PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M, PRODUCT, REVERSE_POLICY, TRACK, bayFrame, bayLateralLimits,
} from "../lib/path-plan/policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const DIR = resolve(REPO, "tools", "mobile", "path-refs");
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const REFS = readdirSync(DIR).filter((f) => f.endsWith(".pathref.json")).map((f) => JSON.parse(readFileSync(resolve(DIR, f), "utf8")));
const traceOf = (l) => readFileSync(resolve(REPO, "content", "traces", l, "shadow-correct.trace.json"), "utf8");

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

/* ═══════════════ §5 THE IN-BAY LATERAL LIMIT IS THE PRODUCT'S OWN GEOMETRY ═══════════════
 *
 * policy.mjs BAY_FLANKS is re-derived here from the district JSON the lesson loads and from the
 * three platform sources that mount and size its bodies. Every source is READ, never assumed: a
 * pattern that does not match is `unresolved` and fails (memory a-matcher-must-report-what-it-
 * cannot-read), so a moved constant cannot leave this table silently stale.
 */
describe("§5 policy.mjs BAY_FLANKS re-derived from content/world and platform/src", () => {
  const PLATFORM = resolve(REPO, "platform", "src", "modules", "sim");
  const read = (...p) => readFileSync(resolve(PLATFORM, ...p), "utf8").replace(/\r\n/g, "\n");
  const must = (re, text, what) => {
    const m = text.match(re);
    assert.ok(m, `unresolved: ${what} (${re})`);
    return m;
  };
  const types = read("traffic", "types.ts");
  const widthBlock = must(/VEHICLE_PROFILE_WIDTH_M[^=]*=\s*\{([\s\S]*?)\};/, types, "VEHICLE_PROFILE_WIDTH_M")[1];
  const lengthBlock = must(/VEHICLE_PROFILE_LENGTH_M[^=]*=\s*\{([\s\S]*?)\};/, types, "VEHICLE_PROFILE_LENGTH_M")[1];
  const WIDTH = { car: Number(must(/\bcar:\s*([\d.]+)/, widthBlock, "car width")[1]), van: Number(must(/\bvan:\s*([\d.]+)/, widthBlock, "van width")[1]) };
  const LENGTH = { car: Number(must(/\bcar:\s*([\d.]+)/, lengthBlock, "car length")[1]), van: Number(must(/\bvan:\s*([\d.]+)/, lengthBlock, "van length")[1]) };
  const chassis = must(/CHASSIS_HALF_EXTENTS\s*=\s*\{\s*x:\s*([\d.]+),\s*y:\s*[\d.]+,\s*z:\s*([\d.]+)\s*\}/, read("vehicle", "tuning.ts"), "CHASSIS_HALF_EXTENTS");
  const held = read("scene", "scenarioSceneryProps.ts");
  const recipe = read("scene", "lessonWorldRecipe.ts");
  const heldFor = (lesson) => {
    const block = must(new RegExp(`"${lesson}":\\s*\\[([\\s\\S]*?)\\n\\s*\\],`), held, `HELD_SCENERY ${lesson}`)[1];
    return [...block.matchAll(/\{\s*kind:\s*"(wall|vehicle)",\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*headingDeg:\s*(-?[\d.]+)(?:,\s*lengthM:\s*([\d.]+))?(?:,\s*heightM:\s*[\d.]+)?(?:,\s*thicknessM:\s*([\d.]+))?(?:,\s*model:\s*"([^"]+)")?/g)]
      .map((m) => ({ kind: m[1], x: Number(m[2]), y: Number(m[3]), headingDeg: Number(m[4]), lengthM: m[5] ? Number(m[5]) : null, thicknessM: m[6] ? Number(m[6]) : null, model: m[7] ?? null }));
  };

  it("the sources say what the table was built on: player 1.70 × 4.04 m, car 1.84 m wide, van 1.98 m, occupants mounted centred on their bays", () => {
    assert.equal(Number(chassis[1]), PLAYER_HALF_WIDTH_M);
    assert.equal(Number(chassis[2]), PLAYER_HALF_LENGTH_M);
    assert.equal(WIDTH.car, 1.84);
    assert.equal(WIDTH.van, 1.98);
    must(/\.filter\(\(b\) => b\.occupied\)\s*\n\s*\.map\(\(b, i\) => \(\{\s*\n\s*kind: "vehicle" as const,\s*\n\s*x: b\.x,\s*\n\s*y: b\.y,\s*\n\s*headingDeg: b\.headingDeg,/, recipe, "occupied bays mounted centred at the bay pose");
    must(/"kargo_v"/, held, "the van model");
  });

  for (const [lesson, f] of Object.entries(BAY_FLANKS)) {
    it(`${lesson}: every flank face re-derived within 5 mm, and the limits the reducer and G3 read`, () => {
      const world = JSON.parse(readFileSync(resolve(REPO, "content", "world", `${f.world}.json`), "utf8"));
      const park = PRODUCT[lesson].park;
      const bay = park.bay;
      const sc = world.meta?.scenario;
      if (sc?.targetBayId) {
        const t = sc.bays.find((b) => b.id === sc.targetBayId);
        assert.deepEqual({ x: t.x, y: t.y, headingDeg: t.headingDeg, widthM: t.widthM, lengthM: t.lengthM }, bay, `${lesson}: PRODUCT's bay is not the district's target bay`);
      }
      const bodies = [
        ...(sc?.bays ?? []).filter((b) => b.occupied).map((b) => ({ id: b.id, x: b.x, y: b.y, headingDeg: b.headingDeg, hl: LENGTH.car / 2, hw: WIDTH.car / 2 })),
        ...(["sc-park-van", "sc-park-wall", "sc-pk-driveway"].includes(lesson) ? heldFor(lesson) : []).map((b) => ({
          id: `${b.kind}@${b.x},${b.y}`, x: b.x, y: b.y, headingDeg: b.headingDeg,
          hl: b.kind === "wall" ? b.lengthM / 2 : (b.model === "kargo_v" ? LENGTH.van : LENGTH.car) / 2,
          hw: b.kind === "wall" ? b.thicknessM / 2 : (b.model === "kargo_v" ? WIDTH.van : WIDTH.car) / 2,
        })),
      ];
      assert.ok(bodies.length >= 1, `${lesson}: no body read`);
      const face = { neg: null, pos: null };
      for (const b of bodies) {
        const probe = bayFrame(bay, b.x, -b.y);
        const rel = ((b.headingDeg - bay.headingDeg) * Math.PI) / 180;
        const latHalf = Math.abs(b.hl * Math.sin(rel)) + Math.abs(b.hw * Math.cos(rel));
        const lonHalf = Math.abs(b.hl * Math.cos(rel)) + Math.abs(b.hw * Math.sin(rel));
        if (Math.abs(probe.latM) < 0.01) continue; // fore or aft of the bay, not a flank
        if (probe.lonM + lonHalf < -bay.lengthM / 2 - PLAYER_HALF_LENGTH_M || probe.lonM - lonHalf > bay.lengthM / 2 + PLAYER_HALF_LENGTH_M) continue;
        const side = probe.latM < 0 ? "neg" : "pos";
        const d = Math.abs(probe.latM) - latHalf;
        if (d > 6) continue;
        face[side] = face[side] === null ? d : Math.min(face[side], d);
      }
      for (const side of ["neg", "pos"]) {
        if (f[side] === null) assert.equal(face[side], null, `${lesson} ${side}: a flank the table does not list (${face[side]})`);
        else near(f[side].faceM, face[side], 0.005, `${lesson} ${side} faceM`);
      }
      const lim = bayLateralLimits(lesson, f.k);
      const th = (park.headingTolDeg * Math.PI) / 180;
      for (const side of ["neg", "pos"]) {
        const want = f[side] === null ? null : f[side].faceM - PLAYER_HALF_WIDTH_M * Math.cos(th) - PLAYER_HALF_LENGTH_M * Math.sin(th) - BAY_CLEARANCE_MARGIN_M;
        if (want === null) assert.equal(lim[`${side}M`], null);
        else near(lim[`${side}M`], want, 0.001, `${lesson} ${side} limit`);
      }
      assert.equal(lim.lonHalfM, bay.lengthM / 2 - BAY_MOUTH_INSET_M);
    });
  }

  it("the parallel kerb slots have no flank: their occupants stand fore and aft", () => {
    for (const lesson of ["sc-park-gap-short", "sc-park-zebra", "sc-park-judge", "sc-park-gap-long"]) {
      assert.equal(BAY_FLANKS[lesson], undefined);
      const world = JSON.parse(readFileSync(resolve(REPO, "content", "world", `${{ "sc-park-gap-short": "lot-gap-short-v1", "sc-park-zebra": "lot-zebra-v1", "sc-park-judge": "lot-gap-judge-v1", "sc-park-gap-long": "lot-gap-long-v1" }[lesson]}.json`), "utf8"));
      const bay = PRODUCT[lesson].park.bay;
      for (const b of world.meta.scenario.bays.filter((x) => x.occupied)) near(bayFrame(bay, b.x, -b.y).latM, 0, 1e-9, `${lesson} ${b.id}`);
    }
  });
});
