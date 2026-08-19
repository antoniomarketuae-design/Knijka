/**
 * THE STRADDLE — a car that rocks across the departure circle, and the drive
 * that could not be ended at all.
 *
 * WHAT THIS FILE IS ABOUT. An "outside" finish has two qualifying states with
 * two different bars: IN THE REGION past `radiusM` (the car has left the work
 * site — `zone.dwellSec` = FINISH_LEAVE_S = 20 s ends it) and STRANDED in the
 * band past `strandedBeyondM` (a standstill in the margin — FINISH_OUTSIDE_
 * STUCK_S = 75 s ends it). They are geometrically exclusive and ADJACENT at
 * `radiusM`, and one clock — `insideSinceSec` — times the visit in progress on
 * whichever of them the car is on.
 *
 * That adjacency has now produced a defect in each direction, and the second
 * was introduced by the fix for the first:
 *
 *   ONE CLOCK, NO FACE MEMORY (shipped until 2026-08-19). The clock was carried
 *   straight across the boundary, so a car that stood 70 s in the band and then
 *   drove out arrived in the region with its 20 s departure dwell 3.5× spent and
 *   the drive ended on the crossing frame. Those twenty seconds are the room B1
 *   gives a student who leaves a roundabout without signalling — which VOIDS the
 *   traversal — to notice and swing back in. A FALSE REFUSAL, the founder's own
 *   complaint in miniature.
 *
 *   ONE CLOCK PLUS A FACE LABEL (the fix for it). A change of face restarted the
 *   clock. Correct for the car that crosses ONCE; catastrophic for the car that
 *   rocks: a ±1.2 m oscillation about the departure circle changes face every
 *   few seconds, so NEITHER bar ever accumulates and the drive CANNOT BE ENDED
 *   AT ANY DURATION. An idling automatic nudged on and off the brake near the
 *   circle does it, and the build before the label ended that same pose at
 *   +200.25 s. A regression, in the lane whose entire subject is drives nobody
 *   can end.
 *
 *   TWO ACCUMULATORS, ONE RUNNING VISIT (in the tree, and what this file pins).
 *   Each face banks the seconds actually spent ON IT; `insideSinceSec` times only
 *   the visit in progress; a face change banks the visit that just ended and
 *   starts the other face's visit here. The rocking car accumulates on both and
 *   ends; the car that crosses once still gets its full twenty seconds.
 *
 * MEASURED HERE, 2026-08-19, and every number below was reproduced by this file
 * before it was written into it — the refuter's four poses on the shipped ring
 * drills at 0.9 км/ч (a standstill by this module's own FINISH_STANDSTILL_KMH),
 * held 900 s. Through the real engine on `sc-roundabout-entry` L1, seconds from
 * the frame the car came to rest:
 *
 *                              in the tree   label only   before the label
 *   rocking ±1.2 m, 8 s        +224.75 s     NEVER        +200.25 s
 *   parked 1.2 m outside       +200.25 s     +200.25 s    +200.25 s
 *   parked 1.2 m inside        +255.25 s     +255.25 s    +255.25 s
 *   (200.25 = YIELD_WAIT_MAX_S 180 + FINISH_LEAVE_S 20 + one 0.25 s frame;
 *    255.25 = 180 + FINISH_OUTSIDE_STUCK_S 75 + one frame. The 180 is B15's
 *    lawful wait, which every ring band is inside by construction — see
 *    `finish-work-site-band.test.ts`.)
 *
 * HOW THE COUNTERFACTUALS ARE RUN, because a test that passes equally before and
 * after guards nothing. Neither old build is reimplemented: both are produced by
 * MUTATING THE STATE between frames through the exported API only.
 *   · "label only"        = the shipped gate with both accumulators forced to 0
 *                           every frame, so a face change can bank nothing. That
 *                           IS the label build.
 *   · "before the label"  = the same, plus `dwellFace` forced to the face the
 *                           pose is on, so `sameFace` is always true and the one
 *                           clock is carried across the boundary. That IS the
 *                           pre-label build.
 * Every assertion about the shipped gate is followed by the mutant that breaks
 * it, in the same `it`, so the assertion cannot silently stop discriminating.
 *
 * THE FIXTURE IS COMPILED, NEVER INVENTED. The lane that wrote the fix could not
 * ship a test because its hand-built zone used `radiusM: 34, workSiteRadiusM:
 * 34`, which collapses both faces onto one circle — there is no straddle in it at
 * all — and never armed, and a drive that never arms reads exactly like a drive
 * that never ends. So the zones here come from `routeFinishZone`/
 * `terminalRescueZone` over `SCENARIO_TEMPLATES`, the arming frame is asserted to
 * be inside `armWithinM`, and `assertStraddles` refuses the collapsed shape by
 * name.
 */

import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  FINISH_LEAVE_S,
  FINISH_OUTSIDE_STUCK_S,
  FINISH_STANDSTILL_KMH,
  YIELD_WAIT_MAX_S,
  createFinishGate,
  routeFinishZone,
  stepFinishGate,
  strandedBeyondM,
  terminalRescueZone,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { FinishGateState, ObjectiveParams, RouteFinishZone } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// The compiled catalogue — the only source of a zone in this file
// ---------------------------------------------------------------------------

