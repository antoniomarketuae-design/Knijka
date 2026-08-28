/**
 * WHERE «КАРАЙ ДОТУК» STANDS — the objective marker's roadside sign.
 *
 * THE FOUNDER'S FRAME (2026-08-14, sc-zebra-approach at spawn, both
 * orientations — `scratchpad/play/01-arrival.png`,
 * `scratchpad/lessons/sc-zebra-approach/portrait-18-overlay-hint.png`):
 *
 *   „«КАРАЙ ДОТУК» HANGS IN MID-AIR. In every landscape and portrait frame …
 *    there is a dark billboard floating at BUILDING HEIGHT in the middle of the
 *    street, reading «Карай дотук» with a smaller line under it. … It reads as
 *    unfinished, and it sits on the vanishing point — the exact place a driver
 *    must look."
 *
 * THE THREE MEASURABLE FACTS BEHIND THAT SENTENCE, all true of the old chip:
 *
 *   1. it was a camera-facing quad at y = 4.4 m with NOTHING under it (the 11 m
 *      marker shaft is fully transparent below 2.6 m and gone inside 9 m);
 *   2. its lateral offset from the route was **0 m** — dead over the student's
 *      own lane, hence on the vanishing point of a straight street;
 *   3. its fade ramp was 30 m → 11 m with NO far end, so at 120 m, where the
 *      5 m panel subtends 2.4° and its second line is under a pixel per stroke,
 *      it still drew at alpha 0.95.
 *
 * Each assertion below is written against one of those three, in the units the
 * driver experiences (degrees at the eye, metres of road), and each of them
 * REDS on the values the old component shipped — the offset assertions on 0 m,
 * the post assertions on „there is no post", the band assertions on a fade with
 * no far end. That is the point of the file: it is not a description of the new
 * numbers, it is a fence around the defect.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "@/modules/sim/world/builders/buildWorldGeometry";
import { assertDistrict } from "@/modules/sim/world/types";
import {
  GATE_HALF_WIDTH_M,
  MARKER_SIGN_FAR_END_M,
  MARKER_SIGN_FAR_START_M,
  MARKER_SIGN_LATERAL_M,
  MARKER_SIGN_MAX_OPACITY,
  MARKER_SIGN_NEAR_END_M,
  MARKER_SIGN_PANEL_H_M,
  MARKER_SIGN_PANEL_W_M,
  MARKER_SIGN_PANEL_Y,
  MARKER_SIGN_POST_BASE_Y,
  markerSignOffset,
  markerSignOpacity,
  WORLD_KERB_SIGN_LATERAL_M,
} from "./guidanceRoute";

/** Cockpit eye height (CameraRig): ~1.2 m above the road. */
const EYE_Y = 1.2;
const RAD2DEG = 180 / Math.PI;

describe("the sign is OFF the axis the driver reads the road down", () => {
  it("stands beyond the lane edge, on the kerb side of travel", () => {
    // Right of travel is (dy, −dx). Driving north (0, 1) puts the sign east.
    const north = markerSignOffset(0, 1);
    expect(north.x).toBeCloseTo(MARKER_SIGN_LATERAL_M, 6);
    expect(north.y).toBeCloseTo(0, 6);

    // Driving east (1, 0) puts it south — still the right-hand side.
    const east = markerSignOffset(1, 0);
    expect(east.x).toBeCloseTo(0, 6);
    expect(east.y).toBeCloseTo(-MARKER_SIGN_LATERAL_M, 6);

    // THE DEFECT ASSERTION: it is not on the lane. The old chip's offset was
    // 0 m and this line is what says so out loud.
    expect(MARKER_SIGN_LATERAL_M).toBeGreaterThan(GATE_HALF_WIDTH_M);
  });

  it("is exactly perpendicular to travel, at any bearing", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const off = markerSignOffset(dx, dy);
      expect(Math.hypot(off.x, off.y)).toBeCloseTo(MARKER_SIGN_LATERAL_M, 6);
      // Dot with travel is zero ⇒ the sign never runs ahead of or behind its
      // own marker, so the distance the fade is measured on is the marker's.
      expect(off.x * dx + off.y * dy).toBeCloseTo(0, 6);
    }
  });

  it("refuses to guess when the approach direction is unknown", () => {
    // A route that could not be derived and a goal with no gate normal give no
    // direction. A chip over the lane centre is the old defect; a chip flung
    // onto an arbitrary bearing — into oncoming traffic, or into a wall —
    // would be a worse one, so the answer is „do not move it".
    expect(markerSignOffset(0, 0)).toEqual({ x: 0, y: 0 });
    expect(markerSignOffset(Number.NaN, 1)).toEqual({ x: 0, y: 0 });
  });

  it("clears the vanishing point at every distance it is visible", () => {
    // The driver's eye on the lane centreline; the panel's NEAR edge is the
    // one that would encroach on the axis.
    const nearEdgeM = MARKER_SIGN_LATERAL_M - MARKER_SIGN_PANEL_W_M / 2;
    expect(nearEdgeM, "the panel's near edge is off the lane centre").toBeGreaterThan(0);

    // Bounded at 200 m rather than at MARKER_SIGN_FAR_END_M on purpose: the
    // loop must survive somebody deleting the far fade (which is exactly the
    // regression it is here to catch) instead of spinning on 1e9 iterations.
    for (let d = MARKER_SIGN_NEAR_END_M; d <= 200; d += 1) {
      if (markerSignOpacity(d) <= 0) continue;
      const offAxisDeg = Math.atan2(nearEdgeM, d) * RAD2DEG;
      // 1.5° is roughly the foveal patch a driver holds the vanishing point in.
      // With the old 0 m offset this is 0° at EVERY distance — the panel
      // straddled the axis — so this loop is the fence around defect (2).
      expect(offAxisDeg, `panel encroaches on the road axis at ${d} m`).toBeGreaterThan(1.5);
    }
  });
});

