/**
 * path-follow.test.mjs — the pc-path leg's control law, reducer and words.
 *
 * Run: node --test tools/mobile/__tests__/path-follow.test.mjs
 *
 * THESE ARE KINEMATIC BENCHES WITH NO WORLD. There are no kerbs, cones, walls,
 * parked cars or pedestrians here (the stance of `lib/steer-bench.mjs`). A law
 * that passes them has been shown CONSISTENT with the product's chain, pedals and
 * gear gesture as written down, and with w47's pc timing — never that it parks a
 * car in a browser. Passing them certifies the law, not a drive.
 *
 * DESIGN-v2 §12.1 names each case (T1.1 … T12.3). Where an assertion guards a
 * sign or an ordering, the mutation that reddens it is named beside it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VEHICLE, maxSteerAtKmh, yawGainAtKmh } from "../lib/guidance.mjs";
import { steerForBearingError } from "../lib/reverse-plan.mjs";
import { samplesDigest } from "../lib/path-plan/geom.mjs";
import {
  PATH_TESTIMONY,
  PATH_TUNE,
  PM0_DEG,
  PM_SLOPE_DEG_PER_D,
  PRESS_MIN_KMH,
  advanceCursor,
  armFrame,
  authorityVerdict,
  bearingDeg,
  betaTangentYaw,
  brakeAttackDeadS,
  brakeCapMps2,
  brakeCeil,
  captureEndPose,
  contactEvidence,
  centrePursuit,
  chainPulseHeading,
  chainTable,
  createAuthority,
  createModulator,
  createPathSign,
  createPathState,
  createSteerLanding,
  createYawState,
  circularMedianDeg,
  decoratePlan,
  foldSteerLanding,
  pathApplyActions,
  pathCreditBySegment,
  pathObservation,
  pathPressKmh,
  pathRouteLine,
  pathUncreditedLine,
  pathYieldActions,
  pressMinFor,
  productParkWitness,
  steerLandingSummary,
  dutyForWheelFraction,
  foldAuthority,
  foldImpact,
  foldPathSign,
  foldYaw,
  headingUnit,
  loadPathRef,
  lookaheadFor,
  modulate,
  movingMedianProfile,
  pathOnPauseDrain,
  pathReverseOutcome,
  pathSafeKmh,
  pathStep,
  pathTrackingWord,
  pathYieldState,
  pedalGrammar,
  phaseMarginDeg,
  pointAt,
  rearPursuit,
  resetYawHistory,
  rightUnit,
  selectWitness,
  speedTarget,
  stopTrigger,
  toBodyFrame,
  witnessPolyline,
  wrapDeg,
  yawFromCamOffset,
} from "../lib/path-follow.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const L = VEHICLE.WHEELBASE_M;
const A = L / 2;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);
const angNear = (a, b, tol, msg) => assert.ok(Math.abs(wrapDeg(a - b)) <= tol, `${msg ?? ""} ${a}° vs ${b}° (tol ${tol}°)`);
const PATHREF_DIR = resolve(REPO, "tools", "mobile", "path-refs");
const LESSONS = readdirSync(PATHREF_DIR).filter((f) => f.endsWith(".pathref.json")).map((f) => f.replace(".pathref.json", ""));
const plans = new Map(LESSONS.map((l) => [l, loadPathRef(l, REPO)]));
const plan = (l) => plans.get(l);

/* ═══════════════════════════ T1 frames and yaw ═══════════════════════════ */

