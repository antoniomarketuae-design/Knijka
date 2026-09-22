// Run: node --test tools/audit/path-canary.test.mjs
//
// THE CANARY'S GATES FAIL ONE AT A TIME, AND A CONTROLLER THAT SAYS IT
// SUCCEEDED CANNOT MAKE THEM PASS (DESIGN-v2 §10.3, §12.5, F-M9).
//
// The passing case is a sc-park-wall pc-path drive on the kinematic bench
// (tools/mobile/lib/path-bench.mjs — NO WORLD: it shows the gates' arithmetic,
// never that a car parks in a browser). Each failing case changes one witness.
import { strict as assert } from "node:assert";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCanary, FORBIDDEN_LINES, STOP_FAULT_RE, noReversePlanReason, stopServedBasis } from "./path-canary.mjs";
import { loadPathRef, productBoxPrediction } from "../mobile/lib/path-follow.mjs";
import { runBench, plantCentre } from "../mobile/lib/path-bench.mjs";
import { driveClearance, driveClearanceFromSidecar, driveClearanceGate, DRIVE_CLEARANCE_FLOOR_M } from "../mobile/lib/drive-clearance.mjs";
import { BODY_FLOOR_M, clearanceAtPose, mountedBodies } from "../mobile/lib/path-plan/body-screen.mjs";
import { computePathEvidence } from "../mobile/lib/path-evidence.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const lesson = "sc-park-wall";
const trace = JSON.parse(fs.readFileSync(path.join(REPO, "content", "traces", lesson, "shadow-correct.trace.json"), "utf8"));
const plan = loadPathRef(lesson, REPO);
/**
 * THE SEED IS A PRECONDITION, NOT A PREFERENCE — AND IT IS NOW SEARCHED FOR (2026-09-16).
 *
 * G4's isolation case withdraws the product's credit, and `stopServedBasis` lets a SHORT
 * gear-change rest span be served by exactly that credit. A fixture whose gear-change stop
 * is served only on credit therefore couples G7 to G4, and «G4 fails alone» stops being a
 * statement about the gates at all. The fixture needs a drive whose gear-change stop is
 * served on TIMING alone.
 *
 * Seed 1 was such a drive and stopped being one: it read 0.97–5 s against the 1.35 s dwell,
 * and after the 2026-09-16 approach re-aim it reads 0.61 s, so G7 fell through to the credit
 * and failed beside G4. Pinning another lucky number would only postpone that, so the
 * property itself is searched for here and the seed is whatever satisfies it — and if NO
 * seed does, `FIXTURE_REFUSAL` below says so by name instead of leaving the coupling silent.
 */
const CREDIT_WITHDRAWN = { allCredited: false, reachedVerdict: true, stopFaultBooked: false };
const servedWithoutCredit = (b) => {
  const ev = computePathEvidence({ samples: b.books.samples, trace, lesson });
  const gc = (ev.stops ?? []).filter((x) => x.tag === "gearChange");
  return gc.length > 0 && gc.every((x) => stopServedBasis(x, CREDIT_WITHDRAWN) !== null);
};
const FIXTURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
let bench = null;
let benchSeed = null;
let FIXTURE_REFUSAL = null;
for (const seed of FIXTURE_SEEDS) {
  const b = runBench({ plan, seed });
  if (b.state.refusals.length) continue;
  if (!servedWithoutCredit(b)) continue;
  bench = b;
  benchSeed = seed;
  break;
}
if (!bench) {
  FIXTURE_REFUSAL = `no seed of ${FIXTURE_SEEDS.join(",")} drives ${lesson} to a gear-change stop that G7 serves on TIMING alone, so G7 rides on the product's credit and «fails alone» cannot be told apart from it — the fixture, not the gates, is what must be fixed`;
  bench = runBench({ plan, seed: FIXTURE_SEEDS[0] });
  benchSeed = FIXTURE_SEEDS[0];
}
const endPsi = ((bench.plant.psi % 360) + 360) % 360;
const box = productBoxPrediction(plan.product.park, plantCentre(bench.plant), endPsi);

/**
 * A pose ledger of the shape `_audit-path.json` carries, from a pathref witness's
 * own rows: what G10 would measure if the car had tracked its committed witness
 * exactly. The bench is kinematic and mounts no world, so this is where the
 * passing fixture's body clearance comes from - a real geometry against the real
 * bodies `content/world` puts in that district, not a hand-written number.
 */
const ledgerFromWitness = (ref, segIndex, startAlongM, { lat = 0, along = 0 } = {}) => {
  const seg = ref.segments[segIndex];
  const w = seg.witnesses.find((x) => x.startAlongM === startAlongM) ?? seg.witnesses[0];
  return w.rows.map((row, i) => {
    const psi = row[5];
    const h = { x: Math.sin((psi * Math.PI) / 180), z: -Math.cos((psi * Math.PI) / 180) };
    const rgt = { x: Math.cos((psi * Math.PI) / 180), z: Math.sin((psi * Math.PI) / 180) };
    return { f: i, x: row[1] + lat * rgt.x + along * h.x, z: row[2] + lat * rgt.z + along * h.z, psi, v: -3, mode: "reverse-follow", seg: segIndex, src: "cam" };
  });
};
const benchDriveClearance = driveClearance(lesson, [
  ...ledgerFromWitness(plan, 0, 0),
  ...ledgerFromWitness(plan, 1, plan.segments[1].witnesses[0].startAlongM),
]);