interface Rung {
  id: string;
  level: ScenarioLevel;
  params: ObjectiveParams[];
}

/**
 * Every rung that compiles, plus the id of every template that does not.
 *
 * The failures are carried out rather than swallowed: eight lanes edit this
 * catalogue at once, and a census that ate a compile error would quietly shrink
 * its own world and still report a pass — the instrument failure this programme
 * has shipped four times, always in the reassuring direction.
 */
function compileAllRungs(): { rungs: Rung[]; failed: string[] } {
  const rungs: Rung[] = [];
  const failed: string[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    for (const { level } of t.levels) {
      let lesson;
      try {
        lesson = compileScenario(t, level);
      } catch (e) {
        failed.push(`${t.id}@L${level}: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }
      rungs.push({
        id: t.id,
        level,
        params: lesson.objectives.map((o) => parseObjectiveParams(o)),
      });
    }
  }
  return { rungs, failed };
}

const { rungs: RUNGS, failed: COMPILE_FAILURES } = compileAllRungs();

function terminalOf(r: Rung): ObjectiveParams {
  return r.params[r.params.length - 1];
}

/** Both "outside" zones a rung hands out — the same shape by design. */
function outsideZones(r: Rung): RouteFinishZone[] {
  return [routeFinishZone(r.params), terminalRescueZone(r.params)].filter(
    (z): z is RouteFinishZone => z !== null && z.mode === "outside",
  );
}

function rung(id: string, level: ScenarioLevel): Rung {
  const found = RUNGS.find((r) => r.id === id && r.level === level);
  if (found === undefined) {
    throw new Error(
      `no such rung: ${id}@L${level}; templates that did not compile: ` +
        (COMPILE_FAILURES.join(" | ") || "(none — the catalogue itself moved)"),
    );
  }
  return found;
}

interface Ring {
  id: string;
  enterRadiusM: number;
  exitRadiusM: number;
  zone: RouteFinishZone;
}

/**
 * One rung per DISTINCT ring geometry in the catalogue, L1.
 *
 * Distinct rather than „the two the refuter drove", so authoring a seventh ring
 * drill puts it under these poses instead of leaving it uncovered. Measured
 * 2026-08-19: six ring templates, three geometries — enter 24 / exit 34
 * (`sc-roundabout-entry`, `sc-rb-exit-signal`, `sc-rb-circulate-priority`,
 * `sc-rb-busy-gap`), 33 / 46 (`sc-rb-lane-choice`, the widest band in the
 * module at 13 m) and 29 / 37 (`sc-rb-ped-exit`).
 */
function distinctRings(): Ring[] {
  const seen = new Map<string, Ring>();
  for (const r of RUNGS) {
    const p = terminalOf(r);
    if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") continue;
    const key = `${p.enterRadiusM}/${p.exitRadiusM}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      id: `${r.id}@L${r.level}`,
      enterRadiusM: p.enterRadiusM,
      exitRadiusM: p.exitRadiusM,
      zone: outsideZones(r)[0],
    });
  }
  return [...seen.values()];
}

const RINGS = distinctRings();

// ---------------------------------------------------------------------------
// The poses, and the proof that they are the poses claimed
// ---------------------------------------------------------------------------

const DT = 0.25;
/** How long the arming pose is held, seconds — four frames at DT. */
const ARM_SEC = 1;
/** 0.9 км/ч: what the refuter measured. A standstill by this module's own bar. */
const IDLE_KMH = 0.9;
/** The rock's amplitude and period, as measured. */
const ROCK_M = 1.2;
const ROCK_PERIOD_S = 8;

interface Poses {
  /** Inside `armWithinM` — the gate arms here and nowhere else. */
  armDM: number;
  /** In the band: past the work site, short of the departure circle. */
  bandDM: number;
  /** In the region: past the departure circle. */
  regionDM: number;
}

/**
 * Derive the three poses from a compiled zone AND prove each one is on the face
 * it is named for. Every script below is meaningless if this is wrong, which is
 * exactly how the deleted fixture went wrong, so it is asserted per zone rather
 * than reasoned about once.
 */
function assertStraddles(z: RouteFinishZone): Poses {
  const inner = strandedBeyondM(z);
  const arm = z.armWithinM ?? z.radiusM;
  // The collapsed shape by name: one circle for both faces leaves no straddle.
  expect(z.workSiteRadiusM).not.toBe(z.radiusM);
  expect(z.mode).toBe("outside");
  // A band with room for a pose on either side of it.
  expect(inner).toBeGreaterThan(0);
  expect(z.radiusM - inner).toBeGreaterThan(2 * ROCK_M);
  const poses: Poses = { armDM: arm - 1, bandDM: z.radiusM - ROCK_M, regionDM: z.radiusM + ROCK_M };
  // Arming is geometry only, and it is „within `armWithinM`".
  expect(poses.armDM).toBeLessThanOrEqual(arm);
  // The band pose: past the work site, short of the departure circle.
  expect(poses.bandDM).toBeGreaterThan(inner);
  expect(poses.bandDM).toBeLessThanOrEqual(z.radiusM);
  // The region pose: past the departure circle.
  expect(poses.regionDM).toBeGreaterThan(z.radiusM);
  // …and the speed the whole thing is held at really is a standstill by the bar
  // this module grades with, or „stranded" would never be true at all.
  expect(IDLE_KMH).toBeLessThanOrEqual(FINISH_STANDSTILL_KMH);
  return poses;
}

// ---------------------------------------------------------------------------
// THE MUTATION INSTRUMENT — both old builds, from the shipped code only
// ---------------------------------------------------------------------------

/**
 * · `inTree`         the gate exactly as it ships.
 * · `labelOnly`      both accumulators forced to 0 every frame, so a face change
 *                    banks nothing and restarts the only clock there is.
 * · `beforeTheLabel` the same, plus `dwellFace` forced to the pose's own face, so
 *                    `sameFace` is always true and the clock is carried across
 *                    the boundary at whatever bar the new face brings.
 * · `wallClock`      the running visit survives leaving, i.e. a start-TIMESTAMP
 *                    design instead of accumulated seconds.
 * · `bankToFaceEntered` the plausible off-by-one in the fix: the closed visit is
 *                    banked to the face being entered rather than the one left.
 */
type Build = "inTree" | "labelOnly" | "beforeTheLabel" | "wallClock" | "bankToFaceEntered";

/** Which face a pose is on, by the same two comparisons `stepFinishGate` makes. */
function faceAt(z: RouteFinishZone, dM: number): "region" | "stranded" {
  return dM > z.radiusM ? "region" : "stranded";
}

interface Carried {
  since: number | null;
  face: "region" | "stranded" | undefined;
}

function stepAs(
  build: Build,
  gate: FinishGateState,
  z: RouteFinishZone,
  tick: SimTick,
  dM: number,
  carried: Carried,
): FinishGateState {
  let prev = gate;
  if (build === "labelOnly" || build === "beforeTheLabel") {
    prev = { ...prev, regionDwellSec: 0, strandedDwellSec: 0 };
  }
  if (build === "beforeTheLabel") {
    prev = { ...prev, dwellFace: faceAt(z, dM) };
  }
  if (build === "wallClock") {
    prev = {
      ...prev,
      insideSinceSec: prev.insideSinceSec ?? carried.since,
      dwellFace: prev.dwellFace ?? carried.face,
    };
  }
  if (build === "bankToFaceEntered") {
    const face = faceAt(z, dM);
    if (prev.dwellFace !== undefined && prev.dwellFace !== face && prev.insideSinceSec !== null) {
      const closed = Math.max(0, tick.t - prev.insideSinceSec);
      const region = (prev.regionDwellSec ?? 0) + (face === "region" ? closed : 0);
      const stranded = (prev.strandedDwellSec ?? 0) + (face === "stranded" ? closed : 0);
      prev = {
        ...prev,
        regionDwellSec: region,
        strandedDwellSec: stranded,
        insideSinceSec: tick.t,
        dwellFace: face,
      };
    }
  }
  const next = stepFinishGate(prev, z, tick);
  if (next.insideSinceSec !== null) {
    carried.since = next.insideSinceSec;
    carried.face = next.dwellFace;
  }
  return next;
}

/** One pose held for a while. `frozen` = B15 holds this frame (see below). */
interface Step {
  dM: number | ((sinceStepSec: number) => number);
  speedKmh: number;
  forSec: number;
  frozen?: "asShipped" | "clockOnly";
}

interface Ran {
  trippedAtSec: number | null;
  /** Session time each step began, so an expectation can be stated relative to it. */
  startedAtSec: number[];
  gate: FinishGateState;
}

/**
 * Run a pose script through one build of the gate.
 *
 * A `frozen` step is what `lessons/engine.ts` does on a lawful-wait frame: the
 * gate is NOT stepped at all, and the partial dwell is dropped. `asShipped`
 * drops the running visit AND both accumulators, which is the line in the tree;
 * `clockOnly` drops the running visit alone, which is what the freeze did while
 * the accumulators were being built and is the reason it could be defeated in
 * two instalments.
 */
function runScript(build: Build, z: RouteFinishZone, script: readonly Step[]): Ran {
  let gate = createFinishGate();
  const carried: Carried = { since: null, face: undefined };
  const startedAtSec: number[] = [];
  let t = 0;
  for (const step of script) {
    startedAtSec.push(t);
    for (let s = 0; s < step.forSec; s += DT) {
      const dM = typeof step.dM === "function" ? step.dM(s) : step.dM;
      const tick = makeTick({ t, speedKmh: step.speedKmh, position: { x: z.x, y: z.y - dM } });
      if (step.frozen !== undefined) {
        if (gate.insideSinceSec !== null || gate.regionDwellSec || gate.strandedDwellSec) {
          gate =
            step.frozen === "asShipped"
              ? { ...gate, insideSinceSec: null, regionDwellSec: 0, strandedDwellSec: 0 }
              : { ...gate, insideSinceSec: null };
        }
      } else {
        gate = stepAs(build, gate, z, tick, dM, carried);
      }
      if (gate.reachedAtSec !== null) return { trippedAtSec: gate.reachedAtSec, startedAtSec, gate };
      t += DT;
    }
  }
  return { trippedAtSec: null, startedAtSec, gate };
}

/** The arming step: one second inside `armWithinM`, at a speed, going nowhere. */
function armStep(p: Poses): Step {
  return { dM: p.armDM, speedKmh: 5, forSec: ARM_SEC };
}

// ---------------------------------------------------------------------------
// THE FOUR POSES THE REFUTER MEASURED
// ---------------------------------------------------------------------------

describe("THE ROCKING CAR — the pose that could not be ended at all", () => {
  /**
   * ±1.2 m about the departure circle, 8 s period, 0.9 км/ч, held 900 s.
   *
   * WHY IT ENDS WHEN THE FACES BANK. Region frames are the ones with d strictly
   * greater than `radiusM`: 15 of every 32 frames, so the region face earns
   * 3.75 s per 8 s period and its 20 s bar is reached in the sixth period.
   * MEASURED: banked 18.75 s after five periods, then 1.25 s into the sixth
   * region visit — 41.5 s after the rock began, on every ring geometry in the
   * catalogue. The floor below (2 × FINISH_LEAVE_S) is that duty cycle stated as
   * a bound rather than a measurement: the region face can never be more than
   * half the time, so 20 s of it can never take less than 40 s of wall clock.
   */
  const rock = (z: RouteFinishZone): ((s: number) => number) => (s) =>
    z.radiusM + ROCK_M * Math.sin((2 * Math.PI * s) / ROCK_PERIOD_S);

  for (const ring of RINGS) {
    it(`${ring.id} — it ends with two accumulators, NEVER with one clock and a label`, () => {
      const z = ring.zone;
      const poses = assertStraddles(z);
      const script: Step[] = [armStep(poses), { dM: rock(z), speedKmh: IDLE_KMH, forSec: 900 }];

      const inTree = runScript("inTree", z, script);
      expect(inTree.trippedAtSec).not.toBeNull();
      const rockStart = inTree.startedAtSec[1];
      const spent = inTree.trippedAtSec! - rockStart;
      // Not before the region face can honestly have earned its bar…
      expect(spent).toBeGreaterThanOrEqual(2 * FINISH_LEAVE_S);
      // …and not more than one period's phase past it. (Measured: 41.5 s.)
      expect(spent).toBeLessThanOrEqual(2 * FINISH_LEAVE_S + ROCK_PERIOD_S + DT);
      // AND FOR THE RIGHT REASON, which is the half a passing test can skip. At
      // the trip frame the region face is holding seconds banked by EARLIER
      // visits, and no single visit ever reached the bar on its own — so what
      // ended this drive was the accumulation across face changes and nothing
      // else. MEASURED: 18.75 s banked (five periods at 3.75 s), the last 1.25 s
      // in the visit in progress.
      expect(inTree.gate.regionDwellSec).toBeGreaterThan(0);
      expect(inTree.gate.regionDwellSec).toBeLessThan(FINISH_LEAVE_S);

      // THE REGRESSION, in the state rather than in a story: with the two
      // accumulators forced to zero the same drive cannot be ended at any
      // duration. 900 s is 45× the departure bar and 12× the stranded one.
      const labelOnly = runScript("labelOnly", z, script);
      expect(labelOnly.trippedAtSec).toBeNull();

      // …and the build BEFORE the label ended it, which is what makes the label
      // a regression rather than a trade. It ends it EARLY, on the departure bar
      // carried in from the band — the false refusal the label was fixing.
      const before = runScript("beforeTheLabel", z, script);
      expect(before.trippedAtSec).not.toBeNull();
      expect(before.trippedAtSec! - rockStart).toBeLessThan(2 * FINISH_LEAVE_S);
    });
  }

  it("a rock of ANY period under 2 × FINISH_LEAVE_S was unendable, not just an 8 s one", () => {
    // The label build's hole is not tuned to 8 s: it needs only a half-period
    // shorter than the bar of the face it is on, and the shorter bar is 20 s. So
    // every period below 40 s is unendable and the shipped gate ends all of them.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    for (const periodSec of [2, 8, 20, 39]) {
      const script: Step[] = [
        armStep(poses),
        {
          dM: (s) => z.radiusM + ROCK_M * Math.sin((2 * Math.PI * s) / periodSec),
          speedKmh: IDLE_KMH,
          forSec: 900,
        },
      ];
      expect(runScript("labelOnly", z, script).trippedAtSec).toBeNull();
      const inTree = runScript("inTree", z, script);
      expect(inTree.trippedAtSec).not.toBeNull();
      expect(inTree.trippedAtSec! - inTree.startedAtSec[1]).toBeGreaterThanOrEqual(
        2 * FINISH_LEAVE_S,
      );
    }
  });
});

