/**
 * A LANE-IDENTITY CLAIM STANDS DOWN WHERE THE WORLD DRAWS NO LANE — the second
 * channel carved out of the surface consult, after `wrongWay`.
 *
 * THE FINDING (sc-ac-truck-spray:7e53374c, critical). Frame:
 * `.audit-frames/sweep161/sc-ac-truck-spray/mobile-wrong/04-t102s.png` — 145
 * км/ч across open green field with no road anywhere in it, „the car left the
 * carriageway entirely and the sim keeps driving". Two of that row's three
 * clauses were repaired before this file existed (`OFF_CARRIAGEWAY` in ba3ed16,
 * the off-network ending in 7404468). What survived is the half nobody had
 * measured: while the car is out there, the sim goes on grading it as though it
 * were in one of the lanes it can no longer see.
 *
 * THE MECHANISM. `worldRuntime.sample()` publishes the authored zone spans and
 * the М10 arrow off `fix.edgeIdx >= 0` — the LOCATOR's 30 m lock radius — while
 * `edgeId`, the paint flags and `wrongWay` have all been measured at the KERB
 * since the surface consult landed. Between those two boundaries the tick says
 * both things at once. Measured on mw-v1 through the production `sample()`,
 * `emergencyLaneRight` was published out to 17.8 m PAST both kerbs, with
 * `edgeId: null` and `surfaceAt().under === "verge"` on the same frame.
 *
 * WHAT IT COST, through the real reducer: a car 17.44 m into the grass beside
 * `mw-e-sb` was billed `OFF_CARRIAGEWAY` at t = 2 s — correctly — and then
 * `EMERGENCY_LANE_DRIVING` at t = 3 s. That is 10 точки, ОПАСНА, an instant
 * НЕИЗДЪРЖАН on a 9-point sheet — the grade and the basis both retrieved, not
 * recalled: `rules/catalog.ts` EMERGENCY_LANE_DRIVING (`severityClass:
 * "opasna"`, `lawRef: "ЗДвП чл. 58, т. 4"`) and `rules/n38.ts` N38_BASIS for it
 * (`clause: "в"` — Наредба № 38, прил. № 5, т. 10, б. „в") — for a лента за
 * принудително спиране the car was seventeen metres away from. THEO-4 (doc 64)
 * is what makes it a defect rather than a scoring nit: the card explains
 * «Движеше се по лентата за принудително спиране» to a seventeen-year-old who
 * can see there is no lane at all under him, and an explanation the student can
 * refute out of the windscreen teaches him to stop reading them.
 *
 * BOTH DIRECTIONS, because a false acquittal is the same crime as a false
 * conviction: every case proving the verge is now bare is paired with one
 * proving the carriageway is untouched — the same discipline
 * off-carriageway-consult.test.ts states for its own sweep. The repair is
 * one-sided by construction: `emergencyLaneRight` / `busLaneRight` only ever
 * RAISE `rightmostRequiredLane` or arm a fault, and `laneArrow` is absent =
 * innocent, so withholding them can acquit and can never convict.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWorldRuntime } from "../worldRuntime";
import { OFF_CARRIAGEWAY_BODY_ALLOWANCE_M, makeSurfaceFix } from "../surface";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../../rules/engine";
import { analyzeNetwork } from "../../world/builders/network";
import { assertDistrict, type District } from "../../world/types";
import type { VehicleSample } from "../../contracts";
import type { SimTick } from "../../rules/types";

const WORLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world",
);
const cache = new Map<string, District>();
function load(id: string): District {
  let d = cache.get(id);
  if (d === undefined) {
    d = assertDistrict(JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8")));
    cache.set(id, d);
  }
  return d;
}
const ALL_IDS = readdirSync(WORLD)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();

function vehicle(x: number, y: number, headingDeg = 0, speedKmh = 60): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

/** Every authored span of these kinds, with the edge it rides. */
type LaneSpanKind = "emergencyLane" | "busLane";
interface SpanCase {
  districtId: string;
  kind: LaneSpanKind;
  edgeId: string;
  /** Station inside the span, metres of arclength. */
  sM: number;
}

