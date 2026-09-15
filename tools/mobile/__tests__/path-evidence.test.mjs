/**
 * path-evidence.test.mjs — the INDEPENDENT half of a pc-path leg's evidence.
 *
 * Run: node --test tools/mobile/__tests__/path-evidence.test.mjs
 *
 * `lib/path-evidence.mjs` is what may GATE (DESIGN-v2 §8.1): route per segment,
 * the arm before and after its roll, the stops from Σ dtMs, the speed envelope,
 * the arrival lag, the product's own park words, and the one-way attribution.
 * It is independent of the controller and of the witnesses — never of the pose
 * probe, which both read. The import pin below is what keeps the first half of
 * that sentence true.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeDeviation } from "../lib/guidance.mjs";
import { segmentPoints } from "../lib/path-plan/geom.mjs";
import { corridorFor, ARM_ROLL_ALLOW_M, bayLateralLimits } from "../lib/path-plan/policy.mjs";
import {
  SAME_PROBE,
  armPoseFromSamples,
  arrivalLagFromSamples,
  attributeMistakes,
  authoredMovingMedian,
  bayLateralOfRun,
  computePathEvidence,
  gearSegmentsOfTrace,
  overshootFromSamples,
  parseParkDebrief,
  routeBySegment,
  segmentPolyline,
  stopsFromSamples,
} from "../lib/path-evidence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const SRC = resolve(REPO, "tools", "mobile", "lib", "path-evidence.mjs");
const traceOf = (l) => JSON.parse(readFileSync(resolve(REPO, "content", "traces", l, "shadow-correct.trace.json"), "utf8"));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

/** Outer-tick samples along a trace's segments: every `every`-th authored point, shifted `lat` m. */
function samplesAlong(trace, { lat = 0, every = 4, restTicks = 3, dtMs = 550, rollM = 0.1 } = {}) {
  const { S, segs } = gearSegmentsOfTrace(trace);
  const out = [];
  let t = 0;
  const push = (o) => { t += o.dtMs ?? dtMs; out.push({ tSec: Math.round(t / 1000), dtMs, loop: false, ...o }); };
  for (const sg of segs) {
    const pts = segmentPoints(S, sg);
    for (let i = 0; i < pts.length; i += every) {
      const [x, y] = pts[i];
      push({ kmh: sg.g === -1 ? 3 : 9, wx: x + lat, wz: -y, phase: sg.g === -1 ? "reverse" : "roll-path" });
    }
    const [ex, ey] = pts[pts.length - 1];
    const e = S[sg.i1];
    const h = { x: Math.sin((e.psi * Math.PI) / 180), z: -Math.cos((e.psi * Math.PI) / 180) };
    for (let r = 0; r < restTicks; r++) push({ kmh: 0, wx: ex + lat, wz: -ey, phase: sg.g === -1 ? "reverse" : "stop" });
    // the arm roll: the first reverse sample of the next R segment sits rollM back along the approach
    if (segs[sg.k + 1]?.g === -1) push({ kmh: 0, wx: ex + lat - rollM * h.x, wz: -ey - rollM * h.z, phase: "reverse" });
  }
  return out;
}

