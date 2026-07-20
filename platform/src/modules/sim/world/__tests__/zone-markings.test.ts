/**
 * Zone-driven marking renderer battery (ADR-006 stage 2b — the world SHOWS
 * what District.zones GRADE; builders/markings.ts).
 *
 * The audit finding this closes: markings.ts had ZERO references to
 * district.zones, so an authored М1 осева was invisible AND a DASHED
 * "overtaking OK" line was painted over the very span the runtime grades as the
 * опасна CROSSED_SOLID_LINE. This battery pins the fix on real shipped maps:
 *  - solidCenterLine (ov-solid2-v1): a SOLID centre strip lands over EXACTLY
 *    the span's arclength and the dashed centre line is suppressed there —
 *    while every dash outside the span is byte-identical to the zoneless build
 *    (the blast-radius proof: only the span gains/loses geometry);
 *  - busLane / emergencyLane (ov-bus-v1 two-way, mw-v1 oneway): the solid seam
 *    lands on the laneId-0 curb-lane boundary the runtime grades against
 *    (runtime/spatial.ts buildEdge lanesPerDir), per bank;
 *  - residential (ov-solid-v1): a host that paints NO lane lines still shows
 *    the authored solid осева over its span (the founder call — see notes);
 *  - a zoneless map's markings are UNCHANGED (stripping the zones reproduces
 *    the pre-fix dashed geometry exactly), and the full build stays finite +
 *    deterministic on every zoned archetype.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeNetwork } from "../builders/network";
import { buildMarkings } from "../builders/markings";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { LANE_WIDTH_M } from "../builders/constants";
import { assertDistrict, type District, type MeshData } from "../types";

const EMPTY: ReadonlySet<string> = new Set();

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
    path.join(process.cwd(), "public", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  throw new Error(`${id}.json not found in ${candidates.join(", ")}`);
}

/** buildMarkings on a district, with no stop/give-way signs and no bays. */
function markingsOf(district: District): MeshData {
  const network = analyzeNetwork(district);
  return buildMarkings(district, network, EMPTY, EMPTY).markings.toMeshData();
}

interface Quad {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  wx: number;
  wy: number;
}

/**
 * Reconstruct marking quads from the indexed mesh. Every marking is emitted via
 * MeshAccumulator.quad → indices [a,b,c,a,c,d], so each 6-index group is one
 * quad whose corners are idx[0,1,2,5]. World (x, MARKING_Y, -y) → district
 * (x, y): districtY = -z.
 */
function quads(mesh: MeshData): Quad[] {
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: Quad[] = [];
  for (let i = 0; i + 6 <= idx.length; i += 6) {
    const corners = [idx[i], idx[i + 1], idx[i + 2], idx[i + 5]].map((vi) => ({
      x: p[3 * vi],
      y: -p[3 * vi + 2],
    }));
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    out.push({ minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, wx: maxX - minX, wy: maxY - minY });
  }
  return out;
}

/** Thin longitudinal line quads whose centre sits at lateral offset ≈ x. */
const lineQuadsAtX = (qs: Quad[], x: number, tol = 0.4): Quad[] =>
  qs.filter((q) => Math.abs(q.cx - x) < tol && q.wx < 0.6);

/** A continuous solid strip = one long quad (wy large); dashes are short. */
const solids = (qs: Quad[]) => qs.filter((q) => q.wy > 40);
const dashes = (qs: Quad[]) => qs.filter((q) => q.wy < 12);

const W = LANE_WIDTH_M; // 8.125 m (3.25 × perceptual scale)

// ---------------------------------------------------------------------------
// solidCenterLine — the SOLID span + dash suppression + blast radius
// ---------------------------------------------------------------------------

