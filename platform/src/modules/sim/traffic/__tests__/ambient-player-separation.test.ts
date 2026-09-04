/**
 * AN AMBIENT CAR MAY NEVER GET INSIDE THE STUDENT — INCLUDING SIDEWAYS.
 *
 * `sc-junction-blind:dea35510`, whose sentence is „a student who does exactly
 * what the briefing says still crashes into the priority car". The model line's
 * half of that row was closed by wave 20's arrival clauses (`traffic/system.ts
 * conflictFromRightFor`) and wave 22's commitment immunity (`runtime/
 * worldRuntime.ts` §4b) — see `jblind-model-line-in-compiled-traffic.test.ts`,
 * which pins the shadow at 1/20 seeds on L1-L2 and 0/20 above. What those did
 * not touch is the OTHER dangerous error the w26 re-drive still bills on the
 * mobile leg: «Удар в друго превозно средство» −10 ОПАСНА, НЕИЗДЪРЖАН, on a car
 * photographed at **0 км/ч** (`w26/frames/sc-junction-blind__mobile-right/
 * 04-t067s.png` and `04-t073s.png`: speedometer 0, gear D, an ambient car
 * embedded in the bonnet at «Дистанция · 2 м»).
 *
 * WHY IT COULD HAPPEN. `vehicles.ts` had two anti-overlap guarantees and they
 * covered different bodies. Against a STAGED actor: any angle, closing-only
 * (FR-B5-FREEZE). Against the PLAYER: a corridor clamp asking `along > 0 &&
 * lateral < playerLateralM`, i.e. „is he ahead of me in my own lane" — which is
 * exactly the question that cannot see a car standing in the JUNCTION BOX while
 * an agent turns through it.
 *
 * MEASURED, on tj-occluded-v1 at the counts the rungs compile to (n = 4/5/6),
 * 20 seeds, the student arriving at the pose the w26 mobile leg actually stood
 * at and stopping there:
 *
 *   before  16 of 60 runs put an ambient car inside him · worst 2.66 m of
 *           CENTRES — two 4.1 m cars overlapping by ~1.4 m
 *   after    0 of 60 below 4.10 m · worst separation 5.20 m
 *
 * And the closing step is not a smooth one, which is why the repair looks up the
 * pose it will PUBLISH rather than extrapolating along `dirX/dirY`: traced on
 * seed 4, the agent runs the stem to (4.06, −0.42) heading north and its NEXT
 * published pose is (0.12, −4.06) heading east — 5.36 m of travel in a step
 * worth 0.55 m, because the lane graph trims both lanes back from the node. The
 * pose HOPS the junction box; nothing crosses it.
 *
 * WHAT KEEPS THIS FROM BEING A FORCE FIELD, and both halves are tested here:
 *   · the freeze is closing-only, so a student who drives into traffic still
 *     closes the gap himself — `jblind-model-line-in-compiled-traffic.test.ts`
 *     replays `mistake-no-look` at the same counts and requires it to stay
 *     convicted on COLLISION, so an acquittal bought here turns that file red;
 *   · a frozen agent RESUMES the moment he clears the box (below), so this can
 *     never become the frozen queue FR-B5-DEADLOCK was written against.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict, TrafficUpdateContext } from "../types";
import { VEHICLE_PROFILE_LENGTH_M } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;

/** Two 4.1 m cars are interpenetrating below this many metres of CENTRES. */
const CLIP_M = VEHICLE_PROFILE_LENGTH_M.car;

/** sc-junction-blind's host: the equal T whose box the student turns through. */
const DISTRICT_ID = "tj-occluded-v1";
/** His own spawn, 115 m down the south stem. */
const SPAWN = { x: 4.06, y: -115 };
/** The pose the w26 mobile-right leg stood at, motionless, when it was hit. */
const BOX = { x: -1.14, y: -6.47 };
/** Out on the west arm — objective 2's side of the junction. */
const WEST = { x: -60, y: 4.06 };
/** What L1…L5 compile to via SCENARIO_FAMILY_TRAFFIC_BASELINE.junction. */
const COUNTS = [4, 5, 6];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

function ctxAt(pos: { x: number; y: number }): TrafficUpdateContext {
  return {
    signalPhase: () => "green",
    playerPos: pos,
    playerSpeedKmh: 0,
    playerHeadingDeg: 340, // mid-left-turn, the heading the tape carried
  };
}

function build(seed: number, vehicleCount: number) {
  return createTrafficSystem(district(DISTRICT_ID), {
    seed,
    vehicleCount,
    pedestrianCount: 0,
    anchor: SPAWN,
    anchorRadiusM: 400,
  });
}

describe("a student stopped in the junction box is never driven into", () => {
  it("no ambient car ever gets inside him, on any seed at any compiled count", () => {
    let worst = Infinity;
    let worstWhere = "";
    for (const seed of SEEDS) {
      for (const n of COUNTS) {
        const tr = build(seed, n);
        for (let i = 0; i < 120 * 30; i++) {
          const t = i * DT;
          // He drives the stem for 20 s, then stops in the box and stays.
          const inBox = t >= 20;
          tr.update(DT, ctxAt(inBox ? BOX : SPAWN));
          if (!inBox) continue;
          for (const v of tr.vehicles) {
            const d = Math.hypot(v.x - BOX.x, v.y - BOX.y);
            if (d < worst) {
              worst = d;
              worstWhere = `seed ${seed}, n ${n}, t ${t.toFixed(1)} s`;
            }
          }
        }
      }
    }
    expect(worst, `closest centres over 60 runs (${worstWhere})`).toBeGreaterThanOrEqual(CLIP_M);
  });

  it("and every car it held resumes the moment he clears the box", () => {
    // The anti-deadlock half. FR-B5-DEADLOCK is what happens when a guarantee
    // that stops a car cannot let it go again; this one is closing-only, so
    // the same agents move as soon as the separation stops shrinking.
    let worstResume = Infinity;
    let held = 0;
    for (const seed of SEEDS) {
      for (const n of COUNTS) {
        const tr = build(seed, n);
        const near: number[] = [];
        const odo = new Map<number, number>();
        const last = new Map<number, { x: number; y: number }>();
        for (let i = 0; i < 120 * 30; i++) {
          const t = i * DT;
          tr.update(DT, ctxAt(t < 20 ? SPAWN : t < 60 ? BOX : WEST));
          if (Math.abs(t - 60) < DT) {
            for (const v of tr.vehicles) {
              if (Math.hypot(v.x - BOX.x, v.y - BOX.y) < 12) near.push(v.id);
              last.set(v.id, { x: v.x, y: v.y });
            }
          }
          if (t >= 60) {
            for (const v of tr.vehicles) {
              const p = last.get(v.id);
              if (!p) continue;
              odo.set(v.id, (odo.get(v.id) ?? 0) + Math.hypot(v.x - p.x, v.y - p.y));
              p.x = v.x;
              p.y = v.y;
            }
          }
        }
        for (const id of near) {
          held++;
          const travelled = odo.get(id) ?? 0;
          if (travelled < worstResume) worstResume = travelled;
        }
      }
    }
    expect(held, "some agent was beside the box when he left it").toBeGreaterThan(0);
    // Measured floor 50.5 m in the 60 s after he clears; 25 m is half of it.
    expect(worstResume, "least distance covered by a car that had been beside him").toBeGreaterThan(
      25,
    );
  });
});
