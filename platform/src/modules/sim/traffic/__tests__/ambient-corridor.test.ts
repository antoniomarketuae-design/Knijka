/**
 * FR-B5-CORRIDOR (2026-09-01) — A LESSON THAT TRAVELS NEEDS TRAFFIC ALL THE WAY
 * ALONG IT, NOT JUST WHERE IT STARTED.
 *
 * THE ROW. `sc-ed-d2-priority-run:76d2e929`, critical — „A priority lesson with
 * ZERO moving traffic. Not one other vehicle appears in any frame of any run,
 * yet the coach orders «сега пропусни движещите се по пътя с предимство» and
 * the right drive burned 90 s of «lawful waits» standing still for a car that
 * never comes." Frame `sweep161/sc-ed-d2-priority-run/pc-right/04-t073s.png`.
 *
 * IT WAS TWO FAULTS WEARING ONE SENTENCE, and the first one hid the second.
 *
 *  1. `exam-drills` is not in `SCENARIO_FAMILY_TRAFFIC_BASELINE` and the
 *     template authored no `traffic`, so L1–L4 compiled `vehicleCount: 0`. The
 *     entire cast of a three-minute exam segment was the two staged actors, and
 *     both arm late — at the audited t = 73 s the nearest vehicle in the world
 *     was 146 m away. §1 pins the count at every rung.
 *  2. Ambient loops are seeded ONCE, around the spawn, and this drill walks
 *     927 m away from it. Measured over the committed shadow drive with eight
 *     cars and the shipped point-anchor, the longest stretch of the drive with
 *     no ambient vehicle inside 150 m was 89 s — more than half the lesson —
 *     and the nearest car per 10 s ran 13 · 51 · 90 · 90 · 69 · 91 m and then
 *     227 · 367 · 480 · 589 · 696 · 749 · 805 · 859 · 874 · 917. So a COUNT
 *     alone buys a busy first minute and an empty rest, which is why the
 *     earlier probe in `ambient-presence.test.ts` read this drill as „100%
 *     empty at 4 cars AND at 12" and concluded density was not the story. It
 *     was right about that and wrong about the cause.
 *
 * §2 is what makes §1 a measurement of the REPAIR rather than of the district:
 * it strips `anchorPath` back off the same compiled lesson, with the same eight
 * cars and the same seed, and shows the drive going quiet again. Without it,
 * a future wave deleting the corridor would leave §1 green on eight cars that
 * all orbit the kerb the student left.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_ED_D2_PRIORITY_RUN } from "../../lessons/scenario/templates-exam";
import { createScenarioDirector, lessonSeed } from "../../orchestrator";
import { loadDistrict } from "../../world/referents";
import { STAGED_STATE_ID_BASE } from "../staged";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict } from "../types";
import type { ScenarioLevel } from "../../lessons/scenario/types";

const DT = 1 / 60;
const RUNGS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

/** „In frame" for a car on a city street, metres. Generous on purpose: the row
 *  is about an EMPTY road, not about a close pass. */
const IN_FRAME_M = 150;

/**
 * The bar, in seconds of drive with nothing inside `IN_FRAME_M`.
 *
 * MEASURED after the repair, over all five rungs: 0 · 0 · 17 · 0 · 11 s. The
 * bar is 40 — more than twice the worst rung, so ordinary seed movement cannot
 * flap it, and less than half the 89 s the same eight cars produce with the
 * corridor removed (§2), so the thing it is guarding stays guarded.
 */
const MAX_EMPTY_SEC = 40;

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
}

const SHADOW = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "..",
      "content/traces/sc-ed-d2-priority-run/shadow-correct.trace.json",
    ),
    "utf8",
  ),
) as { samples: TraceSample[] };

interface DriveResult {
  /** Ambient cars the system actually built (staged actors excluded). */
  ambient: number;
  /** Longest run of drive time with no ambient vehicle inside IN_FRAME_M. */
  longestEmptySec: number;
  /** Did the drill's own car from the right cross its junction? */
  rightCarCrossed: boolean;
}

/**
 * The student IS the product's own correct drive — the committed shadow
 * recording — through the production stack (`compileScenario` +
 * `createTrafficSystem` + `createScenarioDirector`), which is the same way
 * `staged-cross-return.test.ts` drives this segment and for the same reason:
 * sc-ed-d2-priority-run is a cut of real Лозенец and has no straight line to
 * synthesise.
 */