describe("T1 frames and yaw", () => {
  it("T1.1 headingUnit / bearingDeg / wrapDeg round-trip in the probe frame (z = −y)", () => {
    for (const psi of [0, 90, 180, 270]) {
      const h = headingUnit(psi);
      angNear(bearingDeg(h.x, h.z), psi, 1e-9, `psi ${psi}`);
    }
    // north is −z; east (+x) is 90 (mutation: h = (sinψ, +cosψ) → north would be +z)
    near(headingUnit(0).z, -1, 1e-12);
    near(headingUnit(90).x, 1, 1e-12);
    // right of north is east
    near(rightUnit(0).x, 1, 1e-12);
    assert.equal(wrapDeg(190), -170);
    assert.equal(wrapDeg(-180), 180);
  });

  const ry = (th, [x, y, z]) => [x * Math.cos(th) + z * Math.sin(th), y, -x * Math.sin(th) + z * Math.cos(th)];
  const rx = (a, [x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  const rz = (a, [x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];

  it("T1.2 yawFromCamOffset recovers ψ = 180° − θ from three.js Ry(θ), pitch/roll leak ≤ 4°", () => {
    const Lv = [0.24, 0.71, 0.35];
    for (const thDeg of [0, 37, 90, 200, 315]) {
      const W = ry(thDeg * RAD, Lv);
      const y = yawFromCamOffset({ lx: Lv[0], lz: Lv[2], wx: W[0], wz: W[2] });
      assert.equal(y.valid, true);
      angNear(y.psi, 180 - thDeg, 1e-9, `θ ${thDeg}`);
      // mutation ψ = θ goes red on every θ but 90
      if (thDeg !== 90) assert.ok(Math.abs(wrapDeg(y.psi - thDeg)) > 1);
      // 2° of pitch OR roll leaks ≤ 4° (≈ 1.7°/° per control-law.md §8.1). Both at
      // once in the same sense leak 4.6° on this lever (0.71 m over 0.42 m): the
      // design's "≤ 4° with 2° pitch plus 2° roll" holds for opposite senses only.
      for (const [p, q, tol] of [[2, 0, 4], [0, 2, 4], [2, -2, 4], [2, 2, 4.7]]) {
        const Wt = ry(thDeg * RAD, rx(p * RAD, rz(q * RAD, Lv)));
        const yt = yawFromCamOffset({ lx: Lv[0], lz: Lv[2], wx: Wt[0], wz: Wt[2] });
        angNear(yt.psi, 180 - thDeg, tol, `θ ${thDeg} pitch ${p} roll ${q}`);
      }
    }
    assert.equal(yawFromCamOffset({ lx: 0.1, lz: 0.1, wx: 0.1, wz: 0.1 }).valid, false);
    assert.equal(yawFromCamOffset({ lx: NaN, lz: 0.3, wx: 0.3, wz: 0.3 }).valid, false);
    // spawn: sc-park-wall trace ψ0 = 0° ⇒ θ = 180°
    const W = ry(Math.PI, Lv);
    angNear(yawFromCamOffset({ lx: Lv[0], lz: Lv[2], wx: W[0], wz: W[2] }).psi, plan("sc-park-wall").segments[0].authoredStart.psi, 1e-9);
  });

  it("T1.3 chassis +Z rotated by Ry(θ) is h(180° − θ)", () => {
    for (const thDeg of [0, 37, 90, 200, 315]) {
      const W = ry(thDeg * RAD, [0, 0, 1]);
      const h = headingUnit(180 - thDeg);
      near(W[0], h.x, 1e-12);
      near(W[2], h.z, 1e-12);
    }
  });

  /** A rear-axle bicycle at constant δ, publishing mid-wheelbase poses every `ds` m of rear travel. */
  const bicycle = (delta, sigma, n = 12, ds = 0.3, psi0 = 30) => {
    let rxp = 0;
    let rzp = 0;
    let psi = psi0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = headingUnit(psi);
      out.push({ x: rxp + A * h.x, z: rzp + A * h.z, psi });
      const steps = 30;
      for (let k = 0; k < steps; k++) {
        const dpsi = ((sigma * Math.tan(delta)) / L) * (ds / steps) * DEG;
        const pm = headingUnit(psi + dpsi / 2);
        rxp += sigma * pm.x * (ds / steps);
        rzp += sigma * pm.z * (ds / steps);
        psi += dpsi;
      }
    }
    return out;
  };

  it("T1.4 betaTangentYaw is within 0.7° where the plain tangent is off by β (8.8° at 0.3, 18.9° at lock)", () => {
    for (const delta of [0.1, -0.1, 0.3, -0.3, 0.6, -0.6]) {
      for (const sigma of [1, -1]) {
        const poses = bicycle(delta, sigma);
        for (let i = 2; i < poses.length; i++) {
          const b = betaTangentYaw(poses[i - 2], poses[i - 1], poses[i], sigma * 3);
          angNear(b.psi, poses[i].psi, 0.7, `δ ${delta} σ ${sigma}`);
        }
      }
    }
    const beta = (d) => Math.atan(Math.tan(d) / 2) * DEG;
    near(beta(0.3), 8.8, 0.05);
    near(beta(0.6), 18.9, 0.05);
    for (const [delta, want] of [[0.3, 8.8], [0.6, 18.9]]) {
      const p = bicycle(delta, 1);
      const b = betaTangentYaw(p[4], p[5], p[6], 3);
      near(Math.abs(wrapDeg(b.plainTangent - p[6].psi)), want, 0.6, `plain tangent at δ ${delta}`);
      // mutation: the sign of β (ψ = bm + β) is off by 2β
      assert.ok(Math.abs(wrapDeg(b.plainTangent + b.betaDeg - p[6].psi)) > want);
    }
    // real rows: sc-park-wall R1 witness replayed as centre poses, reversing. Where the
    // witness holds its wheel (δ constant over the 0.6 m window, here at lock) the
    // estimator is within 1.5°; where the committed δ steps between rows the centre
    // path has kinks a chord estimator cannot follow (±36° measured) — which is why
    // it is a FALLBACK, and a latch input on commanded-straight travel only.
    const w = plan("sc-park-wall").segments[1].witnesses[1];
    let worst = 0;
    let n = 0;
    for (let i = 6; i < w.rows.length; i += 3) {
      if (!w.rows.slice(i - 6, i + 1).every((r) => r[6] === w.rows[i][6])) continue;
      const [a, b, c] = [w.rows[i - 6], w.rows[i - 3], w.rows[i]].map((r) => ({ x: r[1], z: r[2] }));
      const est = betaTangentYaw(a, b, c, -3);
      worst = Math.max(worst, Math.abs(wrapDeg(est.psi - w.rows[i][5])));
      n += 1;
    }
    assert.ok(n >= 5, `${n} steady windows`);
    assert.ok(worst <= 1.5, `sc-park-wall R1 steady-wheel windows: worst ${worst.toFixed(2)}°`);
  });

  it("T1.5 foldYaw: cam when valid, β-tangent when moving blind, held at rest; a SYSTEMATIC disagreement latches camYawSuspect", () => {
    const poses = bicycle(0, 1, 40, 0.35, 0);
    const camOf = (psi, bias = 0) => {
      const th = (180 - psi - bias) * RAD;
      const Lv = { x: -0.24, z: 0.35 };
      return yawFromCamOffset({ lx: Lv.x, lz: Lv.z, wx: Lv.x * Math.cos(th) + Lv.z * Math.sin(th), wz: -Lv.x * Math.sin(th) + Lv.z * Math.cos(th) });
    };
    let y = createYawState();
    y = foldYaw(y, { cam: camOf(0), pose: poses[0], v: 5, u: 0 });
    assert.equal(y.source, "cam");
    let blind = createYawState();
    for (const p of poses.slice(0, 5)) blind = foldYaw(blind, { cam: { valid: false }, pose: p, v: 5, u: 0 });
    assert.equal(blind.source, "beta-tangent");
    angNear(blind.psi, 0, 0.7);
    blind = foldYaw(blind, { cam: { valid: false }, pose: poses[4], v: 0, u: 0 });
    assert.equal(blind.source, "held");
    // an unbiased camera on a straight never latches; a +5° biased one does (mutation: drop the latch)
    let ok = createYawState();
    let bad = createYawState();
    for (const p of poses) {
      ok = foldYaw(ok, { cam: camOf(p.psi), pose: p, v: 5, u: 0 });
      bad = foldYaw(bad, { cam: camOf(p.psi, 5), pose: p, v: 5, u: 0 });
    }
    assert.equal(ok.suspect, false);
    assert.equal(bad.suspect, true);
    // noise that averages out is not a disagreement (T9 bench: a keyboard wheel's β noise)
    let noisy = createYawState();
    poses.forEach((p, i) => { noisy = foldYaw(noisy, { cam: camOf(p.psi, Math.floor(i / 2) % 2 ? 4 : -4), pose: p, v: 5, u: 0 }); });
    assert.equal(noisy.suspect, false);
    // a commanded turn is not "straight": a biased camera on an arc does not convict
    let arc = createYawState();
    for (const p of bicycle(0.05, 1, 40, 0.35, 0)) arc = foldYaw(arc, { cam: camOf(p.psi, 5), pose: p, v: 5, u: 0.4 });
    assert.equal(arc.suspect, false);
  });

  it("T1.6 the history is reset at a gear change: the first reverse yaw is never ~180° off", () => {
    const fwd = bicycle(0, 1, 8, 0.4, 0);
    const last = fwd[fwd.length - 1];
    const rev = bicycle(0, -1, 8, 0.4, 0).map((p) => ({ x: p.x + last.x - A * headingUnit(0).x + A * headingUnit(0).x, z: p.z + last.z, psi: 0 }));
    let y = createYawState();
    for (const p of fwd) y = foldYaw(y, { cam: { valid: false }, pose: p, v: 5 });
    y = resetYawHistory(y);
    const ests = [];
    for (const p of rev) {
      y = foldYaw(y, { cam: { valid: false }, pose: p, v: -3 });
      if (y.source === "beta-tangent") ests.push(y.psi);
    }
    assert.ok(ests.length >= 3);
    for (const e of ests) angNear(e, 0, 1);
    // without the reset (the mutation) the mixed chords are wrong
    let m = createYawState();
    for (const p of fwd) m = foldYaw(m, { cam: { valid: false }, pose: p, v: 5 });
    const bad = [];
    for (const p of rev.slice(0, 3)) {
      m = foldYaw(m, { cam: { valid: false }, pose: p, v: -3 });
      bad.push(m.psi);
    }
    assert.ok(bad.some((e) => Math.abs(wrapDeg(e - 0)) > 90), `unreset estimates ${bad.join(", ")}`);
    // poligon R1 starts after a 24.2° authored heading snap at standstill
    const pr = plan("sc-ed-poligon-chain").segments[1];
    assert.ok(Math.abs(wrapDeg(pr.gearChangePose.psi - pr.witnesses[0].startPose.psi)) < 1e-6 || Number.isFinite(pr.gearChangePose.psi));
  });
});

/* ═══════════════════════════ T2 reference ═══════════════════════════ */

describe("T2 the committed reference", () => {
  it("T2.1 every committed pathref loads; a mutated sample is reference-stale; CRLF and LF digest alike", () => {
    assert.ok(LESSONS.length >= 11, `${LESSONS.length} pathrefs`);
    for (const l of LESSONS) assert.equal(plan(l).lesson, l);
    const tmp = mkdtempSync(join(tmpdir(), "pathref-"));
    const lesson = "sc-park-wall";
    const trace = readFileSync(resolve(REPO, "content", "traces", lesson, "shadow-correct.trace.json"), "utf8");
    mkdirSync(join(tmp, "tools", "mobile", "path-refs"), { recursive: true });
    mkdirSync(join(tmp, "content", "traces", lesson), { recursive: true });
    writeFileSync(join(tmp, "tools", "mobile", "path-refs", `${lesson}.pathref.json`), readFileSync(resolve(PATHREF_DIR, `${lesson}.pathref.json`)));
    const doc = JSON.parse(trace);
    doc.samples[5].x += 0.001;
    writeFileSync(join(tmp, "content", "traces", lesson, "shadow-correct.trace.json"), JSON.stringify(doc));
    assert.throws(() => loadPathRef(lesson, tmp), (e) => e.code === "reference-stale");
    assert.throws(() => loadPathRef("sc-no-such-lesson", tmp), (e) => e.code === "no-pathref");
    const lf = trace.replace(/\r\n/g, "\n");
    assert.equal(samplesDigest(lf), samplesDigest(lf.replace(/\n/g, "\r\n")));
  });

  it("T2.2 selectWitness: the largest grid ≤ the start along, lead ≤ 0.5, outside the band refuses", () => {
    const seg = plan("sc-park-gap-short").segments[1];
    const sel = selectWitness(seg, { alongM: 1.37, latM: 0.1, yawErrDeg: -1 });
    assert.equal(sel.witness.startAlongM, 1.0);
    near(sel.leadM, 0.37, 1e-9);
    assert.equal(selectWitness(seg, { alongM: 1.37, latM: -0.1, yawErrDeg: -1 }).refusal, "arm-roll-out-of-band");
    assert.equal(selectWitness(seg, { alongM: seg.armBand.alongM[1] + 0.1, latM: 0.1, yawErrDeg: -1 }).refusal, "arm-roll-out-of-band");
  });
});

/* ═══════════════════════════ T3 cursor ═══════════════════════════ */

describe("T3 the cursor", () => {
  it("T3.1 a double-back never snaps back more than 0.4 m; ctM is + right", () => {
    // out north 10 m, a 0.017 m-wide hairpin, back south
    const rows = [];
    for (let i = 0; i <= 100; i++) rows.push([i * 0.1, 0, -i * 0.1, 0, 0, 0, 0, 0, 3]);
    for (let i = 0; i <= 100; i++) rows.push([10 + i * 0.1, 0.017, -10 + i * 0.1, 0, 0, 180, 0, 0, 3]);
    const poly = witnessPolyline({ rows }, { gear: 1 });
    let cur = null;
    let prevS = 0;
    for (let i = 0; i <= 200; i++) {
      const p = i <= 100 ? { x: 0.3, z: -i * 0.1 } : { x: 0.017 + 0.3, z: -10 + (i - 100) * 0.1 };
      cur = advanceCursor(cur, poly, p, 0.1, { acquire: i === 0 });
      assert.ok(cur.s >= prevS - 0.4, `snap back at ${i}: ${cur.s} < ${prevS}`);
      prevS = Math.max(prevS, cur.s);
    }
    near(cur.s, 20, 0.2);
    // heading north, a point at +x is right of the line
    const c0 = advanceCursor(null, poly, { x: 0.5, z: -3 }, 0, { acquire: true });
    assert.ok(c0.ctM > 0);
    // sc-pk-driveway F0 then R1 are separate polylines: R1's cursor starts at its own start
    const dw = plan("sc-pk-driveway");
    const f0 = witnessPolyline(dw.segments[0].witnesses[0], { gear: 1, extendM: 3 });
    const r1 = witnessPolyline(dw.segments[1].witnesses[1], { gear: -1, leadM: 1, extendM: 3 });
    let cf = null;
    for (let i = 0; i < f0.n; i += 5) cf = advanceCursor(cf, f0, f0.pts[i], 0.5, { acquire: cf === null });
    assert.ok(cf.s > f0.sEnd - 1);
    let cr = null;
    for (let i = 0; i < r1.n; i += 3) {
      const before = cr?.s ?? 0;
      cr = advanceCursor(cr, r1, r1.pts[i], 0.3, { acquire: cr === null, leadM: 1 });
      assert.ok(cr.s >= before - 0.4);
    }
  });
});

/* ═══════════════════════════ T4 the law ═══════════════════════════ */

describe("T4 control law", () => {
  it("T4.1 centrePursuit: a = 0 is 2·yt/Ld²; for a = 1.28 the ICR circle holds the centre and the target", () => {
    for (const [xt, yt] of [[3, 0.4], [4, -0.8], [6, 1.5]]) {
      near(centrePursuit({ xt, yt, kmh: 5, a: 0 }).kappa, (2 * yt) / (xt * xt + yt * yt), 1e-12);
      const k = centrePursuit({ xt, yt, kmh: 5 }).kappa;
      const Rr = 1 / k;
      near(Math.hypot(A - 0, 0 - Rr), Math.hypot(xt, yt - Rr), 1e-9, "|ICR − centre| = |ICR − target|");
    }
    assert.ok(centrePursuit({ xt: 4, yt: 0.5, kmh: 5 }).u > 0);
    assert.ok(centrePursuit({ xt: 4, yt: -0.5, kmh: 5 }).u < 0);
  });

  it("T4.2 rearPursuit: facing north, behind-right ⇒ u > 0; agrees with steerForBearingError on 12 cases", () => {
    const pose = { x: 0, z: 0 };
    const rear = { x: 0, z: A };
    assert.ok(rearPursuit({ pose, psi: 0, target: { x: 1, z: rear.z + 2 }, lookaheadM: 1.5, kmh: 3 }).u > 0);
    assert.ok(rearPursuit({ pose, psi: 0, target: { x: -1, z: rear.z + 2 }, lookaheadM: 1.5, kmh: 3 }).u < 0);
    let n = 0;
    for (const psi of [0, 90, 225]) {
      for (const [bx, bz] of [[1, 2], [-1, 2], [0.5, 3], [-0.7, 1.5]]) {
        const h = headingUnit(psi);
        const rg = rightUnit(psi);
        const rp = { x: pose.x - A * h.x, z: pose.z - A * h.z };
        // behind (−h) by bz, right by bx
        const target = { x: rp.x - bz * h.x + bx * rg.x, z: rp.z - bz * h.z + bx * rg.z };
        const law = rearPursuit({ pose, psi, target, lookaheadM: 1.5, kmh: 3 });
        const motion = Math.atan2(-h.z, -h.x);
        const tb = Math.atan2(target.z - rp.z, target.x - rp.x);
        const err = Math.atan2(Math.sin(tb - motion), Math.cos(tb - motion));
        const dir = steerForBearingError(err, { reversing: true, deadbandDeg: 0 });
        assert.equal(Math.sign(law.u), dir === "right" ? 1 : -1, `ψ ${psi} target ${bx},${bz}`);
        n += 1;
      }
    }
    assert.equal(n, 12);
  });

  it("T4.3 the terminal extension keeps Ld ≥ 1.5 m and puts the target on it at toEndM 0.2", () => {
    const w = plan("sc-park-wall").segments[1].witnesses[1];
    const poly = witnessPolyline(w, { gear: -1, leadM: 1, extendM: 3 });
    const s = poly.sEnd - 0.2;
    const Ld = lookaheadFor(3, 0.2, -1);
    assert.ok(Ld >= 1.5);
    const T = pointAt(poly, s + Ld);
    assert.ok(poly.pts[T.idx].ext === true || poly.pts[Math.min(poly.n - 1, T.idx + 1)].ext === true);
  });
});

/* ═══════════════════════════ T5 actuation ═══════════════════════════ */

describe("T5 actuation", () => {
  it("T5.1 the chain reproduces input-channels.md §2 within 15 %, and the table inverts within 0.03", () => {
    for (const [ms, deg] of [[45, 1.58], [65, 2.08], [100, 3.69], [200, 7.78], [300, 11.3]]) {
      const h = chainPulseHeading(ms, 10).headingDeg;
      assert.ok(Math.abs(h - deg) <= 0.15 * deg, `${ms} ms: ${h.toFixed(2)}° vs ${deg}°`);
    }
    const table = chainTable();
    for (const band of table.bands) {
      for (let i = 2; i < table.duties.length; i += 3) {
        const d = dutyForWheelFraction(band.frac[i], band.kmh, table);
        near(d, table.duties[i], 0.03, `band ${band.kmh} duty ${table.duties[i]}`);
      }
    }
  });

  it("T5.2 modulate: k ∈ {−1,0,1}, mean within 0.01 over 200 quanta, |e| ≤ 1, e = 0 after a gap, a release restarts it", () => {
    for (const u of [0.13, 0.5, -0.72, 1, 0]) {
      let st = createModulator();
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const m = modulate(st, u, 0.05, 0.05);
        st = m.state;
        assert.ok([-1, 0, 1].includes(m.k));
        assert.ok(Math.abs(st.e) <= 1);
        sum += m.k;
      }
      near(sum / 200, u, 0.01, `u ${u}`);
    }
    const gap = modulate({ e: 0.9, kPrev: 1 }, 0.3, 0.2, 0.05);
    near(gap.state.e, 0, 1e-9, "after a 4-quantum gap the error restarts from 0 (mutation: no reset → 0.9 + (0.3 − 1)·2 wound up)");
    assert.equal(gap.k, 0);
    // at saturation after a yield the first quantum must press (the 117 ms gap the T9 bench found)
    const st = pathYieldState({ mod: { e: 0.2, kPrev: 1 }, lastU: 1 });
    assert.equal(modulate(st.mod, 1, 0.05, 0.05).k, 1);
  });
});

/* ═══════════════════════════ T6 pedals ═══════════════════════════ */

const rngOf = (seed) => {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe("T6 the pedal grammar", () => {
  it("T6.1 D: no S down-edge lands at |v| ≤ 1; the latched S is never released before rest + dwell", () => {
    const R = rngOf(11);
    for (let trial = 0; trial < 10_000; trial++) {
      let v = R() * 12;
      const dial = () => Math.round(v);
      let latch = { brake: false, coast: false, wBrake: false };
      let keys = { W: false, S: false };
      const queue = [];
      let restAt = null;
      let toStop = 2 + R() * 10;
      const vT = R() * 14;
      const dwell = 1;
      for (let f = 0; f < 300; f++) {
        const t = f / 60;
        const release = restAt !== null && t - restAt >= dwell;
        const g = pedalGrammar(latch, { gear: 1, vAbs: v, dialKmh: dial(), vT, toStopM: toStop, keys, release });
        if (g.S && !keys.S) queue.push({ at: f + Math.floor(R() * 3), S: true });
        if (!g.S && keys.S && latch.brake && !release) assert.fail(`latched S released before rest + dwell (trial ${trial})`);
        latch = g.latch;
        keys = { W: g.W, S: g.S };
        for (const q of queue.splice(0).filter((q) => q.at <= f)) assert.ok(v > 1, `S down-edge landed at ${v.toFixed(2)} km/h`);
        const a = keys.S ? -3 : keys.W ? 1.2 : -0.23;
        v = Math.max(0, v + (a * 3.6) / 60);
        toStop -= v / 3.6 / 60;
        if (v === 0 && restAt === null) restAt = t;
      }
    }
    // a negative float never passes the refusal
    assert.equal(pedalGrammar({ brake: true, coast: false }, { gear: 1, vAbs: -3, dialKmh: 3, keys: { W: false, S: false } }).S, false);
  });

  /* T6.2 (2026-09-15) THE R GRAMMAR AGAINST THE PRODUCT'S OWN LAW 1, not a proxy for it.
   * ReverseAssist arms a toggle only on a functional-brake rising edge that meets a car which
   * has stood below 0.6 km/h with that pedal lifted for ≥ 0.25 s (reverseAssist.ts:143, :155,
   * :231-262); the edge lands τ_land 0.1 s after the key and the W ramp (THROTTLE_ATTACK_S 0.35 s)
   * crosses the 0.1 pedal threshold 35 ms later. The plant here includes impacts (a car pinned
   * to rest in one frame) and a creep after rest. The old invariant — W released at ≤ 1 km/h —
   * is the one canary-path-s2 sc-park-left broke the other way: an unbraked car past its end. */
  it("T6.2 R: no W edge ReverseAssist could arm; no W before a final latch; S never after one; a W held from motion stays down through rest", () => {
    const run = (pedals, dialOf, strict) => {
    const R = rngOf(12);
    const LIFT_S = 0.25, STAND_KMH = 0.6, LAND_F = 6, RAMP_F = 3;
    let armedEdges = 0;
    let holds = 0;
    for (let trial = 0; trial < (strict ? 10_000 : 2_000); trial++) {
      let v = R() * 5;
      let latch = { brake: false, coast: false, wBrake: false, hold: false };
      let keys = { W: false, S: false };
      let toStop = R() * 2;
      const impactAt = R() < 0.3 ? Math.floor(R() * 200) : -1;
      const creepAfterRest = R() < 0.3;
      let everLatched = false;
      let restFrames = 0;
      // the product's view: key edges land LAND_F frames later and cross the 0.1 threshold RAMP_F frames after that
      const wDown = [];
      let pedalOn = false;
      let liftS = 0;
      let wasRestHeld = false;
      for (let f = 0; f < 300; f++) {
        const g = pedalGrammar(latch, { gear: -1, vAbs: v, dialKmh: dialOf(v), toStopM: toStop, keys, holdNow: toStop <= 0 }, pedals);
        const stopping = g.latch.wBrake || g.latch.coast || g.latch.hold;
        if (strict) {
          if (!stopping) assert.equal(g.W, false, `W before a final latch at ${v.toFixed(2)} km/h`);
          if (everLatched) assert.equal(g.S, false, "S — the R accelerator — after a final latch");
          if (g.W) assert.equal(g.S, false);
          if (keys.W && stopping) assert.equal(g.W, true, "a W that went down after the latch is held through rest");
          if (g.W && !keys.W) assert.ok(v >= PATH_TUNE.pedals.rHoldPressMinKmh && Math.round(v) >= 1, `fresh W at ${v.toFixed(2)} km/h`);
        }
        everLatched ||= stopping;
        if (g.W && !keys.W) wDown.push(f + LAND_F + RAMP_F);
        latch = g.latch;
        keys = { W: g.W, S: g.S };
        // the product: a W rising edge arms only after LIFT_S of lifted pedal at a standstill
        const stopped = v < STAND_KMH;
        const edgeNow = wDown.length && wDown[0] <= f;
        if (edgeNow) wDown.shift();
        if (keys.W && edgeNow && !pedalOn) {
          if (stopped && liftS >= LIFT_S) armedEdges += 1;
          pedalOn = true;
        } else if (!keys.W) {
          pedalOn = false;
          liftS = stopped ? liftS + 1 / 60 : 0;
        }
        const a = f === impactAt ? -Infinity : keys.W ? -5 : keys.S ? 1.2 : restFrames > 30 && creepAfterRest ? 0.35 : -0.23;
        v = Math.max(0, v + (a * 3.6) / 60);
        restFrames = v === 0 ? restFrames + 1 : 0;
        toStop -= v / 3.6 / 60;
        if (keys.W && v === 0) wasRestHeld = true;
      }
      if (wasRestHeld) holds += 1;
    }
    return { armedEdges, holds };
    };
    const ok = run(PATH_TUNE.pedals, (v) => Math.round(v), true);
    assert.equal(ok.armedEdges, 0, `${ok.armedEdges} W edge(s) the product would have armed as a direction toggle`);
    assert.ok(ok.holds > 100, `the property never exercised a hold at rest (${ok.holds})`);
    // MUTATION: the press gate at 0 km/h behind a stale dial that still reads 1 — the LAW 1 model must catch it
    const mut = run({ ...PATH_TUNE.pedals, rHoldPressMinKmh: 0 }, () => 1, false);
    assert.ok(mut.armedEdges > 0, "the LAW 1 model cannot fail: a press at rest behind a stale dial armed nothing");
  });

  it("T6.3 stopTrigger reproduces check/v3-arith.cjs within 0.005 m in both branches and gears", () => {
    near(brakeCapMps2(5), 5.297, 0.001);
    near(brakeCeil(6), 0.6, 1e-12);
    near(brakeCeil(14), 1.0, 1e-12);
    near(brakeAttackDeadS(5, 1), 0.075, 1e-12);
    near(brakeAttackDeadS(5, -1), 0.105, 1e-12);
    near(stopTrigger({ gear: 1, vAbs: 5, vGate: 5 }).distM, 0.475, 0.005);
    const R = (k, aCoast) => stopTrigger({ gear: -1, vAbs: k, vGate: k, aCoast });
    near(R(3.7, 0.5).distM, 0.43, 0.005);
    near(R(3.2, 0.5).distM, 0.377, 0.005);
    near(R(2.66, 0.5).distM, 0.323, 0.005);
    assert.equal(R(2.66, 0.5).branch, "brake");
    const C = (k, aCoast) => stopTrigger({ gear: -1, vAbs: k, vGate: 2.5, aCoast });
    near(C(2.66, 0.5).distM, 0.744, 0.005);
    near(C(2.66, 1.0).distM, 0.471, 0.005);
    near(C(2.66, 0.23).distM, 1.385, 0.005);
    assert.equal(C(2.66, 0.5).branch, "coast");
    assert.ok(PRESS_MIN_KMH > 2.5 && PRESS_MIN_KMH < 2.6);
    // branch property (S-6): below PRESS_MIN the brake branch is never chosen and no brake down-edge issued
    const rnd = rngOf(13);
    for (let i = 0; i < 10_000; i++) {
      const gear = rnd() < 0.5 ? 1 : -1;
      const vAbs = rnd() * 6;
      const droop = rnd() * 0.6 * (0.3 + rnd() * 0.9) * 3.6;
      const vGate = Math.max(0, vAbs - droop);
      const tr = stopTrigger({ gear, vAbs, vGate, aCoast: 0.3 + rnd() * 0.9 });
      if (vGate < PRESS_MIN_KMH) {
        assert.equal(tr.branch, "coast");
        const g = pedalGrammar({ brake: false, coast: false, wBrake: false }, { gear, vAbs, dialKmh: vGate, vT: 3, toStopM: 0, keys: { W: false, S: false } });
        if (gear === 1) assert.equal(g.S, false);
        // R (2026-09-15): the coast branch is still chosen, but at the stop itself W is pressed the
        // moment it is safely pressable while moving (PATH_TUNE.pedals.rHoldPressMinKmh, the LAW 1
        // proof in T6.2) — and never the accelerator
        else {
          assert.equal(g.latch.coast, true);
          assert.equal(g.W, vAbs >= PATH_TUNE.pedals.rHoldPressMinKmh && vGate >= 1, `R coast at the stop, |v| ${vAbs.toFixed(2)} dial ${vGate.toFixed(2)}`);
          assert.equal(g.S, false);
        }
      }
    }
    // the stop-phase press speed (S-4)
    assert.equal(pathSafeKmh(2, 5), 0);
    assert.equal(pathSafeKmh(5, 2), 0);
    assert.equal(pathSafeKmh(5, 4), 4);
  });

  it("T6.4 (CODE-REVIEW-1 M1) no steering landing figure reaches a pedal constant; the estimator books one sample per isolated edge and none from a stale one", () => {
    // PRESS_MIN is ONE constant; an observation's landS is ignored by the grammar
    assert.equal(pressMinFor(), PRESS_MIN_KMH);
    assert.ok(PRESS_MIN_KMH <= 2.6);
    for (const landS of [0.05, 0.1, 0.25, 0.3, 4.7]) {
      for (const gear of [1, -1]) {
        const base = { gear, vAbs: 3.5, dialKmh: 3, vT: 3, toStopM: 0.2, keys: { W: false, S: false } };
        const g0 = pedalGrammar({ brake: false, coast: false, wBrake: false }, base);
        const g1 = pedalGrammar({ brake: false, coast: false, wBrake: false }, { ...base, landS });
        assert.equal(g1.pressMin, PRESS_MIN_KMH, `landS ${landS} moved PRESS_MIN to ${g1.pressMin}`);
        assert.deepEqual(g1.trigger, g0.trigger, `landS ${landS} moved the trigger`);
        assert.equal(g1.latch.coast, false, `gear ${gear}: 3.5 km/h ≥ PRESS_MIN must take the brake branch (the M1 failure latched coast)`);
      }
    }
    assert.equal("landS" in createPathState(straightPlan()), false, "the reducer carries no run-time landS");
    // (a) a STALE edge: its sequence never advances over 3 s of straight drift → no sample
    let st = createSteerLanding();
    let psi = 10;
    st = foldSteerLanding(st, { edgeSeq: 1, edgeAtMs: -4717, steerKey: 1, v: 5, psi, prevPsi: psi, prevReadMs: -50, now: 0 });
    for (let t = 50; t <= 3000; t += 50) {
      const prev = psi;
      psi += 0.05;
      st = foldSteerLanding(st, { edgeSeq: 1, edgeAtMs: -4717, steerKey: 1, v: 5, psi, prevPsi: prev, prevReadMs: t - 50, now: t });
    }
    assert.deepEqual(st.samples, [], `a stale edge booked ${JSON.stringify(st.samples)} (the v1 estimator re-armed on it)`);
    // (b) an isolated fresh edge → exactly one sample, in the commanded sense
    let ok = createSteerLanding();
    ok = foldSteerLanding(ok, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0, prevPsi: 0, prevReadMs: 980, now: 1030 });
    ok = foldSteerLanding(ok, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0.1, prevPsi: 0, prevReadMs: 1030, now: 1080 });
    ok = foldSteerLanding(ok, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0.3, prevPsi: 0.1, prevReadMs: 1080, now: 1130 });
    assert.deepEqual(ok.samples, [130]);
    // (c) a second edge inside the window voids the pending sample; a wrong-sense departure voids it; a slow one is discarded
    let ov = createSteerLanding();
    ov = foldSteerLanding(ov, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0, prevPsi: 0, prevReadMs: 990, now: 1030 });
    ov = foldSteerLanding(ov, { edgeSeq: 2, edgeAtMs: 1060, steerKey: -1, v: 5, psi: 0.05, prevPsi: 0, prevReadMs: 1030, now: 1080 });
    ov = foldSteerLanding(ov, { edgeSeq: 2, edgeAtMs: 1060, steerKey: -1, v: 5, psi: -0.5, prevPsi: 0.05, prevReadMs: 1080, now: 1130 });
    assert.deepEqual(ov.samples, []);
    assert.equal(ov.rejected.overlap, 1);
    assert.equal(ov.rejected.notIsolated, 1);
    let ws = createSteerLanding();
    ws = foldSteerLanding(ws, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0, prevPsi: 0, prevReadMs: 990, now: 1030 });
    ws = foldSteerLanding(ws, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: -0.4, prevPsi: 0, prevReadMs: 1030, now: 1080 });
    assert.deepEqual(ws.samples, []);
    assert.equal(ws.rejected.sign, 1);
    let sl = createSteerLanding();
    sl = foldSteerLanding(sl, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0, prevPsi: 0, prevReadMs: 990, now: 1030 });
    sl = foldSteerLanding(sl, { edgeSeq: 1, edgeAtMs: 1000, steerKey: 1, v: 5, psi: 0.5, prevPsi: 0, prevReadMs: 1300, now: 1350 });
    assert.deepEqual(sl.samples, []);
    assert.equal(sl.rejected.slow, 1);
    // (d) the summary is a MEDIAN, never the max of five
    assert.equal(steerLandingSummary({ samples: [40, 250, 60], rejected: {} }).medianMs, 60);
    assert.match(steerLandingSummary(ok).selfReport, /feeds no pedal constant/);
  });

  /* T6.5 (CODE-REVIEW-1 M2, M4): THE PAGE CONTRACT. lesson-audit.mjs and the bench both
   * execute these plans, so their invariants are tested here, exhaustively, and each
   * checker is shown able to fail on the mutation the review ran against lesson-audit. */
  const HOLD_MODES = ["hold-stop", "hold-for-arm", "route-end"];
  const simulate = (actions, held, phase) => {
    const h = { ...held };
    const v = [];
    actions.forEach((a, i) => {
      if (a.ch === "steer") { if (i !== 0) v.push("the wheel is not first"); h.steer = a.dir; }
      else if (a.ch === "W") { if (a.down && phase !== "reverse" && h.S) v.push("D: W pressed while S is held"); h.W = a.down; }
      else if (a.ch === "S-accel") { if (phase !== "reverse") v.push("sChannel in D"); if (a.down && h.W) v.push("R: S pressed while W is held"); h.S = a.down; }
      else if (a.ch === "S-brake") { if (phase === "reverse") v.push("brake() in R"); if (!a.down) h.S = false; else if (!(a.kmh !== null && a.kmh >= 0 && a.kmh <= 1)) h.S = true; }
      if (a.down === true && h.S && h.W) v.push(`${phase === "reverse" ? "R" : "D"}: a press left W and S both down`);
    });
    if (actions.filter((a) => a.ch === "steer").length > 1) v.push("two wheel actions");
    return { h, v };
  };
  const checkApply = (planner) => {
    const bad = [];
    for (const phase of ["roll", "stop", "reverse"]) for (const cW of [false, true]) for (const cS of [false, true]) for (const cSt of [-1, 0, 1])
      for (const hW of [false, true]) for (const hS of [false, true]) for (const hSt of [null, "left", "right"]) for (const vAbs of [0, 0.5, 2, 5]) for (const dialKmh of [null, 0, 1, 3, 6]) {
        const cmd = { W: cW, S: cS, steer: cSt };
        const held = { W: hW, S: hS, steer: hSt };
        const plan = planner(cmd, { phase, held, vAbs, dialKmh });
        const { h, v } = simulate(plan.actions, held, phase);
        const tag = JSON.stringify({ phase, cmd, held, vAbs, dialKmh });
        for (const x of v) bad.push(`${tag}: ${x}`);
        if (JSON.stringify(h) !== JSON.stringify(plan.held)) bad.push(`${tag}: plan.held ${JSON.stringify(plan.held)} ≠ executed ${JSON.stringify(h)}`);
        const dir = cSt > 0 ? "right" : cSt < 0 ? "left" : null;
        if (h.steer !== dir) bad.push(`${tag}: wheel ends ${h.steer}`);
        for (const a of plan.actions) if (a.ch === "S-brake" && a.down && a.kmh !== pathPressKmh(vAbs, dialKmh)) bad.push(`${tag}: brake pressed at ${a.kmh}, not min(|v|, dial)`);
        if (phase === "reverse") {
          if (!cS && h.S) bad.push(`${tag}: R accelerator left down`);
          if (!cW && h.W) bad.push(`${tag}: R brake left down`);
          if (cW && !h.W) bad.push(`${tag}: R brake not pressed`);
        } else {
          if (!cW && h.W) bad.push(`${tag}: D accelerator left down`);
          if (!cS && h.S) bad.push(`${tag}: D brake left down`);
        }
      }
    return bad;
  };
  const checkYield = (planner) => {
    const bad = [];
    for (const phase of ["roll", "stop", "reverse"]) for (const hW of [false, true]) for (const hS of [false, true]) for (const hSt of [null, "left", "right"])
      for (const brake of [false, true]) for (const wBrake of [false, true]) for (const hold of [false, true]) for (const mode of ["follow", ...HOLD_MODES, "reverse-follow"]) for (const vAbs of [0, 0.8, 1.5, 4]) {
        const held = { W: hW, S: hS, steer: hSt };
        const plan = planner({ phase, held, latch: { brake, coast: false, wBrake, hold }, mode, vAbs });
        const { h, v } = simulate(plan.actions, held, phase);
        const tag = JSON.stringify({ phase, held, brake, wBrake, hold, mode, vAbs });
        for (const x of v) bad.push(`${tag}: ${x}`);
        if (h.steer !== null) bad.push(`${tag}: the wheel is down across the yield`);
        if (phase === "reverse") {
          if (h.S) bad.push(`${tag}: the R accelerator is down across the yield`);
          // a functional brake latched from motion stays down through rest (2026-09-15, LAW 1 — T6.2)
          if (h.W !== (hW && (wBrake || hold))) bad.push(`${tag}: W ${h.W} across the yield`);
        } else {
          if (h.W) bad.push(`${tag}: the D accelerator is down across the yield`);
          if (h.S !== (hS && (brake || HOLD_MODES.includes(mode)))) bad.push(`${tag}: S ${h.S} across the yield`);
        }
      }
    return bad;
  };

  it("T6.5 pathApplyActions / pathYieldActions hold every key invariant on the full grid; each checker reddens on the mutation it guards", () => {
    assert.deepEqual(checkApply(pathApplyActions).slice(0, 3), []);
    assert.deepEqual(checkYield(pathYieldActions).slice(0, 3), []);
    // MUTATION (wmut «pathYield without throttle(false)»): the D accelerator stays down through the beats
    const noLift = (a) => { const p = pathYieldActions(a); return { ...p, actions: p.actions.filter((x) => !(x.ch === "W" && x.down === false && a.phase !== "reverse")) }; };
    assert.ok(checkYield(noLift).length > 0);
    // MUTATION: the yield keeps the wheel
    const keepWheel = (a) => { const p = pathYieldActions(a); return { ...p, actions: p.actions.filter((x) => x.ch !== "steer") }; };
    assert.ok(checkYield(keepWheel).length > 0);
    // MUTATION (HEAD 4209dad): the yield lifts the R brake at rest — a stopped car at its end left unbraked
    const liftAtRest = (a) => {
      const p = pathYieldActions(a);
      if (a.phase === "reverse" && a.held.W && a.vAbs <= 1 && !p.actions.some((x) => x.ch === "W")) return { ...p, actions: [...p.actions, { ch: "W", down: false }] };
      return p;
    };
    assert.ok(checkYield(liftAtRest).some((x) => /W false across the yield/.test(x)));
    // MUTATION (wmut «drop !holdW»): S — the R accelerator — pressed while W is held
    const noGuard = (cmd, ctx) => {
      const p = pathApplyActions(cmd, ctx);
      if (ctx.phase === "reverse" && cmd.S && !p.actions.some((x) => x.ch === "S-accel" && x.down)) return { ...p, actions: [...p.actions, { ch: "S-accel", down: true }] };
      return p;
    };
    assert.ok(checkApply(noGuard).some((x) => /S pressed while W is held|W and S both down/.test(x)));
    // …and the planner never leaves both down when the command did not ask for both
    for (const hW of [false, true]) for (const hS of [false, true]) for (const cW of [false, true]) {
      const p = pathApplyActions({ W: cW, S: !cW, steer: 0 }, { phase: "reverse", held: { W: hW, S: hS, steer: null }, vAbs: 2, dialKmh: 2 });
      assert.equal(p.held.W && p.held.S, false, JSON.stringify({ hW, hS, cW }));
    }
    // MUTATION (the census reads a name): a made-up press speed
    const madeUp = (cmd, ctx) => { const p = pathApplyActions(cmd, ctx); return { ...p, actions: p.actions.map((x) => (x.ch === "S-brake" && x.down ? { ...x, kmh: 99 } : x)) }; };
    assert.ok(checkApply(madeUp).some((x) => /not min\(\|v\|, dial\)/.test(x)));
    // the press speed itself
    assert.equal(pathPressKmh(5, 2), 2);
    assert.equal(pathPressKmh(5, null), 5);
    assert.equal(pathPressKmh(-3, 4), 3);
    assert.equal(pathPressKmh(5, -1), 5);
    assert.equal(pathPressKmh(0.6, 3), 0.6);
  });

  it("T6.6 pathObservation takes the dial and the cluster from the READ, never from anything older", () => {
    const read = { f: 7, x: 1, z: -2, v: -3.4, d: 1 / 60, lx: -0.24, lz: 0.35, cx: 0.8, cz: -1.7, pz: false, dial: 3, gear: ["D"] };
    const o = pathObservation(read, { wallMs: 10, rttMs: 4, phase: "reverse", hz: null, untilMs: 500, entry: true, disarmed: true, held: { W: true, S: false, steer: "left" }, heldS: 0.05, blindP90S: 0.3, edge: { seq: 4, atMs: 9 } });
    assert.equal(o.dialKmh, 3);
    assert.deepEqual(o.gearLetters, ["D"]);
    assert.deepEqual(o.keys, { W: true, S: false, steer: -1 });
    assert.equal(o.disarmed, undefined, "only an explicit false is a failed disarm");
    assert.equal(o.edgeSeq, 4);
    assert.equal(o.edgeAtMs, 9);
    assert.equal(pathObservation({ ...read, dial: -1, gear: undefined }, { held: {} }).dialKmh, null, "an unread dial (-1) is null, never 0");
    assert.deepEqual(pathObservation({ ...read, gear: undefined }, { held: {} }).gearLetters, []);
    assert.equal(pathObservation(read, { held: {}, disarmed: false }).disarmed, false);
    near(circularMedianDeg([359.5, 0.3, 0.1, 359.9, 0.2]), 0.1, 1e-9, "a median about north is 0.1°, not 180°");
    assert.equal(circularMedianDeg([]), null);
  });
});