describe("THE THREE POSES THAT ALREADY ENDED STILL END, AT THE SAME SECOND", () => {
  // If only the rock were pinned, deleting the face memory entirely would pass —
  // and that is the 20 s false refusal, put back. Every build must agree here.
  for (const ring of RINGS) {
    it(`${ring.id} — parked 1.2 m outside the departure circle: FINISH_LEAVE_S, in all three builds`, () => {
      const z = ring.zone;
      const poses = assertStraddles(z);
      const script: Step[] = [armStep(poses), { dM: poses.regionDM, speedKmh: IDLE_KMH, forSec: 900 }];
      for (const build of ["inTree", "labelOnly", "beforeTheLabel"] as Build[]) {
        const out = runScript(build, z, script);
        expect(out.trippedAtSec).toBe(ARM_SEC + FINISH_LEAVE_S);
      }
    });

    it(`${ring.id} — parked 1.2 m inside it: FINISH_OUTSIDE_STUCK_S, in all three builds`, () => {
      const z = ring.zone;
      const poses = assertStraddles(z);
      const script: Step[] = [armStep(poses), { dM: poses.bandDM, speedKmh: IDLE_KMH, forSec: 900 }];
      for (const build of ["inTree", "labelOnly", "beforeTheLabel"] as Build[]) {
        const out = runScript(build, z, script);
        expect(out.trippedAtSec).toBe(ARM_SEC + FINISH_OUTSIDE_STUCK_S);
      }
    });
  }

  it("THE PURE FOLD — 70 s stranded, one frame out, repeat: the band's bar is owed in full", () => {
    // The fold is the straddle taken to its point: a car that is stranded almost
    // long enough, touches the region for a single frame, and goes back. Under
    // one clock the touch made its 70 banked seconds count against the TWENTY
    // second bar and the drive ended on that frame; under the label the touch
    // deleted them and the drive ended never. Both are wrong about the same
    // student. In the tree the stranded face keeps its 70 s and reaches 75 five
    // seconds later — MEASURED at +75.25 s from the fold's first frame.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const strandedSec = FINISH_OUTSIDE_STUCK_S - 5;
    const script: Step[] = [armStep(poses)];
    for (let i = 0; i < 12; i++) {
      script.push({ dM: poses.bandDM, speedKmh: IDLE_KMH, forSec: strandedSec });
      script.push({ dM: poses.regionDM, speedKmh: IDLE_KMH, forSec: DT });
    }

    const inTree = runScript("inTree", z, script);
    expect(inTree.trippedAtSec).not.toBeNull();
    const foldStart = inTree.startedAtSec[1];
    // The whole 75 s, plus the one frame the excursion cost.
    expect(inTree.trippedAtSec! - foldStart).toBe(FINISH_OUTSIDE_STUCK_S + DT);
    // …and the 70 s the excursion closed are on the stranded face, where they
    // were earned, rather than deleted (the label) or spent at the other bar
    // (before it). This is the row that says the ending was the accumulator's.
    expect(inTree.gate.strandedDwellSec).toBe(strandedSec);

    // Before the label the single excursion frame ended the drive on the spot,
    // at the DEPARTURE bar — 70 s of a 20 s clock, spent in the wrong currency.
    const before = runScript("beforeTheLabel", z, script);
    expect(before.trippedAtSec).toBe(foldStart + strandedSec);
    // With the label it never ended at all: 900 s of fold, twelve instalments.
    expect(runScript("labelOnly", z, script).trippedAtSec).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE THREE DIRECTIONS THAT MAKE THE FIX CORRECT RATHER THAN GOOD AT ENDING
// ---------------------------------------------------------------------------

describe("A FACE CHANGE MUST NOT HAND ITS BANKED SECONDS TO THE OTHER BAR", () => {
  it("19 s in the region then 60 s stranded is 79 s of wall clock and must NOT end", () => {
    // 79 s is past the 75 s stranded bar and it is nothing of the sort: 19 of
    // those seconds were spent on a face whose bar is 20. Crediting them to the
    // other bar closes the lesson 19 s early on a student who has been standing
    // still for barely a minute — and the two accumulators exist precisely so
    // each face is spent in its own currency.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const script: Step[] = [
      armStep(poses),
      { dM: poses.regionDM, speedKmh: 0, forSec: FINISH_LEAVE_S - 1 },
      { dM: poses.bandDM, speedKmh: 0, forSec: 60 },
    ];

    const inTree = runScript("inTree", z, script);
    expect(inTree.trippedAtSec).toBeNull();
    // The banked seconds are on the face they were earned on, and nowhere else.
    expect(inTree.gate.regionDwellSec).toBe(FINISH_LEAVE_S - 1);
    expect(inTree.gate.strandedDwellSec).toBe(0);

    // MUTATION 1 — one clock carried across the boundary: 75 s of a clock that
    // started in the region ends the drive at +56 s of standstill. MEASURED 76.0.
    const before = runScript("beforeTheLabel", z, script);
    expect(before.trippedAtSec).toBe(ARM_SEC + FINISH_OUTSIDE_STUCK_S);

    // MUTATION 2 — the off-by-one that banks the closed visit to the face being
    // ENTERED. The state looks right (19 s banked) and points at the wrong bar.
    const wrongWay = runScript("bankToFaceEntered", z, script);
    expect(wrongWay.trippedAtSec).toBe(ARM_SEC + FINISH_OUTSIDE_STUCK_S);
    expect(wrongWay.gate.strandedDwellSec).toBe(FINISH_LEAVE_S - 1);
  });

  it("…and the stranded bar is then owed IN FULL from the frame he stopped, never earlier", () => {
    // The generous direction of the same rule, so „banks nothing" cannot be read
    // as „ends nothing": stay stranded and the drive does end — 75 s after the
    // standstill began, not 56 s. MEASURED +95.0 s on a 19 s region prologue.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const out = runScript("inTree", z, [
      armStep(poses),
      { dM: poses.regionDM, speedKmh: 0, forSec: FINISH_LEAVE_S - 1 },
      { dM: poses.bandDM, speedKmh: 0, forSec: 300 },
    ]);
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - out.startedAtSec[2]).toBe(FINISH_OUTSIDE_STUCK_S);
  });
});