describe("ov-solid2-v1 — solidCenterLine paints a solid осева and suppresses the dashes", () => {
  // tertiary 1+1, straight edge (0,0)→(0,620) at x=0; М1 span [300, 500].
  const district = loadDistrict("ov-solid2-v1");
  const zoned = quads(markingsOf(district));
  const stripped = quads(markingsOf({ ...district, zones: undefined }));

  const zonedCenter = lineQuadsAtX(zoned, 0);
  const strippedCenter = lineQuadsAtX(stripped, 0);

  it("host carries exactly the one authored М1 span over [300, 500]", () => {
    expect(district.zones).toHaveLength(1);
    const z = district.zones![0];
    expect(z.kind).toBe("solidCenterLine");
    expect(z.fromM).toBe(300);
    expect(z.toM).toBe(500);
  });

  it("paints ONE solid centre strip over exactly the span's arclength", () => {
    const strip = solids(zonedCenter);
    expect(strip).toHaveLength(1);
    expect(strip[0].minY).toBeCloseTo(300, 1);
    expect(strip[0].maxY).toBeCloseTo(500, 1);
    // ...and it sits ON the centreline (x = 0), not offset into a bank.
    expect(Math.abs(strip[0].cx)).toBeLessThan(0.05);
  });

  it("suppresses every dashed centre segment INSIDE the span", () => {
    for (const d of dashes(zonedCenter)) {
      const insideSpan = d.cy > 300 && d.cy < 500;
      expect(insideSpan).toBe(false);
    }
  });

  it("the zoneless build has NO solid strip and DOES dash straight through the span", () => {
    expect(solids(strippedCenter)).toHaveLength(0);
    expect(dashes(strippedCenter).some((d) => d.cy > 305 && d.cy < 495)).toBe(true);
  });

  it("blast radius: every centre dash OUTSIDE the span is byte-identical to the zoneless build", () => {
    const key = (q: Quad) => `${q.minY.toFixed(3)}:${q.maxY.toFixed(3)}:${q.cx.toFixed(3)}`;
    const zonedKeys = new Set(dashes(zonedCenter).map(key));
    const strippedKeys = new Set(dashes(strippedCenter).map(key));
    // Every kept (zoned) dash exists identically in the zoneless build.
    for (const k of zonedKeys) expect(strippedKeys.has(k)).toBe(true);
    // The only stripped dashes missing from the zoned build are span dashes.
    for (const d of dashes(strippedCenter)) {
      if (!zonedKeys.has(key(d))) expect(d.cy > 299 && d.cy < 501).toBe(true);
    }
    // Something WAS removed (the span was genuinely suppressed, not a no-op).
    expect(dashes(zonedCenter).length).toBeLessThan(dashes(strippedCenter).length);
  });

  it("leaves the arterial solid edge lines (±travelHalf) untouched vs the zoneless build", () => {
    // The 1+1 tertiary carriageway edge lines sit at ±W (lanes×W/2). They must
    // be identical between builds — the zone pass touches only the centreline.
    const edgeZoned = lineQuadsAtX(zoned, W).length + lineQuadsAtX(zoned, -W).length;
    const edgeStripped = lineQuadsAtX(stripped, W).length + lineQuadsAtX(stripped, -W).length;
    expect(edgeZoned).toBe(edgeStripped);
    expect(edgeZoned).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// busLane — the solid seam on the laneId-0 boundary, per bank (two-way)
// ---------------------------------------------------------------------------

describe("ov-bus-v1 — busLane seams land on both curb-lane-0 boundaries", () => {
  // tertiary 2+2, straight edge at x=0; BUS span [90, 330]. lanesPerDir = 2, so
  // laneId-0 inner boundary sits (2-1)·W = ±W off the centreline.
  const district = loadDistrict("ov-bus-v1");
  const zoned = quads(markingsOf(district));

  it("paints a solid seam over the span on the RIGHT bank boundary (+W)", () => {
    const strip = solids(lineQuadsAtX(zoned, W));
    expect(strip).toHaveLength(1);
    expect(strip[0].minY).toBeCloseTo(90, 0);
    expect(strip[0].maxY).toBeCloseTo(330, 0);
  });

  it("paints a solid seam over the span on the LEFT bank boundary (−W)", () => {
    const strip = solids(lineQuadsAtX(zoned, -W));
    expect(strip).toHaveLength(1);
    expect(strip[0].minY).toBeCloseTo(90, 0);
    expect(strip[0].maxY).toBeCloseTo(330, 0);
  });

  it("does NOT touch the centre line (x=0): a bus lane is a curb-lane duty, not an осева", () => {
    const center = lineQuadsAtX(zoned, 0);
    expect(solids(center)).toHaveLength(0);
    // The centre dashes run through the span unbroken (nothing suppressed).
    expect(dashes(center).some((d) => d.cy > 100 && d.cy < 320)).toBe(true);
  });

  it("suppresses the dashed divider under each seam INSIDE the span only", () => {
    for (const side of [W, -W]) {
      for (const d of dashes(lineQuadsAtX(zoned, side))) {
        expect(d.cy > 90 && d.cy < 330).toBe(false);
      }
      // ...but dashes still exist outside the span on that boundary.
      expect(dashes(lineQuadsAtX(zoned, side)).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// emergencyLane — oneway seam on the single-bank laneId-0 boundary
// ---------------------------------------------------------------------------

describe("mw-v1 — emergencyLane seam lands on the oneway curb-lane-0 boundary", () => {
  // primary oneway 3-lane, edge (0,0)→(0,1000) at x=0; emergency span [0,1000].
  // lanesPerDir = 3, travelHalf = 1.5·W, laneId-0 inner boundary at
  // −travelHalf + (3-1)·W = +0.5·W ≈ +4.06 (the rightmost divider, solid).
  const district = loadDistrict("mw-v1");
  const zoned = quads(markingsOf(district));
  const seamX = -1.5 * W + 2 * W; // +0.5·W

  it("paints the solid emergency seam at +0.5·W over the drawn edge", () => {
    const strip = solids(lineQuadsAtX(zoned, seamX));
    expect(strip.length).toBeGreaterThanOrEqual(1);
    // The span is the whole edge → the seam covers the full drawn length, and
    // the rightmost dashed divider is fully suppressed (only the solid remains).
    expect(dashes(lineQuadsAtX(zoned, seamX))).toHaveLength(0);
  });

  it("leaves the OTHER (left) divider at −0.5·W dashed — only laneId 0's boundary seams", () => {
    const other = lineQuadsAtX(zoned, -0.5 * W);
    expect(solids(other)).toHaveLength(0);
    expect(dashes(other).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// noOvertaking — В24 paints the solid М1 over the ban span (founder R3 #50)
// ---------------------------------------------------------------------------

describe("ov-ban-v1 — a В24 span paints the solid осева and suppresses the centre dashes", () => {
  // tertiary 2+2, straight edge (0,0)→(0,400) at x=0; В24 span [90, 210]. The
  // founder's #50: the ban map painted a DASHED centre (= overtaking allowed)
  // over the very span the runtime grades OVERTAKING_IN_BAN_ZONE — В24 on a
  // two-way road means the centre line is not to be crossed, so it renders
  // exactly like an authored solidCenterLine span.
  const district = loadDistrict("ov-ban-v1");
  const zoned = quads(markingsOf(district));
  const stripped = quads(markingsOf({ ...district, zones: undefined }));

  const zonedCenter = lineQuadsAtX(zoned, 0);
  const strippedCenter = lineQuadsAtX(stripped, 0);

  it("paints ONE solid centre strip over exactly the ban span [90, 210]", () => {
    const strip = solids(zonedCenter);
    expect(strip).toHaveLength(1);
    expect(strip[0].minY).toBeCloseTo(90, 1);
    expect(strip[0].maxY).toBeCloseTo(210, 1);
    expect(Math.abs(strip[0].cx)).toBeLessThan(0.05);
  });

  it("suppresses every dashed centre segment INSIDE the span — none survive", () => {
    for (const d of dashes(zonedCenter)) {
      expect(d.cy > 90 && d.cy < 210).toBe(false);
    }
    // ...and dashes still exist outside the span (the road is not all-solid).
    expect(dashes(zonedCenter).length).toBeGreaterThan(0);
  });

  it("leaves the same-direction lane dividers (±W) dashed — В24 bans overtaking, not lane paint", () => {
    for (const side of [W, -W]) {
      const divider = lineQuadsAtX(zoned, side);
      expect(solids(divider)).toHaveLength(0);
      expect(dashes(divider).some((d) => d.cy > 100 && d.cy < 200)).toBe(true);
    }
  });

  it("the zoneless build has NO solid and dashes straight through (the pre-fix render)", () => {
    expect(solids(strippedCenter)).toHaveLength(0);
    expect(dashes(strippedCenter).some((d) => d.cy > 95 && d.cy < 205)).toBe(true);
  });

  it("blast radius: every centre dash OUTSIDE the span is byte-identical to the zoneless build", () => {
    const key = (q: Quad) => `${q.minY.toFixed(3)}:${q.maxY.toFixed(3)}:${q.cx.toFixed(3)}`;
    const zonedKeys = new Set(dashes(zonedCenter).map(key));
    const strippedKeys = new Set(dashes(strippedCenter).map(key));
    for (const k of zonedKeys) expect(strippedKeys.has(k)).toBe(true);
    for (const d of dashes(strippedCenter)) {
      if (!zonedKeys.has(key(d))) expect(d.cy > 89 && d.cy < 211).toBe(true);
    }
    expect(dashes(zonedCenter).length).toBeLessThan(dashes(strippedCenter).length);
  });
});

describe("ov-crest-v1 — the unmarked-class В24 host still shows the solid осева", () => {
  // unclassified 1+1 (not in MARKED_CLASSES → paints NO lane lines at all);
  // В24 span [150, 452.04] runs over the straight [150, 240] then follows the
  // arc — the residential-осева precedent: the solid still renders. The road
  // bends past y=240, so assertions stay in the straight stretch.
  const district = loadDistrict("ov-crest-v1");
  const zoned = quads(markingsOf(district));
  const stripped = quads(markingsOf({ ...district, zones: undefined }));

  it("paints centre paint over the ban span where there was NONE before", () => {
    // Zone-stripped: an unmarked class paints zero markings.
    expect(stripped).toHaveLength(0);
    expect(zoned.length).toBeGreaterThan(0);
    // The straight stretch of the span carries centreline paint at x ≈ 0.
    const straightPart = zoned.filter((q) => Math.abs(q.cx) < 0.4 && q.cy > 150 && q.cy < 240);
    expect(straightPart.length).toBeGreaterThan(0);
    const minY = Math.min(...straightPart.map((q) => q.minY));
    expect(minY).toBeCloseTo(150, 0);
    // ...and nothing paints before the span starts.
    expect(zoned.some((q) => q.maxY < 149)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// residential — the founder call: a no-lane-line host STILL shows the осева
// ---------------------------------------------------------------------------

describe("ov-solid-v1 — a residential solidCenterLine host renders the solid span", () => {
  // residential 1+1 (NOT in MARKED_CLASSES → paints no lane lines); М1 [90,230].
  const district = loadDistrict("ov-solid-v1");
  const zoned = quads(markingsOf(district));

  it("paints the solid осева over [90, 230] even though the host paints no dashes", () => {
    const center = lineQuadsAtX(zoned, 0);
    const strip = solids(center);
    expect(strip).toHaveLength(1);
    expect(strip[0].minY).toBeCloseTo(90, 0);
    expect(strip[0].maxY).toBeCloseTo(230, 0);
    // Residential paints no dashed lane lines at all — only the authored solid.
    expect(dashes(center)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Painted zone-speed numerals (founder R3 #33/#34 — the honest В26-30 stopgap)
// ---------------------------------------------------------------------------

describe("painted zone-speed numerals — «30»/«20» road glyphs on zone streets", () => {
  /** Glyph quads = the zoned build's extra quads vs a mapKind-stripped build
   *  (the pass gates on the scenario mapKind, so stripping it is the exact
   *  pre-slice geometry). */
  const glyphQuadsOf = (id: string) => {
    const district = loadDistrict(id);
    const withGlyphs = quads(markingsOf(district));
    const without = quads(
      markingsOf({ ...district, meta: { ...district.meta, mapKind: undefined } }),
    );
    return { withGlyphs, without, extra: withGlyphs.slice(without.length) };
  };

  it("sp-zone30-v1 (#33): the 360 m zone street paints «30» stations in BOTH banks", () => {
    const { withGlyphs, without, extra } = glyphQuadsOf("sp-zone30-v1");
    expect(withGlyphs.length).toBeGreaterThan(without.length);
    // Seven-segment «30» = 11 quads per station; 3 stations per bank × 2.
    expect(extra.length).toBe(66);
    // Stations sit in each bank's own curb lane (±4.06 lane centres).
    expect(extra.some((q) => q.cx > 1 && q.cx < 7.2)).toBe(true);
    expect(extra.some((q) => q.cx < -1 && q.cx > -7.2)).toBe(true);
    // The first northbound station is fully visible ahead of the y=15 spawn.
    const north = extra.filter((q) => q.cx > 0);
    expect(Math.min(...north.map((q) => q.minY))).toBeGreaterThan(15);
  });

  it("sp-trans-v1 (#34): ONLY the 30-zone edge paints — the 50 approach stays clean", () => {
    const { extra } = glyphQuadsOf("sp-trans-v1");
    expect(extra.length).toBeGreaterThan(0);
    // The zone edge starts at the y=160 transition; every glyph lands past it.
    for (const q of extra) expect(q.minY).toBeGreaterThan(160);
  });

  it("pe-zone-v1: the residential-20 edge paints «20»; pk-drive-v1's 90 m stub paints NOTHING", () => {
    const { extra } = glyphQuadsOf("pe-zone-v1");
    expect(extra.length).toBeGreaterThan(0); // «20» = 11 quads per station
    const stub = glyphQuadsOf("pk-drive-v1");
    expect(stub.extra).toHaveLength(0); // min-length gate: not a zone street
  });

  it("the digits are honest: glyph quads span the digit box, not random paint", () => {
    const { extra } = glyphQuadsOf("sp-zone30-v1");
    for (const q of extra) {
      // Every segment quad fits inside one 6 m × 2.4 m digit box.
      expect(q.wy).toBeLessThanOrEqual(6.05);
      expect(q.wx).toBeLessThanOrEqual(6.05);
    }
  });
});

// ---------------------------------------------------------------------------
// Whole-build guards on every zoned archetype (finite + deterministic)
// ---------------------------------------------------------------------------

describe("zoned archetypes build finite, deterministic marking geometry", () => {
  for (const id of [
    "ov-solid2-v1",
    "mv-uturn-v1",
    "ov-bus-v1",
    "mw-v1",
    "ov-solid-v1",
    "ov-ban-v1",
    "ov-crest-v1",
    "sp-zone30-v1",
    "sp-trans-v1",
  ]) {
    it(`${id}: markings are all-finite and stable for a fixed seed`, () => {
      const district = loadDistrict(id);
      const a = buildWorldGeometry(district, { seed: 7 });
      const b = buildWorldGeometry(district, { seed: 7 });
      for (let i = 0; i < a.markings.positions.length; i++) {
        expect(Number.isFinite(a.markings.positions[i])).toBe(true);
      }
      expect(a.stats.markingQuads).toBe(b.stats.markingQuads);
      expect(a.markings.positions.length).toBe(b.markings.positions.length);
    });
  }
});
