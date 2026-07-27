/**
 * Scene-still Half-A contracts (founder review 2026-07-27).
 *
 * Two defects the founder found by LOOKING at the rendered board, both of which
 * a schema validator happily passes:
 *
 *  1. a pose kind that draws NOTHING — the cyclist question rendered an empty
 *     road because the still only knew how to draw the vehicle fleet;
 *  2. the ego already sitting INSIDE the junction on the priority questions,
 *     when the whole point of those questions is the decision taken BEFORE
 *     entering ("the car ... has to be in fact on the road before entering the
 *     junction").
 *
 * Both are asserted here against the committed content + world files, because
 * both are properties of the shipped picture, not of a component's props.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SceneStillMedia, SceneStillPoseKind } from "@/lib/content/types";
import { poseDrawPath, VULNERABLE_POSE_KINDS } from "./stillActors";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

// ---------------------------------------------------------------------------
// 1. Every authorable pose kind reaches the screen
// ---------------------------------------------------------------------------

describe("poseDrawPath", () => {
  // Mirrors SceneStillPoseKind. Spelled out rather than derived so widening the
  // union without teaching the still how to draw it fails HERE, loudly.
  const ALL_KINDS: readonly SceneStillPoseKind[] = ["car", "truck", "bus", "tram", "bike", "ped"];

  it("draws every pose kind through some path — none may render as nothing", () => {
    for (const kind of ALL_KINDS) {
      expect(["vehicle", "figure"], `pose kind "${kind}"`).toContain(poseDrawPath(kind));
    }
  });

  it("routes the vulnerable users to the code-mesh figure, not the vehicle fleet", () => {
    // The regression: bike/ped used to fall through the fleet mapping to null.
    for (const kind of VULNERABLE_POSE_KINDS) {
      expect(poseDrawPath(kind)).toBe("figure");
    }
    expect(poseDrawPath("car")).toBe("vehicle");
  });
});

// ---------------------------------------------------------------------------
// 2. The yield decision is taken BEFORE the junction
// ---------------------------------------------------------------------------

interface DistrictEdgeLike {
  id: string;
  from: string;
  to: string;
  lanes: number;
  oneway: boolean;
}
interface DistrictLike {
  roads: { edges: DistrictEdgeLike[] };
  intersections: { id: string; x: number; y: number }[];
}
interface QuestionLike {
  id: string;
  media?: SceneStillMedia | { kind: string } | null;
}

/** spatial.ts LANE_WIDTH_M — the district-v1 authoring law (3.25 m × the
 *  perceptual road scale). Copied, not imported: this test asserts the SHIPPED
 *  geometry, so it must not move silently when the constant does. */
const LANE_WIDTH_M = 3.25 * 2.5;

/** Half the drawn carriageway of an edge — the distance from the node at which
 *  a crossing road's asphalt begins, i.e. the junction mouth (spatial.ts
 *  buildEdge: two-way edges carry floor(lanes/2) lanes per direction). */
function edgeHalfWidthM(edge: DistrictEdgeLike): number {
  const lanesPerDir = edge.oneway ? Math.max(1, edge.lanes) : Math.max(1, Math.floor(edge.lanes / 2));
  return ((edge.oneway ? Math.max(1, edge.lanes) : lanesPerDir * 2) * LANE_WIDTH_M) / 2;
}

/** Fleet-car half-length, m. The pose is the car's CENTRE, so the bumper is
 *  this far ahead of it — being "before the junction" is a claim about the
 *  bumper, not about the roof. */
const CAR_HALF_LENGTH_M = 2.25;

/**
 * How much clear asphalt the founder wants between bumper and junction mouth.
 * The pre-fix poses sat ~3.6 m short of the mouth and read as "a few inches
 * inside the junction" once the corner fillets are drawn; a full car length of
 * daylight is what makes the still read as an APPROACH.
 */
const APPROACH_CLEARANCE_M = 5;

function readQuestions(slug: string): QuestionLike[] {
  return JSON.parse(readFileSync(path.join(REPO, "content/questions", `${slug}.json`), "utf-8"));
}

function readDistrict(districtId: string): DistrictLike {
  return JSON.parse(
    readFileSync(path.join(REPO, "platform/public/world", `${districtId}.json`), "utf-8"),
  );
}