const passing = () => ({
  driveClearance: benchDriveClearance,
  status: {
    mode: "path", exit: 0, phase: "complete", scenario: lesson,
    guidance: { samples: bench.books.samples.map((s) => ({ ...s })), routeHold: { crashPinnedTicks: 0, offRoadTicks: 0 } },
    pathFollow: { state: "followed", endPoses: { 1: { camYawDeg: Math.round(endPsi * 100) / 100 } } },
  },
  debrief: {
    routeHold: { crashPinnedTicks: 0 },
    debrief: {
      objectives: [{ titleBg: "Паркиране: 1 опит · подравняване: центрирано", done: true }],
      sections: {
        'section[aria-label="Оценка на маневрата"]': { text: `В очертанията (отместване 0,2 м, ъгъл ${String(box.headingOffsetDeg).replace(".", ",")}°).` },
        'section[aria-label="Грешки"]': { items: [] },
      },
    },
  },
  runLog: "STEERED BY: THE LESSON'S AUTHORED LINE …\n",
  frameNames: ["01-arrival.png", "05-stopped.png", "05r-reverse-R.png", "07-end.png"],
  trace,
  lesson,
  platformDiffEmpty: true,
});
const gate = (out, id) => out.gates.find((g) => g.id === id);

test("the fixture's own precondition: its gear-change stop is served on TIMING, independently of the product's credit", () => {
  assert.equal(FIXTURE_REFUSAL, null, String(FIXTURE_REFUSAL));
  assert.equal(servedWithoutCredit(bench), true, `seed ${benchSeed}`);
});