/* ═══════════════════════════ T7 speed ═══════════════════════════ */

describe("T7 speed", () => {
  it("T7.1 speedTarget: the envelope is the only preview, the floor never lifts a cap, every committed profile is whole", () => {
    const prof = [12, 12, 12, 12];
    const far = speedTarget({ profileKmh: prof, frac: 0.1, stopsAhead: [{ deltaS: 40 }] });
    const close = speedTarget({ profileKmh: prof, frac: 0.1, stopsAhead: [{ deltaS: 2 }] });
    assert.ok(close.vT < far.vT);
    assert.equal(speedTarget({ profileKmh: prof, frac: 0.1, stopsAhead: [{ deltaS: 2, consumed: true }] }).vT, 12);
    assert.equal(speedTarget({ profileKmh: [0.5, 0.5], frac: 0 }).vT, 3, "bin with vAuth < 3 is floored at 3");
    assert.equal(speedTarget({ profileKmh: [12], frac: 0, hzCapKmh: 1.5 }).vT, 1.5, "the floor never lifts a hazard cap");
    assert.equal(speedTarget({ profileKmh: [12], frac: 0, vCapKmh: 7 }).capped, true);
    for (const l of LESSONS) {
      const trace = JSON.parse(readFileSync(resolve(REPO, "content", "traces", l, "shadow-correct.trace.json"), "utf8"));
      for (const seg of plan(l).segments) {
        const m = seg.speed.movingMedianKmh;
        assert.ok(m.length > 0 && m.every((b) => b !== null), `${l} seg ${seg.k} has an empty bin`);
        assert.ok(m.every((b) => Math.max(b, 3) >= 3));
        assert.deepEqual(movingMedianProfile(trace.samples, seg.samples[0] + (seg.teleportDropped !== null && seg.k > 0 ? 1 : 0), seg.samples[1]).length > 0, true);
        if (seg.gear === -1) {
          const g = pedalGrammar({ brake: false, coast: false, wBrake: false }, { gear: -1, vAbs: 0, dialKmh: 0, toStopM: 5, keys: { W: false, S: false } });
          assert.equal(g.S, true, `${l} R${seg.k}: S from rest`);
        } else {
          assert.ok(speedTarget({ profileKmh: m, frac: 0 }).vT >= 3, `${l} F${seg.k} bin 0`);
        }
      }
    }
    const gapLong = plan("sc-park-gap-long").segments[0];
    const at = (arc) => (arc - gapLong.arcM[0]) / gapLong.lengthM;
    assert.ok(speedTarget({ profileKmh: gapLong.speed.movingMedianKmh, frac: at(97.5) }).vT >= 3);
    const judge = plan("sc-park-judge").segments[0];
    assert.ok(speedTarget({ profileKmh: judge.speed.movingMedianKmh, frac: (102 - judge.arcM[0]) / judge.lengthM }).vT >= 3);
  });
});

/* ═══════════════════════════ T8 stability ═══════════════════════════ */