describe("A STUDENT WHO LEAVES AND RETURNS IS NOT ENDED ON THE WALL CLOCK", () => {
  it("19 s out, a minute driving back at the ring, then a return: the 20 s starts again", () => {
    // This is why the fix is ACCUMULATED SECONDS and not a start timestamp. A
    // timestamp is wrong in the other direction: it reads the wall clock, so a
    // car that stood in the region for 19 s, drove properly back toward the ring
    // for a minute and crossed out again would arrive with 79 s of „dwell" and be
    // ended on the frame it returned. Leaving clears what was banked, so that
    // frame cannot be the twentieth second.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const script: Step[] = [
      armStep(poses),
      { dM: poses.regionDM, speedKmh: 0, forSec: FINISH_LEAVE_S - 1 },
      // Driving, in the band: qualifying for neither face, which is the pose
      // that says „he is driving again" — and it clears both accumulators.
      { dM: poses.bandDM, speedKmh: 10, forSec: 60 },
      { dM: poses.regionDM, speedKmh: 0, forSec: 60 },
    ];

    const inTree = runScript("inTree", z, script);
    expect(inTree.trippedAtSec).not.toBeNull();
    const returnedAtSec = inTree.startedAtSec[3];
    // A full FINISH_LEAVE_S from the RETURN. MEASURED +20.0 s (t = 100.0).
    expect(inTree.trippedAtSec! - returnedAtSec).toBe(FINISH_LEAVE_S);

    // MUTATION — the running visit survives the leave, i.e. a timestamp. The
    // drive ends on the very first frame of the return. MEASURED t = 80.0.
    const wall = runScript("wallClock", z, script);
    expect(wall.trippedAtSec).toBe(returnedAtSec);
  });
});

