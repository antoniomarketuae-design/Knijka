/**
 * runtime/surface — THE DRIVABLE SURFACE, both directions.
 *
 * The three sweep161 frames this exists for (surface.ts slice 2 names them):
 * a car parked on a roundabout's central grass island, a car standing on the
 * footway beside a bench, a car at 145 км/ч across open field — and in all
 * three the sim raised no off-road state at all. So the first half of this
 * suite is the CONVICTING half: those three surfaces must read off the
 * carriageway, on the very districts the frames were shot on
 * (rb-mini-v1 / sxf-v1 / mw-v1).
 *
 * The second half is the half that matters more. "Never answer a missing
 * credit by loosening a check into one that credits everybody" cuts both ways:
 * a surface predicate that convicts a student driving their own lane is the
 * same crime with the sign flipped. So every lane centre of every DRAWN ribbon
 * on all 105 shipped districts is swept, and every one must read carriageway —
 * including the kerbside PARKING BAND, which is part of the carriageway a
 * `lanes × LANE_WIDTH_M` re-derivation would have thrown away (4 m per side on
 * every arterial in the district).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeNetwork } from "../../world/builders/network";
import { analyzeRoundabouts } from "../../world/builders/roundabout";
import { buildWorldGeometry } from "../../world/builders/buildWorldGeometry";
import { SIDEWALK_WIDTH_M } from "../../world/builders/constants";
import { assertDistrict, type District } from "../../world/types";
import { LANE_WIDTH_M } from "../spatial";
import {
  makeSurfaceFix,
  resolveDistrictDrivableSurface,
  resolveDrivableSurface,
  surfaceAt,
  OFF_CARRIAGEWAY_BODY_ALLOWANCE_M,
  SURFACE_PROBE_CAP_M,
  type DrivableSurface,
  type SurfaceFix,
} from "../surface";

const WORLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world",
);

const cache = new Map<string, District>();
function load(id: string): District {
  let d = cache.get(id);
  if (!d) {
    d = assertDistrict(JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8")));
    cache.set(id, d);
  }
  return d;
}

const surfaces = new Map<string, DrivableSurface>();
function surfaceOf(id: string): DrivableSurface {
  let s = surfaces.get(id);
  if (!s) surfaces.set(id, (s = resolveDistrictDrivableSurface(load(id))));
  return s;
}

const fix: SurfaceFix = makeSurfaceFix();
function at(id: string, x: number, y: number): SurfaceFix {
  return surfaceAt(surfaceOf(id), x, y, fix);
}

/** Unit normal (right of travel) at the midpoint of a drawn ribbon segment. */
function midCross(line: readonly [number, number][]): {
  x: number;
  y: number;
  nx: number;
  ny: number;
} {
  const i = Math.max(1, Math.floor(line.length / 2));
  const [x0, y0] = line[i - 1];
  const [x1, y1] = line[i];
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, nx: (y1 - y0) / L, ny: -(x1 - x0) / L };
}

// ---------------------------------------------------------------------------
// The three frames
// ---------------------------------------------------------------------------