describe("T8 stability margin", () => {
  it("T8.1 PM(0.28) = 30.2°, PM(0.52) ≈ 0, cross-checked by solving |L(jω)| = 1 with the delay", () => {
    near(phaseMarginDeg(0.28), 30.2, 0.1);
    near(phaseMarginDeg(0.52), 0, 0.2);
    for (const D of [0, 0.1, 0.28, 0.4]) {
      // L(jx) = (2/x²)(1 + j·x)·(−1)·e^{−j·x·D}, x = ωLd/v
      let lo = 0.1;
      let hi = 10;
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const mag = (2 / (mid * mid)) * Math.hypot(1, mid);
        if (mag > 1) lo = mid;
        else hi = mid;
      }
      const x = (lo + hi) / 2;
      const phase = -180 + Math.atan(x) * DEG - x * D * DEG;
      near(180 + phase, phaseMarginDeg(D), 1e-6, `D ${D}`);
    }
    near(PM0_DEG, 65.53, 0.01);
    near(PM_SLOPE_DEG_PER_D, 125.9, 0.1);
    for (const kmh of [3, 9, 15]) assert.ok(lookaheadFor(kmh, 0.3, 1) >= Math.min(8, 3.6 * (kmh / 3.6) * 0.3));
  });
});

/* ═══════════════════════════ T10 sign and authority ═══════════════════════════ */

describe("T10 sign audit and authority", () => {
  it("T10.1 foldPathSign: agrees on the modelled plant, contradicts on a mirrored one after ≥ 2.5 m and 10°", () => {
    const run = (mirror, metres) => {
      let st = createPathSign();
      let psi = 0;
      let mod = createModulator();
      const step = 0.05;
      for (let s = 0; s < metres; s += step) {
        const m = modulate(mod, 0.3, 0.05, 0.05);
        mod = m.state;
        const delta = m.k * 0.6 * (mirror ? -1 : 1);
        psi += ((-1 * Math.tan(delta)) / L) * step * DEG;
        st = foldPathSign(st, { u: m.k === 0 ? 0 : m.k, v: -3, stepM: step, psi });
      }
      return st;
    };
    assert.equal(run(false, 3).verdict, "agrees");
    assert.equal(run(true, 3).verdict, "contradicts");
    assert.equal(run(true, 2).verdict, "undetermined");
  });

  it("T10.2 foldAuthority: live, weak, dead (≥ 30° predicted), unexercised", () => {
    const run = (gain, metres, u = 0.5) => {
      let st = createAuthority();
      for (let s = 0; s < metres; s += 0.1) {
        const predicted = ((0.1 * Math.tan(Math.abs(u) * maxSteerAtKmh(5)) * yawGainAtKmh(5)) / L) * DEG;
        st = foldAuthority(st, { u, v: 5, stepM: 0.1, dPsi: predicted * gain });
        st = foldAuthority(st, { u: -u, v: 5, stepM: 0.1, dPsi: -predicted * gain });
      }
      return authorityVerdict(st);
    };
    assert.equal(run(1, 10).verdict, "live");
    assert.equal(run(0.3, 10).verdict, "weak");
    assert.equal(run(0, 10).verdict, "dead");
    assert.equal(run(0, 1).verdict, "unexercised");
  });
});

/* ═══════════════════════════ T11 end pose, outcome, word ═══════════════════════════ */

describe("T11 outcome", () => {
  it("T11.1 captureEndPose: a 60° yaw error at 0.31 m is not «in the box»; a suspect camera is UNMEASURED", () => {
    const seg = plan("sc-park-zebra").segments[1];
    const park = seg.productPark;
    const bay = { x: park.bay.x, z: -park.bay.y };
    const ok = captureEndPose({ pose: { x: bay.x, z: bay.z + 0.31 }, camPsiMedian: park.bay.headingDeg + 60, yawSource: "cam", camYawSuspect: false, witnessEnd: null, authoredEnd: seg.authoredEnd, park });
    assert.equal(ok.inBoxPredicted, false);
    const sus = captureEndPose({ pose: { x: bay.x, z: bay.z }, camPsiMedian: park.bay.headingDeg, yawSource: "cam", camYawSuspect: true, witnessEnd: null, authoredEnd: seg.authoredEnd, park });
    assert.equal(sus.inBoxPredicted, "UNMEASURED");
    assert.equal(sus.yawMeasured, false);
    const good = captureEndPose({ pose: { x: bay.x, z: bay.z }, camPsiMedian: park.bay.headingDeg + 2, yawSource: "cam", camYawSuspect: false, witnessEnd: null, authoredEnd: seg.authoredEnd, park });
    assert.equal(good.inBoxPredicted, true);
  });

  it("T11.2 pathReverseOutcome checks every harness fault, then every UNMEASURED witness, before product blame; a designed negative never blames", () => {
    const park = { centerTolM: 0.5, headingTolDeg: 10 };
    const segs = [{ k: 0, gear: 1 }, { k: 1, gear: -1, productPark: park }, { k: 2, gear: 1 }];
    const measured = { 1: { yawMeasured: true, inBoxPredicted: true } };
    const good = {
      arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: true, armRollM: 0.08 }],
      routeBySegment: [{ k: 1, gear: -1, measured: true, maxM: 0.3, corridorM: 0.6 }],
      productPark: { credited: false, centerOffsetM: 0.3, headingOffsetDeg: 4 },
    };
    const blame = (o) => pathReverseOutcome({ segments: segs, endPoses: measured, evidence: good, credited: false, ...o })[0];
    // the one admissible shape: every witness measured, the product's OWN offsets inside, not credited
    assert.equal(blame({}).branch, 13);
    assert.equal(blame({}).blame, "admissible");
    assert.match(blame({}).text, /INTO THE BOX/);
    assert.equal(blame({ credited: true }).branch, 9);
    for (const code of ["arm-gate-stalled", "arm-roll-out-of-band", "disarm-failed", "reverse-not-armed", "lost-R"]) {
      const o = blame({ refusals: [{ code, k: 1, why: "x" }] });
      assert.equal(o.blame, "harness", code);
      assert.equal(o.branch, 1);
    }
    assert.equal(blame({ sign: { verdict: "contradicts" } }).branch, 2);
    assert.equal(blame({ evidence: { ...good, arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: false, armRollM: 0.31 }] } }).branch, 3, "an out-of-allowance independent armRollM is the harness");
    assert.equal(blame({ evidence: { ...good, routeBySegment: [{ k: 1, gear: -1, measured: true, maxM: 0.9, corridorM: 0.6 }] } }).branch, 5);
    assert.equal(pathReverseOutcome({ segments: segs, endPoses: {}, evidence: good, credited: false })[0].branch, 7);
    // CODE-REVIEW-2 M2: an UNMEASURED arm or route is UNJUDGED — never skipped on to a self-report end pose
    assert.equal(blame({ evidence: { ...good, arms: [{ k: 1, measured: false, why: "no reverse sample for this segment" }] } }).branch, 4);
    assert.equal(blame({ evidence: { ...good, arms: [] } }).branch, 4);
    assert.equal(blame({ evidence: { ...good, arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: null, armRollM: null }] } }).branch, 4);
    assert.equal(blame({ evidence: { ...good, routeBySegment: [{ k: 1, gear: -1, measured: false, why: "UNMEASURED — sample runs do not match the plan" }] } }).branch, 6);
    assert.equal(blame({ evidence: { ...good, routeBySegment: [] } }).branch, 6);
    const allUnmeasured = { arms: [{ k: 1, measured: false }], routeBySegment: [{ k: 0, gear: 1, measured: false }, { k: 1, gear: -1, measured: false }], productPark: { centerOffsetM: 0.3, headingOffsetDeg: 4 } };
    assert.notEqual(blame({ evidence: allUnmeasured }).blame, "admissible", "cr2-probe2: every value unmeasured must not read admissible");
    // CODE-REVIEW-1 M3: the credit must be READ and FALSE, and something independent must show the box
    assert.equal(blame({ credited: null }).branch, 10, "credit unread → UNJUDGED, never admissible (the v1 pinned blame({}) === 8)");
    assert.equal(blame({ credited: undefined }).branch, 10);
    const out = blame({ evidence: { ...good, productPark: { credited: false, centerOffsetM: 0.8, headingOffsetDeg: 12 } } });
    assert.equal(out.branch, 12, "MUTATION GUARD: drop the in-box conjunct and this reads admissible");
    assert.equal(out.blame, "unjudged");
    assert.match(out.text, /THE HARNESS MISSED THE BOX/);
    assert.equal(blame({ evidence: { ...good, productPark: { credited: false, centerOffsetM: 0.49, headingOffsetDeg: 11 } } }).branch, 12, "heading outside alone is outside");
    assert.equal(blame({ evidence: { ...good, productPark: { credited: false, centerOffsetM: null, headingOffsetDeg: null } } }).branch, 11, "no «отместване / ъгъл» read → UNJUDGED");
    // cr2-probe case 3: the controller's own end pose says out of the box, no product numbers → UNJUDGED
    const probe3 = pathReverseOutcome({ segments: [{ k: 0, gear: 1 }, { k: 1, gear: -1 }], endPoses: { 1: { yawMeasured: true, inBoxPredicted: false } }, evidence: { arms: good.arms, routeBySegment: [{ k: 1, gear: -1, measured: true, maxM: 0.4, corridorM: 0.6 }] }, credited: false })[0];
    assert.equal(probe3.blame, "unjudged");
    assert.equal(probe3.branch, 11);
    assert.equal(blame({ segments: [{ k: 0, gear: 1 }, { k: 1, gear: -1 }] }).branch, 11, "a segment with no graded park has no in-box witness");
    // CODE-REVIEW-2 M1b: one lesson flag over several R segments places no blame (cr2-probe case 5)
    const poly = [{ k: 0, gear: 1 }, { k: 1, gear: -1, productPark: park }, { k: 2, gear: 1 }, { k: 3, gear: -1, productPark: park }];
    const ev2 = { ...good, arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: true }, { k: 3, measured: true, startInBand: true, rollWithinAllow: true }], routeBySegment: [{ k: 1, gear: -1, measured: true, maxM: 0.3, corridorM: 0.6 }, { k: 3, gear: -1, measured: true, maxM: 0.3, corridorM: 0.6 }] };
    const multi = pathReverseOutcome({ segments: poly, endPoses: { 1: { yawMeasured: true }, 3: { yawMeasured: true } }, evidence: ev2, credited: false });
    assert.deepEqual(multi.map((o) => [o.k, o.branch, o.blame]), [[1, 10, "unjudged"], [3, 10, "unjudged"]]);
    const mixed = pathCreditBySegment({ segments: poly, revObjectives: [{ done: true }, { done: false }] });
    assert.deepEqual(pathReverseOutcome({ segments: poly, endPoses: { 1: { yawMeasured: true }, 3: { yawMeasured: true } }, evidence: ev2, creditBySegment: mixed }).map((o) => o.branch), [10, 10], "partial credit blames neither segment");
    const none = pathCreditBySegment({ segments: poly, revObjectives: [{ done: false }, { done: false }] });
    assert.deepEqual(pathReverseOutcome({ segments: poly, endPoses: { 1: { yawMeasured: true }, 3: { yawMeasured: true } }, evidence: ev2, creditBySegment: none }).map((o) => o.branch), [13, 13]);
    // mutation (product blame first) — an out-of-band arm on an uncredited drive still reads harness
    assert.equal(blame({ evidence: { ...good, arms: [{ k: 1, measured: true, startInBand: false }] } }).blame, "harness");
    const neg = pathReverseOutcome({ segments: [{ k: 0, gear: -1, designedNegative: true }, { k: 1, gear: 1 }], endPoses: {}, credited: false })[0];
    assert.equal(neg.blame, "none");
    assert.equal(neg.branch, 8);
  });

  /* T11.2b (2026-09-15, CODE-REVIEW-parkleft M1b). canary-path-s2 sc-park-left: its R1 was 0.59 m wide
   * in the bay inside a 0.836 m corridor, crash-pinned for 21 ticks on R1, and the debrief booked
   * «Удар в друго превозно средство −10». HEAD's ladder read none of the three: with the product's
   * own offsets inside it printed branch 13, «admissible». */
  it("T11.2b a reverse the harness drove wide in the bay or into something is the harness's, ahead of every product branch — three independent witnesses, each enough", () => {
    const park = { centerTolM: 0.5, headingTolDeg: 10 };
    const segs = [{ k: 0, gear: 1 }, { k: 1, gear: -1, productPark: park }];
    const measured = { 1: { yawMeasured: true, inBoxPredicted: true } };
    const route = { k: 1, gear: -1, measured: true, maxM: 0.3, corridorM: 0.836 };
    const good = {
      arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: true, armRollM: 0.02 }],
      routeBySegment: [{ k: 0, gear: 1, measured: true, maxM: 0.24, corridorM: 0.426 }, route],
      productPark: { credited: false, centerOffsetM: 0.3, headingOffsetDeg: 4 },
      routeHoldBySegment: [{ k: 0, gear: 1, offRoad: 0, crashPinned: 0, clear: 61, unread: 0, bay: false }, { k: 1, gear: -1, offRoad: 0, crashPinned: 0, clear: 35, unread: 0, bay: true }],
      attribution: { collisionCandidates: [] },
    };
    const run = (ev, o = {}) => pathReverseOutcome({ segments: segs, endPoses: measured, evidence: ev, credited: false, ...o })[0];
    assert.equal(run(good).branch, 13, "the fixture is the admissible shape without a contact");
    const wideBay = { measured: true, n: 9, limitNegM: 0.492, limitPosM: 0.492, worst: { latM: -0.587, lonM: -0.518, tSec: 44 }, over: [{ latM: -0.587, lonM: -0.518, tSec: 44 }], within: false };
    const bayOut = run({ ...good, routeBySegment: [good.routeBySegment[0], { ...route, bay: wideBay, within: false }] });
    assert.deepEqual([bayOut.branch, bayOut.blame], [5.1, "harness"]);
    assert.match(bayOut.text, /lateral room the bay's own bodies leave .*worst -0\.587 m off the bay axis at lon -0\.518 m, t=44s, limits 0\.492 \/ 0\.492 m/);
    // an UNMEASURED route does not hide a measured in-bay excursion (bay rides on unmeasured routes too)
    assert.equal(run({ ...good, routeBySegment: [good.routeBySegment[0], { k: 1, gear: -1, measured: false, driven: true, bay: wideBay, why: "too few moving samples" }] }).branch, 5.1);
    assert.equal(run({ ...good, routeBySegment: [good.routeBySegment[0], { ...route, bay: { ...wideBay, within: true, over: [] } }] }).branch, 13, "a bay measured inside is no contact");
    assert.equal(run({ ...good, routeBySegment: [good.routeBySegment[0], { ...route, bay: { measured: false, n: 0, within: null } }] }).branch, 13, "an unmeasured bay is not an excursion");
    const pinned = run({ ...good, routeHoldBySegment: [good.routeHoldBySegment[0], { ...good.routeHoldBySegment[1], crashPinned: 21 }] });
    assert.deepEqual([pinned.branch, pinned.blame], [5.2, "harness"]);
    assert.match(pinned.text, /crash-pinned on 21 outer tick\(s\) while this segment was being driven/);
    assert.equal(run({ ...good, routeHoldBySegment: [{ ...good.routeHoldBySegment[0], crashPinned: 4 }, good.routeHoldBySegment[1]] }).branch, 13, "a pin tallied on F0 alone is not this segment's (nothing in the debrief)");
    const udar = "Удар в друго превозно средство −10 изпитни т. ОПАСНА ГРЕШКА · НАКАЗАТЕЛНИ ТОЧКИ ПО ИЗПИТНИЯ ЛИСТ";
    const booked = run({ ...good, attribution: { collisionCandidates: [{ code: udar, label: "CANDIDATE" }, { code: "Удар в неподвижно препятствие без допълнителни изпитни точки", label: "CANDIDATE" }] } });
    assert.deepEqual([booked.branch, booked.blame], [5.3, "harness"]);
    assert.match(booked.text, /debrief books a collision on this leg \(«Удар в друго превозно средство» and 1 more\) — no crash-pinned tick places it/);
    assert.equal(run({ ...good, attribution: { collisionCandidates: [{ code: "crashPinnedTicks 21", label: "CANDIDATE" }] } }).branch, 13, "the whole-drive route-hold pseudo-code is not a debrief collision");
    // ORDER: ahead of the credit, the unmeasured witnesses and the in-box witness — never behind them
    assert.equal(run({ ...good, attribution: { collisionCandidates: [{ code: udar }] } }, { credited: true }).branch, 5.3, "a credited segment of a leg that touched something still reads harness (as branch 1's own collision refusal does)");
    assert.equal(pathReverseOutcome({ segments: segs, endPoses: {}, evidence: { ...good, attribution: { collisionCandidates: [{ code: udar }] } }, credited: false })[0].branch, 5.3, "ahead of branch 7");
    assert.equal(run({ ...good, productPark: { credited: false, centerOffsetM: null, headingOffsetDeg: null }, attribution: { collisionCandidates: [{ code: udar }] } }).branch, 5.3, "ahead of branch 11");
    assert.equal(run({ ...good, routeBySegment: [good.routeBySegment[0], { ...route, maxM: 3.88 }], attribution: { collisionCandidates: [{ code: udar }] } }).branch, 5, "the corridor keeps its place");
    // THE CANARY'S OWN SHAPE with the corridor passed: every witness named, the first one's branch
    const canary = run({ ...good, routeBySegment: [good.routeBySegment[0], { ...route, bay: wideBay }], routeHoldBySegment: [good.routeHoldBySegment[0], { ...good.routeHoldBySegment[1], crashPinned: 21 }], attribution: { collisionCandidates: [{ code: udar }] } });
    assert.equal(canary.branch, 5.1);
    assert.equal(canary.blame, "harness");
    assert.match(canary.text, /lateral room.*; and the product held the car crash-pinned on 21.*; and the product's debrief books a collision on this leg \(«Удар в друго превозно средство»\) — the crash-pinned banner above places it on this segment/);
    // several R segments: the pin places it; the debrief blames every R segment and says where the banner was read
    const poly = [{ k: 0, gear: 1 }, { k: 1, gear: -1, productPark: park }, { k: 2, gear: 1 }, { k: 3, gear: -1, productPark: park }];
    const ev2 = {
      ...good,
      arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: true }, { k: 3, measured: true, startInBand: true, rollWithinAllow: true }],
      routeBySegment: [{ ...route, k: 1 }, { ...route, k: 3 }],
      routeHoldBySegment: [{ k: 1, gear: -1, crashPinned: 0 }, { k: 3, gear: -1, crashPinned: 6 }],
    };
    const both = { 1: { yawMeasured: true }, 3: { yawMeasured: true } };
    const none = pathCreditBySegment({ segments: poly, revObjectives: [{ done: false }, { done: false }] });
    assert.deepEqual(pathReverseOutcome({ segments: poly, endPoses: both, evidence: ev2, creditBySegment: none }).map((o) => [o.k, o.branch]), [[1, 13], [3, 5.2]]);
    const multi = pathReverseOutcome({ segments: poly, endPoses: both, evidence: { ...ev2, attribution: { collisionCandidates: [{ code: udar }] } }, creditBySegment: none });
    assert.deepEqual(multi.map((o) => [o.k, o.branch, o.blame]), [[1, 5.3, "harness"], [3, 5.2, "harness"]]);
    assert.match(multi[0].text, /banner was read on R3 \(6\), not on this segment/);
    // the helper alone: null with no witness, and every witness it holds
    assert.equal(contactEvidence(1, route, good), null);
    assert.equal(contactEvidence(1, undefined, {}), null);
    assert.deepEqual(contactEvidence(1, { ...route, bay: wideBay }, { routeHoldBySegment: [null, { k: 1, gear: -1, crashPinned: 2 }] }).reasons.length, 2, "a sparse per-segment tally (pathEvidenceNow's) is read too");
  });

  it("T11.4 pathCreditBySegment places a credit only where the debrief allows; productParkWitness reads the product's own numbers", () => {
    const one = [{ k: 0, gear: 1 }, { k: 1, gear: -1 }];
    const three = [{ k: 0, gear: 1 }, { k: 1, gear: -1 }, { k: 2, gear: 1 }, { k: 3, gear: -1 }, { k: 4, gear: 1 }, { k: 5, gear: -1 }];
    const val = (m) => [...m.values()].map((x) => x.credited);
    assert.deepEqual(val(pathCreditBySegment({ segments: one, revObjectives: [{ done: true }, { done: false }] })), [false]);
    assert.deepEqual(val(pathCreditBySegment({ segments: one, revObjectives: [{ done: true }] })), [true]);
    assert.deepEqual(val(pathCreditBySegment({ segments: one, revObjectives: [], parkCredited: true })), [true]);
    assert.deepEqual(val(pathCreditBySegment({ segments: one, revObjectives: [], parkCredited: null })), [null]);
    assert.deepEqual(val(pathCreditBySegment({ segments: three, revObjectives: [{ done: true }, { done: true }, { done: false }] })), [null, null, null]);
    assert.deepEqual(val(pathCreditBySegment({ segments: three, revObjectives: [{ done: false }, { done: false }, { done: false }] })), [false, false, false]);
    assert.deepEqual(val(pathCreditBySegment({ segments: three, revObjectives: [{ done: true }, { done: true }, { done: true }] })), [true, true, true]);
    assert.deepEqual(val(pathCreditBySegment({ segments: three, revObjectives: [{ done: false }] })), [null, null, null], "one objective cannot be placed on three segments");
    assert.deepEqual(val(pathCreditBySegment({ segments: three, revObjectives: [], parkCredited: false })), [null, null, null]);
    assert.equal(productParkWitness({ centerOffsetM: 0.3, headingOffsetDeg: 4 }, { centerTolM: 0.5, headingTolDeg: 10 }).inTolerance, true);
    assert.equal(productParkWitness({ centerOffsetM: 0.6, headingOffsetDeg: 4 }, { centerTolM: 0.5, headingTolDeg: 10 }).inTolerance, false);
    assert.equal(productParkWitness({ centerOffsetM: null, headingOffsetDeg: 4 }, { centerTolM: 0.5, headingTolDeg: 10 }), null);
    assert.equal(productParkWitness({ centerOffsetM: 0.3, headingOffsetDeg: 4 }, null), null);
  });

  it("T11.5 (CODE-REVIEW-2 M2) the ROUTE and uncredited lines print UNMEASURED for what nobody measured, never «BY CONSTRUCTION» or «yes»", () => {
    const unmeasured = { arms: [{ k: 1, measured: false, why: "no reverse sample for this segment" }], routeBySegment: [{ k: 0, gear: 1, measured: false, why: "UNMEASURED — sample runs do not match the plan" }, { k: 1, gear: -1, measured: false, why: "UNMEASURED — sample runs do not match the plan" }], productPark: { alignment: null } };
    const line = pathRouteLine(unmeasured, null);
    assert.doesNotMatch(line, /BY CONSTRUCTION/);
    assert.match(line, /ROUTE UNMEASURED/);
    const unc = pathUncreditedLine([{ titleBg: "Паркирай на заден ход" }], unmeasured);
    assert.match(unc, /arm in band UNMEASURED, reverse within corridor UNMEASURED/);
    assert.doesNotMatch(unc, /\byes\b/);
    const inside = { arms: [{ k: 1, measured: true, startInBand: true, rollWithinAllow: true }], routeBySegment: [{ k: 0, gear: 1, measured: true, maxM: 0.2, corridorM: 0.5 }, { k: 1, gear: -1, measured: true, maxM: 0.3, corridorM: 0.6 }, { k: 2, gear: 1, micro: true, measured: false }] };
    assert.match(pathRouteLine(inside, null), /^ON THE AUTHORED LINE BY CONSTRUCTION/);
    assert.match(pathRouteLine(inside, null), /F2: unmeasured \(micro\)/);
    assert.match(pathUncreditedLine([{ titleBg: "x" }], inside), /arm in band yes, reverse within corridor yes/);
    const over = { ...inside, routeBySegment: [{ k: 1, gear: -1, measured: true, maxM: 0.9, corridorM: 0.6 }] };
    assert.match(pathRouteLine(over, null), /THE CAR LEFT ITS WITNESS CORRIDOR/);
    assert.match(pathUncreditedLine([{ titleBg: "x" }], { ...over, arms: [{ k: 1, measured: true, startInBand: false, rollWithinAllow: true }] }), /arm in band no, reverse within corridor no/);
    assert.doesNotMatch(pathRouteLine({ routeBySegment: [] }, null), /BY CONSTRUCTION/, "no segment evidence at all is not «on the line»");
  });

  it("T11.3 pathTrackingWord never says tracked/blind/not-invoked; an early refusal is path-refused", () => {
    const words = [
      pathTrackingWord({ routeBySegment: [{ k: 0, measured: true, maxM: 0.1, corridorM: 0.4 }] }),
      pathTrackingWord({ routeBySegment: [{ k: 0, measured: true, maxM: 0.5, corridorM: 0.4 }] }),
      pathTrackingWord({ routeBySegment: [{ k: 0, measured: true, maxM: 0.9, corridorM: 0.4 }] }),
      pathTrackingWord({ routeBySegment: [] }, [{ code: "lost", arcM: 10 }], { authoredArcM: 100 }),
    ].map((w) => w.word);
    assert.deepEqual(words, ["path-followed", "path-degraded", "path-lost", "path-refused"]);
    for (const w of words) assert.ok(!["tracked", "blind", "not-invoked"].includes(w));
    assert.ok(PATH_TESTIMONY.mayNotTestify.some((s) => /ribbon/.test(s)));
  });
});