describe("B15's FREEZE CANNOT BE DEFEATED IN TWO INSTALMENTS", () => {
  it("a lawful wait banks nothing on either face — so the bar restarts, not resumes", () => {
    // THE SHAPE OF THE DEFEAT. Bank 40 s on the stranded face (a standstill, then
    // one frame in the region, which closes the visit and banks it). Now the road
    // gives him a lawful reason to stay put — a give-way line, a pedestrian, a
    // ring he is waiting to enter — and `lessons/engine.ts` freezes the gates. If
    // the freeze cleared only the running visit, the 40 banked seconds would sit
    // there through the wait and the drive would close 35 s after it lifted: the
    // freeze would have bought him nothing, which is exactly what B15 forbids.
    //
    // MEASURED on this script: 75.0 s after the wait lifts with the shipped
    // freeze, 35.0 s with the clock-only one.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const bankedSec = 40;
    const script: Step[] = [
      armStep(poses),
      { dM: poses.bandDM, speedKmh: 0, forSec: bankedSec },
      { dM: poses.regionDM, speedKmh: 0, forSec: DT }, // closes the visit: 40 s banked
      { dM: poses.bandDM, speedKmh: 0, forSec: DT }, // …and it is resumed from
      { dM: poses.bandDM, speedKmh: 0, forSec: 10, frozen: "asShipped" },
      { dM: poses.bandDM, speedKmh: 0, forSec: 300 },
    ];

    const inTree = runScript("inTree", z, script);
    expect(inTree.trippedAtSec).not.toBeNull();
    const freeAgainAtSec = inTree.startedAtSec[5];
    expect(inTree.trippedAtSec! - freeAgainAtSec).toBe(FINISH_OUTSIDE_STUCK_S);

    // MUTATION — the freeze as it stood while the accumulators were being built:
    // `insideSinceSec: null` and nothing else. The banked 40 s survive the lawful
    // wait and the drive closes 40 s early.
    const clockOnly = runScript("inTree", z, [
      ...script.slice(0, 4),
      { dM: poses.bandDM, speedKmh: 0, forSec: 10, frozen: "clockOnly" },
      { dM: poses.bandDM, speedKmh: 0, forSec: 300 },
    ]);
    expect(clockOnly.trippedAtSec).not.toBeNull();
    expect(clockOnly.trippedAtSec! - freeAgainAtSec).toBe(FINISH_OUTSIDE_STUCK_S - bankedSec);
  });

  it("…and the 40 s really were banked, or the row above proves nothing", () => {
    // THE CONTROL. Every „the freeze cleared it" assertion is worthless if there
    // was nothing to clear — the reassuring direction this project has been
    // wrong in four times. Same script, no wait at all: the drive ends 35 s after
    // the second instalment begins, which is the 40 banked seconds being spent.
    const ring = RINGS[0];
    const z = ring.zone;
    const poses = assertStraddles(z);
    const bankedSec = 40;
    const out = runScript("inTree", z, [
      armStep(poses),
      { dM: poses.bandDM, speedKmh: 0, forSec: bankedSec },
      { dM: poses.regionDM, speedKmh: 0, forSec: DT },
      { dM: poses.bandDM, speedKmh: 0, forSec: 300 },
    ]);
    expect(out.trippedAtSec).not.toBeNull();
    expect(out.trippedAtSec! - out.startedAtSec[3]).toBe(FINISH_OUTSIDE_STUCK_S - bankedSec);
  });
});

