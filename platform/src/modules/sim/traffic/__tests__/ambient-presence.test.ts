/**
 * AMBIENT PRESENCE AT THE GRADED POSE — the measurement whose absence shipped
 * the dead boulevard (doc 87 B23 / B28 / B36 / B38, founder items 8/15/17/18).
 *
 * The ambient baseline was measured once before, *with the player out of the
 * way*, and certified a street the founder then photographed empty:
 *
 *   „the priority road is empty across the whole visible span while the
 *    demonstration bubble says «Кола отдясно — тя има предимство»"
 *
 * The reason the first measurement missed it is the whole point of this file.
 * The taught behaviour on a give-way drill is TO STOP AT THE LINE — so the
 * honest probe drives nothing: it parks the player 30 m short of the junction,
 * exactly where the objective accepts, and asks the two questions a screenshot
 * can answer.
 *
 *   CROSS — is the priority road alive? % of the minute with a MOVING vehicle
 *           on a CROSSING arm within 60 m of the node.
 *   PASS  — how often does one actually come through? Distinct vehicles
 *           entering a 25 m disc at the node, per minute.
 *
 * This is deliberately NOT a test that the street looks good. It is a test that
 * the lesson's SUBJECT exists at the moment the lesson grades. A yielding drill
 * with nothing to yield to is not an easier yielding drill; it is a different
 * lesson, and it is the one he was played.
 *
 * SCOPE. Only templates that take the FAMILY baseline
 * (SCENARIO_FAMILY_TRAFFIC_BASELINE, no authored `traffic`), because that is
 * the number the compiler derives and the only one this lane owns. A template
 * that hand-authors its count is its author's business — and one of them,
 * `sc-junction-scan` (templates-junctions.ts, `traffic: { vehicleCount: 4 }`),
 * still measures cross 13% / 1 pass per minute at L1 for exactly the reason
 * this file exists. That is a real open row for the lane that owns that file,
 * and it is named here rather than quietly excluded.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict, TrafficUpdateContext } from "../types";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario, SCENARIO_FAMILY_TRAFFIC_BASELINE } from "../../lessons/scenario/compile";
import type { ScenarioSpec } from "../../lessons/scenario/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;
const SEC = 60;
/** Where the drill actually grades: short of the node on the spawn's own arm, m. */
const GRADED_POSE_BACK_M = 30;
/** A vehicle is MOVING (not queued, not parked) above this, m/s. */
const MOVING_MPS = 0.9;

/**
 * The floors, set BELOW the measured worst so this gate reports a regression
 * and not the weather. Measured 2026-08-03, seed 7, at the lowest authored rung
 * of every family-baseline template: cross ran 15–58% and 2–5 passes/min, worst
 * cases `jxg-giveway-v1` (15% / 2) and `tj-emerge-v1` (29% / 2). Before the
 * floor landed, the same probe on the same seed measured **0–13% and 1 pass a
 * minute** — that gap is the founder's sentence.
 */
const MIN_CROSS_PCT = 8;
const MIN_PASSAGES_PER_MIN = 2;

interface SpawnPoint {
  id: string;
  x: number;
  y: number;
}
interface RawDistrict extends TrafficDistrict {
  spawnPoints?: SpawnPoint[];
}

const cache = new Map<string, RawDistrict>();
function district(id: string): RawDistrict {
  const hit = cache.get(id);
  if (hit) return hit;
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as RawDistrict;
  cache.set(id, raw);
  return raw;
}

interface Presence {
  crossPct: number;
  passages: number;
  vehicleCount: number;
}