/* ═══════════════════════════ T12 reducer units ═══════════════════════════ */

/** A straight synthetic plan: one forward segment of `len` m north from (0, 0). */
function straightPlan(len = 60) {
  const rows = [];
  for (let i = 0; i <= len * 10; i++) rows.push([i / 10, 0, -i / 10, 0, -i / 10 + A, 0, 0, 0, 10]);
  return decoratePlan({
    schema: "knijka.pathref/1",
    lesson: "synthetic",
    segments: [{ k: 0, gear: 1, micro: false, lengthM: len, extensionM: 0, stops: [{ tag: "routeEnd", frac: 1, dwellS: 1 }], speed: { movingMedianKmh: Array(len).fill(10) }, witnesses: [{ startAlongM: 0, startPose: { x: 0, z: 0, psi: 0 }, rows }] }],
  });
}
const camFor = (x, z, psi) => {
  const th = (180 - psi) * RAD;
  const Lv = { x: -0.24, z: 0.35 };
  return { lx: Lv.x, lz: Lv.z, cx: x + Lv.x * Math.cos(th) + Lv.z * Math.sin(th), cz: z - Lv.x * Math.sin(th) + Lv.z * Math.cos(th) };
};
const obsAt = (o) => ({ phase: "roll", dialKmh: Math.round(Math.abs(o.v ?? 0)), gearLetters: ["D"], keys: { W: false, S: false, steer: 0 }, rttMs: 5, d: 1 / 60, pz: false, ...camFor(o.x ?? 0, o.z ?? 0, o.psi ?? 0), ...o });

describe("T12 the reducer", () => {
  it("T12.2 shutterOk: true at rest and when straight and settled, false on the lane-change arc", () => {
    let st = createPathState(straightPlan());
    st = pathStep(st, obsAt({ f: 1, x: 0, z: -5, v: 0, wallMs: 0 })).state;
    assert.equal(st.flags.shutterOk, true);
    let s2 = createPathState(straightPlan());
    for (let i = 0; i < 20; i++) s2 = pathStep(s2, obsAt({ f: i + 1, x: 0, z: -5 - i * 0.14, v: 10, wallMs: i * 50 })).state;
    assert.equal(s2.flags.shutterOk, true);
    // sc-park-wall F0 at arc 87 m: the lane change (the witness bends at 87.5 m)
    const wall = plan("sc-park-wall");
    const w = wall.segments[0].witnesses[0];
    const drive = (toArc) => {
      const last = w.rows.findIndex((r) => r[0] >= toArc);
      let st = createPathState(wall);
      for (let j = 0; j <= last; j++) {
        const r = w.rows[j];
        st = pathStep(st, obsAt({ f: j + 1, x: r[1], z: r[2], psi: r[5], v: 9, wallMs: j * 40 })).state;
      }
      return st;
    };
    const s3 = drive(87);
    assert.equal(s3.refusals.length, 0);
    assert.equal(s3.flags.shutterOk, false, "the lane-change arc is not a steer-neutral instant");
    assert.equal(drive(40).flags.shutterOk, true, "a settled straight is");
  });

  it("T12.3 the stall detector: a card never refuses, a stalled page under throttle does, a drain resets it, a frozen car returns", () => {
    const base = (o) => obsAt({ x: 0, z: -5, ...o });
    // (a) frames stop with a pause layer up, latched brake at rest, 30 s → returnNow only
    let a = createPathState(straightPlan());
    a = { ...a, latch: { brake: true, coast: false, wBrake: false } };
    for (let t = 0; t <= 30_000; t += 50) {
      const out = pathStep(a, base({ f: 7, v: 0, pz: t > 0, wallMs: t, entry: t % 500 === 0, keys: { W: false, S: true, steer: 0 } }));
      a = out.state;
      if (t > 0) assert.equal(out.cmd.returnNow, true);
    }
    assert.equal(a.refusals.length, 0, "a teach card must never read as pose-stale");
    // (b) frames stop, no pause layer, latched brake at rest, 10 s → no refusal
    let b = createPathState(straightPlan());
    for (let t = 0; t <= 10_000; t += 50) b = pathStep(b, base({ f: 3, v: 0, wallMs: t, entry: t % 500 === 0, keys: { W: false, S: true, steer: 0 } })).state;
    assert.equal(b.refusals.length, 0);
    // (c) frames stop at 5 km/h with W held: returnNow at 1.0 s; pose-stale only after ≥ 3 s AND a second entry
    let c = createPathState(straightPlan());
    c = pathStep(c, base({ f: 1, v: 5, wallMs: 0, entry: true, keys: { W: true, S: false, steer: 0 } })).state;
    let firstReturn = null;
    let refusedAt = null;
    for (let t = 50; t <= 5000; t += 50) {
      const entry = t === 2000 || t === 3500;
      const out = pathStep(c, base({ f: 1, v: 5, wallMs: t, entry, keys: { W: true, S: false, steer: 0 } }));
      c = out.state;
      if (out.cmd.returnNow && firstReturn === null) firstReturn = t;
      if (c.refusals.some((r) => r.code === "pose-stale") && refusedAt === null) refusedAt = t;
    }
    assert.equal(firstReturn, 1000);
    assert.ok(refusedAt !== null && refusedAt >= 3000, `pose-stale at ${refusedAt}`);
    // (d) a drain between entries resets it
    let d = createPathState(straightPlan());
    d = pathStep(d, base({ f: 1, v: 5, wallMs: 0, entry: true, keys: { W: true, S: false, steer: 0 } })).state;
    for (let t = 50; t <= 5000; t += 50) {
      if (t === 2000) d = pathOnPauseDrain(d);
      d = pathStep(d, base({ f: 1, v: 5, wallMs: t, entry: t === 2000, keys: { W: true, S: false, steer: 0 } })).state;
    }
    assert.equal(d.refusals.length, 0, "a drained pause is not a stalled page");
    // (e) frames advance, the pose does not, W held, 1.5 s → frozen returnNow, not a refusal
    let e = createPathState(straightPlan());
    let frozen = false;
    for (let t = 0, f = 1; t <= 2500; t += 50, f++) {
      const out = pathStep(e, base({ f, v: 0.2, wallMs: t, keys: { W: true, S: false, steer: 0 } }));
      e = out.state;
      if (/frozen/.test(out.cmd.why ?? "")) frozen = true;
    }
    assert.equal(frozen, true);
    assert.equal(e.refusals.length, 0);
  });
});

/* ═══════════════════════════ T9 / T12.1 closed-loop benches ═══════════════════════════
 *
 * lib/path-bench.mjs: the REAL reducer and the outer tick's arm gate, bursts, stop
 * branch and yields as lesson-audit.mjs runs them, on a kinematic plant with the
 * product chain, pedal ramps and ReverseAssist gesture, timed by the first pc-path
 * browser drives (CANARY_PC_S2) and CALIBRATED to their reverse turning. NO WORLD.
 *
 * Where the design's claim does not hold on this bench it is kept as a `todo`
 * with the measured number in its name — the gate stays honest, not green by
 * omission.
 *
 * WHAT THE FIRST REAL DRIVES CHANGED HERE (2026-09-15, canary-path-s1/-s2 at 4209dad).
 * Until then this block blamed the yield contract for 15–20 % of a lock-limited arc's
 * turning (key-on 77 % of frames). That figure was the bench's: `advance()` rounded every
 * sub-frame wait UP to a whole 16.7 ms frame, so each yield released the wheel for 4
 * frames where the browser measures 4–7 ms of blind (pathFollow.cadence.blindMsByPhase).
 * With wall and frame time separated the yield costs ~6 %, and the plant turned 0.94 of
 * the kinematic lock where the product turned 0.89–0.90 (sc-park-left R1 3.9 m and
 * sc-park-wall R1 3.4 m of saturated arc, _audit-path.json): the product's reverse
 * deficit, now `BENCH.revKappaScale` 0.92 (T13.4 pins the calibration). A witness planned
 * at κ × 0.95 near lock therefore has ~3 % more than this car has — and the browser's
 * run-wide needed the card drain of T13.4 on top of it.
 */