test("the bench drive passes every gate (the arithmetic, not a browser)", () => {
  assert.equal(bench.state.refusals.length, 0, JSON.stringify(bench.state.refusals));
  const out = evaluateCanary(passing());
  assert.deepEqual(out.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.why}`), []);
  assert.equal(out.pass, true);
});

const failsOnlyG10 = (mutate, why) => {
  const base = evaluateCanary(passing());
  const c = passing();
  mutate(c);
  const out = evaluateCanary(c);
  const flipped = out.gates.filter((g, i) => g.pass !== base.gates[i].pass).map((g) => g.id);
  assert.deepEqual(flipped, ["G10"], `${why ?? ""} — flipped ${flipped.join(",")} · ${out.gates.filter((g) => !g.pass).map((g) => `${g.id} ${g.why}`).join(" | ")}`);
  assert.equal(gate(out, "G10").pass, false, gate(out, "G10").why);
  assert.equal(gate(base, "G10").pass, true, "the baseline fixture must PASS G10 or this proves nothing");
};

const failsAlone = (id, mutate) => {
  const c = passing();
  mutate(c);
  const out = evaluateCanary(c);
  const failed = out.gates.filter((g) => !g.pass).map((g) => g.id);
  assert.deepEqual(failed, [id], `${id}: ${out.gates.filter((g) => !g.pass).map((g) => `${g.id} ${g.why}`).join(" | ")}`);
};

test("G0 fails alone on a non-zero exit, and on a printed refusal", () => {
  failsAlone("G0", (c) => { c.status.exit = 1; });
  failsAlone("G0", (c) => { c.runLog += "!! THE pc-path LEG REFUSED (lost) at segment 0\n"; });
});

test("G1 fails alone when the forward samples sit 0.6 m off the line", () => {
  failsAlone("G1", (c) => {
    // not the last moving ones: the arm's approach chord is its own gate (G2)
    const moving = c.status.guidance.samples.filter((s) => s.phase === "roll-path" && s.kmh > 1);
    for (const s of moving.slice(0, -8)) s.wx += 0.6;
  });
});

test("G2 fails alone when the reverse begins 0.5 m behind where the car rested", () => {
  failsAlone("G2", (c) => {
    const first = c.status.guidance.samples.find((s) => s.phase === "reverse");
    first.wz += 0.5; // the approach heads north (−z): +z is back along it
  });
});

test("G3 fails alone when the reverse samples leave the corridor", () => {
  failsAlone("G3", (c) => {
    for (const s of c.status.guidance.samples) if (s.phase === "reverse" && s.kmh > 1) s.wx -= 1.2;
  });
});

/**
 * THE HAND-OVER, PINNED (2026-09-16). G3 used to carry a second clause — the in-bay LATERAL
 * room, `policy.mjs BAY_FLANKS` through `routeBySegment[].bay`. It was a PROXY for body
 * clearance, written when nothing here could measure body clearance, and it is retired.
 *
 * This test is what stops that retirement being a quiet loss of coverage, and it lands on the
 * hardest case: the AUTHORED garage wall, one of the two bodies with no rig, whose room the
 * retired margin was never standing in for. Shift sc-park-wall's reverse 0.25 m toward the
 * wall and the corridor still holds (0.79 of 0.819) — G3 passes, as the corridor always would
 * have — while the chassis box is 4.7 cm INSIDE the wall. The retired proxy would not have
 * caught it either: its neg limit for this bay was 1.712 m of lateral offset, five times the
 * pos side's, and its window (|lon| inside the paint, 20° off the bay axis) never covered the
 * pose where the car actually meets that wall. G10 fails it, names the wall, and says by how
 * much. That is protection the authored face did not have before.
 */
test("a reverse 0.25 m into the AUTHORED garage wall: G3's corridor still holds, and G10 fails it by name — the proxy that used to ride on G3 caught neither", () => {
  const D = 0.25;
  const c = passing();
  let shifted = 0;
  for (const s of c.status.guidance.samples) {
    if (s.phase !== "reverse" || !Number.isFinite(s.wx)) continue;
    if (Math.abs(s.wx - 5.03) > 2.0) continue;
    s.wz += D;                       // sc-park-wall's bay (x 5.03, y 5.4, heading 90): +z is +lat
    shifted += 1;
  }
  assert.ok(shifted >= 2, "no reverse sample stood in the bay");
  const g3 = gate(evaluateCanary(c), "G3");
  assert.equal(g3.pass, true, `G3 is the corridor alone now and the corridor holds — got «${g3.why}»`);
  assert.match(g3.why, /R1 max 0\.\d+\/corr 0\.819/, g3.why);
  assert.doesNotMatch(g3.why, /in-bay/, "G3 still carries the retired in-bay proxy");

  // …and the same 0.25 m, as a POSE RECORD rather than as samples, fails G10 alone.
  const wide = driveClearance(lesson, [
    ...ledgerFromWitness(plan, 0, 0),
    ...ledgerFromWitness(plan, 1, plan.segments[1].witnesses[0].startAlongM, { lat: D }),
  ]);
  assert.equal(wide.measured, true, wide.why);
  assert.equal(wide.verdict, "contact", `0.25 m into the wall must read as a contact — got ${wide.verdict} at ${wide.worstM} m`);
  assert.match(String(wide.body), /wall/, `it must name the authored wall, got ${wide.body}`);
  assert.equal(driveClearanceGate(wide).pass, false);
  failsOnlyG10((x) => { x.driveClearance = wide; }, "a drive 0.25 m into the garage wall");
});

test("a pathFollow block claiming success while the samples violate G3 still fails", () => {
  const c = passing();
  for (const s of c.status.guidance.samples) if (s.phase === "reverse" && s.kmh > 1) s.wx -= 1.2;
  c.status.pathFollow = { ...c.status.pathFollow, state: "followed", segments: [{ k: 1, ctMaxM: 0.01 }], refusals: [] };
  const out = evaluateCanary(c);
  assert.equal(out.pass, false);
  assert.equal(gate(out, "G3").pass, false);
});

test("G4 fails alone when an objective is uncredited", () => {
  failsAlone("G4", (c) => { c.debrief.debrief.objectives[0].done = false; });
});

test("G5 fails alone on a crash-pinned tick", () => {
  failsAlone("G5", (c) => { c.debrief.routeHold.crashPinnedTicks = 3; });
});

test("G6 fails alone when the product's «ъгъл» disagrees with the camera yaw by more than 1.5°", () => {
  failsAlone("G6", (c) => {
    c.debrief.debrief.sections['section[aria-label="Оценка на маневрата"]'].text = `В очертанията (отместване 0,2 м, ъгъл ${String(Math.round((box.headingOffsetDeg + 5) * 10) / 10).replace(".", ",")}°).`;
  });
});

test("G7 fails alone without the 05-stopped frame", () => {
  failsAlone("G7", (c) => { c.frameNames = c.frameNames.filter((n) => n !== "05-stopped.png"); });
});

// The stop rule, on the exact figures of the first two browser drives (sc-park-zebra and
// sc-park-gap-short pc-path at 4209dad), and on the shapes it must still refuse.
test("G7 stop rule: a timed stop passes on timing alone", () => {
  const w = { allCredited: false, reachedVerdict: false, stopFaultBooked: false };
  assert.equal(stopServedBasis({ tag: "gearChange", measured: true, restLoS: 1.2, restHiS: 3, dwellS: 1.3, distToTargetM: 0.2 }, w), "timed");
});
test("G7 stop rule: zebra's gear-change stop (0.65–5 s against 1.3 at 0.169 m) is decided by the product's credit", () => {
  const s = { tag: "gearChange", measured: true, restLoS: 0.65, restHiS: 5, dwellS: 1.3, distToTargetM: 0.169 };
  assert.match(stopServedBasis(s, { allCredited: true, reachedVerdict: true, stopFaultBooked: false }), /product credited/);
  assert.equal(stopServedBasis(s, { allCredited: false, reachedVerdict: true, stopFaultBooked: false }), null, "an uncredited objective is no witness of the hold");
  assert.equal(stopServedBasis(s, { allCredited: true, reachedVerdict: true, stopFaultBooked: true }), null, "a booked failure-to-stop fault overrides the credit");
});
test("G7 stop rule: the route-end stop passes only when the drive reached the verdict card", () => {
  // zebra: 1.04–3 s against 2.23; gap-short: 1.05–2 s against 2.23 — the product ended the lesson.
  for (const s of [
    { tag: "routeEnd", measured: true, restLoS: 1.04, restHiS: 3, dwellS: 2.23, distToTargetM: 0.034 },
    { tag: "routeEnd", measured: true, restLoS: 1.05, restHiS: 2, dwellS: 2.23, distToTargetM: 0.311 },
  ]) {
    assert.match(stopServedBasis(s, { allCredited: false, reachedVerdict: true, stopFaultBooked: false }), /verdict card/);
    assert.equal(stopServedBasis(s, { allCredited: true, reachedVerdict: false, stopFaultBooked: false }), null, "no verdict card, no witness");
  }
});
test("G7 stop rule: a car that ROLLED THROUGH is refused whatever the product credited", () => {
  const w = { allCredited: true, reachedVerdict: true, stopFaultBooked: false };
  assert.equal(stopServedBasis({ tag: "gearChange", measured: false }, w), null, "no rest span near the target");
  assert.equal(stopServedBasis({ tag: "gearChange", measured: true, restLoS: 0.6, restHiS: 5, dwellS: 1.3, distToTargetM: 1.6 }, w), null, "the rest was not at the stop");
  assert.equal(stopServedBasis({ tag: "gearChange", measured: true, restLoS: 0.2, restHiS: 1.0, dwellS: 1.3, distToTargetM: 0.3 }, w), null, "even the over-stating bound falls short of the dwell");
  assert.equal(stopServedBasis({ tag: "routeEnd", measured: false }, w), null, "still moving at the end: no rest span");
  assert.equal(stopServedBasis({ tag: "routeEnd", measured: true, restLoS: 1, restHiS: 3, dwellS: 2.23, distToTargetM: 2.4 }, w), null, "stopped, but not at the end");
});
test("G7 stop fault matcher reads the product's own failure-to-stop titles and not «Рязко спиране»", () => {
  assert.ok(STOP_FAULT_RE.test("Неспиране на знак Б2 „Спри!“ −10 изпитни т."));
  assert.ok(STOP_FAULT_RE.test("Премина знака Б2 без пълно спиране."));
  assert.ok(!STOP_FAULT_RE.test("Рязко спиране без причина −3 изпитни т."));
});

test("G8 fails alone on every forbidden line", () => {
  for (const line of FORBIDDEN_LINES) failsAlone("G8", (c) => { c.runLog += `  ${line}\n`; });
});

test("G9 fails alone when platform/src moved, and is not a pass when unchecked", () => {
  failsAlone("G9", (c) => { c.platformDiffEmpty = false; });
  failsAlone("G9", (c) => { c.platformDiffEmpty = null; });
});

/* ═══════════════ G10 — THE DRIVE'S OWN BODY CLEARANCE ═══════════════════════
 *
 * The gate that exists because the corridor stopped being a safety check: the
 * reverse corridors are 0.819-0.820 m wide so that a body-CLEARING witness (which
 * deviates ~0.47 m from the authored line on purpose) can pass, and 0.82 m is
 * nine times the 0.088 m of following error the clearance margin was budgeted
 * for. The tests below are, in order: it passes a drive that tracked its
 * committed witness; it fails ALONE on a drive that did not; it fails on an
 * absent, truncated or unreadable pose record; and it fails THE ARCHIVED DRIVE
 * THAT ACTUALLY COLLIDED.
 */
test("G10 passes a drive that tracked its committed witness, and reports what it measured", () => {
  const out = evaluateCanary(passing());
  const g = gate(out, "G10");
  assert.equal(g.pass, true, g.why);
  assert.ok(benchDriveClearance.measured === true, JSON.stringify(benchDriveClearance));
  assert.ok(benchDriveClearance.worstM >= benchDriveClearance.requiredM, `${benchDriveClearance.worstM} vs ${benchDriveClearance.requiredM}`);
  assert.match(g.why, /worst .* m vs .* at ledger row/, g.why);
  assert.match(g.why, /required/, g.why);
});

test("G10 fails alone when the drive's body penetrates a mounted car, and names the body", () => {
  // the SAME witness, pushed sideways into the neighbour it was planned to clear:
  // the corridor gates would not see it, because the corridor is 0.82 m wide.
  const at = (lat) => driveClearance(lesson, [
    ...ledgerFromWitness(plan, 0, 0),
    ...ledgerFromWitness(plan, 1, plan.segments[1].witnesses[0].startAlongM, { lat }),
  ]);
  let shifted = null;
  for (let lat = 0.05; lat <= 1.2 && !shifted; lat += 0.05) {
    for (const sign of [-1, 1]) {
      const r = at(sign * lat);
      if (r.worstM < 0) { shifted = r; break; }
    }
  }
  assert.ok(shifted, "no lateral offset up to 1.2 m drove the witness through a body");
  assert.ok(shifted.worstM < 0, `the shift must actually penetrate, got ${shifted.worstM}`);
  // ...and the corridor gates do NOT see it: the reverse corridor is wide enough
  // that this whole shift fits inside it, which is the entire reason G10 exists.
  assert.ok(Math.abs(shifted.worstM) > 0, shifted.why);
  failsOnlyG10((c) => { c.driveClearance = shifted; }, "a penetrating drive");
  const why = gate(evaluateCanary({ ...passing(), driveClearance: shifted }), "G10").why;
  assert.match(why, /PENETRATED/, why);
  assert.match(why, new RegExp(shifted.body.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")), why);
});

test("G10 fails alone on a drive whose clearance is positive but under what it had to keep", () => {
  // a real geometry again: walk the witness in until it is inside the required
  // margin but has not touched. Anything in that band is a drive one following
  // error away from a booked «Удар в друго превозно средство».
  let unsafe = null;
  for (let lat = 0.05; lat <= 0.6; lat += 0.005) {
    const r = driveClearance(lesson, [
      ...ledgerFromWitness(plan, 0, 0),
      ...ledgerFromWitness(plan, 1, plan.segments[1].witnesses[0].startAlongM, { lat: -lat }),
    ]);
    if (r.worstM > 0 && r.worstM < r.requiredM) { unsafe = r; break; }
  }
  assert.ok(unsafe, "no lateral offset produced a positive clearance under the required margin");
  assert.equal(unsafe.verdict, "unsafe", JSON.stringify(unsafe));
  failsOnlyG10((c) => { c.driveClearance = unsafe; }, "a drive inside its required margin");
});


/**
 * H1 (2026-09-16) — THE NON-FINITE POSE USED TO VANISH.
 *
 * `posesFromDriveLedger` read `if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.z))
 * continue;` — a `continue`, in a gate whose whole contract is that a pose it cannot read is a
 * refusal. The row it skipped is exactly where a drive might have been closest: a NaN in the
 * pose stream is most likely at the frame the physics went non-finite, i.e. a contact.
 *
 * The mutation below is the point. Take a drive that PENETRATES a body, blank the single pose
 * where it is worst, and under the old rule the gate came back CLEAR — the hole only widened
 * `worstGapM`, and a wide gap with no heading change has a chord-to-arc sagitta of zero, so it
 * sailed past `INTERP_BOUND_CAP_M` too. Now that row is a named refusal.
 */
test("H1 a ledger row with no finite (x, z) is a named REFUSAL, never a skipped row", () => {
  const clean = [
    ...ledgerFromWitness(plan, 0, 0),
    ...ledgerFromWitness(plan, 1, plan.segments[1].witnesses[0].startAlongM, { lat: 0.25 }),
  ];
  const hit = driveClearance(lesson, clean);
  assert.equal(hit.verdict, "contact", `the fixture must penetrate — got ${hit.verdict} at ${hit.worstM}`);
  const worstRow = hit.atRow;
  assert.ok(Number.isFinite(worstRow), "the record must name the row it was worst at");

  // THE MUTATION: blank the worst row. Under the old `continue` this came back clear.
  const blanked = clean.map((r, i) => (i === worstRow ? { ...r, x: NaN, z: NaN } : r));
  const rec = driveClearanceFromSidecar(lesson, { rows: blanked, dropped: 0 });
  assert.equal(rec.measured, false, "a pose the gate cannot read must not be measured around");
  assert.equal(rec.verdict, "refused");
  assert.match(rec.why, /carries no finite \(x, z\)/);
  assert.match(rec.why, /never a skipped row/);
  assert.equal(driveClearanceGate(rec).pass, false);
  failsOnlyG10((c) => { c.driveClearance = rec; }, "a ledger with one unreadable pose");

  // every shape of "not finite" refuses, not only NaN
  for (const bad of [{ x: null, z: 0 }, { x: 0, z: undefined }, { x: "1.5", z: 0 }, { x: Infinity, z: 0 }, null]) {
    const r = driveClearanceFromSidecar(lesson, { rows: clean.map((row, i) => (i === 5 ? bad : row)), dropped: 0 });
    assert.equal(r.measured, false, `${JSON.stringify(bad)} was measured around`);
    assert.equal(driveClearanceGate(r).pass, false);
  }

  // …and the ROW is named, so the reader can go and look at it
  assert.match(rec.why, new RegExp(`ledger row ${worstRow} of ${blanked.length}`));
});

/**
 * H1, THE PROOF THAT THE HOLE WAS REAL — and the exact shape the existing backstop misses.
 *
 * `INTERP_BOUND_CAP_M` already refuses a record whose gaps are too sparse to interpolate, and
 * on a TURNING drive it catches a run of skipped poses on its own (measured: dropping 3 rows
 * either side of the worst pose of the sc-park-wall fixture takes the chord-to-arc bound to
 * 0.0205 m, over the 0.02 m cap). So the danger is not a turning car.
 *
 * It is a STRAIGHT one. The sagitta of a chord across a straight stretch is ZERO at any
 * length, so the cap never bites — and a car sliding straight into a wall is exactly when the
 * physics goes non-finite. Here is that drive: 60 poses creeping straight at the sc-park-wall
 * garage wall, the last 33 of them inside it. Drop the unreadable ones, as the old `continue`
 * did, and the record comes back `tight` at +0.06 m and the gate PASSES a drive that is 2.2 m
 * inside a wall. The tail is also where a reverse ENDS, which is what `dropped > 0` guards
 * against for the runner's own truncation — and a NaN tail was not covered by it.
 */
test("H1 the shape the interpolation cap cannot catch: a STRAIGHT slide into a wall, its poses unreadable", () => {
  const bodies = mountedBodies(lesson).bodies;
  const wall = bodies.find((b) => b.kind === "wall");
  assert.ok(wall, "sc-park-wall mounts no authored wall");
  // straight in along +z at the wall's own x, the car facing it
  const rows = Array.from({ length: 60 }, (_, i) => ({ f: i, x: wall.box.x, z: wall.box.z - 5.4 + i * 0.12, psi: 180, v: 2, mode: "follow", seg: 0, src: "cam" }));
  const full = driveClearance(lesson, rows);
  assert.equal(full.verdict, "contact", `the fixture must end inside the wall — got ${full.verdict} at ${full.worstM}`);
  assert.equal(full.interpolationBoundM, 0, "a straight ribbon has no chord-to-arc bound — which is the point");

  const unreadable = rows.map((r, i) => [i, clearanceAtPose(bodies, r.x, r.z, r.psi).m]).filter(([, m]) => m < 0).map(([i]) => i);
  assert.ok(unreadable.length >= 10, `${unreadable.length} poses are inside the wall — re-pick the fixture`);

  // THE OLD BEHAVIOUR: skip them. The gate passes a drive 2.2 m inside a wall.
  const oldBehaviour = driveClearance(lesson, rows.filter((_, i) => !unreadable.includes(i)));
  assert.equal(oldBehaviour.measured, true);
  assert.ok(oldBehaviour.worstM > 0, `skipping the ${unreadable.length} unreadable poses left ${oldBehaviour.worstM} m`);
  assert.equal(driveClearanceGate(oldBehaviour).pass, true, "…and the gate PASSED it — that is the hole H1 closes");

  // THE NEW BEHAVIOUR: the same rows blanked, as a real ledger would carry them.
  const now = driveClearanceFromSidecar(lesson, { rows: rows.map((r, i) => (unreadable.includes(i) ? { ...r, x: NaN, z: NaN } : r)), dropped: 0 });
  assert.equal(now.measured, false);
  assert.equal(now.verdict, "refused");
  assert.match(now.why, new RegExp(`ledger row ${unreadable[0]} of 60`));
  assert.equal(driveClearanceGate(now).pass, false);
});

test("H1 the archived drives carry no such row, so nothing that passed before fails now", (t) => {
  let checked = 0;
  for (const [set, l] of [["canary-path-s1", "sc-park-zebra"], ["canary-path-s1", "sc-park-gap-short"], ["canary-path-s2", "sc-park-wall"], ["canary-path-s2", "sc-park-left"], ["canary-path-s3", "sc-park-left"]]) {
    const f = path.join(REPO, ".audit-frames", set, "frames", `${l}__pc-path`, "_audit-path.json");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const bad = j.rows.filter((r) => !r || !Number.isFinite(r.x) || !Number.isFinite(r.z));
    assert.equal(bad.length, 0, `${set}/${l}: ${bad.length} row(s) carry no finite (x, z) — H1 changes this drive's verdict, go and look`);
    checked += 1;
  }
  if (checked === 0) t.skip(".audit-frames is not on this machine (gitignored on purpose — see the ledger/audit branch)");
});
test("G10 is not a pass when the pose record is absent, empty, truncated or unreadable", () => {
  failsOnlyG10((c) => { c.driveClearance = null; }, "no record at all");
  for (const [why, sidecar] of [
    ["no _audit-path.json at all", null],
    ["an empty ledger", { rows: [], dropped: 0 }],
    ["a ledger truncated at PATH_LEDGER_MAX", { rows: [{ x: 1, z: 1, psi: 0 }], dropped: 12 }],
    ["rows with no finite pose", { rows: Array.from({ length: 60 }, () => ({ x: null, z: null, psi: null })), dropped: 0 }],
  ]) {
    const rec = driveClearanceFromSidecar(lesson, sidecar);
    assert.equal(rec.measured, false, why);
    assert.equal(driveClearanceGate(rec).pass, false, why);
    failsOnlyG10((c) => { c.driveClearance = rec; }, why);
  }
  // and the refusal TRAVELS: the gate prints the named reason, never "clear"
  const rec = driveClearanceFromSidecar(lesson, { rows: [{ x: 1, z: 1, psi: 0 }], dropped: 12 });
  assert.match(gate(evaluateCanary({ ...passing(), driveClearance: rec }), "G10").why, /UNMEASURED .*dropped 12/);
});