// ---------------------------------------------------------------------------
// THROUGH THE REAL ENGINE — where the freeze actually lives
// ---------------------------------------------------------------------------

/**
 * Drive into the ring (the arming evidence — you cannot leave a roundabout you
 * never reached), back out to a pose, and hold it.
 *
 * 5 km/h on the approach: below every drill's own cap, so nothing the rule
 * engine grades can end the session for an unrelated reason and steal the
 * assertion. `holdDM` is a function of seconds-since-rest so one helper drives
 * both a parked car and a rocking one.
 */
function engineRing(
  r: Rung,
  ring: { x: number; y: number; enterRadiusM: number; exitRadiusM: number },
  holdDM: (sinceRestSec: number) => number,
  restSec: number,
  restKmh: number,
): { ended: boolean; endedAtSec: number | null; restStartedAtSec: number } {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === r.id)!;
  const lesson = compileScenario(template, r.level);
  const ticks: SimTick[] = [];
  let t = 0;
  const armPose = { x: ring.x, y: ring.y - (ring.enterRadiusM - 1) };
  const from = { x: ring.x, y: ring.y - (ring.exitRadiusM + 40) };
  for (let s = 0; s <= 1; s += DT / 8) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: { x: from.x + (armPose.x - from.x) * s, y: from.y + (armPose.y - from.y) * s },
      }),
    );
    t += DT;
  }
  const hold0 = { x: ring.x, y: ring.y - holdDM(0) };
  for (let s = 0; s <= 1; s += DT / 4) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: {
          x: armPose.x + (hold0.x - armPose.x) * s,
          y: armPose.y + (hold0.y - armPose.y) * s,
        },
      }),
    );
    t += DT;
  }
  const restStartedAtSec = t;
  for (let s = 0; s < restSec; s += DT) {
    ticks.push(makeTick({ t, speedKmh: restKmh, position: { x: ring.x, y: ring.y - holdDM(s) } }));
    t += DT;
  }
  let state = createLessonSession(lesson);
  for (const tick of ticks) {
    state = applyTick(state, tick).state;
    if (state.phase !== "driving") break;
  }
  return {
    ended: state.phase !== "driving",
    endedAtSec: state.endedAtSec ?? null,
    restStartedAtSec,
  };
}