/** Smallest gap between a pose's front bumper and any junction mouth it is
 *  approaching. Negative = the car is standing in the junction. */
function bumperClearanceM(district: DistrictLike, x: number, y: number): number {
  const halfAt = new Map<string, number>();
  for (const edge of district.roads.edges) {
    for (const node of [edge.from, edge.to]) {
      halfAt.set(node, Math.max(halfAt.get(node) ?? 0, edgeHalfWidthM(edge)));
    }
  }
  let worst = Infinity;
  for (const it of district.intersections) {
    const mouth = halfAt.get(it.id) ?? 0;
    worst = Math.min(worst, Math.hypot(x - it.x, y - it.y) - mouth - CAR_HALF_LENGTH_M);
  }
  return worst;
}

/**
 * The questions the founder pulled off the verdict board, with the poses that
 * are ALLOWED to be inside the junction because the question is about them
 * being there. Every exemption is named on purpose: an implicit one is how the
 * defect got shipped the first time.
 */
const REVIEWED: { slug: string; id: string; insideJunctionOk: number[] }[] = [
  { slug: "predimstvo", id: "q-predimstvo-063", insideJunctionOk: [] },
  { slug: "predimstvo", id: "q-predimstvo-064", insideJunctionOk: [] },
  // pose[1] is the oncoming car that "започва да завива" — it must be in the
  // junction, mid-turn, or the picture contradicts the question text.
  { slug: "predimstvo", id: "q-predimstvo-065", insideJunctionOk: [1] },
  { slug: "predimstvo", id: "q-predimstvo-066", insideJunctionOk: [] },
  { slug: "predimstvo", id: "q-predimstvo-067", insideJunctionOk: [] },
  { slug: "uyazvimi-uchastnitsi", id: "q-uyazvimi-068", insideJunctionOk: [] },
  { slug: "krastovishta", id: "q-krastovishta-029", insideJunctionOk: [] },
];