/**
 * Strip line and block comments, respecting string and template literals — a glob
 * such as path-refs/(star).json inside a line comment must not open a block.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let q = null;
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (q) {
      out += ch;
      if (ch === "\\") {
        out += nx ?? "";
        i += 2;
        continue;
      }
      if (ch === q) q = null;
      i += 1;
      continue;
    }
    if (ch === "/" && nx === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && nx === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") q = ch;
    out += ch;
    i += 1;
  }
  return out;
}

describe("§12.2 path-evidence", () => {
  const lesson = "sc-park-wall";
  const trace = traceOf(lesson);

  it("routeBySegment equals a hand computation with routeDeviation; a run mismatch is UNMEASURED", () => {
    const samples = samplesAlong(trace, { lat: 0.2 });
    const got = routeBySegment(samples, trace, lesson);
    const { S, segs } = gearSegmentsOfTrace(trace);
    for (const sg of segs) {
      const idx = samples.map((s, i) => [s, i]).filter(([s]) => (sg.g === -1 ? s.phase === "reverse" : s.phase === "roll-path" || s.phase === "stop")).map(([, i]) => i);
      const want = routeDeviation(idx.map((i) => samples[i]), segmentPolyline(S, sg));
      const g = got.find((x) => x.k === sg.k);
      assert.equal(g.measured, true);
      near(g.maxM, want.maxM, 1e-9, `seg ${sg.k}`);
      assert.equal(g.corridorM, corridorFor(lesson, sg.k));
      near(g.maxM, 0.2, 0.06, `seg ${sg.k} lateral shift`);
    }
    const bad = samples.map((s) => ({ ...s, phase: "roll-path" }));
    const r = routeBySegment(bad.concat([{ ...bad[0], phase: "reverse" }, { ...bad[0], phase: "roll-path" }, { ...bad[0], phase: "reverse" }]), trace, lesson);
    assert.ok(r.every((x) => x.measured === false && /UNMEASURED/.test(x.why)));
  });

  /* THE IN-BAY LATERAL CHECK (2026-09-15, canary-path-s2 sc-park-left): the segment corridor passed a
   * car that stood 0.58 m off its bay axis beside a parked neighbour. The bay's own room gates too. */
  it("bayLateralOfRun: inside the bay the product's own flank room gates; a run that never entered the bay is UNMEASURED; a kerb slot has no flank", () => {
    const lim = bayLateralLimits("sc-park-left", 1);
    // probe frame for sc-park-left's bay (x −5.03, y 0, heading 270): lon = −(x + 5.03), lat = −z
    const at = (lon, lat, extra = {}) => ({ wx: -5.03 - lon, wz: -lat, kmh: 2, tSec: 40, ...extra });
    const inside = bayLateralOfRun([at(1.8, 0.2), at(-1.0, 0.3), at(-1.9, -0.45), at(3.5, 1.5)], "sc-park-left", 1);
    assert.equal(inside.measured, true);
    assert.equal(inside.n, 3, "the sample 3.5 m out (past the 0.5 m mouth inset) is not in the bay");
    assert.equal(inside.within, true);
    near(inside.limitNegM, lim.negM, 1e-9);
    // the browser's contact pose, 0.587 m wide on lotlf-bay-2's side
    const wide = bayLateralOfRun([at(-1.0, 0.1), { wx: -4.512, wz: 0.587, kmh: 3, tSec: 44 }], "sc-park-left", 1);
    assert.equal(wide.within, false);
    near(wide.over[0].latM, -0.587, 1e-3);
    const never = bayLateralOfRun([at(3.0, 0), at(4.2, 0.1)], "sc-park-left", 1);
    assert.deepEqual([never.measured, never.within], [false, null], "a bay nobody entered is UNMEASURED, never a pass");
    assert.match(never.why, /UNMEASURED/);
    assert.equal(bayLateralOfRun([at(0, 3)], "sc-park-gap-short", 1), null);
  });

  it("armPoseFromSamples: start from the FIRST reverse sample, armRollM = rest − start, a 0.3 m roll is out of allowance", () => {
    const ok = armPoseFromSamples(samplesAlong(trace, { rollM: 0.1 }), trace, lesson);
    assert.equal(ok.length, 1);
    near(ok[0].armRollM, 0.1, 1e-3);
    assert.equal(ok[0].rollWithinAllow, true);
    assert.ok(ok[0].startAlongM < ok[0].restAlongM, "a reverse roll moves the start back along the approach");
    const bad = armPoseFromSamples(samplesAlong(trace, { rollM: 0.3 }), trace, lesson);
    near(bad[0].armRollM, 0.3, 1e-3);
    assert.equal(bad[0].rollWithinAllow, false);
    assert.ok(0.3 > ARM_ROLL_ALLOW_M);
    // a lateral offset shows in startLatM with its sign (+ right of the approach heading, north → +x)
    const lat = armPoseFromSamples(samplesAlong(trace, { lat: 0.12 }), trace, lesson);
    near(lat[0].startLatM, 0.12, 1e-3);
    assert.equal(ok[0].basis, SAME_PROBE);
  });

  it("stopsFromSamples: rest from Σ dtMs (a 1.35 s dwell tSec would round to 1 s), signed stopErrM", () => {
    const samples = samplesAlong(trace, { restTicks: 4, dtMs: 450 });
    const st = stopsFromSamples(samples, trace, lesson);
    const gc = st.find((s) => s.tag === "gearChange");
    assert.equal(gc.measured, true);
    assert.ok(gc.restLoS >= 1.35, `restLo ${gc.restLoS}`);
    assert.ok(Number.isFinite(gc.stopErrM));
    // against the POLICY stop target (−0.25 m along for wall): resting on the authored pose is +0.25 long
    near(gc.stopErrM, 0.25, 0.12);
    assert.equal(gc.basis, SAME_PROBE);
  });

  it("overshootFromSamples recomputes vAuthMove from the trace, equal to the builder's for every pathref; 3 km/h over reads 3", () => {
    for (const f of readdirSync(resolve(REPO, "tools", "mobile", "path-refs")).filter((x) => x.endsWith(".pathref.json"))) {
      const ref = JSON.parse(readFileSync(resolve(REPO, "tools", "mobile", "path-refs", f), "utf8"));
      const tr = traceOf(ref.lesson);
      const { segs } = gearSegmentsOfTrace(tr);
      for (const sg of segs) {
        const committed = ref.segments.find((x) => x.k === sg.k).speed.movingMedianKmh;
        assert.deepEqual(authoredMovingMedian(tr, sg), committed, `${ref.lesson} seg ${sg.k}`);
      }
    }
    const samples = samplesAlong(trace).map((s) => (s.phase === "roll-path" ? { ...s, kmh: 0 } : s));
    const { S, segs } = gearSegmentsOfTrace(trace);
    const prof = authoredMovingMedian(trace, segs[0]);
    const pts = segmentPoints(S, segs[0]);
    const k = 40;
    samples[k] = { ...samples[k], kmh: Math.max(prof[Math.floor(k * 4 * 0.2)] ?? 3, 3) };
    const i10 = samples.findIndex((s) => s.phase === "roll-path");
    const at = pts[200];
    const env = Math.max(prof[Math.floor(S[segs[0].p0 + 200]?.s ?? 0)] ?? 3, 3);
    const one = [...samples.slice(0, i10), { tSec: 1, dtMs: 500, kmh: Math.round(env) + 3, wx: at[0], wz: -at[1], phase: "roll-path" }];
    const sp = overshootFromSamples(one.concat(samples.filter((s) => s.phase !== "roll-path")), trace, lesson);
    assert.ok(sp[0].overshootKmh >= 2.5 && sp[0].overshootKmh <= 3.5, `overshoot ${sp[0].overshootKmh}`);
  });

  it("arrivalLagFromSamples uses Σ dtMs; a drained pause (reset dtMs) adds no lag; no arc gives null, never 0", () => {
    const l = "sc-park-bay-exit-rev";
    const tr = traceOf(l);
    const s1 = samplesAlong(tr, { every: 2, dtMs: 300 });
    const a1 = arrivalLagFromSamples(s1, tr, l);
    assert.equal(a1.length, 1);
    assert.ok(Number.isFinite(a1[0].lagWallS));
    const i = s1.findIndex((s) => s.phase === "roll-path") + 2;
    const s2 = s1.map((s, j) => (j === i ? { ...s, dtMs: 40 } : s));
    assert.ok(arrivalLagFromSamples(s2, tr, l)[0].lagWallS <= a1[0].lagWallS, "a drained tick resets dtMs and adds nothing");
    const dw = arrivalLagFromSamples(samplesAlong(traceOf("sc-pk-driveway")), traceOf("sc-pk-driveway"), "sc-pk-driveway");
    assert.equal(dw[0].lagWallS, null);
  });

  it("parseParkDebrief reads w47 text shapes, comma decimals; absent is null, never 0", () => {
    const debrief = {
      objectives: [{ titleBg: "Паркиране: 1 опит · подравняване: центрирано", done: true }],
      sections: { 'section[aria-label="Оценка на маневрата"]': { text: "В очертанията, с малко отместване (отместване 0,3 м, ъгъл 4,1°)." } },
    };
    const p = parseParkDebrief(debrief);
    assert.equal(p.credited, true);
    assert.equal(p.alignment, "центрирано");
    assert.equal(p.centerOffsetM, 0.3);
    assert.equal(p.headingOffsetDeg, 4.1);
    const none = parseParkDebrief({ objectives: [], sections: {} });
    assert.equal(none.centerOffsetM, null);
    assert.equal(none.headingOffsetDeg, null);
    assert.equal(parseParkDebrief(null).credited, null);
  });

  const traceWithChannels = { samples: [{ indicator: "right" }], events: [{ kind: "glance-rear" }, { kind: "signal-on" }] };
  const cleanIndep = { stops: [{ tag: "gearChange", measured: true, stopErrM: 0.1, restLoS: 1.5, dwellS: 1.35 }], speed: [{ measured: true, overshootKmh: 1 }], arrivals: [], routeBySegment: [] };

  it("attributeMistakes: the catalog's procedural codes, a collision candidate, and a 0.8 m stop error as HARNESS TIMING", () => {
    const codes = [
      "Завиване без мигач",
      "Завиване без поглед в огледалото",
      "Смяна на лента без мигач",
      "Смяна на лента без проверка в огледалото",
      "Потегляне без оглед",
      "Движение в дъжд без светлини",
    ];
    const a = attributeMistakes(codes, [], traceWithChannels, cleanIndep);
    assert.equal(a.proceduralOmission.length, codes.length);
    const c = attributeMistakes(["Удар в друго превозно средство"], [], traceWithChannels, cleanIndep);
    assert.equal(c.collisionCandidates.length, 1);
    const late = { ...cleanIndep, stops: [{ tag: "authored", measured: true, stopErrM: 0.8, restLoS: 2, dwellS: 1.5 }] };
    const t = attributeMistakes(["Неспиране на знак СТОП"], [], traceWithChannels, late);
    assert.equal(t.timingActuation.length, 1);
    assert.match(t.timingActuation[0].label, /HARNESS TIMING\/ACTUATION/);
  });

  it("attributeMistakes (CODE-REVIEW-2 M3): an UNMEASURED arrival, speed or forward route is a reason NOT to release — never a pass", () => {
    const code = ["Не пропусна пешеход"];
    // cr2-probe case 1: Math.abs(null) === 0 released a pedestrian code on an arrival nobody measured
    const arr = attributeMistakes(code, [], traceWithChannels, { ...cleanIndep, arrivals: [{ actor: "walker", arcM: 14.2, lagWallS: null, why: "no sample within 3 m of the actor's arc" }] });
    assert.equal(arr.release.released, false);
    assert.match(arr.release.label, /arrival at the walker unmeasured/);
    assert.match(arr.timingActuation[0].label, /HARNESS TIMING\/ACTUATION/);
    for (const lag of [undefined, NaN, "3"]) assert.equal(attributeMistakes(code, [], traceWithChannels, { ...cleanIndep, arrivals: [{ actor: "walker", lagWallS: lag }] }).release.released, false, `lagWallS ${lag}`);
    assert.equal(attributeMistakes(code, [], traceWithChannels, { ...cleanIndep, arrivals: [{ actor: "walker", lagWallS: 1.2 }] }).release.released, true, "a measured, in-tolerance arrival still releases");
    // cr2-probe case 2: speed and forward route measured:false
    const sp = attributeMistakes(["Превишена скорост"], [], traceWithChannels, { ...cleanIndep, speed: [{ k: 0, measured: false, why: "UNMEASURED — sample runs do not match the plan" }] });
    assert.equal(sp.release.released, false);
    assert.match(sp.release.label, /speed on segment 0 was not measured/);
    const rt = attributeMistakes(["Превишена скорост"], [], traceWithChannels, { ...cleanIndep, routeBySegment: [{ k: 0, gear: 1, measured: false, why: "too few moving samples" }] });
    assert.equal(rt.release.released, false);
    assert.match(rt.release.label, /forward segment 0 route was not measured/);
    assert.equal(attributeMistakes(code, [], traceWithChannels, { ...cleanIndep, speed: undefined }).release.released, false, "no speed evidence at all is not a pass");
    // a micro square-up is unmeasured BY CONSTRUCTION and is the one exemption
    const micro = { ...cleanIndep, speed: [{ k: 0, measured: true, overshootKmh: 1 }, { k: 2, micro: true, measured: false }], routeBySegment: [{ k: 0, gear: 1, measured: true, maxM: 0.2, corridorM: 0.5 }, { k: 2, gear: 1, micro: true, measured: false }] };
    assert.equal(attributeMistakes(code, [], traceWithChannels, micro).release.released, true);
    // the real samples: an arrival the drive never reached is null and blocks the release
    const dw = arrivalLagFromSamples(samplesAlong(traceOf("sc-pk-driveway")), traceOf("sc-pk-driveway"), "sc-pk-driveway");
    assert.equal(attributeMistakes(code, [], traceWithChannels, { ...cleanIndep, arrivals: dw }).release.released, false);
    // overshootFromSamples carries micro through, so the exemption is reachable from real evidence
    const zb = "sc-park-zebra";
    assert.ok(overshootFromSamples(samplesAlong(traceOf(zb)), traceOf(zb), zb).some((s) => s.micro === true));
  });

  it("attributeMistakes release is computable and ONE-WAY (2,000 random cases)", () => {
    const code = ["Неспиране на знак СТОП"];
    const clean = attributeMistakes(code, [], traceWithChannels, cleanIndep, null);
    assert.equal(clean.release.released, true, "all independent values in tolerance → released (the v2 dead end is gone)");
    const blind = attributeMistakes(code, [], traceWithChannels, cleanIndep, { blindGapM: [{ m: 0.42, distToStopM: 6 }] });
    assert.equal(blind.release.released, false);
    assert.match(blind.release.label, /self-report only/);
    let s = 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const junk = () => {
      const pick = rnd();
      if (pick < 0.1) return null;
      if (pick < 0.2) return "garbage";
      if (pick < 0.3) return { blindGapM: "x", stopErrM: [NaN, "1"] };
      return {
        blindGapM: rnd() < 0.5 ? [{ m: rnd(), distToStopM: rnd() * 40 }] : [],
        stopErrM: rnd() < 0.5 ? [rnd() * 1.2 - 0.6] : undefined,
        arrivalLagWorldS: rnd() < 0.3 ? [rnd() * 8 - 4] : [],
        stopLate: rnd() < 0.2 ? ["coast"] : [],
      };
    };
    for (let i = 0; i < 2000; i++) {
      const indep = {
        stops: [{ tag: "authored", measured: rnd() > 0.05, stopErrM: rnd() * 1.4 - 0.7, restLoS: rnd() * 3, dwellS: 1.5 }],
        speed: [{ measured: rnd() > 0.05, overshootKmh: rnd() * 4 }],
        arrivals: rnd() < 0.3 ? [{ actor: "walker", lagWallS: rnd() < 0.2 ? null : rnd() * 8 - 4 }] : [],
        routeBySegment: rnd() < 0.3 ? [{ k: 0, gear: 1, measured: rnd() > 0.2, maxM: rnd(), corridorM: 0.6 }] : [],
      };
      const sr = junk();
      const alone = attributeMistakes(code, [], traceWithChannels, indep, null);
      const withSr = attributeMistakes(code, [], traceWithChannels, indep, sr);
      if (!alone.release.released) assert.equal(withSr.release.released, false, `case ${i}: self-report released a code`);
      // no release ever rests on an unmeasured value
      const unmeasured = indep.speed.some((s) => !s.measured) || indep.arrivals.some((a) => !Number.isFinite(a.lagWallS)) || indep.routeBySegment.some((s) => !s.measured);
      if (unmeasured) assert.equal(alone.release.released, false, `case ${i}: released on unmeasured evidence ${JSON.stringify(indep)}`);
      const srInTol = sr && typeof sr === "object" && Array.isArray(sr.blindGapM) && sr.blindGapM.every((g) => !(g.m > 0.3 && g.distToStopM <= 20)) && (sr.stopErrM ?? []).every((e) => !(Math.abs(e) > 0.5)) && (sr.arrivalLagWorldS ?? []).every((e) => !(Math.abs(e) > 3)) && (sr.stopLate ?? []).length === 0;
      if (srInTol || sr === null || typeof sr !== "object") assert.equal(withSr.release.released, alone.release.released, `case ${i}: in-tolerance self-report changed the result`);
    }
    // the mutation: a within-tolerance self-report overriding an out-of-tolerance independent stop error
    const outOfTol = { ...cleanIndep, stops: [{ tag: "authored", measured: true, stopErrM: 0.9, restLoS: 2, dwellS: 1.5 }] };
    assert.equal(attributeMistakes(code, [], traceWithChannels, outOfTol, { stopErrM: [0.05] }).release.released, false);
  });

  it("computePathEvidence carries the same-probe label and the lesson's caveats", () => {
    const ev = computePathEvidence({ samples: samplesAlong(trace), trace, lesson });
    assert.match(ev.kind, /INDEPENDENT/);
    assert.match(ev.kind, /same pose probe/);
    assert.ok(Array.isArray(ev.caveats));
  });

  it("IMPORT PIN: no path-follow, no path-refs read, no pathFollow identifier; imports are an allow-list", () => {
    const raw = readFileSync(SRC, "utf8");
    const code = stripComments(raw);
    // positive control on the stripped code: the import lines survived stripping
    assert.match(code, /from "\.\/guidance\.mjs"/);
    assert.doesNotMatch(code, /path-follow/);
    assert.doesNotMatch(code, /path-refs/);
    assert.doesNotMatch(code, /\bpathFollow\b/);
    const imports = [...code.matchAll(/^\s*import\s[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    assert.ok(imports.length >= 3);
    for (const spec of imports) assert.ok(["./guidance.mjs", "./path-plan/policy.mjs", "./path-plan/geom.mjs"].includes(spec) || spec.startsWith("node:"), `import ${spec} is not on the allow-list`);
    // the pin can fail: a synthetic source with the forbidden import is caught by the same matcher
    const bad = stripComments(`// a comment naming path-refs/*.json\nimport { pathStep } from "./path-follow.mjs";\n/* pathFollow */\n`);
    assert.match(bad, /path-follow/);
    assert.doesNotMatch(bad, /pathFollow|path-refs/);
  });
});