describe("the sign is held up by something", () => {
  it("the post reaches the road surface and meets the panel's lower edge", () => {
    // Defect (1): the old panel had no support of any kind.
    expect(MARKER_SIGN_POST_BASE_Y).toBe(0);
    const panelBottom = MARKER_SIGN_PANEL_Y - MARKER_SIGN_PANEL_H_M / 2;
    const postHeight = panelBottom - MARKER_SIGN_POST_BASE_Y;
    expect(postHeight).toBeGreaterThan(1.5);
    // …and there is no air gap between the post's top and the panel.
    expect(MARKER_SIGN_POST_BASE_Y + postHeight).toBeCloseTo(panelBottom, 6);
  });

  it("RouteGuidance actually builds the post, and hangs the panel on it", () => {
    // The constants above can all be right while the component still renders a
    // bare quad — which is precisely the state the founder photographed. There
    // is no r3f render harness in this suite and `RouteGuidance.tsx` is a
    // client component, so the cheapest honest guard is to read the wiring: the
    // label mesh must live INSIDE the sign group (so it cannot drift off its
    // own post) and a cylinder must be built from MARKER_SIGN_POST_BASE_Y.
    // On the pre-2026-08-16 file none of these three strings exist.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../components/sim/RouteGuidance.tsx"),
      "utf8",
    );
    expect(src).toContain("signRef");
    expect(src).toMatch(/<group ref=\{signRef\}>[\s\S]*cylinderGeometry[\s\S]*<\/group>/);
    expect(src).toMatch(/<group ref=\{signRef\}>[\s\S]*ref=\{labelRef\}[\s\S]*<\/group>/);
    expect(src).toContain("MARKER_SIGN_POST_BASE_Y");
  });

  it("sits at road-sign height, not at building height", () => {
    const panelBottom = MARKER_SIGN_PANEL_Y - MARKER_SIGN_PANEL_H_M / 2;
    // Наредба № 18 mounts a sign's lower edge ~2.0–2.5 m over a pavement.
    // The old chip's centre was 4.4 m and its top 5.24 m — first-floor
    // height, which is the „building height" in his sentence.
    expect(panelBottom).toBeGreaterThanOrEqual(2.0);
    expect(panelBottom).toBeLessThanOrEqual(2.5);
    expect(MARKER_SIGN_PANEL_Y + MARKER_SIGN_PANEL_H_M / 2).toBeLessThan(4.0);
    // Still above the driver's eye, so the panel is never in the road surface.
    expect(panelBottom).toBeGreaterThan(EYE_Y);
  });
});