describe("priority scene stills — the car is on the approach, not in the junction", () => {
  for (const { slug, id, insideJunctionOk } of REVIEWED) {
    it(`${id}: every waiting vehicle keeps ${APPROACH_CLEARANCE_M} m before the junction mouth`, () => {
      const question = readQuestions(slug).find((q) => q.id === id);
      expect(question, `${id} must exist in ${slug}.json`).toBeDefined();
      const media = question!.media as SceneStillMedia;
      expect(media.kind).toBe("sceneStill");

      const district = readDistrict(media.districtId);
      media.poses.forEach((pose, i) => {
        if (insideJunctionOk.includes(i)) return;
        const clearance = bumperClearanceM(district, pose.x, pose.y);
        expect(
          clearance,
          `${id} pose[${i}] (${pose.kind} at ${pose.x}, ${pose.y}) is ${clearance.toFixed(1)} m ` +
            `from the junction mouth — the decision is taken BEFORE entering`,
        ).toBeGreaterThanOrEqual(APPROACH_CLEARANCE_M);
      });
    });
  }

  it("q-krastovishta-029 marks one of the four cars as the learner's own", () => {
    // The founder asked for better words; the words are in second person
    // („Ти си колата с ореола"), so the picture must actually carry the halo.
    const question = readQuestions("krastovishta").find((q) => q.id === "q-krastovishta-029");
    const media = question!.media as SceneStillMedia;
    expect(media.poses.filter((p) => p.variant === "ego")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. A roundabout still shows ONE roundabout, entered from the give-way line
// ---------------------------------------------------------------------------

/**
 * The founder's verdict on the two ring pictures (2026-07-27):
 *
 *   q-krastovishta-064 — „the problem here is the map first problem it is not
 *     real roundabout - rather 4 small roundabouts and also the car is already
 *     at the roundabout and it must be on the line before entering it"
 *   q-krastovishta-065 — „here aswell 4 small roundabouts which in fact on the
 *     map are not roundabouts rather look like some wrong thing, we need proper
 *     1 roundabout"
 *
 * Both defects are measurable on the SHIPPED files, so both are asserted here.
 *
 * WHY A RING CAN RENDER AS FOUR. The world builder opens a junction pad at
 * every node of degree >= 3, of radius `widest approach half width + curb
 * fillet` — 8.125 + 9 = 17.13 m on a 2-lane arm at the perceptual road scale.
 * It opens one at each arm↔ring joint. When the ring is small enough that those
 * four pads eat the arcs between them (and bite through the middle), the
 * picture IS four overlapping pads around a scrap of grass. The two numbers
 * below are that failure, stated as arithmetic:
 *
 *   circulatoryRunM   drawn ring surviving between two consecutive mouths
 *   islandRadiusM     central island where a pad's inner corner bites deepest
 *
 * On the rejected map (rb-mini-v1, R = 18) they are −6.3 m and 0.4 m. This
 * battery therefore fails on the picture the founder rejected and passes on the
 * one that replaced it, without knowing anything about which file that is.
 */

/** builders/constants.ts JUNCTION_CORNER_RADIUS_MINOR_M — the fillet a junction
 *  whose dominant class ranks <= 2 (unclassified/residential arms) gets. */
const JUNCTION_CORNER_RADIUS_M = 9;
/** network.ts edgeTravelHalfWidth floor for a roundabout ring edge. */
const RING_MIN_HALF_WIDTH_M = 2.4;
/** markings.ts STOP_LINE_BEYOND_CUT_M — the painted give-way line sits this far
 *  outside the junction cut (paint and the graded line coincide there). */
const STOP_LINE_BEYOND_CUT_M = 0.6;

/** Minimum drawn ring between two mouths for the ring to read as a ring. */
const MIN_CIRCULATORY_RUN_M = 20;
/** Minimum central island for anything to read as an island. */
const MIN_ISLAND_RADIUS_M = 18;

interface RingGeometry {
  centerX: number;
  centerY: number;
  radiusM: number;
  ringHalfWidthM: number;
  openRadiusM: number;
  circulatoryRunM: number;
  islandRadiusM: number;
  /** Painted dashed Б1 line on every entry arm, m from the ring centre. */
  giveWayRadiusM: number;
}

interface RoundaboutDistrictLike extends DistrictLike {
  roads: { edges: DistrictEdgeLike[] };
  roundabouts: { id: string; x: number; y: number; radius: number; edgeIds: string[] }[];
}

/** Full travel half-width of an edge, the builder's way (rings carry a floor). */
function travelHalfWidthM(edge: DistrictEdgeLike, roundabout: boolean): number {
  const half = (Math.max(1, edge.lanes) * LANE_WIDTH_M) / 2;
  return roundabout ? Math.max(half, RING_MIN_HALF_WIDTH_M) : half;
}

/** Resolve how the builder will actually draw a district's single roundabout. */
function ringGeometry(district: RoundaboutDistrictLike): RingGeometry {
  const rb = district.roundabouts[0];
  const ringIds = new Set(rb.edgeIds);
  let ringHalfWidthM = RING_MIN_HALF_WIDTH_M;
  let armHalfWidthM = 0;
  for (const edge of district.roads.edges) {
    if (ringIds.has(edge.id)) {
      ringHalfWidthM = Math.max(ringHalfWidthM, travelHalfWidthM(edge, true));
    } else {
      armHalfWidthM = Math.max(armHalfWidthM, travelHalfWidthM(edge, false));
    }
  }
  // nodeOpenRadiusM at a degree-3 joint: widest approach + the class fillet.
  const openRadiusM = Math.max(armHalfWidthM, ringHalfWidthM) + JUNCTION_CORNER_RADIUS_M;
  // Mouths sit one arc-quarter apart on a 4-arm ring; each end of that quarter
  // is trimmed by its own pad.
  const quarterArcM = (Math.PI * rb.radius) / 2;
  // The pad's inner corner arc rides at |innerRingCut − node| around the node,
  // so it reaches R − that distance toward the centre.
  const theta = openRadiusM / rb.radius;
  const bulgeM = Math.hypot(
    (rb.radius - ringHalfWidthM) * Math.sin(theta),
    rb.radius - (rb.radius - ringHalfWidthM) * Math.cos(theta),
  );
  return {
    centerX: rb.x,
    centerY: rb.y,
    radiusM: rb.radius,
    ringHalfWidthM,
    openRadiusM,
    circulatoryRunM: quarterArcM - 2 * openRadiusM,
    islandRadiusM: rb.radius - bulgeM,
    giveWayRadiusM: rb.radius + openRadiusM + STOP_LINE_BEYOND_CUT_M,
  };
}

/**
 * The ring stills, with where the ego is SUPPOSED to be. Named per question on
 * purpose: „on the ring" and „behind the give-way line" are opposite claims and
 * an implicit default would let one question quietly adopt the other's staging.
 */
const RING_REVIEWED: { slug: string; id: string; egoOn: "approach" | "ring" }[] = [
  // „Приближаваш кръгово…" — the whole question is the decision taken at the
  // line, so the ego must still be behind it.
  { slug: "krastovishta", id: "q-krastovishta-064", egoOn: "approach" },
  // „Движиш се в кръга…" — this one is about signalling the exit, so the ego
  // belongs ON the circulatory carriageway.
  { slug: "krastovishta", id: "q-krastovishta-065", egoOn: "ring" },
];

describe("roundabout scene stills — one roundabout, entered from the give-way line", () => {
  for (const { slug, id, egoOn } of RING_REVIEWED) {
    it(`${id}: the map draws ONE roundabout — a real ring and a real island`, () => {
      const question = readQuestions(slug).find((q) => q.id === id);
      expect(question, `${id} must exist in ${slug}.json`).toBeDefined();
      const media = question!.media as SceneStillMedia;
      const district = readDistrict(media.districtId) as RoundaboutDistrictLike;
      expect(district.roundabouts, `${media.districtId} must register a roundabout`).toHaveLength(1);

      const ring = ringGeometry(district);
      expect(
        ring.circulatoryRunM,
        `${media.districtId}: only ${ring.circulatoryRunM.toFixed(1)} m of circulatory carriageway ` +
          `survives between mouths (junction pads are ${ring.openRadiusM.toFixed(1)} m) — this renders ` +
          `as four small roundabouts`,
      ).toBeGreaterThanOrEqual(MIN_CIRCULATORY_RUN_M);
      expect(
        ring.islandRadiusM,
        `${media.districtId}: the central island shrinks to ${ring.islandRadiusM.toFixed(1)} m at the ` +
          `mouths — nothing reads as an island`,
      ).toBeGreaterThanOrEqual(MIN_ISLAND_RADIUS_M);
    });

    it(`${id}: the ego is staged ${egoOn === "ring" ? "on the ring" : "behind the give-way line"}`, () => {
      const question = readQuestions(slug).find((q) => q.id === id);
      const media = question!.media as SceneStillMedia;
      const district = readDistrict(media.districtId) as RoundaboutDistrictLike;
      const ring = ringGeometry(district);

      const ego = media.poses.find((p) => p.variant === "ego");
      expect(ego, `${id} must mark one pose as the learner's own`).toBeDefined();
      const rEgo = Math.hypot(ego!.x - ring.centerX, ego!.y - ring.centerY);

      if (egoOn === "ring") {
        expect(
          Math.abs(rEgo - ring.radiusM),
          `${id}: the ego is ${rEgo.toFixed(1)} m from the centre — off the ${ring.radiusM} m ` +
            `circulatory carriageway the question puts it on`,
        ).toBeLessThanOrEqual(ring.ringHalfWidthM);
        return;
      }
      // On an approach: the FRONT BUMPER (not the roof) must still be short of
      // the painted line — „it must be on the line before entering it".
      expect(
        rEgo - CAR_HALF_LENGTH_M,
        `${id}: the ego's bumper is ${(rEgo - CAR_HALF_LENGTH_M).toFixed(1)} m from the centre but the ` +
          `give-way line is at ${ring.giveWayRadiusM.toFixed(1)} m — the car has already crossed it`,
      ).toBeGreaterThanOrEqual(ring.giveWayRadiusM);
      // …and not parked half a block back, where the decision reads as unrelated.
      expect(rEgo - CAR_HALF_LENGTH_M).toBeLessThanOrEqual(ring.giveWayRadiusM + 8);
    });
  }
});