test("G10 fails THE ARCHIVED COLLIDED DRIVE — the regression fixture", (t) => {
  const dir = path.join(REPO, ".audit-frames", "canary-path-s3", "frames", "sc-park-left__pc-path");
  if (!fs.existsSync(path.join(dir, "_audit-path.json"))) {
    t.skip(`${dir} is not on this machine (.audit-frames is gitignored on purpose — see the ledger/audit branch). The synthetic penetration case above pins the same behaviour.`);
    return;
  }
  const rec = driveClearanceFromSidecar("sc-park-left", JSON.parse(fs.readFileSync(path.join(dir, "_audit-path.json"), "utf8")));
  assert.equal(rec.measured, true, rec.why);
  assert.equal(rec.verdict, "contact", JSON.stringify(rec));
  assert.ok(rec.worstM < 0, `the archived drive collided; the screen must read a penetration, got ${rec.worstM}`);
  assert.equal(driveClearanceGate(rec).pass, false);
  // ... and the drives that did NOT collide are not simply failed too
  for (const [set, l] of [["canary-path-s1", "sc-park-zebra"], ["canary-path-s1", "sc-park-gap-short"], ["canary-path-s2", "sc-park-wall"]]) {
    const f = path.join(REPO, ".audit-frames", set, "frames", `${l}__pc-path`, "_audit-path.json");
    if (!fs.existsSync(f)) continue;
    const ok = driveClearanceFromSidecar(l, JSON.parse(fs.readFileSync(f, "utf8")));
    assert.equal(ok.measured, true, ok.why);
    assert.ok(ok.worstM > 0, `${l} did not collide; the screen must read a positive clearance, got ${ok.worstM}`);
    assert.equal(driveClearanceGate(ok).pass, true, `${l}: ${driveClearanceGate(ok).why}`);
  }
});