function drive(level: ScenarioLevel, withCorridor: boolean): DriveResult {
  const samples = SHADOW.samples;
  const lesson = compileScenario(SC_ED_D2_PRIORITY_RUN, level);
  const cfg = lesson.traffic ?? {};
  const traffic = createTrafficSystem(loadDistrict("d2-v1") as TrafficDistrict, {
    seed: lessonSeed(lesson.id),
    // The live scene anchors on the spawn pose (`LessonScene`), so this does.
    anchor: { x: samples[0].x, y: samples[0].y },
    anchorRadiusM: cfg.anchorRadiusM ?? 400,
    anchorPath: withCorridor ? cfg.anchorPath : undefined,
    vehicleCount: cfg.vehicleCount ?? 0,
    pedestrianCount: cfg.pedestrianCount ?? 0,
  });
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  const out: DriveResult = {
    ambient: traffic.vehicles.filter((v) => v.id < STAGED_STATE_ID_BASE).length,
    longestEmptySec: 0,
    rightCarCrossed: false,
  };
  let t = 0;
  let i = 0;
  let empty = 0;
  // Галичица runs east into n248572866 at x = −725.4, so one crossing is one
  // sign change of the actor's x through the junction.
  let wasEast: boolean | null = null;
  const end = samples[samples.length - 1].tSec;
  while (t <= end) {
    while (i < samples.length - 1 && samples[i + 1].tSec <= t) i++;
    const p = samples[i];
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: p.x, y: p.y },
      playerSpeedKmh: p.speedKmh,
      playerHeadingDeg: p.headingDeg,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: p.x,
      y: p.y,
      speedKmh: p.speedKmh,
      headingDeg: p.headingDeg,
      brakePedal: p.speedKmh < 1 ? 1 : 0,
      tickEvents: [],
    });

    let nearest = Infinity;
    for (const v of traffic.vehicles) {
      if (v.id >= STAGED_STATE_ID_BASE) continue;
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < nearest) nearest = d;
    }
    if (nearest <= IN_FRAME_M) {
      empty = 0;
    } else {
      empty += DT;
      if (empty > out.longestEmptySec) out.longestEmptySec = empty;
    }

    const right = traffic.staged("sc-edpr-right");
    if (right) {
      const east = right.x > -725.4;
      if (wasEast !== null && wasEast !== east) out.rightCarCrossed = true;
      wasEast = east;
    }
    t += DT;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §1 — the drill, at every rung it ships
// ---------------------------------------------------------------------------

describe("FR-B5-CORRIDOR — sc-ed-d2-priority-run has a street to give way to", () => {
  for (const level of RUNGS) {
    it(`L${level}: the compiled lesson carries ambient cars AND the route they belong on`, () => {
      const lesson = compileScenario(SC_ED_D2_PRIORITY_RUN, level);
      // MEASURED BEFORE THE REPAIR: 0 at L1–L4. The floor is 8 because the §7
      // ladder's ×0.5 / ×0.75 were both driven on this corridor — at 4 cars the
      // street is dead from t = 60 s (which is the audited frame) and at 6 from
      // t = 115 s. The template pins L1/L2 for exactly that reason.
      expect(
        lesson.traffic?.vehicleCount ?? 0,
        `L${level} compiles ${lesson.traffic?.vehicleCount ?? 0} ambient vehicles`,
      ).toBeGreaterThanOrEqual(8);
      // …and the corridor, or the cars all orbit the spawn (§2).
      expect(lesson.traffic?.anchorPath?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it(`L${level}: no stretch of the drive is an empty road`, () => {
      const r = drive(level, true);
      expect(r.ambient, "the ambient fleet was actually built").toBeGreaterThanOrEqual(8);
      expect(
        r.longestEmptySec,
        `L${level} went ${r.longestEmptySec.toFixed(0)} s with no vehicle inside ${IN_FRAME_M} m`,
      ).toBeLessThan(MAX_EMPTY_SEC);
      // The traffic must not swallow the lesson: the drill's own car from the
      // right still crosses n248572866 (measured t ≈ 139 s on every rung).
      expect(r.rightCarCrossed, "sc-edpr-right crossed the equal junction").toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — the same eight cars, without the corridor: the street goes quiet again
// ---------------------------------------------------------------------------

describe("FR-B5-CORRIDOR — the corridor is what does it, not the count", () => {
  it("stripping anchorPath leaves the same fleet orbiting the spawn", () => {
    // L4 is the exam rung — the one a student drives for the certificate — and
    // it is where the point-anchor measured worst: 89 s of the 150 s drive with
    // nothing inside 150 m, against 0 s with the corridor.
    const withCorridor = drive(4, true);
    const without = drive(4, false);
    expect(withCorridor.ambient).toBe(without.ambient);
    expect(
      without.longestEmptySec,
      `without the corridor the same ${without.ambient} cars left ${without.longestEmptySec.toFixed(0)} s empty`,
    ).toBeGreaterThan(MAX_EMPTY_SEC);
    expect(withCorridor.longestEmptySec).toBeLessThan(without.longestEmptySec);
  });
});

// ---------------------------------------------------------------------------
// §3 — the live scene actually forwards it
// ---------------------------------------------------------------------------

/**
 * The measured failure mode of this codebase's repair waves is a predicate
 * nothing reads: 51 of 82 audited repairs shipped one. Everything above drives
 * `createTrafficSystem` the way `LessonScene` does; this is the one link that
 * cannot be driven from here and could therefore rot silently — the compiled
 * `LessonSpec.traffic.anchorPath` reaching the live session's traffic config.
 * One line of source, matched on one line, so a CRLF worktree cannot fake it.
 */
describe("FR-B5-CORRIDOR — the corridor reaches the live session", () => {
  it("LessonScene passes the compiled anchorPath into createTrafficSystem", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/sim/LessonScene.tsx"),
      "utf8",
    );
    expect(src).toContain("anchorPath: trafficSpec?.anchorPath");
  });
});
