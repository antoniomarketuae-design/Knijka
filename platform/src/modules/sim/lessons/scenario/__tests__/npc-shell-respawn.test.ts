/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, round 2) — A RESPAWN WITH SHELLS
 * BOUND, on rapier, under @react-three/rapier's stepper.
 *
 * LessonScene's `resetCar` (key R, the touch sheet's «Рестарт») puts the car
 * back on its spawn point and has the director RE-STAGE: every staged actor
 * jumps back to its hold at the next grid point. Through round 1 that was no
 * event for the road users' shells — a bound shell was handed its actor's new
 * pose as the NEXT kinematic pose, so rapier carried the body across the whole
 * jump in one physics step (a body with the jump's speed, for one step), and
 * who held a shell was not re-chosen until the next multiple of 30 grid
 * points, from wherever the car had been.
 *
 * NOW the grid tells the shells' hook at its first call after the respawn
 * (`GradeGrid.reset` → `hooks.shells(k, student, true)`): the pool TELEPORTS
 * every shell there and re-chooses its bindings, and chooses once more at the
 * point after (whose student is the car on its spawn).
 *
 * Driven here: sc-follow-distance L1 (a staged lead the car follows — its
 * shell is bound and a few metres ahead), the committed tailgate demo followed
 * on rapier, a respawn at grid point 607 made from that point's own tick.
 */
import { appendFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { demoTrace, W69 } from "./npcContactDrive";
import { driveIntoContact, followTape, initRapier, sheetDigest, type ContactDriveOutcome } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";

beforeAll(async () => {
  await initRapier();
});

const OUT = process.env.NPC_RESPAWN_OUT;
/** Seven points after a rebind point, twenty-three before the next. */
const RESPAWN_AT = 607;
const MAX = 1100;

function drive(deltas: readonly number[], o: { respawn?: boolean; shellsIgnoreRespawn?: boolean } = {}): ContactDriveOutcome {
  const id = "sc-follow-distance";
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
  const trace = demoTrace(id, "mistake-tailgate.trace.json");
  const s0 = trace.samples[0];
  return driveIntoContact({
    lesson: compileScenario(spec, 1),
    raw: loadDistrict(spec.map.districtId),
    start: { x: s0.x, y: s0.y, headingDeg: s0.headingDeg },
    control: followTape(trace, { afterCrash: "carry-on" })(),
    deltas,
    maxSteps: MAX,
    npcShells: "product",
    tracePoses: true,
    ...(o.respawn === false ? {} : { respawnAtPoint: RESPAWN_AT }),
    ...(o.shellsIgnoreRespawn ? { shellsIgnoreRespawn: true } : {}),
  });
}

const key = (o: ContactDriveOutcome) => ({
  // (A long frame carries a drive a few steps past MAX; nothing after MAX is
  // compared.)
  binds: o.shellBinds.filter((l) => Number(l.split(" ")[0]) <= MAX),
  reports: o.collisionReports,
  judged: o.judged.map((j) => [j.bookedStep, j.impactKmh, j.withWhat, j.graded, j.npcId ?? null]),
  sheet: sheetDigest(o.result),
  poses: o.poseAfterStep,
});

describe("a respawn with shells bound — the pool re-binds on the grid, and nothing sweeps the street", () => {
  it("at 60 Hz: the car is back on its start one step after point 607, the pool chose again AT the respawn's point and at the point after (two selections more than the grid's multiples of 30), and no shell ever moved faster than a road user can", () => {
    const r = drive([1 / 60]);
    if (OUT) appendFileSync(OUT, `[respawn 60 Hz] rebinds ${r.shellRebinds} maxShell ${r.maxShellSpeedMps} binds ${JSON.stringify(r.shellBinds)} at ${JSON.stringify(r.poseAfterStep[RESPAWN_AT])} after ${JSON.stringify(r.poseAfterStep[RESPAWN_AT + 1])}\n`);
    expect(r.shellClock).toBe("product");
    expect(r.respawns).toBe(1);
    // The car had travelled, and stands on its start again after step 601.
    const start = r.poseAfterStep[0];
    const before = r.poseAfterStep[RESPAWN_AT];
    const after = r.poseAfterStep[RESPAWN_AT + 1];
    expect(Math.hypot(before[0] - start[0], before[1] - start[1])).toBeGreaterThan(30);
    expect(Math.hypot(after[0] - start[0], after[1] - start[1])).toBeLessThan(0.5);
    // The pool's selections: its first point, every multiple of 30 up to the
    // last point graded, and TWO more — the respawn's point (607) and the
    // point after it (608).
    expect(r.steps).toBe(MAX);
    expect(r.shellRebinds).toBe(1 + Math.floor(MAX / 30) + 2);
    // 60 м/с is 216 км/ч: no staged or ambient road user is faster; the jump
    // back to a hold in one step reads in the hundreds or thousands.
    expect(r.maxShellSpeedMps).toBeLessThan(60);
    expect(r.judged.filter((j) => j.impactKmh > 250)).toEqual([]);
  }, 600_000);

  it("WHAT IT WAS (the pool not told — the wiring through round 1): the lead's shell crosses its jump back to the hold in ONE step, at a speed no road user has", () => {
    const told = drive([1 / 60]);
    const untold = drive([1 / 60], { shellsIgnoreRespawn: true });
    if (OUT) appendFileSync(OUT, `[respawn untold] rebinds ${untold.shellRebinds} maxShell ${untold.maxShellSpeedMps}\n`);
    expect(untold.maxShellSpeedMps).toBeGreaterThan(200);
    expect(untold.shellRebinds).toBe(told.shellRebinds - 2);
    expect(told.maxShellSpeedMps).toBeLessThan(60);
  }, 600_000);

  it("on 30 Hz, 13 fps, 0.37 s frames and the recorded phone: the respawn lands at the same point, and the binds, the reports, the judged contacts, the sheet and the car after every step are 60 Hz's", () => {
    const ref = drive([1 / 60]);
    for (const [name, deltas] of [
      ["30 Hz", [1 / 30]],
      ["13 fps", [1 / 13]],
      ["0.37 s", [0.37]],
      ["w69 phone", W69],
    ] as const) {
      const r = drive(deltas);
      expect(r.maxStepsPerFrame, name).toBeGreaterThan(1);
      const upTo = Math.min(r.poseAfterStep.length, ref.poseAfterStep.length, MAX + 1);
      const a = key(r);
      const b = key(ref);
      expect({ cadence: name, ...a, poses: a.poses.slice(0, upTo) }).toEqual({ cadence: name, ...b, poses: b.poses.slice(0, upTo) });
    }
  }, 900_000);

  it("…and a drive that is never respawned is untouched by all of this: the same drive as before the option existed (its sim is built exactly as it was)", () => {
    const plain = drive([1 / 60], { respawn: false });
    expect(plain.respawns).toBe(0);
    expect(plain.shellRebinds).toBe(1 + Math.floor(plain.steps / 30));
  }, 600_000);
});