const { runBench, plantCentre, W47_PC } = await import("../lib/path-bench.mjs");
const { bayFrame, bayLateralExceeds, bayLateralLimits } = await import("../lib/path-plan/policy.mjs");
const { computePathEvidence } = await import("../lib/path-evidence.mjs");
const { productBoxPrediction } = await import("../lib/path-follow.mjs");
const traceJson = (l) => JSON.parse(readFileSync(resolve(REPO, "content", "traces", l, "shadow-correct.trace.json"), "utf8"));
const p90 = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(0.9 * (s.length - 1))];
};
const benchCache = new Map();
const bench = (lesson, seed, opts = {}) => {
  const key = `${lesson}|${seed}|${JSON.stringify(opts)}`;
  if (!benchCache.has(key)) benchCache.set(key, runBench({ plan: plan(lesson), seed, ...opts }));
  return benchCache.get(key);
};
const psiOf = (pl) => ((pl.psi % 360) + 360) % 360;

describe("T9 closed-loop benches", () => {
  it("T9.a a straight approach 0.5 m off at 12 km/h is within 0.1 m after 15 m", () => {
    const rows = [];
    for (let i = 0; i <= 800; i++) rows.push([i / 10, 0, -i / 10, 0, -i / 10 + A, 0, 0, 0, 12]);
    const p = decoratePlan({ schema: "knijka.pathref/1", lesson: "synthetic", segments: [{ k: 0, gear: 1, micro: false, lengthM: 80, extensionM: 0, stops: [{ tag: "routeEnd", frac: 1, dwellS: 1 }], speed: { movingMedianKmh: Array(80).fill(12) }, witnesses: [{ startAlongM: 0, startPose: { x: 0, z: 0, psi: 0 }, rows }] }] });
    let worstAfter = 0;
    let s0 = null;
    const r = runBench({ plan: p, start: { x: 0.5, z: 0, psi: 0 }, seed: 2, onSubTick: ({ row }) => {
      if (!Number.isFinite(row.s)) return;
      s0 ??= row.s;
      if (row.s - s0 >= 15 && row.s < 70) worstAfter = Math.max(worstAfter, Math.abs(row.ct));
    } });
    assert.equal(r.state.refusals.length, 0);
    assert.ok(worstAfter <= 0.1, `worst ${worstAfter}`);
  });

  /* T9.arm runs DESIGN-v2-CHECK S-14's grid — a_rev {0.9, 1.06, 1.5} × a_coast {0.23, 0.5},
   * the product's crawl coast included (CODE-REVIEW-1 M5). On the faithful bench the
   * selector hold reads the cluster through the HUD's 100 ms poll, as lesson-audit's
   * gear() does, and the allowance does NOT hold there: the measured numbers are in the
   * todo's name. What must hold regardless is kept as a hard test below. */
  const S14 = [];
  for (const aRev of [0.9, 1.06, 1.5]) for (const aCoast of [0.23, 0.5]) S14.push({ aRev, aCoast });
  const armGrid = (lesson, extra = {}) => {
    const rolls = [];
    const drolls = [];
    const refused = [];
    for (const po of S14) for (let seed = 1; seed <= 3; seed++) {
      const r = bench(lesson, seed, { ...extra, plantOpts: po });
      for (const a of r.books.follow.arms) if (a.armRollM !== null) rolls.push(a.armRollM);
      for (const d of r.books.follow.disarms) drolls.push(d.disarmRollM);
      refused.push(...r.state.refusals.map((x) => x.code));
    }
    return { rolls, drolls, refused };
  };

  it("T9.arm p90 disarmRoll ≤ 0.20 m over the S-14 grid", { todo: "calibrated bench: sc-park-judge p90 disarmRoll 0.27 m (0.305 max) — the D creep between «D» landing and the HUD's 100 ms-polled cluster showing it. Single arm rolls reach 0.228 m on both lessons (p90 0.127 wall, 0.148 judge). ARM_ROLL_ALLOW_M 0.2 was derived without the poll" }, () => {
    const { drolls } = armGrid("sc-park-judge");
    assert.ok(p90(drolls) <= 0.2, `sc-park-judge p90 disarmRoll ${p90(drolls)}`);
  });

  it("T9.arm the selector bursts over the S-14 grid (a_rev {0.9, 1.06, 1.5} × a_coast {0.23, 0.5}): p90 armRoll ≤ 0.20 m, rolls bounded, no arm driven out of band, both burst mutations redden", () => {
    for (const lesson of ["sc-park-wall", "sc-park-judge"]) {
      const { rolls, drolls, refused } = armGrid(lesson);
      assert.ok(rolls.length >= 15, `${lesson}: ${rolls.length} arms`);
      assert.ok(p90(rolls) <= 0.2, `${lesson} p90 armRoll ${p90(rolls)}`);
      // the bound the faithful bench meets today, so a regression cannot hide inside the todo above
      if (drolls.length) assert.ok(p90(drolls) <= 0.4, `${lesson} p90 disarmRoll ${p90(drolls)}`);
      assert.ok(refused.every((c) => c === "arm-roll-out-of-band"), `${lesson}: ${JSON.stringify(refused)}`);
      // every stop-acceptance lower corner minus the p90 roll still starts inside the screened band
      for (const seg of plan(lesson).segments.filter((s) => s.gear === -1 && !s.designedNegative)) {
        assert.ok(seg.stopTarget.acceptAlongM[0] - p90(rolls) >= seg.armBand.alongM[0] - 1e-9);
      }
    }
    // fail closed: wherever a run DID arm, the INDEPENDENT arm evidence is in band or the run refused
    for (const po of S14) for (let seed = 1; seed <= 3; seed++) {
      const r = bench("sc-park-judge", seed, { plantOpts: po });
      const ev = computePathEvidence({ samples: r.books.samples, trace: traceJson("sc-park-judge"), lesson: "sc-park-judge" });
      for (const a of ev.arms.filter((x) => x.measured)) {
        if (a.startInBand === false) assert.ok(r.state.refusals.some((x) => x.code === "arm-roll-out-of-band"), `seed ${seed} ${JSON.stringify(po)}: an out-of-band start was driven`);
      }
    }
    // MUTATION: HEAD's fixed 1100 ms hold with the lift at return
    const fixed = runBench({ plan: plan("sc-park-wall"), seed: 1, holdMode: "fixed", plantOpts: { aRev: 1.2, aCoast: 0.5 } });
    assert.ok(fixed.books.follow.arms[0].armRollM > 0.5, `fixed hold roll ${fixed.books.follow.arms[0].armRollM}`);
    // MUTATION (N4, DESIGN-v2-CHECK): HEAD's stop-first press at rest on the disarm, with the functional
    // brake LIFTED at rest as HEAD left it → an armed press, and the D creep returns
    const n4 = armGrid("sc-park-judge", { disarmSkipAtRest: false, liftBeforeDisarm: true });
    const fix = armGrid("sc-park-judge");
    assert.ok(p90(n4.drolls) >= 0.4, `the N4 mutation must roll the disarm ≥ 0.40 m (p90 ${p90(n4.drolls)})`);
    assert.ok(p90(fix.drolls) <= p90(n4.drolls) - 0.15, `the at-rest skip must save ≥ 0.15 m (fix ${p90(fix.drolls)} vs mutation ${p90(n4.drolls)})`);
    // …and the R HOLD (2026-09-15) is a second net on its own: with the brake still held from motion the
    // stop-first press is a no-op, so the skip disabled alone rolls no further than the fix
    const holdOnly = armGrid("sc-park-judge", { disarmSkipAtRest: false });
    assert.ok(p90(holdOnly.drolls) <= p90(fix.drolls) + 0.05, `held W: skip disabled rolls ${p90(holdOnly.drolls)} vs fix ${p90(fix.drolls)}`);
  });

  const wallSeg = () => plan("sc-park-wall").segments[1];
  const cornerRun = (along, lat, yaw) => {
    const seg = wallSeg();
    const p = decoratePlan({ ...plan("sc-park-wall"), segments: [seg] });
    const gc = seg.gearChangePose;
    const h = headingUnit(gc.psi);
    const rg = rightUnit(gc.psi);
    return runBench({ plan: p, start: { x: gc.x + along * h.x + lat * rg.x, z: gc.z + along * h.z + lat * rg.z, psi: gc.psi + yaw }, seed: 3 });
  };
  const cornersOf = () => {
    const seg = wallSeg();
    const out = [];
    for (const along of seg.stopTarget.acceptAlongM) for (const lat of seg.armBand.latM) for (const yaw of seg.armBand.yawDeg) {
      const drift = 0.2 * Math.abs(Math.sin((yaw * Math.PI) / 180)) + 1e-3;
      out.push([along, lat - Math.sign(lat) * (drift + 1e-3), yaw]);
    }
    return out;
  };

  const inBandOf = (v, [lo, hi]) => v >= lo - 1e-9 && v <= hi + 1e-9;

  it("T9.b sc-park-wall R1 from the 8 stop-acceptance corners: the reverse starts in band with roll ≤ 0.20 m, no corner refuses", { todo: "calibrated bench, seed 3: 4 of 8 corners refuse arm-roll-out-of-band — the four +1.5° corners read 1.74° at the reverse settle (cam-yaw read noise and pitch leak at the band edge); the lower corners' roll now stays inside the −1.0 m edge" }, () => {
    const seg = wallSeg();
    for (const [along, lat, yaw] of cornersOf()) {
      const r = cornerRun(along, lat, yaw);
      const arm = r.books.follow.arms[0];
      assert.equal(r.state.refusals.length, 0, `${along}/${lat}/${yaw}: ${JSON.stringify(r.state.refusals)}`);
      assert.ok(along - arm.startPose.alongM <= 0.2, "roll");
      assert.ok(inBandOf(arm.startPose.alongM, seg.armBand.alongM) && inBandOf(arm.startPose.latM, seg.armBand.latM));
    }
  });

  it("T9.b (hard) from every corner the reverse either starts in its screened band and drives (or refuses bay-lateral before contact), or refuses arm-roll-out-of-band — never a reverse begun out of band", () => {
    const seg = wallSeg();
    let drove = 0;
    for (const [along, lat, yaw] of cornersOf()) {
      const r = cornerRun(along, lat, yaw);
      const arm = r.books.follow.arms[0];
      assert.ok(arm, `${along}/${lat}/${yaw}: no arm booked`);
      const roll = along - arm.startPose.alongM;
      assert.ok(roll <= 0.35, `${along}/${lat}/${yaw}: roll ${roll}`);
      const inBand = inBandOf(arm.startPose.alongM, seg.armBand.alongM) && inBandOf(arm.startPose.latM, seg.armBand.latM) && inBandOf(arm.startPose.yawErrDeg, seg.armBand.yawDeg);
      if (r.state.refusals.length === 1 && r.state.refusals[0].code === "bay-lateral") {
        // a corner that starts in band but swings wide INTO THE BAY is stopped before its flank meets
        // the neighbour (policy.mjs BAY_FLANKS); without the refusal the −0.8 m / +lat corner ends
        // 0.46–0.56 m wide against a 0.49 m limit (calibrated bench, seeds 1–6)
        assert.equal(inBand, true, `${along}/${lat}/${yaw}: bay-lateral on a reverse begun out of band`);
        const lim = bayLateralLimits("sc-park-wall", 1);
        const c = plantCentre(r.plant);
        const fr = bayFrame(lim.bay, c.x, c.z);
        assert.ok(Math.abs(fr.latM) <= (fr.latM < 0 ? lim.negM : lim.posM), `${along}/${lat}/${yaw}: stopped ${fr.latM} m wide — past the limit it refused on`);
        drove += 1;
      } else if (r.state.refusals.length) {
        assert.deepEqual(r.state.refusals.map((x) => x.code), ["arm-roll-out-of-band"], `${along}/${lat}/${yaw}`);
        assert.equal(inBand, false, `${along}/${lat}/${yaw}: refused a start that was in band`);
        assert.equal(r.books.follow.segments.length, 0, "a refused arm drives no reverse segment");
      } else {
        assert.equal(inBand, true, `${along}/${lat}/${yaw}: drove a reverse that began out of band`);
        drove += 1;
      }
    }
    assert.ok(drove >= 1, "at least one corner must drive, or this test certifies only refusals");
  });

  it("T9.b … stays inside its corridor and ends inside the product box from every corner", { todo: "calibrated bench, seed 3: 4 of 8 corners refuse before the reverse (see above) and the −0.8 m / +0.14 m / −1.5° corner refuses bay-lateral — it would end 0.46–0.56 m wide against 0.49 m (seeds 1–6)" }, () => {
    const seg = wallSeg();
    for (const [along, lat, yaw] of cornersOf()) {
      const r = cornerRun(along, lat, yaw);
      assert.deepEqual(r.state.refusals, [], `${along}/${lat}/${yaw}`);
      const corridor = seg.witnesses.find((w) => w.startAlongM === r.state.witness.startAlongM).corridorM;
      assert.ok(r.books.follow.segments[0].ctMaxM <= corridor, `ct ${r.books.follow.segments[0].ctMaxM} > ${corridor}`);
      const box = productBoxPrediction(seg.productPark, plantCentre(r.plant), psiOf(r.plant));
      assert.equal(box.inBox, true, `${along}/${lat}/${yaw}: ${JSON.stringify(box)}`);
    }
  });

  /* T9.c ON THE CALIBRATED BENCH (CODE-REVIEW-1 M2; 2026-09-15): the runner reads what lesson-audit
   * reads — the HUD-polled dial and cluster, the edge sequence, a camera yaw with read noise and a
   * pitch leak — through the SAME observation and planners. Measured over seeds 1–20:
   * wall, left, van, driveway, judge, zebra, gap-long and 45-rev 0 refusals, 0 corridor or in-bay
   * misses, 20/20 in the box; gap-short 4/20 fail closed (seeds 4, 16, 19 gear-change-missed and 8
   * arm-roll-out-of-band — rest and settle yaw a hair past the one-sided band edge at 0°) and is
   * split out with its fail-closed outcome pinned. */
  const PARKS = ["sc-park-wall", "sc-park-left", "sc-park-van", "sc-pk-driveway", "sc-park-judge", "sc-park-zebra", "sc-park-gap-long"];
  it("T9.c sc-park-45-rev end to end inside its corridors on seeds 7–10", () => {
    for (const seed of [7, 8, 9, 10]) {
      const ev = computePathEvidence({ samples: bench("sc-park-45-rev", seed).books.samples, trace: traceJson("sc-park-45-rev"), lesson: "sc-park-45-rev" });
      for (const s of ev.routeBySegment) if (s.measured) assert.ok(s.maxM <= s.corridorM, `seed ${seed} seg ${s.k}: ${s.maxM} > ${s.corridorM}`);
    }
  });

  it("T9.c (hard) sc-park-45-rev: no refusal, arms in band, ≥ 3 of 4 seeds in the box, and a corridor miss reads THE HARNESS in REVERSE OUTCOME, never admissible", () => {
    const lesson = "sc-park-45-rev";
    const p = plan(lesson);
    let inBox = 0;
    for (const seed of [7, 8, 9, 10]) {
      const r = bench(lesson, seed);
      assert.deepEqual(r.state.refusals, [], `seed ${seed}`);
      const ev = computePathEvidence({ samples: r.books.samples, trace: traceJson(lesson), lesson });
      for (const a of ev.arms) assert.ok(a.startInBand === true && a.rollWithinAllow !== false, `seed ${seed} arm ${JSON.stringify(a)}`);
      for (const s of ev.routeBySegment) if (s.measured) assert.ok(s.maxM <= s.corridorM + 0.15, `seed ${seed} seg ${s.k}: ${s.maxM} beyond the bound`);
      const outcome = pathReverseOutcome({ segments: p.segments, refusals: r.state.refusals, evidence: { ...ev, productPark: { credited: false, centerOffsetM: 0.1, headingOffsetDeg: 1 } }, sign: r.state.sign, endPoses: r.state.endPoses, credited: false });
      const miss = ev.routeBySegment.some((s) => s.gear === -1 && s.measured && s.maxM > s.corridorM);
      for (const o of outcome) {
        if (miss) assert.equal(o.blame, "harness", `seed ${seed}: a corridor miss must blame the harness, got ${o.text}`);
        else assert.notEqual(o.blame, "harness", `seed ${seed}: ${o.text}`);
      }
      if (productBoxPrediction(p.product.park, plantCentre(r.plant), psiOf(r.plant)).inBox) inBox += 1;
    }
    assert.ok(inBox >= 3, `${lesson}: ${inBox}/4 in the box`);
  });

  it("T9.c sc-park-gap-short (hard): a refusal is only the fail-closed band edge, never a driven reverse out of band; ≥ 3 of 4 seeds in the box", () => {
    const lesson = "sc-park-gap-short";
    let inBox = 0;
    for (const seed of [7, 8, 9, 10]) {
      const r = bench(lesson, seed);
      for (const x of r.state.refusals) assert.ok(["gear-change-missed", "arm-roll-out-of-band"].includes(x.code), `seed ${seed}: ${x.code}`);
      const ev = computePathEvidence({ samples: r.books.samples, trace: traceJson(lesson), lesson });
      if (!r.state.refusals.length) {
        for (const a of ev.arms) assert.ok(a.startInBand === true && a.rollWithinAllow !== false, `seed ${seed} arm ${JSON.stringify(a)}`);
        for (const sg of ev.routeBySegment) if (sg.measured) assert.ok(sg.maxM <= sg.corridorM, `seed ${seed} seg ${sg.k}`);
      } else assert.equal(r.books.follow.segments.filter((sg) => sg.gear === -1).length, 0, `seed ${seed}: a refused arm drove a reverse`);
      if (productBoxPrediction(plan(lesson).product.park, plantCentre(r.plant), psiOf(r.plant)).inBox) inBox += 1;
    }
    assert.ok(inBox >= 3, `${lesson}: ${inBox}/4 in the box`);
  });

  it("T9.c every other parking lesson end to end: no refusal, arms in band within allowance, segments inside their corridors and bays (independent), ≥ 3 of 4 seeds in the product box", () => {
    for (const lesson of PARKS) {
      let inBox = 0;
      for (const seed of [7, 8, 9, 10]) {
        const r = bench(lesson, seed);
        assert.deepEqual(r.state.refusals, [], `${lesson} seed ${seed}`);
        const ev = computePathEvidence({ samples: r.books.samples, trace: traceJson(lesson), lesson });
        for (const a of ev.arms) assert.ok(a.startInBand === true && a.rollWithinAllow !== false, `${lesson} seed ${seed} arm ${JSON.stringify(a)}`);
        for (const s of ev.routeBySegment) if (s.measured) assert.ok(s.maxM <= s.corridorM, `${lesson} seed ${seed} seg ${s.k}: ${s.maxM} > ${s.corridorM}`);
        for (const s of ev.routeBySegment) if (s.bay) assert.equal(s.bay.within, true, `${lesson} seed ${seed} R${s.k} in-bay ${JSON.stringify(s.bay.worst)}`);
        const box = productBoxPrediction(plan(lesson).product.park, plantCentre(r.plant), psiOf(r.plant));
        if (box.inBox) inBox += 1;
      }
      assert.ok(inBox >= 3, `${lesson}: ${inBox}/4 in the box`);
    }
  });

  it("T9.c sc-ed-poligon-chain end to end", { todo: "bench: F4's lock-limited turn reaches the R5 gear change 0.3 m / 4° off (gear-change-missed) — the yield contract's steering loss" }, () => {
    const r = bench("sc-ed-poligon-chain", 7);
    assert.deepEqual(r.state.refusals, []);
  });

  it("T9.d sc-park-bay-exit-rev: R0 ends in Задача 1's zone; F1 acquires and holds ≤ 0.3 m after 10 m", () => {
    const p = plan("sc-park-bay-exit-rev");
    for (const seed of [1, 2]) {
      let s0 = null;
      let worst = 0;
      const r = runBench({ plan: p, seed, onSubTick: ({ state, row }) => {
        if (state.segIndex !== 1 || state.mode !== "follow" || !Number.isFinite(row.s)) return;
        s0 ??= row.s;
        if (row.s - s0 >= 10) worst = Math.max(worst, Math.abs(row.ct));
      } });
      assert.deepEqual(r.state.refusals, []);
      const end = r.state.endPoses[0].pose;
      assert.ok(Math.hypot(end.x - 1.0, end.z - 3.03) <= 2.5, `R0 ends ${JSON.stringify(end)}`);
      assert.ok(worst <= 0.3, `F1 worst ${worst}`);
    }
  });

  it("T9.e every gear change: no teleport in a witness, and the no-stop R→D switches get a stop at v = 0", () => {
    let changes = 0;
    for (const l of LESSONS) {
      for (const seg of plan(l).segments) {
        for (const w of seg.witnesses) for (let i = 1; i < w.rows.length; i++) assert.ok(Math.hypot(w.rows[i][1] - w.rows[i - 1][1], w.rows[i][2] - w.rows[i - 1][2]) <= 0.2, `${l} seg ${seg.k} jumps at row ${i}`);
      }
      changes += plan(l).segments.length - 1 + (plan(l).segments[0].gear === -1 ? 1 : 0);
    }
    assert.equal(changes, 19);
    for (const lesson of ["sc-park-zebra", "sc-park-gap-short", "sc-park-judge"]) {
      const seg = plan(lesson).segments[1];
      assert.equal(seg.stops[seg.stops.length - 1].tag, "inserted");
      const r = bench(lesson, 7);
      const rev = r.books.samples.filter((s) => s.phase === "reverse");
      assert.equal(rev[rev.length - 1].kmh, 0, `${lesson}: the reverse ends at rest before the disarm`);
      assert.equal(r.books.disarms.length, 1);
    }
  });

  it("T9.f blackouts × 3: no steer key is ever down across a yield", () => {
    const r = runBench({ plan: plan("sc-park-wall"), seed: 5, blackoutScale: 3 });
    assert.equal(r.books.steerAcrossYield, 0);
    assert.deepEqual(r.state.refusals, []);
    assert.ok(r.books.blindToEntryMs.length > 20);
  });

  it("T9.g τ_eff × 2: the stability cap engages and the lane change does not ring up", () => {
    const run = (measured) => {
      const cts = [];
      const r = runBench({ plan: plan("sc-park-wall"), seed: 4, measured, onSubTick: ({ state, row }) => {
        if (state.segIndex === 0 && Number.isFinite(row.s) && row.s > 84 && row.s < 108) cts.push([row.s, row.ct]);
      } });
      const win = (lo) => Math.max(0, ...cts.filter(([s]) => s >= lo && s < lo + 12).map(([, c]) => Math.abs(c)));
      return { r, early: win(84), late: win(96) };
    };
    const one = run(null);
    const two = run({ frameP90S: 0.236, ioP90S: 0.03, periodP50S: 0.1, blindP90S: 0.1 });
    assert.ok(two.r.books.follow.stability.tauEffP90S >= 2 * one.r.books.follow.stability.tauEffP90S - 0.01);
    assert.ok(two.r.books.follow.stability.stabilityCappedM > one.r.books.follow.stability.stabilityCappedM, "v_cap engages more");
    assert.ok(two.late <= two.early + 0.05, `no limit cycle: ${two.early} → ${two.late}`);
    assert.deepEqual(two.r.state.refusals, []);
    assert.equal(W47_PC.beatMs[1], 536);
  });
});