describe("the four poses again, through the engine, where B15's 180 s comes first", () => {
  // Every ring band is inside the lawful-wait window by construction
  // (`finish-work-site-band.test.ts` samples all 58 zones), so a standstill there
  // is frozen for YIELD_WAIT_MAX_S before any bar may start. That is what turns
  // the gate's 20 s and 75 s into the +200.25 s and +255.25 s the refuter
  // measured, and it is the founder's forty seconds being honoured.
  for (const id of ["sc-roundabout-entry", "sc-rb-lane-choice"]) {
    it(`${id}@L1 — parked either side of the departure circle: 180 + 20, and 180 + 75`, () => {
      const r = rung(id, 1);
      const p = terminalOf(r);
      if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") {
        throw new Error(`${id}@L1 no longer ends on a ring`);
      }
      const ring = { x: p.x, y: p.y, enterRadiusM: p.enterRadiusM, exitRadiusM: p.exitRadiusM };
      const z = outsideZones(r)[0];
      const poses = assertStraddles(z);

      const outside = engineRing(r, ring, () => poses.regionDM, 400, IDLE_KMH);
      expect(outside.ended).toBe(true);
      expect(outside.endedAtSec! - outside.restStartedAtSec).toBe(
        YIELD_WAIT_MAX_S + FINISH_LEAVE_S + DT,
      );

      const inside = engineRing(r, ring, () => poses.bandDM, 400, IDLE_KMH);
      expect(inside.ended).toBe(true);
      expect(inside.endedAtSec! - inside.restStartedAtSec).toBe(
        YIELD_WAIT_MAX_S + FINISH_OUTSIDE_STUCK_S + DT,
      );
    });
  }

  it("sc-roundabout-entry@L1 — the rocking car ends, and NOT at the pre-label second", () => {
    // The window is derived, not fitted, and it convicts both old builds with one
    // assertion: the floor is B15's wait plus the duty cycle's own arithmetic
    // (20 s of a face that is at most half the time cannot take less than 40 s),
    // which the pre-label build's +200.25 s is below; the ceiling is finite,
    // which the label build's „never" is above. MEASURED +224.75 s.
    const r = rung("sc-roundabout-entry", 1);
    const p = terminalOf(r);
    if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") throw new Error("not a ring");
    const ring = { x: p.x, y: p.y, enterRadiusM: p.enterRadiusM, exitRadiusM: p.exitRadiusM };
    const z = outsideZones(r)[0];
    assertStraddles(z);

    const out = engineRing(
      r,
      ring,
      (s) => z.radiusM + ROCK_M * Math.sin((2 * Math.PI * s) / ROCK_PERIOD_S),
      400,
      IDLE_KMH,
    );
    expect(out.ended).toBe(true);
    const spent = out.endedAtSec! - out.restStartedAtSec;
    expect(spent).toBeGreaterThanOrEqual(YIELD_WAIT_MAX_S + 2 * FINISH_LEAVE_S);
    expect(spent).toBeLessThanOrEqual(YIELD_WAIT_MAX_S + 2 * FINISH_LEAVE_S + 2 * ROCK_PERIOD_S);
    // The number the pre-label build produced, stated so the floor above cannot
    // be loosened past it by accident.
    expect(YIELD_WAIT_MAX_S + FINISH_LEAVE_S + DT).toBeLessThan(
      YIELD_WAIT_MAX_S + 2 * FINISH_LEAVE_S,
    );
  });
});

