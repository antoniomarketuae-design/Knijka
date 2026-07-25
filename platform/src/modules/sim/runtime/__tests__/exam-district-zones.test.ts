/**
 * Audit M-15 — can the exam district carry a zone layer at all?
 *
 * The finding: `district-v1` (free drive, Студентски град) and `d2-v1` (the
 * exam district, Лозенец) ship with NO `zones`, so a family of codes is
 * undetectable on the closest thing this product has to a mock practical exam —
 * and „пресичане на плътна осева" is a real examiner fail.
 *
 * Authoring those spans is a CONTENT change (`content/world/*.json` +
 * `meta.zonesVersion: 1`), not an engine change. What this battery does is make
 * that content change safe and cheap: it proves, against the REAL committed
 * cuts, that the whole path — zone data → locator fix → tick flag → reducer
 * verdict — already works on these files, and it names the exact edges and
 * spans a chosen fix can hang from. It is the executable specification the
 * content author writes against; when the spans land in the JSON, the
 * `ships without zones` guard below is the one assertion that must flip.
 *
 * IT ALSO CORRECTS THE FINDING'S COUNT. Three of the eight listed codes cannot
 * honestly fire on either district and must NOT be forced to:
 *   - DRIVING_TOO_SLOW_FOR_MOTORWAY and EMERGENCY_LANE_DRIVING need a
 *     motorway. Neither cut contains one (Студентски град tops out at 50, and
 *     Лозенец's fastest edge is a 70 km/h boulevard) — tagging an urban street
 *     `motorway` to unlock a detector would be inventing a road;
 *   - RAIL_CROSSING_VIOLATION needs a level crossing. Neither OSM cut has one,
 *     and painting rails across a Sofia boulevard that has none is the same
 *     lie in the other direction.
 * Five codes are genuinely authorable here; three of them — the ones needing
 * nothing but position and speed — are proven end-to-end below.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District, type DistrictZone } from "..";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { RuleEvent } from "../../rules/types";
import { LANE_WIDTH_M } from "../spatial";
import { edgeDrivePath, mkVehicle, type PathPose } from "./helpers";

function loadWorld(id: string): District {
  const p = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../../../../../content/world/${id}.json`,
  );
  return parseDistrict(JSON.parse(readFileSync(p, "utf-8")));
}

/** The district with an authored zone layer attached — what the content fix
 *  would commit into the file itself. */
function withZones(district: District, zones: DistrictZone[]): District {
  return { ...district, meta: { ...district.meta, zonesVersion: 1 }, zones };
}

function edge(district: District, id: string) {
  const e = district.roads.edges.find((x) => x.id === id);
  if (!e) throw new Error(`fixture: edge ${id} missing — the cut was regenerated`);
  return e;
}

/** Fold a pose path through the production stack (runtime → reducer). */
function grade(
  district: District,
  poses: PathPose[],
  speedKmh: number,
  dtSec = 0.1,
): RuleEvent[] {
  const rt = createWorldRuntime(district);
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  let t = 0;
  for (const pose of poses) {
    t += dtSec;
    rt.update(dtSec);
    const r = reduceTick(rules, rt.sample(mkVehicle(pose, { speedKmh }), t, false));
    rules = r.state;
    out.push(...r.events);
  }
  return out;
}

const violations = (events: RuleEvent[]): string[] => [
  ...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code)),
];

/**
 * The hosts a content fix would use. Both are long, straight, multi-lane
 * boulevards in the middle of their cut — the shape a solid осева, a bus lane
 * or a В24 span really has in Sofia.
 */
const EXAM_HOST = "e193362542.0"; // бул. Драган Цанков, d2-v1 — 636 m, 4 lanes, 50
const FREE_HOST = "e672186635.0"; // бул. Свети Климент Охридски, district-v1 — 258 m, 5 lanes

