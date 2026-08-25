/**
 * Sign ↔ marking ↔ grading agreement on the three reels the founder rejected
 * for contradicting themselves on the verdict board.
 *
 * All three failed the same way — the world stated the rule in one channel and
 * denied it in another, so the lesson was wrong on its face before a single
 * verdict was computed:
 *
 *  - sc-ov-ban-overtake (ov-ban-v1): „there is a Sign that is stating cant
 *    overtake, but the road lane is showing you can overtake — it must be
 *    unbroken line and currently is broken line which is allowing overtake".
 *    The В24 span painted an unbroken осева the driver never touches, while
 *    the same-direction divider he crosses to pass the slow lead — the one
 *    OVERTAKING_IN_BAN_ZONE actually grades, since the detector reads a laneId
 *    change — stayed broken.
 *  - sc-ov-oneway (ov-oneway-v1): „there is no signal showing that this is
 *    1 way lane — only road marking; there are specific signs stating entering
 *    forbidden". The runtime graded WRONG_WAY off the one-way tag; the world
 *    posted nothing at the forbidden mouth.
 *  - sc-hz-breakdown-pulloff (mw-v1): „the marking on the road is not showing
 *    it either". The аварийна лента was a third lane between a hairline seam
 *    and bare asphalt.
 *
 * This battery pins the agreement itself rather than the fix: every assertion
 * derives the expected paint/post from the SAME authored data the rule engine
 * reads (District.zones spans, the edge one-way tags, the meta lane centres),
 * so paint and grading cannot drift apart again — the junctionPriorityControls
 * lesson (audit C-4) applied to markings.
 *
 * KNOWN GAP, deliberately not asserted (the gen_motorway.mjs honest-gap
 * precedent): mw-v1 still posts no Д5 „Автомагистрала" sign, because no
 * motorway sign GLB exists in the kit — content/signs/svg/d5.svg is authored
 * but tools/blender/signs.py never bakes it. The marking is fixed here; the
 * post needs an asset drop, and posting a face the kit does not ship would be
 * the same class of lie this battery exists to prevent.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime } from "../../runtime";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { DASH_WIDTH_M, EDGE_LINE_INSET_M, LANE_WIDTH_M } from "../builders/constants";
import { onewayNoEntryArms } from "../builders/network";
import { assertDistrict, type District, type MeshData, type WorldGeometry } from "../types";

const W = LANE_WIDTH_M;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

const loadDistrict = (id: string): District => assertDistrict(loadRaw(id));
const loadWorld = (id: string): WorldGeometry =>
  buildWorldGeometry(loadDistrict(id), { seed: 7 });

interface Quad {
  cx: number;
  minY: number;
  maxY: number;
  cy: number;
  wx: number;
  wy: number;
}

/** Marking quads back out of the indexed mesh (zone-markings.test.ts twin):
 *  each 6-index group is one quad, world (x, y, -districtY). */
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
    out.push({
      cx: (minX + maxX) / 2,
      minY,
      maxY,
      cy: (minY + maxY) / 2,
      wx: maxX - minX,
      wy: maxY - minY,
    });
  }
  return out;
}

/** Thin longitudinal line quads centred at lateral offset ≈ x. */
const atX = (qs: Quad[], x: number, tol = 0.4): Quad[] =>
  qs.filter((q) => Math.abs(q.cx - x) < tol && q.wx < 0.8);
/** A continuous strip is one long quad; dashes are DASH_LENGTH_M short. */
const solids = (qs: Quad[]) => qs.filter((q) => q.wy > 40);
const dashes = (qs: Quad[]) => qs.filter((q) => q.wy < 12);

// ---------------------------------------------------------------------------
// 1. ov-ban-v1 — В24 posted AND every line it governs unbroken over the span
// ---------------------------------------------------------------------------

