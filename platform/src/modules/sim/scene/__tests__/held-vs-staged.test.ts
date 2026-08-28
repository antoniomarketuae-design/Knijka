/**
 * The third neighbour: NOTHING HELD STANDS INSIDE A STAGED ACTOR.
 *
 * `scenery-held-conflicts.test.ts` guards the held table against the two body
 * sources it already knew about — the curb-decoration pass and the occupied
 * parking bays. Sweep 161 produced the third: `templates-following.ts` restaged
 * `sc-follow-standstill`'s column as ACTORS with rooflines (FS_QUEUE_AHEAD — a
 * van held at offsetM 298, a truck at 307, both on the northbound lane centre),
 * and this file was still holding two visual cars at (4.0625, 298) and
 * (4.0625, 306) for the same column. The car at 298 was drawn INSIDE the van:
 * 0.00 m of centres apart, a 4.1 m body inside a 5.2 m one.
 *
 * The dressing tier and the actor tier are authored in different files by
 * different waves and neither has ever seen the other, which is exactly the
 * shape of the two conflicts already gated. So: one sweep, every template,
 * shipped geometry (`actorObb`/`obbOverlap` — the same SAT the contact probe
 * bills collisions with), and a fixture that re-runs the removed pose so the
 * check is proven able to convict.
 *
 * SCOPE, stated rather than implied: an actor's hold pose is resolved by the
 * traffic lane graph, which this pure module cannot run. The sweep therefore
 * covers the shape it CAN resolve exactly — a straight-street district (one
 * edge, two points, from the origin along +y) whose `meta.scenario` names its
 * lane centre, with `hold.nodeIndex 0`. That is most of the scenario catalogue;
 * the count of covered actors is asserted, so the sweep cannot quietly decay
 * into checking nothing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import { actorObb, obbOverlap, type Obb2D } from "@/modules/sim/collision";
import { heldSceneryFor } from "../scenarioSceneryProps";
import type { ScenarioObstacleSpec } from "../obstacleSpec";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

/** Held-body half-extents (length, width), m — the same values
 *  scenarioSceneryProps.heldHalfDiagM is built from, and cited to the same
 *  rigs: vehicleFleet TRUCK_DIMENSIONS 7.5 × 2.4, traffic/types
 *  VEHICLE_PROFILE_* „car" 4.1 × 1.84 / „van" 5.34 × 1.98, ANIMAL_DIMENSIONS. */
function heldObb(o: ScenarioObstacleSpec): Obb2D {
  const base = { x: o.x, y: o.y, headingDeg: o.headingDeg };
  switch (o.kind) {
    case "wall":
      return { ...base, halfLengthM: o.lengthM / 2, halfWidthM: (o.thicknessM ?? 0.3) / 2 };
    case "prop":
      return { ...base, halfLengthM: 0.25, halfWidthM: 0.25 };
    case "animal":
      return { ...base, halfLengthM: 1.1, halfWidthM: 0.28 };
    // A worker on foot: shoulder span 0.46 by chest depth 0.30 (the
    // ObstacleWorker body plan in components/sim/ScenarioObstacles.tsx).
    case "worker":
      return { ...base, halfLengthM: 0.15, halfWidthM: 0.23 };
    // The forecourt's canopy footprint (length along the heading, width across).
    case "fuelStation":
      return { ...base, halfLengthM: o.lengthM / 2, halfWidthM: o.widthM / 2 };
    default:
      if (o.model === "box_truck") return { ...base, halfLengthM: 3.75, halfWidthM: 1.2 };
      if (o.model === "kargo_v") return { ...base, halfLengthM: 2.67, halfWidthM: 0.99 };
      return { ...base, halfLengthM: 2.05, halfWidthM: 0.92 };
  }
}

interface StagedHold {
  templateId: string;
  actorId: string;
  obb: Obb2D;
}

/** The district shape whose hold poses this module can resolve EXACTLY: one
 *  edge, two points, from the origin, running north, with an authored lane
 *  centre. Returns { laneX, startNodeId, endNodeId } or null. */
function straightStreetOf(
  raw: unknown,
): { laneX: number; startNodeId: string; endNodeId: string } | null {
  const d = raw as {
    roads?: {
      nodes?: Array<{ id: string; x: number; y: number }>;
      edges?: Array<{ geometry?: number[][]; from?: string; to?: string }>;
    };
    meta?: { scenario?: { laneCenterRightM?: unknown } };
  };
  const edges = d.roads?.edges ?? [];
  if (edges.length !== 1) return null;
  const g = edges[0].geometry;
  if (!Array.isArray(g) || g.length !== 2) return null;
  if (g[0][0] !== 0 || g[0][1] !== 0 || g[1][0] !== 0 || g[1][1] <= 0) return null;
  const lane = d.meta?.scenario?.laneCenterRightM;
  if (typeof lane !== "number" || !Number.isFinite(lane)) return null;
  const from = edges[0].from;
  const to = edges[0].to;
  const nodes = d.roads?.nodes ?? [];
  const at = (id?: string) => nodes.find((n) => n.id === id);
  const a = at(from);
  const b = at(to);
  if (!a || !b || a.x !== 0 || a.y !== 0 || b.x !== 0 || b.y !== g[1][1]) return null;
  return { laneX: lane, startNodeId: a.id, endNodeId: b.id };
}