test("the drive floor is the ONE term of BODY_FLOOR_M a drive has not already spent", () => {
  // Nothing here may be relaxed to make a lesson fit. BODY_FLOOR_M is untouched and
  // still gates every PLAN; the drive keeps only the residual the screen cannot see
  // (2-D, buildings unscreened), because the following error is IN the drive's poses
  // and the sampling error is measured per drive and added back.
  assert.equal(BODY_FLOOR_M, 0.15, "the plan floor moved — it must not");
  assert.equal(DRIVE_CLEARANCE_FLOOR_M, 0.05);
  assert.ok(DRIVE_CLEARANCE_FLOOR_M < BODY_FLOOR_M);
  // the required margin is always the floor PLUS this drive's own measured terms
  assert.ok(benchDriveClearance.requiredM >= DRIVE_CLEARANCE_FLOOR_M);
  assert.ok(
    Math.abs(benchDriveClearance.requiredM - DRIVE_CLEARANCE_FLOOR_M - benchDriveClearance.interpolationBoundM - benchDriveClearance.residualM) < 1e-6,
    `required ${benchDriveClearance.requiredM} is not floor + interpolation + sampling`,
  );
  // a lesson whose district mounts nothing says so; it never reads as a measured clear
  assert.ok(mountedBodies(lesson).count > 0, "sc-park-wall must mount bodies or this suite proves nothing");
});