describe("the three sweep161 frames read as off the carriageway", () => {
  it("sc-rb-exit-signal: the roundabout's central island is not a road (rb-mini-v1)", () => {
    const d = load("rb-mini-v1");
    const rings = analyzeRoundabouts(d, analyzeNetwork(d));
    const ring = rings.find((r) => r.islandRadiusM !== null);
    expect(ring, "rb-mini-v1 must still draw a central island").toBeDefined();
    const r = ring!.islandRadiusM!;
    const [cx, cy] = ring!.centre;

    // The frame: stopped in the MIDDLE of the grass. Nothing may call it a road,
    // and the distance must be the whole island — a metre would not be a fault
    // any consumer could tell from kerb noise.
    const centre = at("rb-mini-v1", cx, cy);
    expect(centre.under).toBe("island");
    expect(centre.outsideKerbM).toBeGreaterThan(r - 1);

    // …and all the way out to the kerb it is still not a road.
    for (const f of [0.25, 0.5, 0.75]) {
      const p = at("rb-mini-v1", cx + r * f, cy);
      expect(p.under, `island at ${f * 100}% of its radius`).not.toBe("carriageway");
      expect(p.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
    }

    // The circulatory carriageway around it IS a road — the acquitting half of
    // the same assertion, without which "island" could just mean "roundabout".
    const onRing = at("rb-mini-v1", cx + ring!.ringRadiusM, cy);
    expect(onRing.under).toBe("carriageway");
    expect(onRing.outsideKerbM).toBe(0);
  });

  it("sc-signal-flashing: the footway beside the carriageway is not a road (sxf-v1)", () => {
    const d = load("sxf-v1");
    const net = analyzeNetwork(d);
    // The widest arm with a drawn ribbon: its pavement is the one the ego stood
    // on beside the bench and the litter bin.
    const eb = [...net.edges]
      .filter((e) => e.line && e.line.length >= 2)
      .sort((a, b) => b.halfWidth - a.halfWidth)[0];
    expect(eb, "sxf-v1 must still draw a ribbon").toBeDefined();
    const c = midCross(eb.line as [number, number][]);

    // Just inside the kerb: road. Just outside it: not road, and the distance
    // grows with the step — a predicate that returns a constant fails here.
    const inside = at("sxf-v1", c.x + c.nx * (eb.halfWidth - 0.5), c.y + c.ny * (eb.halfWidth - 0.5));
    expect(inside.under).toBe("carriageway");

    let previous = 0;
    for (const step of [1, 2.5, 5]) {
      const p = at("sxf-v1", c.x + c.nx * (eb.halfWidth + step), c.y + c.ny * (eb.halfWidth + step));
      expect(p.under, `${step} m past the kerb`).not.toBe("carriageway");
      expect(p.outsideKerbM).toBeGreaterThan(previous);
      previous = p.outsideKerbM;
    }
    // A car whose CENTRE is a body-allowance past the kerb has a flank off the
    // road; that is the threshold the rule engine is told to use, so it has to
    // be reachable on the very map the frame was shot on.
    const bodyOut = at(
      "sxf-v1",
      c.x + c.nx * (eb.halfWidth + OFF_CARRIAGEWAY_BODY_ALLOWANCE_M + 0.05),
      c.y + c.ny * (eb.halfWidth + OFF_CARRIAGEWAY_BODY_ALLOWANCE_M + 0.05),
    );
    expect(bodyOut.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
  });

  it("sc-signal-flashing: the raised pavement is NAMED, not just 'off road'", () => {
    // The label the debrief needs («движение по тротоара» rather than a generic
    // verge). Probe the pavement band of every drawn ribbon on the district the
    // frame was shot on and require at least one true footway reading — the
    // strips are inset from the ribbon ends, so not every station has one.
    const d = load("sxf-v1");
    const net = analyzeNetwork(d);
    let footway = 0;
    let probed = 0;
    for (const eb of net.edges) {
      if (!eb.line || eb.line.length < 2) continue;
      const c = midCross(eb.line as [number, number][]);
      for (const side of [1, -1]) {
        const off = eb.halfWidth + SIDEWALK_WIDTH_M / 2;
        const p = at("sxf-v1", c.x + c.nx * off * side, c.y + c.ny * off * side);
        expect(p.under).not.toBe("carriageway");
        probed++;
        if (p.under === "footway") footway++;
      }
    }
    expect(probed, "sxf-v1 draws no ribbon to stand beside").toBeGreaterThan(4);
    expect(footway, "no pavement recognised anywhere on sxf-v1").toBeGreaterThan(0);
  });

  it("sc-ac-truck-spray: open field beside the motorway is not a road (mw-v1)", () => {
    const d = load("mw-v1");
    const net = analyzeNetwork(d);
    const eb = net.edges.find((e) => e.line && e.line.length >= 2);
    expect(eb, "mw-v1 must still draw a carriageway").toBeDefined();
    const c = midCross(eb!.line as [number, number][]);

    // The OUTWARD side — mw-v1 is a divided carriageway, so the other half of
    // the motorway sits 22 m off the median side and would answer instead.
    const probe = (side: number, off: number): SurfaceFix => {
      const q = eb!.halfWidth + off;
      return at("mw-v1", c.x + c.nx * q * side, c.y + c.ny * q * side);
    };
    const side = probe(1, 10).under === "verge" ? 1 : -1;
    expect(probe(side, 10).under, "no open side found beside mw-v1").toBe("verge");

    // 145 км/ч across green field, no road in frame. The reported distance is
    // the real one at every range the widening search has to reach for — 30 m
    // out is two grid rings away, and a search that stopped at the first ring
    // would answer with the cap instead.
    for (const off of [3, 10, 20, 30, 40]) {
      const p = probe(side, off);
      expect(p.under, `${off} m off the motorway`).toBe("verge");
      expect(p.outsideKerbM, `${off} m off the motorway`).toBeCloseTo(off, 2);
    }

    // …and past the cap it saturates rather than lying about the distance.
    expect(probe(side, 60).outsideKerbM).toBe(SURFACE_PROBE_CAP_M);
    const gone = at("mw-v1", c.x + c.nx * 400 * side, c.y + c.ny * 400 * side);
    expect(gone.under).toBe("verge");
    expect(gone.outsideKerbM).toBe(SURFACE_PROBE_CAP_M);
  });
});

// ---------------------------------------------------------------------------
// The other direction — nothing that is a road may read as anything else
// ---------------------------------------------------------------------------

describe("no lane of any shipped district reads off the carriageway", () => {
  it("sweeps every lane centre of every drawn ribbon on all 105 districts", () => {
    const ids = readdirSync(WORLD)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(ids.length).toBeGreaterThanOrEqual(100);

    let probes = 0;
    const offenders: string[] = [];
    for (const id of ids) {
      const d = load(id);
      const s = resolveDistrictDrivableSurface(d);
      const local = makeSurfaceFix();
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line) continue;
        const lanes = Math.max(1, eb.edge.lanes);
        // The TRAVEL band only — the parking band gets its own case below.
        const travelHalf = eb.halfWidth - eb.parkingM;
        const laneW = (travelHalf * 2) / lanes;
        for (let i = 1; i < eb.line.length; i++) {
          const [x0, y0] = eb.line[i - 1];
          const [x1, y1] = eb.line[i];
          const segLen = Math.hypot(x1 - x0, y1 - y0);
          if (segLen < 1e-6) continue;
          const nx = (y1 - y0) / segLen;
          const ny = -(x1 - x0) / segLen;
          for (let sM = 0; sM <= segLen; sM += 2) {
            const t = sM / segLen;
            for (let L = 0; L < lanes; L++) {
              const lat = -travelHalf + laneW * (L + 0.5);
              const qx = x0 + (x1 - x0) * t + nx * lat;
              const qy = y0 + (y1 - y0) * t + ny * lat;
              probes++;
              surfaceAt(s, qx, qy, local);
              if (local.under !== "carriageway" && offenders.length < 12) {
                offenders.push(
                  `${id} ${eb.edge.id} lane ${L} @ ${qx.toFixed(1)},${qy.toFixed(1)} ` +
                    `→ ${local.under} ${local.outsideKerbM.toExponential(2)} m`,
                );
              }
            }
          }
        }
      }
    }
    expect(probes).toBeGreaterThan(80000);
    expect(offenders).toEqual([]);
  });

  it("…and again through the FLOAT32 world geometry LessonScene actually runs", () => {
    // The sweep above indexes the builder's float64 views. The shipped scene
    // indexes `WorldGeometry`, whose positions are a Float32Array: a vertex
    // 800 m from the origin is quantised, and 82 of district-v1's own lane
    // centres then fall OUTSIDE their own asphalt by up to 2.72e-5 m. That is
    // what SURFACE_EDGE_EPS_M is sized for, and this is the case that proves
    // it — a micron-sized epsilon passes the float64 sweep and fails here.
    const offenders: string[] = [];
    let probes = 0;
    for (const id of ["district-v1", "d2-v1"]) {
      const d = load(id);
      const s = resolveDrivableSurface(buildWorldGeometry(d));
      const local = makeSurfaceFix();
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line) continue;
        const lanes = Math.max(1, eb.edge.lanes);
        const travelHalf = eb.halfWidth - eb.parkingM;
        const laneW = (travelHalf * 2) / lanes;
        for (let i = 1; i < eb.line.length; i++) {
          const [x0, y0] = eb.line[i - 1];
          const [x1, y1] = eb.line[i];
          const segLen = Math.hypot(x1 - x0, y1 - y0);
          if (segLen < 1e-6) continue;
          const nx = (y1 - y0) / segLen;
          const ny = -(x1 - x0) / segLen;
          for (let sM = 0; sM <= segLen; sM += 2) {
            const t = sM / segLen;
            for (let L = 0; L < lanes; L++) {
              const lat = -travelHalf + laneW * (L + 0.5);
              const qx = x0 + (x1 - x0) * t + nx * lat;
              const qy = y0 + (y1 - y0) * t + ny * lat;
              probes++;
              surfaceAt(s, qx, qy, local);
              if (local.under !== "carriageway" && offenders.length < 12) {
                offenders.push(
                  `${id} ${eb.edge.id} lane ${L} @ ${qx.toFixed(1)},${qy.toFixed(1)} ` +
                    `→ ${local.under} ${local.outsideKerbM.toExponential(2)} m`,
                );
              }
            }
          }
        }
      }
    }
    expect(probes).toBeGreaterThan(30000);
    expect(offenders).toEqual([]);
  });

  it("the kerbside PARKING BAND is carriageway — the 4 m a lanes×width guess loses", () => {
    // Doc 68 QW3: an arterial's ribbon is travel lanes PLUS a 4 m parking band
    // per side, and the kerb is at the outside of the band. A predicate built
    // from `lanes × LANE_WIDTH_M` (spatial.EdgeRt.halfWidthM does exactly that)
    // would call a legally parked car off-road by up to 4 m. Probe inside the
    // band on every arterial edge of the two real OSM districts.
    let banded = 0;
    for (const id of ["district-v1", "d2-v1"]) {
      const d = load(id);
      const s = resolveDistrictDrivableSurface(d);
      const local = makeSurfaceFix();
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line || eb.line.length < 2 || eb.parkingM <= 0) continue;
        const travelHalf = eb.halfWidth - eb.parkingM;
        const c = midCross(eb.line as [number, number][]);
        // What a `lanes × LANE_WIDTH_M` derivation would have called the kerb —
        // spatial.EdgeRt.halfWidthM is exactly this, and it is the wrong number
        // for this question.
        const naiveHalf =
          ((eb.edge.oneway
            ? Math.max(1, eb.edge.lanes)
            : Math.max(1, Math.floor(eb.edge.lanes / 2)) * 2) *
            LANE_WIDTH_M) /
          2;
        for (const side of [1, -1]) {
          const lat = (travelHalf + eb.parkingM / 2) * side;
          // The probe is genuinely outside the travel lanes AND outside the
          // naive half width — otherwise this test would pass without ever
          // exercising the band it exists for.
          expect(Math.abs(lat)).toBeGreaterThan(travelHalf);
          expect(Math.abs(lat)).toBeGreaterThan(naiveHalf);
          expect(Math.abs(lat)).toBeLessThan(eb.halfWidth);
          surfaceAt(s, c.x + c.nx * lat, c.y + c.ny * lat, local);
          expect(local.under, `${id} ${eb.edge.id} parking band`).toBe("carriageway");
          banded++;
        }
      }
    }
    expect(banded, "no arterial parking band found to probe").toBeGreaterThan(50);
  });

  it("a junction interior is carriageway — the pad, not just the ribbons", () => {
    // Ribbons stop at the junction trim; what a student drives across the
    // middle of a crossroads is the PAD. Every node of degree >= 2, at its own
    // position, on the two OSM districts and the X-junction micro-map.
    let nodes = 0;
    for (const id of ["sxf-v1", "district-v1", "d2-v1"]) {
      const d = load(id);
      const s = resolveDistrictDrivableSurface(d);
      const local = makeSurfaceFix();
      for (const info of analyzeNetwork(d).nodes.values()) {
        if (info.approaches.length < 2) continue;
        surfaceAt(s, info.pos[0], info.pos[1], local);
        expect(local.under, `${id} node ${info.id}`).toBe("carriageway");
        nodes++;
      }
    }
    expect(nodes).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// The two entry points must be the same surface
// ---------------------------------------------------------------------------

describe("resolve paths", () => {
  it("the world-geometry path and the district path index the same asphalt", () => {
    for (const id of ["rb-mini-v1", "sxf-v1", "district-v1"]) {
      const d = load(id);
      const fromMesh = resolveDrivableSurface(buildWorldGeometry(d));
      const fromDistrict = resolveDistrictDrivableSurface(d);
      expect(fromMesh.counts, id).toEqual(fromDistrict.counts);

      const a = makeSurfaceFix();
      const b = makeSurfaceFix();
      const bounds = d.meta.boundsLocalMeters;
      for (let gx = 0; gx < 24; gx++) {
        for (let gy = 0; gy < 24; gy++) {
          const x = bounds.minX + ((bounds.maxX - bounds.minX) * gx) / 23;
          const y = bounds.minY + ((bounds.maxY - bounds.minY) * gy) / 23;
          surfaceAt(fromMesh, x, y, a);
          surfaceAt(fromDistrict, x, y, b);
          expect(a.under, `${id} @ ${x.toFixed(1)},${y.toFixed(1)}`).toBe(b.under);
          // NOT equal, and it must not be asserted equal: `MeshData.positions`
          // is a Float32Array, so the world-geometry path carries quantised
          // vertices (1.31e-4 m at the shipped extreme). Millimetres agree;
          // anything finer is the float32 grid and not a defect.
          expect(a.outsideKerbM, `${id} @ ${x.toFixed(1)},${y.toFixed(1)}`).toBeCloseTo(
            b.outsideKerbM,
            3,
          );
        }
      }
    }
  });

  it("empty meshes resolve to a surface that answers 'verge' and never throws", () => {
    // The tolerance discipline this file already runs for grip patches: a
    // consumer handed nothing must get a usable answer, not an exception.
    const empty = resolveDrivableSurface({
      roadSurface: { positions: [], indices: [] },
      junctionSurface: { positions: [], indices: [] },
    });
    expect(empty.counts).toEqual({ carriageway: 0, island: 0, footway: 0 });
    const out = makeSurfaceFix();
    surfaceAt(empty, 0, 0, out);
    expect(out.under).toBe("verge");
    expect(out.outsideKerbM).toBe(SURFACE_PROBE_CAP_M);
  });

  it("the label meshes are optional and cannot change a conviction", () => {
    const d = load("rb-mini-v1");
    const geo = buildWorldGeometry(d);
    const withLabels = resolveDrivableSurface(geo);
    const asphaltOnly = resolveDrivableSurface({
      roadSurface: geo.roadSurface,
      junctionSurface: geo.junctionSurface,
    });
    const a = makeSurfaceFix();
    const b = makeSurfaceFix();
    for (let gx = -110; gx <= 110; gx += 7) {
      for (let gy = -110; gy <= 110; gy += 7) {
        surfaceAt(withLabels, gx, gy, a);
        surfaceAt(asphaltOnly, gx, gy, b);
        // Identical verdict and identical measurement; only the OFF label may
        // differ (island/footway collapse to verge without the label meshes).
        expect(a.under === "carriageway", `@ ${gx},${gy}`).toBe(b.under === "carriageway");
        expect(a.outsideKerbM, `@ ${gx},${gy}`).toBeCloseTo(b.outsideKerbM, 9);
      }
    }
  });
});