/**
 * Every staged actor of one template whose hold pose is exactly resolvable.
 *
 * The NORTHBOUND path only, and that restriction was bought: the first build
 * of this sweep resolved `hold.nodeIndex 0` as district y unconditionally and
 * convicted `sc-animal-hazard`'s held animal of standing inside
 * `sc-animal-oncoming`. That actor's path is `["ovs-n-end", "ovs-n-start"]` —
 * SOUTHBOUND — so its offsetM 150 is 150 m measured from the far end, in the
 * far lane, nowhere near the animal. A false conviction is the same defect as
 * a missed one, so a path that does not start at the origin node and run north
 * is skipped rather than guessed at.
 */
function resolvableHolds(
  spec: (typeof SCENARIO_TEMPLATES)[number],
  raw: unknown,
): StagedHold[] {
  const street = straightStreetOf(raw);
  if (street === null) return [];
  const events = [
    ...(spec.staged ?? []),
    ...spec.levels.flatMap((level) => level.stagedAdd ?? []),
  ] as Array<{
    id?: string;
    actor?: {
      pathNodes?: string[];
      hold?: { nodeIndex?: number; offsetM?: number };
      extraRightOffsetM?: number;
      profile?: string;
    };
  }>;
  const out: StagedHold[] = [];
  const seen = new Set<string>(); // levels repeat their stagedAdd actors
  for (const e of events) {
    const hold = e.actor?.hold;
    const nodes = e.actor?.pathNodes;
    if (!hold || hold.nodeIndex !== 0 || typeof hold.offsetM !== "number") continue;
    if (!Array.isArray(nodes) || nodes[0] !== street.startNodeId) continue;
    if (nodes[1] !== street.endNodeId) continue;
    const id = e.id ?? "?";
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      templateId: spec.id,
      actorId: id,
      // Travel is +y, so the arc offset from node 0 IS district y and the
      // curb-side offset adds toward +x — what the shape gate above buys.
      obb: actorObb(
        { x: street.laneX + (e.actor?.extraRightOffsetM ?? 0), y: hold.offsetM, dirX: 0, dirY: 1 },
        e.actor?.profile as Parameters<typeof actorObb>[1],
      ),
    });
  }
  return out;
}

describe("held dressing vs staged actors", () => {
  it("no held body shares ground with a staged actor's hold pose", () => {
    let coveredActors = 0;
    let coveredTemplates = 0;
    const clashes: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const raw = loadDistrict(spec.map.districtId);
      const holds = resolvableHolds(spec, raw);
      if (holds.length === 0) continue;
      coveredTemplates++;
      coveredActors += holds.length;
      for (const held of heldSceneryFor(`${spec.id}@L1`, raw)) {
        const a = heldObb(held);
        for (const h of holds) {
          if (!obbOverlap(a, h.obb)) continue;
          clashes.push(
            `${spec.id}: held ${held.kind} at (${held.x}, ${held.y}) inside staged ` +
              `${h.actorId} at (${h.obb.x.toFixed(2)}, ${h.obb.y})`,
          );
        }
      }
    }
    // The sweep must actually sweep: if the shape gate ever stops matching,
    // this fails instead of silently passing on an empty set.
    expect(coveredTemplates).toBeGreaterThanOrEqual(20);
    expect(coveredActors).toBeGreaterThanOrEqual(25);
    expect(clashes).toEqual([]);
  });

  it("convicts the pose this wave removed — the negative control", () => {
    // The exact body that shipped in HELD_SCENERY["sc-follow-standstill"] and
    // the exact actor templates-following.ts now stages at the same metre. If
    // the sweep above could not see this, its empty result would mean nothing.
    const heldCar = heldObb({
      kind: "vehicle",
      x: 4.0625,
      y: 298,
      headingDeg: 0,
      model: "corva_s",
      seed: 21,
      visual: true,
    });
    const stagedVan = actorObb({ x: 4.06, y: 298, dirX: 0, dirY: 1 }, "van");
    expect(obbOverlap(heldCar, stagedVan)).toBe(true);
    // …and the check is not "everything overlaps": the same car one queue slot
    // further back is clear of the same van.
    const clearCar = heldObb({
      kind: "vehicle",
      x: 4.0625,
      y: 288,
      headingDeg: 0,
      model: "corva_s",
      seed: 21,
      visual: true,
    });
    expect(obbOverlap(clearCar, stagedVan)).toBe(false);
  });

  it("sc-follow-standstill's column is the actor tier's, and it is still there", () => {
    // Removing the dressing is only right because the actors exist. Pin both
    // halves so a revert on either side is loud: this table holds nothing, and
    // templates-following.ts still stages a van and a truck ahead of the tail.
    const raw = loadDistrict("fo-follow-v1");
    expect(heldSceneryFor("sc-follow-standstill@L1", raw)).toEqual([]);
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-standstill");
    expect(spec).toBeDefined();
    const profiles = resolvableHolds(spec!, raw)
      .map((h) => h.obb.halfLengthM)
      .sort((a, b) => a - b);
    // car 4.1 / van 5.2 / truck 7.5 (traffic/types VEHICLE_PROFILE_LENGTH_M):
    // the tail plus two BIGGER bodies is what makes the column readable from a
    // 1.20 m cockpit eye — a third car would have been invisible again.
    expect(profiles).toEqual([2.05, 2.6, 3.75]);
  });
});