test("IMPORT PIN: path-canary.mjs does not import the controller", () => {
  const src = fs.readFileSync(path.join(HERE, "path-canary.mjs"), "utf8");
  const imports = [...src.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 3);
  assert.ok(!imports.some((s) => /path-follow|path-bench|path-refs/.test(s)), imports.join(", "));
  const allow = ["../mobile/lib/path-evidence.mjs", "../mobile/lib/guidance.mjs", "../mobile/lib/drive-clearance.mjs"];
  for (const s of imports) assert.ok(s.startsWith("node:") || allow.includes(s), `import ${s}`);
});

/* The allow-list above grew by one on 2026-09-16, so the reason it is still a pin
 * has to be checked TRANSITIVELY: `drive-clearance.mjs` may reach neither the
 * controller nor the witness. It imports `body-screen.mjs`, which DOES read
 * `path-refs/` — in `screenLesson` / `screenPathrefSegments` / `anchorWitnessRows`,
 * the planning-side readers. So the pin is on the NAMED imports: the gate takes
 * the world and the geometry, and not one function that opens a pathref. */
test("IMPORT PIN (transitive): drive-clearance reaches no pathref and no controller", () => {
  const src = fs.readFileSync(path.join(REPO, "tools", "mobile", "lib", "drive-clearance.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs = [...code.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(specs.filter((x) => !x.startsWith("node:")), ["./path-plan/body-screen.mjs"], specs.join(", "));
  assert.doesNotMatch(code, /path-follow|path-bench|path-refs|pathFollow|corridorM/);
  const named = [...code.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s+"\.\/path-plan\/body-screen\.mjs";/gm)]
    .flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
  assert.ok(named.length >= 4, named.join(", "));
  const forbidden = ["screenLesson", "screenPathrefSegments", "anchorWitnessRows", "runCalibration", "ANCHOR", "witnessBodyVerdict"];
  for (const n of named) assert.ok(!forbidden.includes(n), `drive-clearance imports ${n}, which reads a pathref`);
  // the pin can fail: the same matchers catch a synthetic source that does reach one
  const bad = 'import { screenLesson } from "./path-plan/body-screen.mjs";\nimport { x } from "./path-follow.mjs";\n';
  const badNamed = [...bad.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s+"\.\/path-plan\/body-screen\.mjs";/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
  assert.ok(badNamed.includes("screenLesson"));
  assert.match(bad, /path-follow/);
});

/* ═══════════ A FORWARD-ENTRY PARK (2026-09-22, sc-park-gap-long) ═══════════
 *
 * sc-park-gap-long is the one committed plan with no reverse (its trace's gear segmentation
 * is [F0]; every pathref segment is gear 1). The 91e5a51 canary drive was credited 2/2 by the
 * product («влез НАПРЕД в мястото … подравняване: приемливо», «ъгъл 7.8°») and still failed
 * G2 «no arm» and G3 «no reverse segment» — gates with no subject on this plan — and G6
 * «cam yaw UNMEASURED», because only a reverse ever wrote an end pose.
 *
 * The fixture is a bench drive of the committed gap-long plan (NO WORLD: arithmetic, not a
 * browser), its end yaw captured by the follower's final forward rest
 * (path-follow.mjs captureForwardRestEndPose), and the product's «ъгъл» taken from the bench
 * plant's true pose — so G6 compares the SELF-REPORT cam yaw against a heading it did not
 * write, as it does in the browser. */
const FWD = "sc-park-gap-long";
const fwdTrace = JSON.parse(fs.readFileSync(path.join(REPO, "content", "traces", FWD, "shadow-correct.trace.json"), "utf8"));
const fwdPlan = loadPathRef(FWD, REPO);
const fwdBench = runBench({ plan: fwdPlan, seed: 7 });
const fwdEndPsi = ((fwdBench.plant.psi % 360) + 360) % 360;
const fwdBox = productBoxPrediction(fwdPlan.product.park, plantCentre(fwdBench.plant), fwdEndPsi);
const fwdLedger = fwdPlan.segments[0].witnesses[0].rows.map((row, i) => ({ f: i, x: row[1], z: row[2], psi: row[5], v: 5, mode: "follow", seg: 0, src: "cam" }));
const fwdPassing = () => ({
  driveClearance: driveClearance(FWD, fwdLedger),
  status: {
    mode: "path", exit: 0, phase: "complete", scenario: FWD,
    guidance: { samples: fwdBench.books.samples.map((s) => ({ ...s })), routeHold: { crashPinnedTicks: 0, offRoadTicks: 0 } },
    pathFollow: { state: "followed", endPoses: JSON.parse(JSON.stringify(fwdBench.state.endPoses)) },
  },
  debrief: {
    routeHold: { crashPinnedTicks: 0 },
    debrief: {
      objectives: [
        { titleBg: "Задача 1: спри срещу свободното място", done: true },
        { titleBg: "Задача 2: влез НАПРЕД в мястото и спри успоредно на бордюра · подравняване: приемливо", done: true },
      ],
      sections: {
        'section[aria-label="Оценка на маневрата"]': { text: `В очертанията (отместване 0,3 м, ъгъл ${String(fwdBox.headingOffsetDeg).replace(".", ",")}°).` },
        'section[aria-label="Грешки"]': { items: [] },
      },
    },
  },
  runLog: "STEERED BY: THE LESSON'S AUTHORED LINE …\n",
  frameNames: ["01-arrival.png", "05-stopped.png", "07-end.png"],
  trace: fwdTrace,
  lesson: FWD,
  platformDiffEmpty: true,
});

test("FORWARD ENTRY: the fixture's plan really has no reverse, and it is the only committed plan that doesn't", () => {
  assert.deepEqual(fwdPlan.segments.map((s) => s.gear), [1]);
  assert.equal(fwdBench.state.refusals.length, 0, JSON.stringify(fwdBench.state.refusals));
  const dir = path.join(REPO, "tools", "mobile", "path-refs");
  const forwardOnly = fs.readdirSync(dir).filter((f) => f.endsWith(".pathref.json"))
    .filter((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).segments.every((s) => s.gear === 1));
  assert.deepEqual(forwardOnly, [`${FWD}.pathref.json`]);
});

test("FORWARD ENTRY: G2 and G3 are N/A WITH A REASON — never a silent PASS — and the drive passes every other gate", () => {
  const out = evaluateCanary(fwdPassing());
  for (const id of ["G2", "G3"]) {
    const g = gate(out, id);
    assert.equal(g.na, true, `${id} must be marked N/A, got ${JSON.stringify(g)}`);
    assert.match(g.why, /^N\/A — the plan has no reverse: the trace's gear segments are F0 \(a forward-entry park\)/, g.why);
  }
  // nothing else is N/A: the forward park's G6 is REQUIRED, and it validates
  assert.deepEqual(out.gates.filter((g) => g.na).map((g) => g.id), ["G2", "G3"]);
  assert.deepEqual(out.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.why}`), []);
  assert.equal(out.pass, true);
});

test("FORWARD ENTRY: G6 validates the FINAL FORWARD REST's cam yaw against the product's «ъгъл», and still fails without it", () => {
  const ep = fwdBench.state.endPoses[0];
  assert.ok(ep, `the final forward rest wrote no end pose: ${JSON.stringify(fwdBench.state.endPoses)}`);
  assert.equal(ep.yawMeasured, true, JSON.stringify(ep));
  const g6 = gate(evaluateCanary(fwdPassing()), "G6");
  assert.equal(g6.pass, true, g6.why);
  assert.notEqual(g6.na, true);
  assert.match(g6.why, /^cam yaw [\d.]+° → [\d.]+° off the bay axis against the product's «ъгъл»/, g6.why);
  // the artefact shape of the 91e5a51 drive: no end pose → G6 FAILS, it is not N/A
  const c = fwdPassing();
  c.status.pathFollow.endPoses = {};
  const bare = gate(evaluateCanary(c), "G6");
  assert.equal(bare.pass, false, bare.why);
  assert.match(bare.why, /cam yaw UNMEASURED/);
  // and it compares: a product «ъгъл» 5° away from the captured yaw fails
  const d = fwdPassing();
  d.debrief.debrief.sections['section[aria-label="Оценка на маневрата"]'].text = `В очертанията (отместване 0,3 м, ъгъл ${String(Math.round((fwdBox.headingOffsetDeg + 5) * 10) / 10).replace(".", ",")}°).`;
  assert.equal(gate(evaluateCanary(d), "G6").pass, false);
});

test("A REVERSE PLAN whose reverse went unmeasured still FAILS G2 and G3 — N/A is the plan's, never the drive's (45-rev)", () => {
  const c = passing();
  c.status.guidance.samples = c.status.guidance.samples.filter((s) => s.phase !== "reverse");
  const out = evaluateCanary(c);
  for (const id of ["G2", "G3"]) {
    const g = gate(out, id);
    assert.equal(g.pass, false, `${id}: ${g.why}`);
    assert.notEqual(g.na, true);
  }
  assert.equal(noReversePlanReason(out.evidence, c.status.guidance.samples), null);
});

test("N/A is refused when the forward-only plan's drive REVERSED, and when there is no trace to read the plan from", () => {
  const c = fwdPassing();
  const i = c.status.guidance.samples.findIndex((s) => s.phase === "roll-path");
  c.status.guidance.samples.splice(i + 1, 0, { ...c.status.guidance.samples[i], phase: "reverse" });
  const out = evaluateCanary(c);
  for (const id of ["G2", "G3"]) assert.equal(gate(out, id).pass, false, `${id}: ${gate(out, id).why}`);
  const d = fwdPassing();
  d.trace = null;
  const noTrace = evaluateCanary(d);
  for (const id of ["G2", "G3"]) {
    assert.equal(gate(noTrace, id).pass, false, `${id}: ${gate(noTrace, id).why}`);
    assert.notEqual(gate(noTrace, id).na, true);
  }
});