describe("T12.1 the reducer's sequence on the bench", () => {
  const seq = (lesson, seed = 7) => {
    const events = [];
    const r = runBench({ plan: plan(lesson), seed, onSubTick: ({ state, phase }) => {
      events.push({ seg: state.segIndex, mode: state.mode, phase, flags: { ...state.flags } });
    } });
    return { r, events };
  };

  it("segIndex advances only across an outer phase change; atGearChange rises at most once per R segment; routeEnd never releases", () => {
    for (const lesson of ["sc-park-zebra", "sc-park-judge", "sc-park-bay-exit-rev", "sc-ed-poligon-chain"]) {
      const { r, events } = seq(lesson);
      let rises = 0;
      for (let i = 1; i < events.length; i++) {
        const a = events[i - 1];
        const b = events[i];
        if (b.seg !== a.seg) {
          assert.equal(b.seg, a.seg + 1, `${lesson}: segIndex jumps`);
          assert.notEqual(b.phase, a.phase, `${lesson}: segIndex advanced at ${i} without the outer phase change`);
        }
        if (b.flags.atGearChange && !a.flags.atGearChange) rises += 1;
        if (b.flags.routeEnd) assert.notEqual(b.flags.stopRelease === true && b.flags.wantStop === false && b.mode === "await-roll", true, `${lesson}: routeEnd asked for roll`);
      }
      const rSegs = plan(lesson).segments.filter((s) => s.gear === -1).length;
      const entered = events.filter((e, i) => e.phase === "reverse" && (i === 0 || events[i - 1].phase !== "reverse")).length;
      assert.ok(rises <= rSegs, `${lesson}: ${rises} raises for ${rSegs} R segments`);
      assert.ok(entered <= rSegs);
      if (!r.state.refusals.length) assert.equal(entered, rSegs, `${lesson}: every R segment entered`);
    }
  });

  it("a first segment in R is at its gear change at t = 0 (sc-park-bay-exit-rev)", () => {
    assert.equal(createPathState(plan("sc-park-bay-exit-rev")).mode, "hold-for-arm");
    const { events } = seq("sc-park-bay-exit-rev");
    // the outer arm gate opened before the runner's first sub-tick: the first one already sees «reverse»
    assert.equal(events[0].phase, "reverse");
    assert.equal(events[0].seg, 0);
  });

  it("a reverse that cannot start in band refuses, and the refused leg finishes at rest (HEAD's fixed hold rolls out of band)", () => {
    const r = runBench({ plan: plan("sc-park-wall"), seed: 1, holdMode: "fixed" });
    assert.equal(r.state.refusals[0].code, "arm-roll-out-of-band");
    assert.equal(r.state.done, true);
  });

  it("poligon raises atGearChange three times", { todo: "bench: F4 → R5 gear-change-missed (see T9.c)" }, () => {
    const { events } = seq("sc-ed-poligon-chain");
    let rises = 0;
    for (let i = 1; i < events.length; i++) if (events[i].flags.atGearChange && !events[i - 1].flags.atGearChange) rises += 1;
    assert.equal(rises, 3);
  });
});

/* ═══════════════════ T13 the first real drives: end stop, bay room, calibration ═══════════════════
 *
 * canary-path-s2 sc-park-left pc-path (4209dad) failed G3/G4/G5/G6: its R1 ran 0.47 m wide in the
 * last third, touched the neighbour at 0.58 m inside a 0.836 m corridor, then crept 4.0 m past its
 * witness end with `stopLate: "coast"` and state «followed». Each case below is built to FAIL on
 * HEAD's path-follow.mjs (named beside it, measured with HEAD's reducer on this same bench) and
 * passes on the repair.
 */