describe("ov-ban-v1: the В24 sign and the paint state the same ban", () => {
  const district = loadDistrict("ov-ban-v1");
  const world = loadWorld("ov-ban-v1");
  const qs = quads(world.markings);
  const zone = district.zones!.find((z) => z.kind === "noOvertaking")!;
  const lanes = district.roads.edges[0]!.lanes;
  /** Every lane boundary of the 2+2 carriageway: the осева at 0 and the
   *  same-direction dividers at ±W — derived from the edge, not hardcoded. */
  const boundaries = Array.from({ length: lanes - 1 }, (_, i) => -((lanes * W) / 2) + (i + 1) * W);

  it("posts В24 and posts it INSIDE the span the engine grades", () => {
    expect(world.stats.signs.noOvertaking).toBeGreaterThan(0);
    for (const post of world.signs.filter((s) => s.kind === "noOvertaking")) {
      const y = -post.position[2]; // world z → district y (the edge runs +y)
      expect(y).toBeGreaterThanOrEqual(zone.fromM - 0.5);
      expect(y).toBeLessThanOrEqual(zone.toM + 0.5);
    }
  });

  it("paints EVERY lane boundary unbroken over exactly the graded span", () => {
    expect(boundaries).toHaveLength(3); // осева + two same-direction dividers
    for (const off of boundaries) {
      const line = atX(qs, off);
      const strip = solids(line);
      expect(strip, `boundary at x=${off} carries no unbroken line`).toHaveLength(1);
      expect(strip[0]!.minY).toBeCloseTo(zone.fromM, 1);
      expect(strip[0]!.maxY).toBeCloseTo(zone.toM, 1);
    }
  });

  it("leaves NO broken line anywhere inside the ban — nothing invites the pass", () => {
    for (const off of boundaries) {
      for (const d of dashes(atX(qs, off))) {
        expect(d.cy > zone.fromM && d.cy < zone.toM).toBe(false);
      }
    }
  });

  it("ends the unbroken paint with the ban — the road outside is ordinary 2+2", () => {
    for (const off of boundaries) {
      // The осева of an even-lane host is dashed outside the span too, so the
      // whole carriageway returns to „overtaking allowed" paint past the zone.
      expect(dashes(atX(qs, off)).some((d) => d.cy > zone.toM + 5)).toBe(true);
      expect(dashes(atX(qs, off)).some((d) => d.cy < zone.fromM - 5)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. ov-oneway-v1 — В1 posted at exactly the mouth the runtime grades wrong-way
// ---------------------------------------------------------------------------

const sample = (x: number, y: number, headingDeg: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh: 40,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

describe("ov-oneway-v1: the one-way street is SIGNED, not just painted", () => {
  const district = loadDistrict("ov-oneway-v1");
  const world = loadWorld("ov-oneway-v1");
  const allPosts = world.signs.filter((s) => s.kind === "noEntry");
  // The JUNCTION mouth (network.onewayNoEntryArms) — west of the T.
  const posts = allPosts.filter((s) => s.position[0] < 0);
  // The TERMINAL mouth (network.onewayTerminalNoEntryEdges) — the far end of
  // the east one-way arm, where a driver coming from outside the map would
  // enter against the flow. It did not exist before 2026-07-31: the В1 pass
  // only signed junction arms, which left thirteen of the catalog's one-way
  // maps (motorway carriageways, the lane-drop merge, the roadworks shift, the
  // gantry street) with a graded WRONG_WAY and no plate anywhere. This map has
  // BOTH illegal mouths, so it now carries both plates — which is what a real
  // one-way street has.
  const terminal = allPosts.filter((s) => s.position[0] > 0);

  it("posts a В1 at BOTH illegal mouths — the junction arm and the far terminal", () => {
    expect(allPosts).toHaveLength(2);
    expect(posts).toHaveLength(1);
    expect(terminal).toHaveLength(1);
    // The terminal plate stands at the east end of the east one-way arm and
    // its FACE looks EAST — ON with the flow — so the legal driver leaving the
    // map reads the plate's grey back and only a wrong-way entrant, who is
    // driving west into the arm, ever reads the red disc.
    //
    // THIS LINE ASSERTED THE OPPOSITE until 2026-08-25 (`tFace[0] < -0.8`),
    // under the comment above it that already described the behaviour asserted
    // now — a green test reporting safety for a plate aimed at the wrong
    // reader. `StaticTransform.yaw` states the convention it got backwards:
    // „+Z is the facing side", and `yawFromFacing` turns +Z onto the vector it
    // is handed. See props.ts „THE FACE POINTED THE WRONG WAY" for the frame.
    const t = terminal[0]!;
    const tFace: [number, number] = [Math.sin(t.yaw), -Math.cos(t.yaw)];
    expect(tFace[0]).toBeGreaterThan(0.8);
  });

  it("posts exactly one В1 on the west arm, whose flow points back at the junction", () => {
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    const x = post.position[0];
    const y = -post.position[2];
    // West of the junction (the arm a driver would enter against the flow),
    // abreast of the bar, on the forbidden direction's right-hand curb.
    expect(x).toBeLessThan(0);
    expect(x).toBeGreaterThan(-40);
    expect(y).toBeGreaterThan(200); // right of a WESTBOUND driver = north side
    expect(y).toBeLessThan(212);
  });

  it("the В1 face is READABLE from the stem the student actually approaches on", () => {
    // This replaces a pin on the raw yaw (π/2 — „facing east, straight back
    // down its own arm"). That pin described a plate the student never saw: the
    // only driver who can enter this mouth comes up the STEM, and against his
    // line of sight the face measured 70.8° off-axis, i.e. 0.29 m of projected
    // plate at 69 m. Founder item 47, verbatim: „no sign post of ANY kind".
    //
    // The invariant that matters is not a yaw, it is an ANGLE TO THE READER, so
    // that is what is asserted. A future change may move the post anywhere it
    // likes as long as the driver who is graded for ignoring it can see it.
    const post = posts[0]!;
    const sx = post.position[0];
    const sy = -post.position[2];
    // yaw θ turns model +Z (world +X·sinθ, +Z·cosθ); world +Z is district −y.
    const face: [number, number] = [Math.sin(post.yaw), -Math.cos(post.yaw)];
    // The student, stopped short of the T on the northbound stem lane.
    for (const eyeY of [120, 150, 175]) {
      const dx = 4.06 - sx;
      const dy = eyeY - sy;
      const len = Math.hypot(dx, dy);
      const offAxisDeg = (Math.acos((face[0] * dx + face[1] * dy) / len) * 180) / Math.PI;
      expect(offAxisDeg).toBeLessThan(40);
    }
    // …and it must still address the driver entering the arm illegally: the
    // face may never swing PAST the cross street into the far verge.
    expect(face[0]).toBeGreaterThan(0.3); // still looking east, at the junction
  });

  it("posts Г2 «само надясно» on the stem — the sign that states the manoeuvre", () => {
    // Founder item 47's first clause („there must be sign stating to go left or
    // right"). Derived: the stem's only legal exit at this T is the east arm,
    // because the west arm is one-way INTO the junction. Nothing is authored.
    const g2 = world.signs.filter((s) => s.kind === "mandatoryRight");
    expect(g2).toHaveLength(1);
    const post = g2[0]!;
    const x = post.position[0];
    const y = -post.position[2];
    expect(x).toBeGreaterThan(0); // right-hand kerb of the northbound stem
    expect(y).toBeGreaterThan(160); // before the mouth…
    expect(y).toBeLessThan(200); // …and never inside the junction
    // Square to the approaching driver: face points SOUTH (yaw 0).
    const face: [number, number] = [Math.sin(post.yaw), -Math.cos(post.yaw)];
    expect(face[1]).toBeLessThan(-0.9);
    // Never Г3: turning left here is the movement В1 forbids.
    expect(world.signs.some((s) => s.kind === "mandatoryLeft")).toBe(false);
  });

  it("closes the SAME arm the runtime grades WRONG_WAY on (sign ↔ grading)", () => {
    const junction = district.roads.nodes.find((n) => n.id === "ov-ow-n-junction")!;
    const arms = district.roads.edges.filter(
      (e) => e.from === junction.id || e.to === junction.id,
    );
    const banned = onewayNoEntryArms(
      arms.map((e) => ({
        edgeId: e.id,
        oneway: e.oneway,
        roundabout: e.roundabout,
        incoming: e.to === junction.id || !e.oneway,
        outgoing: e.from === junction.id || !e.oneway,
      })),
    );
    expect([...banned]).toEqual(["ov-ow-oneway-w"]);

    // The runtime, independently, calls the heading INTO that arm wrong-way…
    const rt = createWorldRuntime(loadRaw("ov-oneway-v1"));
    rt.update(1 / 60);
    expect(rt.sample(sample(-60, 200, 270), 1, false).wrongWay).toBe(true);
    // …and the with-flow heading on the far arm clean, where no В1 stands.
    const rt2 = createWorldRuntime(loadRaw("ov-oneway-v1"));
    rt2.update(1 / 60);
    expect(rt2.sample(sample(60, 200, 90), 1, false).wrongWay).toBe(false);
    expect(posts.every((p) => p.position[0] < 0)).toBe(true);
  });

  it("does not sign the two-way stem, and never signs a roundabout ring", () => {
    // The stem runs along x = 0 up to the T: no В1 may stand on it.
    expect(posts.some((p) => Math.abs(p.position[0]) < 3)).toBe(false);
    // Ring arms are one-way by construction and carry Б1 + Д11, never В1 —
    // the rb maps are scenario micro-maps too, so only the ring guard saves them.
    for (const id of ["rb-2lane-v1", "rb-mini-v1", "rb-ped-v1"]) {
      expect(loadWorld(id).stats.signs.noEntry, `${id} posted a В1 on a ring`).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2b. EVERY terminal В1 in the catalogue, not just ov-oneway's
// ---------------------------------------------------------------------------
// The general form of the one assertion above, and the reason it is general:
// the single-instance version was pinned BACKWARDS and stayed green, so the
// same inversion shipped on every other map the pass touches. A steered drive
// photographed it — .audit-frames/w10-4/frames/sc-merge-accel-lane__mobile-
// right/04-t072s.png: a full red В2 disc on a pole beside the acceleration lane
// the briefing had just ordered the student up, on a lesson whose debrief then
// teaches him «В2 „Влизането забранено" значи не влизаш».
//
// DERIVED, NEVER LISTED: every document in content/world is re-run through the
// same rule `network.onewayTerminalNoEntryEdges` applies, and every district
// that has such an edge is built. 9 of the 105 committed maps qualify today
// (the two motorway carriageways and their ramps, the lane-drop merge, the
// roadworks shift, the gantry street, the cane crossing, ov-oneway's far arm),
// carrying 15 plates between them. A tenth map joins this gate on the day it
// lands, with nothing to edit here.
// ---------------------------------------------------------------------------

/** The directory `loadRaw` resolves against, for the whole-catalogue pass. */
function worldDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  const dir = candidates.find((d) => fs.existsSync(d));
  if (!dir) throw new Error(`content/world not found in: ${candidates.join(", ")}`);
  return dir;
}

type DistrictEdgeDoc = District["roads"]["edges"][number];

/** `network.onewayTerminalNoEntryEdges`, re-derived from the raw document — so
 *  the gate cannot be satisfied by the builder agreeing with itself. */
function terminalOneWayEdges(d: District): DistrictEdgeDoc[] {
  const degree = new Map<string, number>();
  for (const e of d.roads.edges) {
    for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  const flowLeaves = new Set(
    d.roads.edges.filter((e) => e.oneway && !e.roundabout).map((e) => e.from),
  );
  return d.roads.edges.filter(
    (e) => e.oneway && !e.roundabout && (degree.get(e.to) ?? 0) < 3 && !flowLeaves.has(e.to),
  );
}

describe("every terminal В1 in the catalogue addresses the wrong-way entrant", () => {
  const signed = fs
    .readdirSync(worldDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort()
    .map((id) => {
      const district = loadDistrict(id);
      return {
        id,
        terminals: terminalOneWayEdges(district),
        // The SAME key `zoneSigns.scenarioSignScale` gates the pass on, read
        // rather than re-guessed: an OSM city district's real signage was never
        // recorded, so props.ts posts nothing there and this gate must not ask
        // it to. d2-v1 and district-v1 have terminal one-way edges and are
        // correctly bare.
        micro: String(district.meta.mapKind ?? "").startsWith("scenario"),
      };
    })
    .filter((d) => d.terminals.length > 0);

  it("still finds the shape this pass exists for, on more than one map", () => {
    // A FLOOR, not an equality: a new micro-map must JOIN the gate below, never
    // renumber it. 9 scenario districts / 15 plates when this was written.
    expect(signed.filter((s) => s.micro).length).toBeGreaterThanOrEqual(9);
    expect(signed.map((s) => s.id)).toContain("mw-entry-v1");
  });

  it.each(signed.map((s) => s.id))("%s: no В1 looks back down its own one-way", (id) => {
    const entry = signed.find((s) => s.id === id)!;
    const terminals = entry.terminals;
    const plates = loadWorld(id).signs.filter((s) => s.kind === "noEntry");
    for (const e of terminals) {
      const g = e.geometry;
      const end = g[g.length - 1]!;
      const prev = g[g.length - 2]!;
      const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]);
      const tangent = [(end[0] - prev[0]) / len, (end[1] - prev[1]) / len] as const;
      // Posted 1.4 m back along the flow and (halfWidth + 0.8) off the kerb —
      // ~5.8 m from the terminal node on the widest (3-lane) map here, so 20 m
      // catches the plate without reaching a neighbouring mouth: a node of
      // degree < 3 has none.
      const atMouth = plates.filter(
        (p) => Math.hypot(p.position[0] - end[0], -p.position[2] - end[1]) < 20,
      );
      if (entry.micro) {
        expect(atMouth.length, `${id}/${e.id}: the terminal mouth is unsigned`).toBeGreaterThan(0);
      }
      for (const p of atMouth) {
        // yaw θ turns model +Z (StaticTransform: „+Z is the facing side") onto
        // world (sinθ, cosθ); world +Z is district −y.
        const face = [Math.sin(p.yaw), -Math.cos(p.yaw)] as const;
        const withFlow = face[0] * tangent[0] + face[1] * tangent[1];
        expect(
          withFlow,
          `${id}/${e.id}: the В1 face looks back at the LEGAL driver (face·flow ${withFlow.toFixed(3)})`,
        ).toBeGreaterThan(0.8);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. mw-v1 — the аварийна лента is a MARKED lane, bounded on both sides
// ---------------------------------------------------------------------------

describe("mw-v1: the emergency lane reads as an emergency lane", () => {
  const district = loadDistrict("mw-v1");
  const world = loadWorld("mw-v1");
  const qs = quads(world.markings);
  const meta = district.meta.scenario as {
    laneEmergencyX: number;
    laneCruiseX: number;
    lanesPerDirection: number;
  };
  const nb = district.roads.edges.find((e) => e.id === "mw-e-nb")!;
  const travelHalf = (nb.lanes * W) / 2;
  const seamX = -travelHalf + (nb.lanes - 1) * W; // laneId-0 inner boundary
  /** …and the outer bound: the carriageway edge line, inset on the arterial
   *  pass's own terms so no paint hangs off the asphalt (halfWidth IS
   *  travelHalf here — a motorway carries no parking band). */
  const outerX = travelHalf - EDGE_LINE_INSET_M;

  it("bounds the shoulder on BOTH sides — the inner seam and the outer edge line", () => {
    for (const x of [seamX, outerX]) {
      const strip = solids(atX(qs, x));
      expect(strip, `no unbroken line at x=${x}`).toHaveLength(1);
    }
  });

  it("keeps every stripe ON the asphalt — no paint peeling into the verge", () => {
    // The outer line is the only marking near a ribbon edge, and a 0.3 m strip
    // centred exactly on travelHalf would hang half its width over it (halfWidth
    // = travelHalf on a motorway: no parking band widens the ribbon).
    const centres = district.roads.edges.map((e) => (e.geometry[0] as [number, number])[0]);
    // Longitudinal stripes only — the same thin-quad filter atX() uses, since
    // the 6-index quad decode above is only meaningful for axis-aligned lines.
    const stripes = qs.filter((q) => q.wx < 0.8 && q.wy > 1);
    expect(stripes.length).toBeGreaterThan(0);
    for (const q of stripes) {
      // Nearest carriageway centre — the ribbon this stripe belongs to.
      const lateral = Math.min(...centres.map((c) => Math.abs(q.cx - c)));
      expect(lateral + q.wx / 2, `marking at x=${q.cx} overruns its carriageway`)
        .toBeLessThanOrEqual(travelHalf + 1e-6);
    }
  });

  it("the inner line is WIDER than a lane divider — it is not a third travel lane", () => {
    const seam = solids(atX(qs, seamX))[0]!;
    expect(seam.wx).toBeGreaterThan(DASH_WIDTH_M * 1.5);
    // …and the divider between the two TRAVEL lanes stays an ordinary dash.
    const divider = atX(qs, -travelHalf + W);
    expect(solids(divider)).toHaveLength(0);
    expect(dashes(divider).length).toBeGreaterThan(0);
  });

  it("the painted strip is exactly the lane the engine grades (meta lane centres)", () => {
    // EMERGENCY_LANE_DRIVING grades laneId 0; its centre must fall BETWEEN the
    // two lines, and the cruise lane's centre must fall outside them.
    expect(meta.laneEmergencyX).toBeGreaterThan(seamX);
    expect(meta.laneEmergencyX).toBeLessThan(outerX);
    expect(meta.laneCruiseX).toBeLessThan(seamX);
    // Nothing is painted down the middle of the shoulder itself.
    expect(atX(qs, meta.laneEmergencyX)).toHaveLength(0);
  });

  it("marks BOTH carriageways — the southbound bank is not a bare strip either", () => {
    const sb = district.roads.edges.find((e) => e.id === "mw-e-sb")!;
    // The southbound edge runs -y, so its right-hand shoulder mirrors to -x.
    const cx = (sb.geometry[0] as [number, number])[0];
    expect(solids(atX(qs, cx - seamX))).toHaveLength(1);
    expect(solids(atX(qs, cx - outerX))).toHaveLength(1);
  });
});
