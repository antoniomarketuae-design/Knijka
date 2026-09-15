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
import { evaluateCanary, FORBIDDEN_LINES, STOP_FAULT_RE, stopServedBasis } from "./path-canary.mjs";
import { loadPathRef, productBoxPrediction } from "../mobile/lib/path-follow.mjs";
import { runBench, plantCentre } from "../mobile/lib/path-bench.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const lesson = "sc-park-wall";
const trace = JSON.parse(fs.readFileSync(path.join(REPO, "content", "traces", lesson, "shadow-correct.trace.json"), "utf8"));
const plan = loadPathRef(lesson, REPO);
// seed 1: its gear-change rest reads 0.97–5 s against the 1.35 s dwell, so G7 passes on TIMING and every
// other gate can fail alone. On the calibrated bench (2026-09-15) seed 7 reads 0.62 s — a stop G7 decides by
// the product's credit (stopServedBasis), which the G4 case below withdraws.
const bench = runBench({ plan, seed: 1 });
const endPsi = ((bench.plant.psi % 360) + 360) % 360;
const box = productBoxPrediction(plan.product.park, plantCentre(bench.plant), endPsi);

const passing = () => ({
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

test("the bench drive passes every gate (the arithmetic, not a browser)", () => {
  assert.equal(bench.state.refusals.length, 0, JSON.stringify(bench.state.refusals));
  const out = evaluateCanary(passing());
  assert.deepEqual(out.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.why}`), []);
  assert.equal(out.pass, true);
});

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

test("G3 fails alone when the car stands 0.55 m off the bay axis beside the neighbour while the segment corridor still holds (canary-path-s2 sc-park-left)", () => {
  // sc-park-wall's bay (x 5.03, y 5.4, heading 90): +lat is +z, the side of lotwl-bay-4's parked car (limit 0.492 m)
  let shifted = 0;
  failsAlone("G3", (c) => {
    for (const s of c.status.guidance.samples) {
      if (s.phase !== "reverse" || !Number.isFinite(s.wx)) continue;
      if (Math.abs(s.wx - 5.03) > 2.0) continue;
      s.wz += 0.55;
      shifted += 1;
    }
  });
  assert.ok(shifted >= 2, "no reverse sample stood in the bay");
  const c = passing();
  for (const s of c.status.guidance.samples) if (s.phase === "reverse" && Number.isFinite(s.wx) && Math.abs(s.wx - 5.03) <= 2.0) s.wz += 0.55;
  const g3 = gate(evaluateCanary(c), "G3");
  assert.match(g3.why, /in-bay \|lat\| 0\.\d+\/limit 0\.492 OVER/);
  assert.match(g3.why, /max 0\.\d+\/corr 0\.783/, "the corridor itself still holds — the bay's room is what failed");
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

test("IMPORT PIN: path-canary.mjs does not import the controller", () => {
  const src = fs.readFileSync(path.join(HERE, "path-canary.mjs"), "utf8");
  const imports = [...src.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 3);
  assert.ok(!imports.some((s) => /path-follow|path-bench|path-refs/.test(s)), imports.join(", "));
  for (const s of imports) assert.ok(s.startsWith("node:") || s === "../mobile/lib/path-evidence.mjs" || s === "../mobile/lib/guidance.mjs", `import ${s}`);
});