describe("the freeze that clears both accumulators is the one lessons/engine.ts ships", () => {
  it("a lawful wait mid-drive costs a turn-box drive its banked 40 s, end to end", () => {
    // THE GATE-LEVEL ROW ABOVE MODELS THE FREEZE; THIS ONE RUNS IT. A turn box is
    // used rather than a ring because a ring band is inside the roundabout freeze
    // at every pose, so there is no unfrozen ground there to bank seconds on —
    // while `sc-maneuver-3point`'s band has no yield reason at all until the tick
    // supplies one. The lawful wait is a stop sign 10 m ahead with the car
    // stationary, which is `yieldReasonAt` case 1-3 verbatim.
    //
    // MEASURED: ends 75.0 s after the sign clears (the bar owed in full), and the
    // control below — the same drive with no sign — ends 34.75 s after the second
    // instalment starts, which is the 40 banked seconds being real. A freeze that
    // cleared only `insideSinceSec` would make the two identical.
    const r = rung("sc-maneuver-3point", 1);
    const p = terminalOf(r);
    if (p.kind !== "completeManeuver" || p.maneuver !== "threePointTurn") {
      throw new Error("sc-maneuver-3point@L1 no longer ends on a turn box");
    }
    const c = p.corridor;
    const z = outsideZones(r)[0];
    const inner = strandedBeyondM(z);
    const bandDM = (inner + z.radiusM) / 2;
    const regionDM = z.radiusM + 1.5;
    // The band pose is outside the authored corridor on both axes — B1's ground
    // is not what is being timed here.
    expect(bandDM).toBeGreaterThan(Math.hypot(c.halfWidthM, c.halfLengthM));
    const template = SCENARIO_TEMPLATES.find((t) => t.id === r.id)!;
    const lesson = compileScenario(template, r.level);
    const bankedSec = 40;

    /** `waitSec` seconds of lawful wait after the 40 s are banked; 0 = the control. */
    function drive(waitSec: number): { endedAtSec: number | null; freeAgainAtSec: number } {
      const ticks: SimTick[] = [];
      let t = 0;
      const at = (dM: number, extra: Partial<SimTick> = {}): SimTick =>
        makeTick({ t, speedKmh: 0, position: { x: c.x, y: c.y + dM }, ...extra });
      // 40 m of approach ending on the corridor centre: the arming evidence.
      for (let s = 0; s <= 1; s += DT / 8) {
        ticks.push(makeTick({ t, speedKmh: 5, position: { x: c.x, y: c.y - 40 + 40 * s } }));
        t += DT;
      }
      // Creep out into the band and stop dead.
      for (let s = 0; s <= 1; s += DT / 4) {
        ticks.push(makeTick({ t, speedKmh: 5, position: { x: c.x, y: c.y + bandDM * s } }));
        t += DT;
      }
      for (let s = 0; s < bankedSec; s += DT) {
        ticks.push(at(bandDM));
        t += DT;
      }
      ticks.push(at(regionDM)); // one frame in the region: banks the 40 s
      t += DT;
      ticks.push(at(bandDM)); // back on the stranded face, resuming from 40
      t += DT;
      for (let s = 0; s < waitSec; s += DT) {
        ticks.push(at(bandDM, { nextStopLineM: 10, nextStopLineControl: "stopSign" }));
        t += DT;
      }
      const freeAgainAtSec = t;
      for (let s = 0; s < 300; s += DT) {
        ticks.push(at(bandDM));
        t += DT;
      }
      let state = createLessonSession(lesson);
      let sawTheWait = false;
      for (const tick of ticks) {
        state = applyTick(state, tick).state;
        if (state.yieldWait?.holding === true) sawTheWait = true;
        if (state.phase !== "driving") break;
      }
      // The instrument's own self-check: a „wait" the engine never recognised
      // would make this row pass for the wrong reason entirely.
      expect(sawTheWait).toBe(waitSec > 0);
      expect(state.phase).not.toBe("driving");
      return { endedAtSec: state.endedAtSec ?? null, freeAgainAtSec };
    }

    const withWait = drive(10);
    expect(withWait.endedAtSec! - withWait.freeAgainAtSec).toBe(FINISH_OUTSIDE_STUCK_S);

    const control = drive(0);
    // 34.75 rather than 35.0 for one frame's reason, stated rather than rounded
    // away: with no frozen frames to displace it the resumed stranded visit
    // begins on the „back on the stranded face" frame, which is one DT before
    // `freeAgainAtSec`, so the bar is reached one DT sooner relative to it.
    expect(control.endedAtSec! - control.freeAgainAtSec).toBe(
      FINISH_OUTSIDE_STUCK_S - bankedSec - DT,
    );
  });
});