describe("M-15 — the shipped exam/free-drive cuts carry no zone layer", () => {
  it("both districts ship without zones (the finding, pinned)", () => {
    // Flip these two when the authored spans land in the JSON — that is the
    // whole point of the guard: the gap must not be able to reopen silently.
    expect(loadWorld("d2-v1").zones ?? []).toEqual([]);
    expect(loadWorld("district-v1").zones ?? []).toEqual([]);
  });

  it("neither cut can honestly host a motorway or a rail crossing", () => {
    // Documented above: three of the eight codes in the finding are not
    // authorable here, and forcing them would mean inventing infrastructure.
    for (const id of ["d2-v1", "district-v1"]) {
      const d = loadWorld(id);
      expect(d.roads.edges.some((e) => e.motorway === true), id).toBe(false);
      expect(Math.max(...d.roads.edges.map((e) => e.maxspeed)), id).toBeLessThan(80);
    }
  });
});

describe("M-15 — an authored zone layer grades end-to-end on the REAL exam cut", () => {
  it("a solid осева span makes the оncoming-half excursion the опасна it is", () => {
    const base = loadWorld("d2-v1");
    const host = edge(base, EXAM_HOST);
    const zones: DistrictZone[] = [
      { id: "d2-m1-tsankov", kind: "solidCenterLine", edgeId: EXAM_HOST, fromM: 120, toM: 420, signRef: "М1" },
    ];
    // Same manoeuvre, twice: on the own bank (right of the centerline) and on
    // the oncoming half inside the М1 span.
    const ownLane = edgeDrivePath(host, 140, 400, 3, LANE_WIDTH_M / 2);
    const oncoming = edgeDrivePath(host, 140, 400, 3, -LANE_WIDTH_M / 2);
    expect(violations(grade(withZones(base, zones), ownLane, 45))).not.toContain("CROSSED_SOLID_LINE");
    expect(violations(grade(withZones(base, zones), oncoming, 45))).toContain("CROSSED_SOLID_LINE");
    // …and the SAME oncoming drive on the file as it ships today grades nothing
    // of the sort — the audit's point, executed.
    expect(violations(grade(base, oncoming, 45))).not.toContain("CROSSED_SOLID_LINE");
  });

  it("a BUS span makes sustained curb-lane travel DRIVING_IN_BUS_LANE", () => {
    const base = loadWorld("d2-v1");
    const host = edge(base, EXAM_HOST);
    const zones: DistrictZone[] = [
      { id: "d2-bus-tsankov", kind: "busLane", edgeId: EXAM_HOST, fromM: 120, toM: 500, signRef: "BUS" },
    ];
    // Curb lane of a 4-lane (2 per bank) boulevard: laneId 0 sits 1.5 lanes
    // right of the centerline. 60 m at 45 km/h ≈ 5 s — past the 4 s sustain.
    const curb = edgeDrivePath(host, 150, 450, 3, 1.5 * LANE_WIDTH_M);
    expect(violations(grade(withZones(base, zones), curb, 45))).toContain("DRIVING_IN_BUS_LANE");
    expect(violations(grade(base, curb, 45))).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("a curve advisory grades SPEED_TOO_FAST_FOR_CURVE below the posted limit", () => {
    // The code the exam district needs most after the осева: every urban 50
    // zone has bends that cannot be taken at 50, and nothing grades them.
    const base = loadWorld("district-v1");
    const host = edge(base, FREE_HOST);
    const zones: DistrictZone[] = [
      {
        id: "dv1-curve-ohridski",
        kind: "curveAdvisory",
        edgeId: FREE_HOST,
        fromM: 40,
        toM: 220,
        signRef: "А1",
        advisoryKmh: 30,
      },
    ];
    const through = edgeDrivePath(host, 50, 210, 3, LANE_WIDTH_M / 2);
    // 45 km/h: legal against the posted 50, reckless against the 30 advisory.
    const codes = violations(grade(withZones(base, zones), through, 45));
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(violations(grade(base, through, 45))).toEqual([]);
  });
});