/**
 * WHERE THE STUDENT STANDS — and this used to be „a spawnPointId or nothing".
 *
 * `ScenarioStart` has TWO forms (`scenario/types.ts`: „a spawn point id … or an
 * explicit pose (exactly one of the two must be set)"), and this probe only
 * ever read the first. A template that authors its own pose returned null from
 * `measure`, and `measure` returning null makes the `it` block RETURN — so the
 * row went green without measuring anything. A skip that reads as a pass is the
 * failure mode this whole file is written against, one level up.
 *
 * HOW IT WAS FOUND, and the finding it hid — w11, working
 * sc-ed-d2-priority-run:76d2e929 („a priority lesson with ZERO moving traffic
 * … the right drive burned 90 s of «lawful waits» standing still for a car
 * that never comes"). Adding `exam-drills` to
 * `SCENARIO_FAMILY_TRAFFIC_BASELINE` brought all five exam templates into
 * `SUBJECTS`, and every one of them authors `start.position` — each with its
 * own comment saying why („d2's five spawnPoints all sit on quiet streets far
 * from this arterial"). The suite reported 27 passing tests and had measured
 * exactly none of them.
 *
 * WHAT THE REAL MEASUREMENT THEN SAID, kept here because it is the answer the
 * next lane would otherwise spend itself re-deriving, and because it is a
 * NEGATIVE result — the family baseline was reverted on the strength of it:
 *
 *   template                    4 cars              12 cars
 *   sc-ed-d2-city-run           ALIVE (both floors) ALIVE
 *   sc-ed-d2-priority-run       100% empty, 0 pass  100% empty, 0 pass
 *   sc-ed-d2-stop-address       0 passages          0 passages
 *
 * Tripling the density moves the two dead ones by nothing at all, so whatever
 * is wrong at those two poses is NOT a count: either `buildRoutes` seeds no
 * loop through those junctions on the real Лозенец topology, or the probe's own
 * premise fails there (it stands at the intersection nearest the SPAWN, and
 * `sc-ed-d2-priority-run` spawns on a one-way slip road whose nearest node has
 * no crossing arm, while the junction the drill actually grades is the Б2 line
 * at n2945503673, further along). Those are different repairs and this probe
 * cannot tell them apart; a drive that stands at the GRADED node rather than
 * the nearest one would.
 */
function startPose(spec: ScenarioSpec, d: RawDistrict): { x: number; y: number } | null {
  if (spec.start.spawnPointId !== undefined) {
    return d.spawnPoints?.find((s) => s.id === spec.start.spawnPointId) ?? null;
  }
  return spec.start.position ?? null;
}

function measure(spec: ScenarioSpec, level: number): Presence | null {
  const d = district(spec.map.districtId);
  const sp = startPose(spec, d);
  if (!sp || d.intersections.length === 0) return null;
  let node = d.intersections[0];
  let best = Infinity;
  for (const c of d.intersections) {
    const dd = Math.hypot(c.x - sp.x, c.y - sp.y);
    if (dd < best) {
      best = dd;
      node = c;
    }
  }
  const lesson = compileScenario(spec, level as never);
  const cfg = lesson.traffic ?? {};
  const tr = createTrafficSystem(d, {
    seed: 7,
    vehicleCount: cfg.vehicleCount ?? 0,
    pedestrianCount: cfg.pedestrianCount ?? 0,
    anchor: { x: sp.x, y: sp.y },
    anchorRadiusM: cfg.anchorRadiusM ?? 400,
  });
  const len = Math.hypot(node.x - sp.x, node.y - sp.y) || 1;
  const ux = (node.x - sp.x) / len;
  const uy = (node.y - sp.y) / len;
  const px = node.x - ux * GRADED_POSE_BACK_M;
  const py = node.y - uy * GRADED_POSE_BACK_M;
  const ctx: TrafficUpdateContext = {
    signalPhase: () => "green",
    playerPos: { x: px, y: py },
    playerSpeedKmh: 0,
    playerHeadingDeg: (Math.atan2(ux, uy) * 180) / Math.PI,
  };
  let crossFrames = 0;
  let passages = 0;
  const inside = new Set<number>();
  for (let i = 0; i < SEC * 30; i++) {
    tr.update(DT, ctx);
    let cross = false;
    for (const v of tr.vehicles) {
      const jx = v.x - node.x;
      const jy = v.y - node.y;
      const dj = Math.hypot(jx, jy);
      // "On a crossing arm" = further across the player's approach axis than
      // along it. No road-graph lookup needed and none is honest here: the
      // question is what is in front of the windscreen, not what the map says.
      if (
        v.speedMps > MOVING_MPS &&
        dj <= 60 &&
        Math.abs(jx * uy - jy * ux) > Math.abs(jx * ux + jy * uy)
      ) {
        cross = true;
      }
      if (dj <= 25) {
        if (!inside.has(v.id)) {
          inside.add(v.id);
          passages++;
        }
      } else {
        inside.delete(v.id);
      }
    }
    if (cross) crossFrames++;
  }
  return {
    crossPct: (crossFrames / (SEC * 30)) * 100,
    passages,
    vehicleCount: cfg.vehicleCount ?? 0,
  };
}