describe("T13 the reverse end stop, the in-bay lateral limit and the calibrated bench", () => {
  const LEFT = "sc-park-left";
  const witnessEnd = (w) => { const row = w.rows[w.rows.length - 1]; return { x: row[1], z: row[2], psi: row[5] }; };
  /** + = the centre is PAST the witness end (the car faces out of the bay). */
  const pastEnd = (w, c) => { const e = witnessEnd(w); const h = headingUnit(e.psi); return -((c.x - e.x) * h.x + (c.z - e.z) * h.z); };
  /** Run a bench and book, per frame: the worst overrun, and every frame the R accelerator is down after a stop state began. */
  const endRun = (opts) => {
    const book = { maxPastM: -Infinity, witness: null, holdAt: null, sAfterHold: 0, sAfterImpactFrames: 0, wAtHit: null };
    const r = runBench({
      plan: plan(LEFT), stopAfterRouteEndMs: 8000, maxMs: 120_000, ...opts,
      onSubTick: ({ state, plant }) => {
        if (state.mode === "reverse-follow" && state.witness) book.witness = state.witness;
        if (book.holdAt === null && (state.latch.hold || state.latch.wBrake || state.latch.coast || state.mode === "refused")) book.holdAt = plant.ft;
      },
      onFrame: (pl) => {
        if (book.witness) book.maxPastM = Math.max(book.maxPastM, pastEnd(book.witness, plantCentre(pl)));
        if (book.holdAt !== null && pl.ft - book.holdAt > 0.25 && pl.gear === "R" && pl.keys.S) book.sAfterHold += 1;
        if (pl.wall?.hitAt != null && pl.ft - pl.wall.hitAt > 0.4 && pl.gear === "R" && pl.keys.S) book.sAfterImpactFrames += 1;
        if (pl.wall?.hitAt != null && book.wAtHit === null) book.wAtHit = pl.keys.W;
      },
    });
    return { r, book };
  };

  it("T13.1 an R creep after the end is braked and HELD: never past the end by more than the tolerance, never the accelerator again, W down at the end (HEAD: W lifted at rest, 1.7 km past, «followed»)", () => {
    const endX = plan(LEFT).segments[1].authoredEnd.x;
    for (const seed of [1, 2, 3, 4]) {
      const { r, book } = endRun({ seed, plantOpts: { creepMps2: 0.35, creepAfterX: endX + 0.6 } });
      assert.deepEqual(r.state.refusals.map((x) => x.code), [], `seed ${seed}`);
      assert.ok(book.maxPastM <= PATH_TUNE.stops.overrunM, `seed ${seed}: the centre went ${book.maxPastM.toFixed(2)} m past its witness end`);
      assert.equal(book.sAfterHold, 0, `seed ${seed}: the R accelerator was down on ${book.sAfterHold} frame(s) after the stop began`);
      assert.equal(r.plant.keys.W, true, `seed ${seed}: the functional brake is not held at the end`);
      assert.equal(r.plant.gear, "R", `seed ${seed}: the hold toggled the selector`);
      near(r.plant.v, 0, 1e-9, `seed ${seed}: still moving`);
    }
  });

  it("T13.2 a collision stop is a named refusal that brakes and holds and never re-applies the throttle, even when the crash pin lifts and the car is pushed (HEAD: no collision seen, 38–41 m past before `lost` refused it)", () => {
    const endX = plan(LEFT).segments[1].authoredEnd.x;
    for (const seed of [1, 2, 3]) {
      const { r, book } = endRun({ seed, crashAt: { axis: "x", at: endX + 0.9, dir: -1, releaseAfterS: 6, softKmh: 0.8 }, plantOpts: { creepMps2: 0.35, creepAfterX: endX + 1.0 } });
      assert.ok(r.plant.wall.hitAt !== null, `seed ${seed}: the bench never hit its obstacle`);
      assert.deepEqual(r.state.refusals.map((x) => x.code), ["collision"], `seed ${seed}`);
      assert.match(r.state.refusals[0].why, /impact|crash-pinned/);
      assert.equal(r.books.follow.state, "refused", `seed ${seed}: a collision read «${r.books.follow.state}»`);
      assert.equal(book.sAfterImpactFrames, 0, `seed ${seed}: the R accelerator was down ${book.sAfterImpactFrames} frame(s) after the impact`);
      assert.ok(book.maxPastM <= 0, `seed ${seed}: ${book.maxPastM.toFixed(2)} m past the end after a collision 0.9 m before it`);
      assert.equal(r.plant.gear, "R");
      assert.ok(r.books.follow.impacts.length === 1, "the impact is booked");
    }
    // the impact fold on its own: two hard reads with no brake, or one at a full brake's deceleration
    let im = { prev: null, reads: 0, peakMps2: 0 };
    for (const [v, t] of [[3.9, 0], [3.25, 70], [2.48, 117]]) im = foldImpact(im, { vAbs: v, now: t, brakeHeld: false });
    assert.equal(im.hit, true, "canary-path-s2 sc-park-left's three reads: 2.7 and 4.5 m/s² with no pedal down");
    let braked = { prev: null, reads: 0, peakMps2: 0 };
    for (const [v, t] of [[3.9, 0], [3.25, 70], [2.48, 117]]) braked = foldImpact(braked, { vAbs: v, now: t, brakeHeld: true });
    assert.equal(braked.hit, false, "the harness's own brake is not an impact");
    let coast = { prev: null, reads: 0, peakMps2: 0 };
    for (let i = 0; i < 40; i++) coast = foldImpact(coast, { vAbs: 3.7 - i * 0.25 * 0.06 * 3.6, now: i * 60, brakeHeld: false });
    assert.equal(coast.hit, false, "a 0.25 m/s² coast is not an impact");
  });

  /* T13.2b (2026-09-15, CODE-REVIEW-parkleft M1a). The collision witnesses were read in reverse-follow
   * only, and the impact fold is blind while W — R's functional brake — is down. A contact under the
   * final brake reaches the runner through the banner a tick late, after the pinned car was captured:
   * HEAD+repair ended probe-latecrash's 0.5 m / seed 2 contact «followed», refusals [], impacts 0, and
   * 73 of 161 R-phase contacts 0.35–0.9 m before the sc-park-left/-wall ends (seeds 1–12) likewise; now 161/161 refused. */
  it("T13.2b a contact under the final brake is refused `collision` in whichever R mode the banner finds the car — capture, the disarm wait, the route end (HEAD+repair: «followed», no refusal)", () => {
    const endX = plan(LEFT).segments[1].authoredEnd.x;
    // the reviewer's probe case, verbatim: W down at the hit, the banner arrives in reverse-capture
    {
      const { r, book } = endRun({ seed: 2, stopAfterRouteEndMs: 6000, crashAt: { axis: "x", at: endX + 0.5, dir: -1 } });
      assert.equal(book.wAtHit, true, "the case no longer hits with the brake down — re-pick it");
      assert.ok(r.plant.wall.hitAt !== null);
      assert.deepEqual(r.state.refusals.map((x) => [x.code, x.atMode]), [["collision", "reverse-capture"]]);
      assert.match(r.state.refusals[0].why, /crash-pinned .*in «reverse-capture» \(after the end was captured/);
      assert.equal(r.books.follow.state, "refused");
      assert.equal(r.books.follow.impacts.length, 1);
      assert.equal(r.books.follow.impacts[0].atMode, "reverse-capture");
      assert.equal(book.sAfterImpactFrames, 0, "the R accelerator after the impact");
      assert.equal(r.plant.gear, "R");
      assert.equal(r.plant.keys.W, true, "the collision is not braked and held");
    }
    // the census: every contact made in phase reverse is refused, however late
    let underBrake = 0;
    let afterCapture = 0;
    for (const d of [0.6, 0.5, 0.45, 0.4]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        let phaseAtHit = null;
        const r = runBench({ plan: plan(LEFT), seed, stopAfterRouteEndMs: 6000, maxMs: 120_000, crashAt: { axis: "x", at: endX + d, dir: -1 },
          onSubTick: ({ plant, phase }) => { if (plant.wall?.hitAt != null && phaseAtHit === null) phaseAtHit = phase; },
          onFrame: (pl) => { if (pl.wall?.hitAt != null && pl.wall.wAtHit === undefined) pl.wall.wAtHit = pl.keys.W; } });
        if (r.plant.wall.hitAt === null || phaseAtHit !== "reverse") continue;
        assert.deepEqual(r.state.refusals.map((x) => x.code), ["collision"], `contact ${d} m before the end, seed ${seed}: «${r.books.follow.state}»`);
        if (r.plant.wall.wAtHit === true) underBrake += 1;
        if (r.state.refusals[0].atMode !== "reverse-follow") afterCapture += 1;
      }
    }
    assert.ok(underBrake >= 6 && afterCapture >= 6, `the census no longer exercises the late banner (${underBrake} under the brake, ${afterCapture} after capture)`);
  });

  it("T13.2c the route end and the disarm wait read the banner too, in both phases; with no banner they hold and hand over exactly as before", () => {
    const obsAt = (pose, psi, extra) => {
      const lx = -0.24, lz = 0.35, th = (180 - psi) * RAD;
      return { f: 1, x: pose.x, z: pose.z, v: 0, d: 1 / 60, lx, lz, cx: pose.x + lx * Math.cos(th) + lz * Math.sin(th), cz: pose.z - lx * Math.sin(th) + lz * Math.cos(th), pz: false, wallMs: 600, phase: "reverse", dialKmh: 0, gearLetters: ["R"], keys: { W: true, S: false, steer: 0 }, ...extra };
    };
    const at = (lesson, mode) => {
      const p = plan(lesson);
      const k = p.segments.findIndex((s) => s.gear === -1);
      const w = p.segments[k].witnesses[0];
      const st = createPathState(p);
      Object.assign(st, { segIndex: k, mode, witness: w, stops: [] });
      return { st, e: witnessEnd(w), k };
    };
    // route end (sc-park-left: R1 is the last segment)
    {
      const { st, e } = at(LEFT, "route-end");
      const o = pathStep(st, obsAt(e, e.psi, { crash: true }));
      assert.deepEqual(o.state.refusals.map((x) => [x.code, x.k, x.atMode]), [["collision", 1, "route-end"]]);
      assert.equal(o.cmd.W, true, "the brake is kept");
      assert.equal(o.cmd.S, false, "never the R accelerator");
      assert.equal(o.state.books.impacts.length, 1);
      const q = pathStep(at(LEFT, "route-end").st, obsAt(e, e.psi, { crash: false }));
      assert.deepEqual(q.state.refusals, []);
      assert.equal(q.state.mode, "route-end");
      assert.equal(q.cmd.W, true);
    }
    // the disarm wait (sc-park-zebra: R1 then F2), in R and after the disarm burst
    {
      const { st, e } = at("sc-park-zebra", "hold-for-disarm");
      const o = pathStep(st, obsAt(e, e.psi, { crash: true }));
      assert.deepEqual(o.state.refusals.map((x) => [x.code, x.k, x.atMode]), [["collision", 1, "hold-for-disarm"]]);
      assert.equal(o.cmd.S, false);
      const after = pathStep(at("sc-park-zebra", "hold-for-disarm").st, obsAt(e, e.psi, { crash: true, phase: "roll", gearLetters: ["D"], keys: { W: false, S: false, steer: 0 } }));
      assert.deepEqual(after.state.refusals.map((x) => [x.code, x.k]), [["collision", 1]], "a banner that arrives with the disarm is still R1's");
      assert.equal(after.cmd.W, false, "W is D's accelerator after the disarm");
      const clean = pathStep(at("sc-park-zebra", "hold-for-disarm").st, obsAt(e, e.psi, { crash: false, phase: "roll", gearLetters: ["D"], keys: { W: false, S: false, steer: 0 } }));
      assert.deepEqual(clean.state.refusals, []);
      assert.equal(clean.state.mode, "forward-settle");
    }
    // a forward route end is not an R mode: unchanged
    {
      const p = plan("sc-park-zebra");
      const st = createPathState(p);
      const last = p.segments[p.segments.length - 1];
      Object.assign(st, { segIndex: p.segments.length - 1, mode: "route-end", stops: [] });
      const e = last.authoredEnd;
      const o = pathStep(st, obsAt(e, e.psi, { crash: true, phase: "roll", gearLetters: ["D"], keys: { W: false, S: true, steer: 0 } }));
      assert.deepEqual(o.state.refusals, []);
    }
  });

  it("T13.3 a car that passes its end anyway is refusal end-overrun, never «followed» (HEAD: state followed, 2 km past)", () => {
    const endX = plan(LEFT).segments[1].authoredEnd.x;
    let refused = 0;
    for (const seed of [1, 2, 3]) {
      // a card drain near the end lifts the brake while a pushed car rolls on
      const { r } = endRun({ seed, disturbances: [{ k: 1, toEndM: 0.35, stallMs: 0, drainMs: 2500 }], plantOpts: { creepMps2: 0.5, creepAfterX: endX + 1.0 } });
      if (!r.books.drains.length) continue;
      refused += 1;
      assert.deepEqual(r.state.refusals.map((x) => x.code), ["end-overrun"], `seed ${seed}`);
      assert.match(r.state.refusals[0].why, /past the witness end \(tolerance 0\.25 m\)/);
      assert.equal(r.books.follow.state, "refused");
      assert.equal(r.plant.keys.W, true, `seed ${seed}: the overrun is not braked`);
      near(r.plant.v, 0, 1e-9);
    }
    assert.ok(refused >= 2, `only ${refused} of 3 runs met the drain`);
    // …and at capture: a car that came to rest past its end
    const st = createPathState(plan(LEFT));
    const w = plan(LEFT).segments[1].witnesses[0];
    const e = witnessEnd(w);
    const h = headingUnit(e.psi);
    Object.assign(st, { segIndex: 1, mode: "reverse-capture", witness: w, capture: { restFrom: 0, camPsis: [], holdFrom: null }, stops: [] });
    const lx = -0.24, lz = 0.35, th = (180 - e.psi) * RAD;
    const pose = { x: e.x - 0.4 * h.x, z: e.z - 0.4 * h.z };
    const o = pathStep(st, { f: 1, x: pose.x, z: pose.z, v: 0, d: 1 / 60, lx, lz, cx: pose.x + lx * Math.cos(th) + lz * Math.sin(th), cz: pose.z - lx * Math.sin(th) + lz * Math.cos(th), pz: false, wallMs: 600, phase: "reverse", dialKmh: 0, gearLetters: ["R"], keys: { W: true, S: false, steer: 0 } });
    assert.equal(o.state.refusals[0]?.code, "end-overrun", "a rest 0.40 m past the end is not captured as «followed»");
  });

  /* T13.4 THE BENCH IS CALIBRATED TO THE PRODUCT, and it reproduces the browser's run-wide. The
   * product turned 0.896 (sc-park-left R1, 3.9 m) and 0.892 (sc-park-wall R1, 3.4 m) of the
   * kinematic lock curvature over its saturated reverse arcs under the 500 ms runner
   * (canary-path-s2 _audit-path.json, true centre arc over camera yaw). The disturbance is the one
   * the browser met at s 3.8 m of sc-park-left R1: a 540 ms page stall (keys held, world at half
   * rate, the card's 1.25 m/s² of extra slowing) and then a 1150 ms pause drain with every key
   * lifted and the world running (ledger rtt 538 ms, then a 1147 ms gap; 0.28 m and 0.49 m moved). */
  const CARD = Object.freeze({ k: 1, toEndM: 5.06, stallMs: 540, drainMs: 1150, worldRate: 0.5, decelMps2: 1.25 });
  const HEAD_BUDGET = { ...PATH_TUNE, runner: { ...PATH_TUNE.runner, nearLockBudgetMs: 500 }, bay: { ...PATH_TUNE.bay, refuse: false } };
  const trackRun = (lesson, seed, opts = {}) => {
    const rows = [];
    const r = runBench({ plan: plan(lesson), seed, ...opts, onSubTick: ({ state, row, plant }) => { const c = plantCentre(plant); rows.push({ mode: state.mode, u: row.u, v: row.v, s: row.s, ct: row.ct, t: plant.t, cx: c.x, cz: c.z, psi: plant.psi }); } });
    const rev = rows.filter((x) => x.mode === "reverse-follow" && Number.isFinite(x.ct));
    const s0 = rev[0]?.s ?? 0;
    const s1 = rev[rev.length - 1]?.s ?? 0;
    const lastThird = Math.max(0, ...rev.filter((x) => x.s - s0 >= (2 / 3) * (s1 - s0)).map((x) => Math.abs(x.ct)));
    let arc = 0;
    let dpsi = 0;
    let cur = [];
    const flush = () => {
      if (cur.length >= 8) {
        let a = 0;
        for (let i = 1; i < cur.length; i++) a += Math.hypot(cur[i].cx - cur[i - 1].cx, cur[i].cz - cur[i - 1].cz);
        if (a >= 0.8) { arc += a; dpsi += Math.abs(cur[cur.length - 1].psi - cur[0].psi); }
      }
      cur = [];
    };
    for (const x of rows) {
      const ok = x.mode === "reverse-follow" && Math.abs(x.u ?? 0) >= 0.999 && Math.abs(x.v) > 1;
      if (ok && (!cur.length || x.t - cur[cur.length - 1].t < 0.15)) cur.push(x);
      else { flush(); if (ok) cur.push(x); }
    }
    flush();
    const rc = arc / (dpsi * RAD);
    const satFrac = arc > 0 ? 1 / Math.sqrt(rc * rc - A * A) / ((yawGainAtKmh(3) * Math.tan(VEHICLE.MAX_ANGLE_RAD)) / L) : null;
    return { r, lastThird, satFrac };
  };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

  it("T13.4 calibration: at HEAD's 500 ms runner the bench turns 0.87–0.92 of lock on saturated reverse arcs (product 0.892–0.896), and it reproduces the browser — clean R1 ≤ 0.20 m, with the canary's card R1 runs ≥ 0.35 m wide in the last third (browser 0.47 m)", () => {
    const fr = [];
    for (const seed of [1, 2, 3, 4]) {
      const t = trackRun("sc-park-wall", seed, { tune: HEAD_BUDGET });
      if (Number.isFinite(t.satFrac)) fr.push(t.satFrac);
    }
    assert.ok(fr.length >= 3, "no saturated arc to calibrate on");
    const f = median(fr);
    assert.ok(f >= 0.87 && f <= 0.92, `the bench turns ${f.toFixed(3)} of lock — outside the product's calibration`);
    // the plant term is what makes it so: the frame-true bench without it turns ~0.94
    const raw = median([1, 2, 3, 4].map((seed) => trackRun("sc-park-wall", seed, { tune: HEAD_BUDGET, plantOpts: { revKappaScale: 1 } }).satFrac).filter(Number.isFinite));
    assert.ok(raw >= f + 0.03, `revKappaScale 1 turns ${raw.toFixed(3)} vs calibrated ${f.toFixed(3)}`);
    const clean = [1, 2, 3, 4, 5, 6].map((seed) => trackRun(LEFT, seed, { tune: HEAD_BUDGET }).lastThird);
    const card = [1, 2, 3, 4, 5, 6].map((seed) => trackRun(LEFT, seed, { tune: HEAD_BUDGET, disturbances: [CARD] }).lastThird);
    assert.ok(median(clean) <= 0.2, `clean R1 last third median ${median(clean).toFixed(3)}`);
    assert.ok(median(card) >= 0.35, `with the canary's card R1 last third median ${median(card).toFixed(3)} — the bench does not reproduce the browser's 0.47 m`);
  });

  it("T13.4b the near-lock runner budget: 1000 ms turns more and tracks tighter than HEAD's 500 ms on sc-park-wall, and keeps the reverse's INDEPENDENT route measured through the card (2000 ms did not)", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const p = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))]; };
    const head = seeds.map((seed) => trackRun("sc-park-wall", seed, { tune: HEAD_BUDGET }));
    const noBay = { ...PATH_TUNE, bay: { ...PATH_TUNE.bay, refuse: false } };
    const now = seeds.map((seed) => trackRun("sc-park-wall", seed, { tune: noBay }));
    assert.equal(PATH_TUNE.runner.nearLockBudgetMs, 1000);
    assert.ok(median(now.map((x) => x.satFrac)) >= median(head.map((x) => x.satFrac)) + 0.008, `turning ${median(now.map((x) => x.satFrac))} vs ${median(head.map((x) => x.satFrac))}`);
    assert.ok(p(now.map((x) => x.lastThird), 0.9) < p(head.map((x) => x.lastThird), 0.9), `p90 last third ${p(now.map((x) => x.lastThird), 0.9)} vs HEAD ${p(head.map((x) => x.lastThird), 0.9)}`);
    assert.ok(now.every((x) => x.r.books.follow.nearLock.budgetEntries > 0), "the extended budget never ran");
    for (const seed of [1, 2, 3]) {
      const t = trackRun(LEFT, seed, { tune: noBay, disturbances: [CARD] });
      const ev = computePathEvidence({ samples: t.r.books.samples, trace: traceJson(LEFT), lesson: LEFT });
      const rseg = ev.routeBySegment.find((sg) => sg.gear === -1);
      assert.equal(rseg.measured, true, `seed ${seed}: the independent R route went UNMEASURED (${rseg.why})`);
    }
    const long = { ...noBay, runner: { ...PATH_TUNE.runner, nearLockBudgetMs: 2000 } };
    const unmeasured = [1, 2, 3].filter((seed) => !computePathEvidence({ samples: trackRun(LEFT, seed, { tune: long, disturbances: [CARD] }).r.books.samples, trace: traceJson(LEFT), lesson: LEFT }).routeBySegment.find((sg) => sg.gear === -1).measured);
    assert.ok(unmeasured.length >= 2, "2000 ms was rejected because it starves the independent samples — if it no longer does, re-measure the choice");
    // no key crosses a yield at any budget (the screenshot contract, §5.3)
    for (const t of now) assert.equal(t.r.books.steerAcrossYield, 0);
  });

  it("T13.5 the in-bay lateral limit: with the canary's card every sc-park-left R1 stops inside the room its neighbours leave — by refusing bay-lateral before contact where it must — and no clean run of the five bay lessons refuses (HEAD: stopped 0.48–0.85 m wide, the browser touched at 0.58 m)", () => {
    const lim = bayLateralLimits(LEFT, 1);
    near(lim.negM, 0.492, 1e-9);
    near(lim.posM, 0.492, 1e-9);
    near(bayLateralLimits("sc-park-van", 1).posM, 0.422, 1e-9);
    assert.equal(bayLateralLimits("sc-pk-driveway", 1).posM, null);
    assert.equal(bayLateralLimits("sc-park-gap-short", 1), null, "a parallel kerb slot has no flank");
    // the browser's contact pose (canary-path-s2 sc-park-left _audit-path.json t 43.89 s) is over the limit, on the side of lotlf-bay-2
    const contact = bayFrame(lim.bay, -4.512, 0.587);
    near(contact.latM, -0.587, 1e-3);
    assert.equal(bayLateralExceeds(lim, contact.latM), true);
    let refusedWide = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const on = runBench({ plan: plan(LEFT), seed, disturbances: [CARD] });
      const codes = on.state.refusals.map((x) => x.code);
      const c = plantCentre(on.plant);
      const fr = bayFrame(lim.bay, c.x, c.z);
      assert.ok(codes.every((x) => x === "bay-lateral"), `seed ${seed}: ${codes}`);
      assert.ok(Math.abs(fr.latM) <= 0.5, `seed ${seed}: stopped ${fr.latM.toFixed(3)} m off the bay axis`);
      const off = runBench({ plan: plan(LEFT), seed, disturbances: [CARD], tune: { ...PATH_TUNE, bay: { ...PATH_TUNE.bay, refuse: false } } });
      const cf = plantCentre(off.plant);
      if (codes.length && Math.abs(bayFrame(lim.bay, cf.x, cf.z).latM) > lim.negM) refusedWide += 1;
    }
    assert.ok(refusedWide >= 4, `the refusal stopped only ${refusedWide} runs that would otherwise have ended past the limit`);
    for (const lesson of ["sc-park-wall", "sc-park-left", "sc-park-van", "sc-pk-driveway", "sc-park-45-rev"]) {
      for (const seed of [7, 8, 9, 10]) assert.ok(!bench(lesson, seed).state.refusals.some((x) => x.code === "bay-lateral"), `${lesson} seed ${seed}: a clean run refused bay-lateral`);
    }
  });
});