describe("the sign exists only where it can be read", () => {
  it("is gone in the far field, where its text is below resolution", () => {
    // Defect (3). Every founder frame catches it here.
    expect(markerSignOpacity(120)).toBe(0);
    expect(markerSignOpacity(MARKER_SIGN_FAR_END_M)).toBe(0);
    expect(markerSignOpacity(MARKER_SIGN_FAR_END_M + 40)).toBe(0);
  });

  it("is gone at the mark itself", () => {
    expect(markerSignOpacity(MARKER_SIGN_NEAR_END_M)).toBe(0);
    expect(markerSignOpacity(0)).toBe(0);
  });

  it("is at full strength across the whole band where it teaches", () => {
    // Same 200 m guard rail as above — the loop bound must not be a constant a
    // regression can set to infinity.
    expect(MARKER_SIGN_FAR_START_M).toBeLessThanOrEqual(200);
    for (let d = MARKER_SIGN_NEAR_END_M + 20; d <= MARKER_SIGN_FAR_START_M; d += 1) {
      expect(markerSignOpacity(d), `${d} m`).toBeCloseTo(MARKER_SIGN_MAX_OPACITY, 6);
    }
  });

  it("leaves the student enough road to read the contract on", () => {
    // The chip carries a cap the drill grades («не по-бързо от 45 км/ч»), so
    // the band it is legible in has to be long enough to act on. Measured as
    // road, not as taste: at the 50 km/h posted limit of the scenario streets
    // (13.9 m/s) the ≥half-alpha band must be worth at least three seconds.
    let firstM = Number.POSITIVE_INFINITY;
    let lastM = 0;
    for (let d = 0; d <= 200; d += 0.5) {
      if (markerSignOpacity(d) >= MARKER_SIGN_MAX_OPACITY / 2) {
        firstM = Math.min(firstM, d);
        lastM = Math.max(lastM, d);
      }
    }
    expect(lastM - firstM).toBeGreaterThanOrEqual(3 * (50 / 3.6));
  });
});

/**
 * WAVE 8 — THE COACH'S POST IS NOT IN THE ROAD'S SIGN BAND.
 *
 * sc-zebra-approach: «the world-space coach label is drawn half behind the А18
 * pedestrian-crossing triangle, so the instruction is unreadable». The cause
 * was arithmetic, not art: the chip stood 0.20 m from where `props.ts` posts
 * every kerb sign, so a 0.9 m plate sat 46 % across a 5.0 m panel — on the
 * centred title.
 */
describe("the coach's sign does not stand where the road's own signs stand", () => {
  /** The А18 posts `buildWorldGeometry` really emits on zb-v1, so the copied
   *  constant is checked against the builder rather than against itself. */
  function zbSignLateralFromRoute(): number {
    const raw = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../../../../content/world/zb-v1.json"),
        "utf8",
      ),
    ) as unknown;
    const world = buildWorldGeometry(assertDistrict(raw));
    const a18 = world.signs.filter((s) => s.kind === "pedestrianCrossing");
    expect(a18.length).toBeGreaterThan(0);
    // zb-v1's street is the north-running centreline x = 0; the northbound
    // route is the east lane centre at GATE_HALF_WIDTH_M.
    const east = a18.map((s) => s.position[0]).filter((x) => x > 0);
    expect(east.length).toBeGreaterThan(0);
    const kerbX = Math.max(...east);
    return kerbX - GATE_HALF_WIDTH_M;
  }

  it("the pinned world-sign band is the band the builder actually uses", () => {
    expect(zbSignLateralFromRoute()).toBeCloseTo(WORLD_KERB_SIGN_LATERAL_M, 3);
  });

  it("stands OUTBOARD of it, by enough that a plate cannot bisect the panel", () => {
    const clearance = MARKER_SIGN_LATERAL_M - WORLD_KERB_SIGN_LATERAL_M;
    // Outboard, not inboard: the road's sign has to read as being in FRONT of
    // the coaching plate, which is the honest depth order.
    expect(clearance).toBeGreaterThan(0);
    // …and far enough that the plate lands on the panel's inboard margin
    // rather than on its centred text. The panel is centred on its post, so a
    // world sign sits `panelW/2 − clearance` in from the inboard edge; asking
    // that to be inside the first fifth of the panel is the readable form of
    // „not across the title".
    const acrossPanel = (MARKER_SIGN_PANEL_W_M / 2 - clearance) / MARKER_SIGN_PANEL_W_M;
    expect(acrossPanel).toBeLessThan(0.2);
    // NEGATIVE CONTROL — the shipped-before offset fails this test, which is
    // what makes it a gate and not a restatement.
    const before = GATE_HALF_WIDTH_M + 1;
    const beforeAcross =
      (MARKER_SIGN_PANEL_W_M / 2 - (before - WORLD_KERB_SIGN_LATERAL_M)) / MARKER_SIGN_PANEL_W_M;
    expect(beforeAcross).toBeGreaterThan(0.4); // dead centre — the defect
  });

  it("is still on the pavement of the scenario street, not in a building", () => {
    // Cross-section of the 1+1 scenario street: kerb at LANE_WIDTH_M (2 ×
    // GATE_HALF_WIDTH_M), 3.5 m of footway behind it (SIDEWALK_WIDTH_M).
    const kerbX = 2 * GATE_HALF_WIDTH_M;
    const postX = GATE_HALF_WIDTH_M + MARKER_SIGN_LATERAL_M;
    expect(postX).toBeGreaterThan(kerbX);
    expect(postX).toBeLessThan(kerbX + 3.5);
  });
});