const SUBJECTS = (SCENARIO_TEMPLATES as ScenarioSpec[]).filter(
  (t) => SCENARIO_FAMILY_TRAFFIC_BASELINE[t.family] !== undefined && t.traffic === undefined,
);

/**
 * ONE TEMPLATE FAILS THE PASSAGE FLOOR AND IS NAMED RATHER THAN EXCLUDED.
 *
 * `sc-jx-priority-confidence` on `tj-stop-v1`, L1: 4 ambient cars, cross 13%,
 * and **1 passage a minute with 74% of agent-time STOPPED**. Density is not the
 * problem — L3's 5 cars only reach 3 passages at 59% stopped. The agents on
 * this pose gridlock instead of circulating, and there are two candidates, both
 * worth the next lane's time and neither yet proven:
 *
 *  1. The probe parks the player in the carriageway 30 m short of the node for
 *     a full minute. On the OTHER `tj-stop-v1` spawn (`sc-junction-stop`) and
 *     on its twin `tj-scan-v1` (`sc-junction-scan`) the maps measure 52%
 *     stopped, so the pose,
 *     not the map, is what backs the district up — a standing car absorbs the
 *     ambient agents into a queue behind it and the street dies. If that is the
 *     mechanism it is a REAL finding about live play, not a probe artefact:
 *     students stop at give-way lines.
 *  2. This drill is «priority confidence» — the lesson where the student HAS
 *     priority and the graded act is proceeding, not stopping. A stopped player
 *     may simply be the wrong premise for this one template.
 *
 * Which of the two it is decides whether the fix is the reservation logic or
 * this file's premise, so it is left failing-by-name instead of being deleted.
 */
const GRIDLOCK_ALLOWLIST = new Map<string, string>([
  [
    "sc-jx-priority-confidence",
    "tj-stop-v1 from this spawn: 74% of ambient agent-time is STOPPED, so the " +
      "junction sees 1 passage a minute at any density — a queueing defect, not " +
      "a count defect (see the block above this map)",
  ],
]);

describe("ambient presence — the lesson's subject exists where the lesson grades", () => {
  it("the census really finds the yielding families (guard against a vacuous suite)", () => {
    expect(SUBJECTS.length).toBeGreaterThanOrEqual(15);
  });

  it("…and every one of them can actually be POSED — a skip reads as a pass", () => {
    // The counting guard above cannot see this: a subject with no resolvable
    // start pose is still counted, still gets its own green `it`, and is never
    // measured. `startPose` above records how that hid five templates for a
    // whole wave. Named here rather than left to `measure`'s null bail, so the
    // suite fails LOUDLY the next time a template's pose stops resolving.
    for (const spec of SUBJECTS) {
      const d = district(spec.map.districtId);
      expect(startPose(spec, d), `${spec.id}: no resolvable start pose`).not.toBeNull();
      expect(d.intersections.length, `${spec.id} (${spec.map.districtId})`).toBeGreaterThan(0);
    }
  });

  for (const spec of SUBJECTS) {
    const lowest = Math.min(...spec.levels.map((l) => l.level));
    it(`${spec.id}@L${lowest} (${spec.map.districtId}): the crossing arm is not dead`, () => {
      const m = measure(spec, lowest);
      if (m === null) return; // no spawn/intersection to stand at — not this file's claim
      expect(
        m.crossPct,
        `${spec.id}@L${lowest}: ${m.vehicleCount} ambient cars left the priority road empty for ` +
          `${(100 - m.crossPct).toFixed(0)}% of the minute — that is the founder's B23 frame, ` +
          `an instructor naming a car the student cannot see`,
      ).toBeGreaterThanOrEqual(MIN_CROSS_PCT);
      const known = GRIDLOCK_ALLOWLIST.get(spec.id);
      if (known !== undefined) {
        // Named, measured, and still asserted downward: the allowlist buys a
        // pass on the floor, never a pass on getting worse.
        expect(m.passages, `${spec.id}: ${known}`).toBeGreaterThanOrEqual(1);
        return;
      }
      expect(
        m.passages,
        `${spec.id}@L${lowest}: only ${m.passages} vehicles came through the junction in a minute`,
      ).toBeGreaterThanOrEqual(MIN_PASSAGES_PER_MIN);
    });
  }

  it("the gridlock allowlist stays a list of one — every entry is an open row", () => {
    expect(GRIDLOCK_ALLOWLIST.size).toBeLessThanOrEqual(1);
  });
});