function laneSpanCases(): SpanCase[] {
  const out: SpanCase[] = [];
  for (const id of ALL_IDS) {
    const d = load(id);
    for (const z of d.zones ?? []) {
      if (z.kind !== "emergencyLane" && z.kind !== "busLane") continue;
      const mid = (z.fromM + z.toM) / 2;
      if (!(mid > 1)) continue;
      out.push({ districtId: id, kind: z.kind, edgeId: z.edgeId, sM: mid });
    }
  }
  return out;
}

/**
 * The point `sM` along `edgeId`, pushed `lateralM` to the geometry-forward
 * right, plus the edge's own half width — so the caller asks for "on the
 * centreline" (0) or "well past the kerb" (halfWidth + n).
 */
function poseOnEdge(
  d: District,
  edgeId: string,
  sM: number,
  lateralM: number,
): { x: number; y: number; headingDeg: number; halfWidth: number } | null {
  const eb = analyzeNetwork(d).edges.find((e) => e.edge.id === edgeId);
  if (!eb || !eb.line) return null;
  const line = eb.line as [number, number][];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]!;
    const [x1, y1] = line[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg < 1e-6) continue;
    if (acc + seg >= sM) {
      const f = (sM - acc) / seg;
      const px = x0 + (x1 - x0) * f;
      const py = y0 + (y1 - y0) * f;
      // Right of travel for a geometry-forward tangent.
      const nx = (y1 - y0) / seg;
      const ny = -(x1 - x0) / seg;
      // District heading: 0 = north (+y), clockwise positive.
      const headingDeg = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
      return {
        x: px + nx * lateralM,
        y: py + ny * lateralM,
        headingDeg,
        halfWidth: eb.halfWidth,
      };
    }
    acc += seg;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. mw-v1 — the finding's own map, the finding's own charge
// ---------------------------------------------------------------------------

describe("mw-v1: the лента за принудително спиране ends at the kerb", () => {
  /** 17.44 m past the southbound kerb — the pose the reducer measurement used. */
  const IN_THE_GRASS = { x: -60, y: 1200 };

  it("THE FIX: off the carriageway the tick claims no lane identity", () => {
    const rt = createWorldRuntime(load("mw-v1"));
    const out = makeSurfaceFix();
    const tick = rt.sample(vehicle(IN_THE_GRASS.x, IN_THE_GRASS.y), 1, false);
    rt.surfaceUnderCar(out);

    // The pose is the interesting band by construction: past the kerb, but
    // still inside the locator's 30 m lock (28.6 m from mw-e-sb's centreline),
    // which is exactly where the tick used to say both things at once.
    expect(out.under).toBe("verge");
    expect(out.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
    expect(tick.edgeId).toBeNull();

    // Fails on the old behaviour: `emergencyLaneRight` was `true` here.
    expect(tick.emergencyLaneRight).toBeUndefined();
  });

  it("…and the reducer bills the excursion instead of the refuge lane", () => {
    const rt = createWorldRuntime(load("mw-v1"));
    let s: RuleEngineState = createRuleEngine();
    const codes = new Set<string>();
    // Long enough to clear both sustains: OFF_CARRIAGEWAY at 2 s, and
    // EMERGENCY_LANE_DRIVING (3 s) which used to follow it at t = 3 s.
    for (let t = 0; t <= 40; t = Number((t + 0.25).toFixed(3))) {
      const tick = rt.sample(vehicle(IN_THE_GRASS.x, 200 + t * 16.7), 0, false) as SimTick;
      tick.t = t;
      const r = reduceTick(s, tick);
      s = r.state;
      for (const e of r.events) if (e.kind === "violation") codes.add(e.code);
    }
    // The car IS off the road and is told so — the acquittal is narrow.
    expect(codes.has("OFF_CARRIAGEWAY")).toBe(true);
    // …and it is no longer also convicted of a 10-point ОПАСНА for a lane it is
    // seventeen metres from.
    expect([...codes]).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("THE CONTROL: in the emergency lane itself the offence is untouched", () => {
    // Without this the case above is worthless — „no charge" is equally true of
    // a build that deleted the offence. `laneEmergencyX: 8.13` is mw-v1's own
    // scenario meta: the curb lane of the northbound carriageway.
    const rt = createWorldRuntime(load("mw-v1"));
    const out = makeSurfaceFix();
    const tick = rt.sample(vehicle(8.13, 1200), 1, false);
    rt.surfaceUnderCar(out);
    expect(out.under).toBe("carriageway");
    expect(tick.emergencyLaneRight).toBe(true);
    expect(tick.laneId).toBe(0);
    expect(tick.motorway).toBe(true);

    const rt2 = createWorldRuntime(load("mw-v1"));
    let s: RuleEngineState = createRuleEngine();
    const codes = new Set<string>();
    for (let t = 0; t <= 40; t = Number((t + 0.25).toFixed(3))) {
      const t2 = rt2.sample(vehicle(8.13, 200 + t * 16.7), 0, false) as SimTick;
      t2.t = t;
      const r = reduceTick(s, t2);
      s = r.state;
      for (const e of r.events) if (e.kind === "violation") codes.add(e.code);
    }
    expect(codes.has("EMERGENCY_LANE_DRIVING")).toBe(true);
    expect(codes.has("OFF_CARRIAGEWAY")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. THE ACQUITTING HALF OVER THE WHOLE CORPUS — every authored lane span
// ---------------------------------------------------------------------------

describe("every authored emergencyLane / busLane span, both sides of its kerb", () => {
  const CASES = laneSpanCases();

  it("the corpus still carries spans of both kinds (non-vacuity)", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(CASES.map((c) => c.kind))).toEqual(new Set(["emergencyLane", "busLane"]));
  });

  it("ON the ribbon the flag is published exactly as before", () => {
    const missing: string[] = [];
    for (const c of CASES) {
      const p = poseOnEdge(load(c.districtId), c.edgeId, c.sM, 0);
      if (p === null) continue;
      const tick = createWorldRuntime(load(c.districtId)).sample(
        vehicle(p.x, p.y, p.headingDeg),
        1,
        false,
      );
      const flag = c.kind === "emergencyLane" ? tick.emergencyLaneRight : tick.busLaneRight;
      if (flag !== true) missing.push(`${c.districtId}/${c.edgeId} ${c.kind}`);
    }
    expect(missing).toEqual([]);
  });

  it("PAST the kerb it is withheld — on the ground `surfaceAt` calls verge", () => {
    const offenders: string[] = [];
    let probes = 0;
    for (const c of CASES) {
      const d = load(c.districtId);
      for (const side of [1, -1]) {
        const p = poseOnEdge(d, c.edgeId, c.sM, side * 0);
        if (p === null) continue;
        const q = poseOnEdge(d, c.edgeId, c.sM, side * (p.halfWidth + 6));
        if (q === null) continue;
        const rt = createWorldRuntime(d);
        const out = makeSurfaceFix();
        const tick = rt.sample(vehicle(q.x, q.y, p.headingDeg), 1, false);
        rt.surfaceUnderCar(out);
        // Only assert where the world agrees the car is off the asphalt — a
        // probe that lands on a neighbouring ribbon is not this test's case.
        if (out.outsideKerbM <= OFF_CARRIAGEWAY_BODY_ALLOWANCE_M) continue;
        probes++;
        const flag = c.kind === "emergencyLane" ? tick.emergencyLaneRight : tick.busLaneRight;
        if (flag !== undefined) {
          offenders.push(`${c.districtId}/${c.edgeId} ${c.kind} side=${side}`);
        }
      }
    }
    // The probes must actually have happened, or "no offenders" is vacuous.
    expect(probes).toBeGreaterThanOrEqual(7);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. THE М10 ARROW — the same claim, the same boundary
// ---------------------------------------------------------------------------

describe("the lane-intent arrow is paint, and paint stops at the kerb", () => {
  /** The three districts that author М10 glyphs in `meta.scenario.laneArrows`. */
  const ARROW_IDS = ["ln-arrows-v1", "ov-oneway-v1", "rb-2lane-v1"];
  /**
   * …of which these two put a glyph on the tick. `rb-2lane-v1` publishes NO
   * arrow at any station of any lane of any arm — measured through the
   * production `sample()` at both authored lane centres (±4.06 / ±12.19) over
   * y = −90…−40, i.e. inside its own `fromM: 30, toM: 90` span. That is a
   * PRE-EXISTING gap in the arrow indexer and NOT this repair's doing: those
   * poses are all on the carriageway (`edgeId` non-null), where the guard added
   * here is inert. It is named rather than papered over, and it is why the
   * non-vacuity witness below is two districts and not three.
   */
  const ARROW_IDS_LIVE = ["ln-arrows-v1", "ov-oneway-v1"];

  it("ON the ribbon an authored arrow still reaches the tick", () => {
    const seen: string[] = [];
    for (const id of ARROW_IDS_LIVE) {
      const d = load(id);
      const rt = createWorldRuntime(d);
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line) continue;
        const line = eb.line as [number, number][];
        const travelHalf = eb.halfWidth - eb.parkingM;
        const lanes = Math.max(1, eb.edge.lanes);
        const laneW = (travelHalf * 2) / lanes;
        for (let i = 1; i < line.length; i++) {
          const [x0, y0] = line[i - 1]!;
          const [x1, y1] = line[i]!;
          const seg = Math.hypot(x1 - x0, y1 - y0);
          if (seg < 1e-6) continue;
          const nx = (y1 - y0) / seg;
          const ny = -(x1 - x0) / seg;
          const headingDeg = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
          for (let step = 2; step < seg; step += 4) {
            const f = step / seg;
            for (let L = 0; L < lanes; L++) {
              const lat = -travelHalf + laneW * (L + 0.5);
              const tick = createWorldRuntime(d).sample(
                vehicle(
                  x0 + (x1 - x0) * f + nx * lat,
                  y0 + (y1 - y0) * f + ny * lat,
                  headingDeg,
                ),
                1,
                false,
              );
              if (tick.laneArrow !== undefined) {
                seen.push(`${id}/${eb.edge.id}`);
                break;
              }
            }
            if (seen.some((s) => s.startsWith(`${id}/`))) break;
          }
          if (seen.some((s) => s.startsWith(`${id}/`))) break;
        }
        if (seen.some((s) => s.startsWith(`${id}/`))) break;
      }
      void rt;
    }
    // Every arrow district that ever published one still does.
    expect(new Set(seen.map((s) => s.split("/")[0]))).toEqual(new Set(ARROW_IDS_LIVE));
  });

  it("PAST the kerb no arrow governs anything", () => {
    const offenders: string[] = [];
    let probes = 0;
    for (const id of ARROW_IDS) {
      const d = load(id);
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line) continue;
        const line = eb.line as [number, number][];
        for (let i = 1; i < line.length; i++) {
          const [x0, y0] = line[i - 1]!;
          const [x1, y1] = line[i]!;
          const seg = Math.hypot(x1 - x0, y1 - y0);
          if (seg < 1e-6) continue;
          const nx = (y1 - y0) / seg;
          const ny = -(x1 - x0) / seg;
          const headingDeg = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
          for (let step = 4; step < seg; step += 12) {
            const f = step / seg;
            for (const side of [1, -1]) {
              const lat = side * (eb.halfWidth + 5);
              const rt = createWorldRuntime(d);
              const out = makeSurfaceFix();
              const tick = rt.sample(
                vehicle(
                  x0 + (x1 - x0) * f + nx * lat,
                  y0 + (y1 - y0) * f + ny * lat,
                  headingDeg,
                ),
                1,
                false,
              );
              rt.surfaceUnderCar(out);
              if (out.outsideKerbM <= OFF_CARRIAGEWAY_BODY_ALLOWANCE_M) continue;
              probes++;
              if (tick.laneArrow !== undefined) {
                offenders.push(`${id}/${eb.edge.id}@${step.toFixed(0)} side=${side}`);
              }
            }
          }
        }
      }
    }
    expect(probes).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
