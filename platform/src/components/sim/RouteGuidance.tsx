"use client";

/**
 * RouteGuidance — A7 in-world route guidance (doc 68 Pillar 2; audit B9).
 * Mounted by LessonScene ONLY when the lesson has objectives (l0 free drive
 * has nothing to follow, so it never mounts).
 *
 * Four visuals, zero per-frame allocation:
 *  1. Ghost ribbon — an emissive, semi-transparent strip hovering ~2 cm above
 *     the asphalt along the derived route; chevron bands scroll forward so
 *     direction reads instantly; fades in ~90→120 m ahead of the car and
 *     dissolves a few meters behind it. Past the ACTIVE waypoint the ribbon
 *     continues into objective n+1 at reduced opacity — that continuation is
 *     what makes the turn visible before the junction (doc 86 L5).
 *  2. Turn chevron — ONE floating arrow before the next junction where the
 *     route turns ≥30°, yawed along the exit direction, gentle pulse/bob.
 *  3. Objective marker — the objective's OWN contract, drawn (doc 86 T3/T8):
 *       · a ring at the acceptance radius for a zone target — `markerRingRadii`
 *         returns the engine's `radiusM`, never a decorative 1.85 m;
 *       · a bar across the lane at the graded stop line for a `passSignal` —
 *         resolved from `worldRuntime.debugStopLines()`, so it can no longer
 *         stand 27.7 m inside the junction the lesson grades;
 *       · the same bar for a `reachZone` whose authored centre lies past paint
 *         the student can see — the М8 give-way line at a roundabout mouth is
 *         not graded by anything, and the waypoint of «Кръгово движение» stood
 *         1.7 m beyond it (register B18);
 *       · a «спри тук» / «премини» label plus the objective's hidden speed cap,
 *         and a live amber tint the moment the student is above that cap.
 *  4. Label chip — a canvas-textured billboard on a kerbside post, so the
 *     marker says what it wants in Bulgarian instead of being a silent circle.
 *     It exists only where it can be READ: `markerSignOpacity` is the authored
 *     band and `signPanelAlpha` is the legibility floor under it, so the chip
 *     is a sign or it is absent — never the half-transparent veil sweep 161
 *     photographed over a facade, over the В14 and under the «РАЗБРАХ» pill.
 *
 * PERF contract: geometry rebuilds ONLY on objective change (route derivation
 * included); per frame we update uniforms + one transform, allocation-free.
 * `prefers-reduced-motion` freezes the band scroll, pulse and bob.
 *
 * Pattern note: objects follow the WindshieldDroplets convention — memoized
 * ARGS + declarative JSX construction; every runtime mutation (uniforms,
 * draw range, visibility, transforms) goes through refs. Mutated props
 * (visible/position/rotation) are deliberately NOT declared in JSX so parent
 * re-renders never stomp the imperative state.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { LessonSpec } from "@/modules/sim/lessons";
import {
  LOOKAHEAD_MAX_LEGS,
  ROUTE_MAX_SAMPLES,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  crossingMuteSpans,
  markerApproachDir,
  markerRingRadii,
  markerSignOffset,
  markerSignOpacity,
  nearestArcOnRoute,
  routePointAt,
  stopLinesForGuidance,
  MARKER_SIGN_PANEL_H_M,
  MARKER_SIGN_PANEL_W_M,
  MARKER_SIGN_PANEL_Y,
  MARKER_SIGN_POST_BASE_Y,
  MARKER_SIGN_POST_RADIUS_M,
  CROSSING_MUTE_MAX_SPANS,
  type DerivedRoute,
  type GuidanceGoal,
  type GuidancePointGoal,
  type RouteDistrictLike,
} from "@/modules/sim/scene/guidanceRoute";
import { createRibbonBuffers, writeRibbonStrip } from "@/modules/sim/scene/ribbonStrip";

// World constants (world/builders/constants.ts): ROAD_Y = 0.02, MARKING_Y =
// 0.032. The ribbon hovers ~2.5 cm over the asphalt — above the paint, no
// z-fighting (and it never writes depth anyway).
const RIBBON_Y = 0.045;
const RIBBON_HALF_W = 0.7;
/** Ahead-fade window (m): full → gone. Keeps attention on the near field. */
const FADE_START_M = 90;
const FADE_END_M = 120;
/**
 * How much of the ribbon's opacity survives PAST the active waypoint. The
 * look-ahead leg has to be readable (it is the turn announcement) without
 * competing with the task the student is actually on.
 *
 * REGISTER B24 — founder: *„the moment I cross the marking after the stop line
 * the green line changes to right."* 0.42 was the whole of it, and it is the
 * same defect class as B18/B25: the ribbon's turn announcement was anchored to
 * the WRONG MOMENT. The geometry was already right — `deriveGuidanceRoute`
 * chains look-ahead legs until the turn is on the ribbon — but the leg was
 * drawn at 0.42 × the ribbon's own 0.42 uOpacity ⇒ **~18 % effective, under
 * additive blending, on daylit asphalt, 60 m out.** Invisible. Then
 * `sc-jstop-line` completes — and that objective is a `passSignal`, so it
 * completes on the exact frame the nose crosses the paint — the route is
 * re-derived and that same stretch snaps to 100 %.
 *
 * So the turn announced itself by GETTING BRIGHT AT THE STOP LINE: the one
 * frame where instruction 4 («Огледай се: наляво, надясно и пак наляво») wants
 * his eyes out of the windscreen and on the junction. He read it exactly
 * right — the line changed to right at the moment he crossed the marking.
 *
 * 0.80 makes the continuation legible from the approach (it clears the 90–120 m
 * ahead-fade about 62 m before the stop line, ~7 s at the 30 km/h this drill
 * caps), so nothing perceptible happens at the crossing. The leg is still
 * visibly quieter than the active one, and „which task is now" was never
 * carried by the ribbon anyway — the marker carries it (gate bar across the
 * lane + «спри тук» label + ground pool), and all three are far louder than a
 * 20 % brightness step.
 *
 * DRIVEN AND PHOTOGRAPHED 2026-08-04, which is the half this row was missing.
 * `sc-junction-stop` L1 in /dev/drive-rig, HUD hidden so the frame is the glass
 * and nothing else, stopped lawfully and then crept across the paint in 0.6 m
 * hops. The objective flips at **y = −27.72**, the graded line to the
 * centimetre. The pair that straddles it is 0.76 m apart:
 *
 *   before  `laneSL/strip/B24S-s05-y-28.44-x4.06-obj1-v4.png`
 *   after   `laneSL/strip/B24S-s07-y-27.68-x4.06-obj2-v3.png`
 *
 * and the green ribbon is the same band, same reach, same brightness in both.
 * A second, independent run put the flip at the same y to the centimetre and
 * closed the pair to **9 cm** —
 *
 *   before  `laneSL/verify/B24V-s06-y-27.75-x4.06-obj1-v3.png`
 *   after   `laneSL/verify/B24V-CARD-y-27.66-obj2.png`
 *
 * — and at that resolution, across the very frame, nothing on the glass
 * changes. It had already bent right 24.8 m earlier
 * (`B24S-s01-y-52.48-…`, where the gate bar and «Спри на стоп-линията» stand
 * across the lane and the ribbon continues past them into the east arm) and at
 * the lawful stop 3.2 m short of the paint (`B24c-A-stopline-y-30.9-obj1.png`).
 *
 * This constant is therefore load-bearing for a founder row, and it is one
 * number in a shader string that no geometry test can see — so it is exported
 * and pinned by `routeGuidanceAnnouncement.test.ts` rather than left as a
 * comment somebody can quietly tune back to 0.42.
 */
export const BEYOND_GOAL_OPACITY = 0.8;

const ARROW_Y = 2.6;
/** Arrow sits this far before the junction node (2.5×-scaled mouths — a safe
 * fixed setback per doc 68 A7). */
const ARROW_BEFORE_JUNCTION_M = 20;
/** Only show the arrow once its junction is inside the guidance horizon. */
const ARROW_VISIBLE_AHEAD_M = 140;

const PILLAR_HEIGHT = 11;
const PILLAR_RADIUS = 1.0;

/** Depth (along travel) of the stop-line bar: solid for a halt, a thin
 *  threshold for a gate the student drives through. */
const BAR_DEPTH_HALT_M = 1.6;
const BAR_DEPTH_THROUGH_M = 0.7;

/**
 * WHERE THE CHIP STANDS AND HOW BIG IT IS is a teaching contract, not styling,
 * so the numbers live in `scene/guidanceRoute.ts` next to the rest of the
 * marker's geometry and are asserted as angles at the driver's eye by
 * `scene/guidance-marker-sign.test.ts`. Read the MARKER'S SIGN section header
 * there before moving any of them — it carries the founder's frame and the
 * three separate things that made a route marker read as an unfinished
 * billboard hanging over the vanishing point.
 */
const LABEL_WIDTH_M = MARKER_SIGN_PANEL_W_M;
const LABEL_HEIGHT_M = MARKER_SIGN_PANEL_H_M;
const LABEL_PX_W = 480;
const LABEL_PX_H = 160;
/** The panel's LOWER EDGE is where the post has to end, so it is derived here
 *  rather than authored — the two can then never drift apart. */
const POST_TOP_Y = MARKER_SIGN_PANEL_Y - LABEL_HEIGHT_M / 2;
const POST_HEIGHT_M = POST_TOP_Y - MARKER_SIGN_POST_BASE_Y;

/** Distance at which the speed-cap warning arms — far enough that easing off
 *  still works, near enough that it is clearly about THIS marker. */
const CAP_WARN_LEAD_M = 35;

/**
 * THE SIGN MAY NOT BE A VEIL — the legibility floor under the chip.
 *
 * SWEEP 161 (2026-08-16/17) photographed the same chip in the same state on
 * three different lessons, and the reviewer read all four frames the same way
 * — „an enormous mid-grey ghost pasted flat on a beige building facade at
 * almost the same value as the wall":
 *
 *   `sc-ln-obstacle-meeting/mobile-right/04-t074s.png` — the car is STOPPED on
 *     the wait mark (the dash in the same frame reads 0 км/ч) and «Спри тук /
 *     спри — под 6 км/ч» stands over the facade at the top right as a wash the
 *     eye cannot resolve, with the HUD's «РАЗБРАХ» pill in the middle of it.
 *   `…/04-t090s.png` — the same chip, now smeared across the block on the left;
 *     the sweep filed it as „world labels render THROUGH buildings", and it is
 *     not that (the street trees and the В14 in the frames below occlude the
 *     panel correctly) — it is a 5 m billboard at 0.2 alpha in front of a
 *     distant wall.
 *   `sc-follow-cutin/mobile-right/04-t157s.png` — «Карай дотук / не по-бързо от
 *     39 км/ч» dissolving into a facade, under the teach card.
 *   `sc-maneuver-3point/pc-right/03-ready.png` — the chip and the world's own
 *     В14 «40» in the same pixels. The В14 is opaque and crisp; the chip is
 *     transparent enough to read the building's window frames through it. The
 *     two objects side by side ARE the defect: one is a sign, one is a veil.
 *
 * ONE CAUSE. `markerSignOpacity` is a function of DISTANCE alone, and its near
 * ramp spends 19 m (30 → 11 m) taking the panel from full to nothing. A car
 * that crawls through that band — or STOPS in it, which is exactly what a halt
 * gate asks for — parks a 5 × 1.67 m half-transparent billboard across the
 * windscreen for as long as it stands there.
 *
 * MEASURED OFF THE GLASS, `sc-park-gap-long/mobile-right/07-end.png`, which is
 * the one frame whose backdrop is clean sky and can therefore be solved rather
 * than judged. The «Паркирай тук» panel is **590 px wide — 23 % of the frame** —
 * and the sky reads (153,161,170) beside it against (124,132,140) through it.
 * Against the plate's own (6,18,22) that is an effective plate alpha of
 * **0.197 / 0.203 / 0.203** on R/G/B — i.e. 0.20, so a material alpha of 0.28,
 * so an eye distance of **16.6 m** on `markerSignOpacity`. At 0.28 the panel's
 * own text stands at about **1.5:1** against its own plate. That is the ghost,
 * in numbers: a quarter of the windscreen, at a contrast ratio no glyph
 * survives, with the HUD's «РАЗБРАХ» pill splitting the word on top of it.
 *
 * MEASURED AS INK (WCAG relative luminance, glyph-over-backdrop against
 * plate-over-backdrop, on the three backdrops those frames catch it on — lit
 * window 235,220,195 · hazy sky 190,200,210 · beige facade 200,190,175):
 *
 *   plate α 0.72, cap #9fe8dc  (what shipped) → needs 0.66 alpha to clear 3:1
 *   plate α 0.96, cap #bef5e9  (this pass)    → needs 0.47
 *
 * So the shipped chip was DRAWN over 82 → 11 m and could only be READ over
 * 63.9 → 24.2 m: 31.3 m of its own 71 m band — 44 % — was veil. Two changes
 * close it, both here:
 *
 *   1. the plate goes near-opaque and every glyph gets a dark halo, which moves
 *      the floor from 0.66 to 0.47;
 *   2. below the floor the sign is NOT DRAWN AT ALL. „Beyond FAR_END the chip
 *      is not information, it is a dark rectangle on the vanishing point" is
 *      the argument `guidanceRoute.ts` already makes for the far end; the near
 *      end is the same argument and had never been made.
 *
 * The chip is now shown 68.3 → 21.0 m — 47.3 m of road, every metre of it above
 * 3:1 — which is still longer than the ≥3 s at the posted 50 km/h that
 * `guidance-marker-sign.test.ts` requires the student be given to act on it.
 *
 * A threshold pops, and this file's own turn arrow already pops at
 * `ARROW_VISIBLE_AHEAD_M` for the identical reason. The pop here is a half-alpha
 * panel leaving the frame 21 m short of a mark whose ring, gate bar, ground pool
 * and objective banner are all still on screen: nothing readable is lost, only
 * the veil over the road, the buildings, the В14 and the HUD's own controls.
 */
export const MIN_LEGIBLE_SIGN_ALPHA = 0.5;

/** The chip's own ink, exported because the floor above is COMPUTED from these
 *  three by `routeGuidanceSignLegibility.test.ts` rather than asserted as
 *  taste — change a colour and the test re-derives the floor and reds if the
 *  shipped one no longer holds. */
export const SIGN_PLATE_RGB: readonly [number, number, number] = [6, 18, 22];
export const SIGN_PLATE_ALPHA = 0.96;
export const SIGN_TITLE_RGB: readonly [number, number, number] = [234, 255, 251];
export const SIGN_CAP_RGB: readonly [number, number, number] = [190, 245, 233];

/**
 * The alpha the panel is ACTUALLY drawn at, given the eye distance.
 *
 * `markerSignOpacity` is the authored BAND — a teaching contract asserted in
 * `scene/guidance-marker-sign.test.ts`. This is the legibility gate on top of
 * it, and it may only ever take alpha away: a sign brighter than its band is
 * the old „dark rectangle on the horizon" defect pointing the other way.
 */
export function signPanelAlpha(distM: number): number {
  const banded = markerSignOpacity(distM);
  return banded >= MIN_LEGIBLE_SIGN_ALPHA ? banded : 0;
}

/** The exported triples, as canvas ink. */
function rgb([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** HUD token palette — holo cyan (--accent-2), the telemetry colour, and
 * --warning for the "you are above this gate's cap" state. Read from the live
 * CSS custom properties so a theme change re-skins the world guidance on next
 * mount; fallbacks = the authored dark-theme values. */
const ACCENT_2_FALLBACK = "#17e1c4";
const WARNING_FALLBACK = "#ffc24b";

function readCssColor(name: string, fallback: string): THREE.Color {
  let value = "";
  if (typeof document !== "undefined") {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  return new THREE.Color(value || fallback);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ---------------------------------------------------------------------------
// Ribbon shader — vS carries arclength; the fragment fades around uHeadS,
// dims past uGoalS (the look-ahead leg) and scrolls forward-pointing chevron
// bands at uFlowSpeed (0 = reduced motion).
// ---------------------------------------------------------------------------

const RIBBON_VERT = /* glsl */ `
  attribute float aS;
  attribute float aSide;
  varying float vS;
  varying float vSide;
  void main() {
    vS = aS;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Ramp length at each end of a crossing gap, m. */
const MUTE_EDGE_M = 1.2;
/**
 * Sentinel for an unused mute slot — far past any route this product derives
 * (LOOKAHEAD_MAX_M is 170 m and the longest single leg is EMERGENCY_AHEAD_M at
 * 150), and deliberately NOT 1e9: the shader evaluates
 * `smoothstep(s − MUTE_EDGE_M, s, vS)` on every slot, and at 1e9 a float32
 * cannot represent the 1.2 m offset, so edge0 == edge1 and the smoothstep
 * divides by zero. 1e6 keeps the two edges distinct with six digits to spare.
 */
const MUTE_UNUSED_S = 1e6;

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHeadS;
  uniform float uGoalS;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uOpacity;
  // Arclength spans the ribbon must not paint over — the pedestrian crossings
  // on this route. See crossingMuteSpans() in scene/guidanceRoute.ts for the
  // frame that forced it. Unused slots are parked at MUTE_UNUSED_S and cost
  // two smoothsteps that resolve to zero.
  uniform vec2 uMute[${CROSSING_MUTE_MAX_SPANS}];
  varying float vS;
  varying float vSide;
  void main() {
    float ahead = vS - uHeadS;
    float fadeAhead = 1.0 - smoothstep(${FADE_START_M.toFixed(1)}, ${FADE_END_M.toFixed(1)}, ahead);
    float fadeBehind = smoothstep(-16.0, -5.0, ahead);
    float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
    // The next objective's leg is drawn, but quieter: it is an announcement,
    // not the current task.
    float beyond = smoothstep(0.0, 6.0, vS - uGoalS);
    float legMix = mix(1.0, ${BEYOND_GOAL_OPACITY.toFixed(2)}, beyond);
    // Chevron bands: wings (|side|→1) trail the center, so the V points along
    // +s (travel direction); bands drift forward at uFlowSpeed m/s.
    float band = fract(vS / 7.0 + abs(vSide) * 0.22 - uTime * uFlowSpeed / 7.0);
    float dash = smoothstep(0.05, 0.22, band) * (1.0 - smoothstep(0.5, 0.68, band));
    // The crossing gap. Ramped over ${MUTE_EDGE_M.toFixed(1)} m at each end
    // rather than cut square: a hard edge across the ribbon reads as a second
    // painted bar, which is the last thing a zebra needs beside it.
    float mute = 1.0;
    for (int i = 0; i < ${CROSSING_MUTE_MAX_SPANS}; i++) {
      float inSpan = smoothstep(uMute[i].x - ${MUTE_EDGE_M.toFixed(1)}, uMute[i].x, vS)
                   * (1.0 - smoothstep(uMute[i].y, uMute[i].y + ${MUTE_EDGE_M.toFixed(1)}, vS));
      mute = min(mute, 1.0 - inSpan);
    }
    float a = uOpacity * edge * fadeAhead * fadeBehind * legMix * mute * (0.35 + 0.65 * dash);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// ---------------------------------------------------------------------------
// Objective marker shaft (art pass 2026-08-03, founder-approved)
//
// THE COMPLAINT, verbatim from the review: the marker is *"a big translucent
// teal shaft plus a teal ring… an untextured emissive primitive and the most
// engine-debug-gizmo object on the screen."* Register rows B24 and B27 add the
// half that actually costs teaching: at the pose the drill grades, the driver's
// eye is INSIDE the 11 m cylinder and *"the entire world goes flat green"* —
// on sc-junction-scan the marker curtain occludes the very left-right scan the
// lesson exists to teach, and on sc-junction-stop it hides the Б2 the student
// is being graded on finding.
//
// The old shader was one term: `pow(1 - vUv.y, 1.8)` over the whole tube,
// brightest AT THE BASE — i.e. densest exactly at eye height, exactly where it
// blocks the road. This replaces it with three terms that make it behave like
// a shaft of light instead of a coloured solid:
//
//  1. EYE-HEIGHT WINDOW. Nothing below EYE_CLEAR_M; a smooth ramp up to
//     SHAFT_FULL_M; a soft top. The driver looks THROUGH the marker at the
//     junction and sees the column above the roofline of the traffic in front.
//  2. SILHOUETTE WEIGHTING (view-dependent). A hollow tube shaded flat reads
//     as a plastic pipe; a real shaft of light is brightest where the optical
//     path through it is longest — at its silhouette. `1 - |N·V|` is that,
//     and it is what turns the primitive into volume.
//  3. PROXIMITY DISSOLVE. Inside PROX_FADE_END_M the shaft fades to nothing.
//     Arriving at the marker is the moment the student needs the WORLD, not
//     the marker: the contract has already been read from 60 m away. This is
//     the term that closes B24/B27 — you can no longer be inside it.
//
// Cost: unchanged. Same one mesh, same one transparent draw, three extra ALU
// terms and one normalize in a shader that covers a few hundred pixels. It
// carries no texture at any tier and is identical at low/med/high.
// ---------------------------------------------------------------------------

/** Below this height the shaft is fully transparent — the cockpit eye sits at
 *  ~1.2 m and the chase eye at ~2.3 m, so this clears both. */
const SHAFT_EYE_CLEAR_M = 2.6;
/** …and reaches full density here. */
const SHAFT_FULL_M = 5.0;
/** Distance at which the shaft starts dissolving as you arrive… */
const SHAFT_PROX_START_M = 26;
/** …and is completely gone. Past this the ground pool alone marks the spot. */
const SHAFT_PROX_END_M = 9;

const PILLAR_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PILLAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHeight;
  uniform vec3 uCamPos;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    float y = vUv.y * uHeight;
    // 1. Eye-height window: clear at the driver's eyeline, full above it,
    //    feathered out at the top so the column ends in air, not a rim.
    float rise = smoothstep(${SHAFT_EYE_CLEAR_M.toFixed(2)}, ${SHAFT_FULL_M.toFixed(2)}, y);
    float top = 1.0 - smoothstep(0.55, 1.0, vUv.y);
    // 2. Silhouette weighting — longest optical path at the tube's edge.
    vec3 v = normalize(uCamPos - vWorldPos);
    float rim = 1.0 - abs(dot(normalize(vWorldNormal), v));
    rim = 0.22 + 0.78 * rim * rim;
    // 3. Proximity dissolve: gone by the time you are at the mark.
    float d = distance(uCamPos.xz, vWorldPos.xz);
    float prox = smoothstep(${SHAFT_PROX_END_M.toFixed(1)}, ${SHAFT_PROX_START_M.toFixed(1)}, d);
    float a = uOpacity * rise * top * rim * prox;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// ---------------------------------------------------------------------------
// Ground pool — what the shaft hands over to when you arrive.
//
// A soft radial wash of light on the asphalt at the marker's foot. It is what
// keeps the target legible once the shaft has dissolved (and once the ring has
// stopped shouting), and it is the ONE part of the marker that is allowed to
// live at eye level, because a pool of light on the road is a thing a driver
// reads without looking up — which is the behaviour the drill wants.
// ---------------------------------------------------------------------------

/** Radius of the ground pool, m. Sized to the car, not to the acceptance
 *  radius: the ring already draws the graded zone. */
const POOL_RADIUS_M = 3.4;

const POOL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // vUv is 0..1 over the circle's bounding square.
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    // Bright, tight core with a long feathered skirt — a light pool, never a
    // hard-edged disc (a hard edge is the debug-gizmo read all over again).
    float core = 1.0 - smoothstep(0.0, 0.55, r);
    float skirt = 1.0 - smoothstep(0.3, 1.0, r);
    float a = uOpacity * (0.45 * core + 0.55 * skirt * skirt);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const POOL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Label chip — the marker states its own contract, in Bulgarian
// ---------------------------------------------------------------------------

/**
 * THE POSTED LIMIT AT A POINT — nearest carriageway edge, district metres.
 *
 * Row B58. This chip is not a debug read-out: it is a bar drawn across the lane
 * carrying an instruction in the instructor's voice, and on «Превишаване над
 * +10» it read **«не по-бързо от 57 км/ч» on a street posted 50**, inside the
 * one drill whose whole subject is that 51–60 in a 50 zone is a scored fault.
 * The founder's words for the class: „a student who obeys the number the world
 * shows him commits the mistake the world is grading."
 *
 * The generator half of that number is fixed at source (`scenario/params.ts`
 * widenSpeedCap — the ladder's grace is now bounded by the posted limit). This
 * is the second half, and it is the one that closes the class rather than the
 * instance: **32 gates in the catalog are AUTHORED above their own street's
 * limit** (55 on a 50, 92 on a 90, 33 on a 30). Those authored numbers are
 * grading slack — a beginner's speedometer, the rule engine's own
 * `speedingGraceMaxKmh` — and re-authoring them would move 32 graded gates and
 * their committed traces, which is a decision, not a bug fix. What is NOT
 * defensible is PRINTING them. So the gate keeps grading exactly what it
 * graded, and the sentence on the glass is clamped to the sign: the label may
 * be stricter than the gate, never more permissive than the law.
 *
 * `maxspeed` is optional on the structural edge type, so a district that omits
 * it (or a test double) leaves the label exactly as authored.
 */
export function postedLimitAt(
  district: RouteDistrictLike,
  x: number,
  y: number,
): number | undefined {
  let best: number | undefined;
  let bestD2 = Infinity;
  for (const e of district.roads.edges) {
    const limit = (e as { maxspeed?: unknown }).maxspeed;
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) continue;
    const g = e.geometry;
    for (let i = 1; i < g.length; i += 1) {
      const ax = g[i - 1]![0];
      const ay = g[i - 1]![1];
      const bx = g[i]![0];
      const by = g[i]![1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 <= 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = limit;
      }
    }
  }
  return best;
}

/** Second line of the chip: the objective's hidden speed contract, spelled
 *  out. A gate that silently demands ≤5 km/h is the whole of doc 86 T8.
 *  `postedKmh` is the street's own limit at the marker — see postedLimitAt. */
export function capLineBg(goal: GuidancePointGoal, postedKmh?: number): string {
  if (goal.maxSpeedKmh === undefined) return "";
  // A HALT demand is never clamped: «спри — под 5 км/ч» is already far below
  // any posted limit, and min() there would silently turn a stop into a limit.
  const shown =
    goal.affordance === "halt" || postedKmh === undefined
      ? goal.maxSpeedKmh
      : Math.min(goal.maxSpeedKmh, postedKmh);
  return goal.affordance === "halt"
    ? `спри — под ${Math.round(shown)} км/ч`
    : `не по-бързо от ${Math.round(shown)} км/ч`;
}

/** Exported for the same reason `capLineBg` is: the chip's ink is a teaching
 *  surface, and R0 says look at it before shipping it. There is no WebGL in the
 *  suite, so the 2026-08-17 look painted THIS function's own canvas over the
 *  three backdrops at the alphas the band allows (scratch only — frames never
 *  enter the repo), which is how the shipped ghost and the new plate were put
 *  side by side instead of argued about. */
export function makeLabelTexture(
  goal: GuidancePointGoal | null,
  postedKmh?: number,
): THREE.CanvasTexture | null {
  if (!goal || !goal.marker || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_PX_W;
  canvas.height = LABEL_PX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cap = capLineBg(goal, postedKmh);
  ctx.clearRect(0, 0, LABEL_PX_W, LABEL_PX_H);
  // Near-opaque, not 0.72. The panel's job is to be the GROUND its own text
  // stands on; at 0.72 the world's value came through it and the glyphs were
  // measured against a sunlit wall instead — see the MIN_LEGIBLE_SIGN_ALPHA
  // block for the numbers and the frames.
  const [pr, pg, pb] = SIGN_PLATE_RGB;
  ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${SIGN_PLATE_ALPHA})`;
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(r, 6);
  ctx.arcTo(LABEL_PX_W - 6, 6, LABEL_PX_W - 6, LABEL_PX_H - 6, r);
  ctx.arcTo(LABEL_PX_W - 6, LABEL_PX_H - 6, 6, LABEL_PX_H - 6, r);
  ctx.arcTo(6, LABEL_PX_H - 6, 6, 6, r);
  ctx.arcTo(6, 6, LABEL_PX_W - 6, 6, r);
  ctx.closePath();
  ctx.fill();
  // A sign has an EDGE. A dark plate on a light facade with no border reads as
  // a smudge on the wall — the border is what makes the shape read as an
  // object at the alphas the fade band leaves it at.
  ctx.strokeStyle = "rgba(23, 225, 196, 0.6)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A dark halo under every glyph. The plate carries the contrast while the sign
  // is at full strength; the halo carries it while the sign is fading, because
  // it darkens the two pixels around each stroke — which is exactly where a
  // light glyph on a light wall dies.
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const halo = "rgba(2, 10, 12, 0.9)";
  const titleY = cap ? 60 : LABEL_PX_H / 2;
  ctx.font = "600 54px system-ui, sans-serif";
  ctx.strokeStyle = halo;
  ctx.lineWidth = 9;
  ctx.strokeText(goal.labelBg, LABEL_PX_W / 2, titleY, LABEL_PX_W - 40);
  ctx.fillStyle = rgb(SIGN_TITLE_RGB);
  ctx.fillText(goal.labelBg, LABEL_PX_W / 2, titleY, LABEL_PX_W - 40);
  if (cap) {
    ctx.font = "400 36px system-ui, sans-serif";
    ctx.strokeStyle = halo;
    ctx.lineWidth = 7;
    ctx.strokeText(cap, LABEL_PX_W / 2, 118, LABEL_PX_W - 40);
    ctx.fillStyle = rgb(SIGN_CAP_RGB);
    ctx.fillText(cap, LABEL_PX_W / 2, 118, LABEL_PX_W - 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export interface RouteGuidanceProps {
  district: RouteDistrictLike;
  lesson: LessonSpec;
  /** 0-based active objective; ≥ objectives.length ⇒ all done (hide all). */
  activeObjectiveIndex: number;
  /** Live vehicle sample (district coords) — written per frame by VehicleRig. */
  sampleRef: React.RefObject<VehicleSample>;
  /** District-space spawn pose — start of the FIRST route (the sample is not
   * live yet at mount; later rebuilds start from the live sample). */
  spawnStart: { x: number; y: number; headingDeg: number };
}

/** Write the derived route into the ribbon's preallocated attribute buffers.
 *  The mesh math lives in the SHARED builder (ribbonStrip.ts) — extracted for
 *  the Scenario Studio trace ribbons; A7 behavior is byte-identical. */
function fillRibbon(geo: THREE.BufferGeometry, route: DerivedRoute): void {
  writeRibbonStrip(geo, route, RIBBON_Y, RIBBON_HALF_W);
}

export function RouteGuidance({
  district,
  lesson,
  activeObjectiveIndex,
  sampleRef,
  spawnStart,
}: RouteGuidanceProps) {
  const graph = useMemo(() => buildRouteGraph(district), [district]);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const accent = useMemo(() => readCssColor("--accent-2", ACCENT_2_FALLBACK), []);
  const warn = useMemo(() => readCssColor("--warning", WARNING_FALLBACK), []);

  /** The district's GRADED stop lines — the same set rules/engine.ts convicts
   *  on. Memoized per district object inside the module, so a remount is free. */
  const stopLines = useMemo(() => stopLinesForGuidance(district), [district]);

  const firstBuildRef = useRef(true);

  /** The pose every goal in the chain is resolved FROM: the spawn on the first
   *  build (the physics sample is not live yet), the car itself after that. */
  const derivedFrom = (): { x: number; y: number } => {
    const sample = sampleRef.current;
    return firstBuildRef.current || !sample
      ? { x: spawnStart.x, y: spawnStart.y }
      : { x: sample.position.x, y: sample.position.y };
  };

  /**
   * The active objective's marker contract. Resolved in render scope (not the
   * layout effect) because the ring geometry is sized from it declaratively —
   * `sampleRef.current` cannot change between this memo and the layout effect
   * below (same task), so both see the same pose.
   */
  const goal = useMemo<GuidanceGoal | null>(() => {
    return guidanceGoalFor(lesson, activeObjectiveIndex, { stopLines, from: derivedFrom() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [lesson, activeObjectiveIndex, stopLines, spawnStart, sampleRef]);

  /**
   * Objectives n+1, n+2, … — the ribbon runs into them so the turn is
   * announced early. It is a CHAIN, not a single step: on «Знак Стоп» the next
   * objective IS the stop line (dead ahead), and the right turn the student
   * must signal for lives one objective further, so a one-deep look-ahead
   * showed no turn at all until the nose had crossed the Б2 paint (doc 86 L5,
   * register B24/B6). `deriveGuidanceRoute` stops appending the moment a turn
   * is on the ribbon, so the extra depth costs nothing when it is not needed.
   */
  const lookahead = useMemo<GuidanceGoal[]>(() => {
    if (!goal) return [];
    const out: GuidanceGoal[] = [];
    // An "ahead" objective has no waypoint of its own, so the chain resolves
    // from the driver — which is exactly what picks the right arm's stop line.
    let from = goal.kind === "point" ? { x: goal.x, y: goal.y } : derivedFrom();
    for (let k = 1; k <= LOOKAHEAD_MAX_LEGS; k += 1) {
      const next = guidanceGoalFor(lesson, activeObjectiveIndex + k, { stopLines, from });
      // A null goal (smoothStop) or a target-less one ends the chain: there is
      // no coordinate to carry the ribbon toward.
      if (!next || next.kind !== "point") break;
      out.push(next);
      from = { x: next.x, y: next.y };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [lesson, activeObjectiveIndex, stopLines, goal, spawnStart, sampleRef]);

  const pointGoal = goal && goal.kind === "point" ? goal : null;
  const ringRadii = useMemo(
    () => (pointGoal && pointGoal.marker ? markerRingRadii(pointGoal) : null),
    [pointGoal],
  );
  const gateShape =
    pointGoal && pointGoal.marker && pointGoal.shape.kind === "gate" ? pointGoal.shape : null;
  // B58 — the street's own limit AT THE MARKER (not the map's headline number),
  // so a 50→30 transition district clamps each gate to the zone it stands in.
  const postedAtGoal = useMemo(
    () => (pointGoal ? postedLimitAt(district, pointGoal.x, pointGoal.y) : undefined),
    [district, pointGoal],
  );
  const labelTexture = useMemo(
    () => makeLabelTexture(pointGoal, postedAtGoal),
    [pointGoal, postedAtGoal],
  );
  useEffect(() => () => labelTexture?.dispose(), [labelTexture]);

  // --- Ribbon: preallocated triangle strip (2 verts per route sample),
  // built by the shared ribbonStrip helper (identical layout as always). ---
  const ribbonBuffers = useMemo(() => createRibbonBuffers(ROUTE_MAX_SAMPLES), []);

  const ribbonMatArgs = useMemo<[THREE.ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: RIBBON_VERT,
        fragmentShader: RIBBON_FRAG,
        uniforms: {
          uColor: { value: accent },
          uHeadS: { value: 0 },
          uGoalS: { value: 1e9 },
          uTime: { value: 0 },
          uFlowSpeed: { value: reducedMotion ? 0 : 6.0 },
          uOpacity: { value: 0.42 },
          // Allocated ONCE and mutated in place by the layout effect — the
          // module's whole perf contract is "no allocation after mount", and a
          // fresh Vector2[] per objective would break it in the one place a
          // reviewer would never look.
          uMute: {
            value: Array.from(
              { length: CROSSING_MUTE_MAX_SPANS },
              () => new THREE.Vector2(MUTE_UNUSED_S, MUTE_UNUSED_S),
            ),
          },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      },
    ],
    [accent, reducedMotion],
  );

  const pillarMatArgs = useMemo<[THREE.ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: PILLAR_VERT,
        fragmentShader: PILLAR_FRAG,
        uniforms: {
          uColor: { value: accent.clone() },
          // Halved (was 0.34). The silhouette term concentrates what is left
          // at the tube's edges, so the column reads BRIGHTER at its rim and
          // far quieter across its face — which is the whole difference
          // between a shaft of light and a coloured solid.
          uOpacity: { value: 0.17 },
          uHeight: { value: PILLAR_HEIGHT },
          uCamPos: { value: new THREE.Vector3() },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      },
    ],
    [accent],
  );

  const poolMatArgs = useMemo<[THREE.ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: POOL_VERT,
        fragmentShader: POOL_FRAG,
        uniforms: {
          uColor: { value: accent.clone() },
          uOpacity: { value: 0.5 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      },
    ],
    [accent],
  );

  // --- Turn chevron: flat arrowhead in local XY, +X forward, extruded. ---
  const arrowGeoArgs = useMemo<[THREE.Shape, THREE.ExtrudeGeometryOptions]>(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0.95, 0);
    shape.lineTo(-0.55, 0.85);
    shape.lineTo(-0.18, 0);
    shape.lineTo(-0.55, -0.85);
    shape.closePath();
    return [shape, { depth: 0.28, bevelEnabled: false }];
  }, []);

  const ribbonRef = useRef<THREE.Mesh>(null);
  const ribbonGeoRef = useRef<THREE.BufferGeometry>(null);
  const ribbonMatRef = useRef<THREE.ShaderMaterial>(null);
  const arrowRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const gateRef = useRef<THREE.Group>(null);
  const barMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const pillarMatRef = useRef<THREE.ShaderMaterial>(null);
  const poolMatRef = useRef<THREE.ShaderMaterial>(null);
  const labelRef = useRef<THREE.Mesh>(null);
  /** The whole roadside sign — post + panel — carried to the kerb side of the
   *  route as ONE transform, so the panel can never drift off its own post. */
  const signRef = useRef<THREE.Group>(null);
  const postMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const routeRef = useRef<DerivedRoute | null>(null);
  const goalRef = useRef<GuidanceGoal | null>(null);
  // Per-frame scratch — never allocated inside useFrame.
  const scratchPtRef = useRef({ x: 0, y: 0 });
  const overCapRef = useRef(false);

  // Rebuild route + visuals on objective change ONLY (never per frame).
  // Layout effect: visibility/positions land before the first paint, so the
  // marker/arrow never flash at the world origin.
  useLayoutEffect(() => {
    goalRef.current = goal;

    // First build: the physics sample is not live yet → derive from spawn.
    // Later rebuilds (objective advance, retry) start from the car itself.
    const sample = sampleRef.current;
    const start =
      firstBuildRef.current || !sample
        ? spawnStart
        : { x: sample.position.x, y: sample.position.y, headingDeg: sample.headingDeg };
    firstBuildRef.current = false;

    const route = deriveGuidanceRoute(graph, start, goal, { lookahead });
    routeRef.current = route;

    const geo = ribbonGeoRef.current;
    if (geo && route) fillRibbon(geo, route);
    if (ribbonRef.current) ribbonRef.current.visible = route !== null && geo !== null;
    if (ribbonMatRef.current) {
      ribbonMatRef.current.uniforms.uGoalS.value = route ? route.goalS : 1e9;
      // Where this leg crosses a painted zebra the ribbon goes quiet, so the
      // bars are the only thing on that asphalt. Written in place; unused slots
      // are parked past every route length this product derives.
      const spans = crossingMuteSpans(route, district);
      const slots = ribbonMatRef.current.uniforms.uMute.value as THREE.Vector2[];
      for (let i = 0; i < slots.length; i++) {
        const span = spans[i];
        if (span) slots[i]!.set(span[0], span[1]);
        else slots[i]!.set(MUTE_UNUSED_S, MUTE_UNUSED_S);
      }
    }
    if (arrowRef.current) arrowRef.current.visible = false; // per-frame logic re-shows it
    const marker = markerRef.current;
    if (marker) {
      const showMarker = goal !== null && goal.kind === "point" && goal.marker;
      marker.visible = showMarker;
      if (showMarker && goal.kind === "point") marker.position.set(goal.x, 0, -goal.y);
    }
    // Zone ring and stop-line bar are mutually exclusive readings of the same
    // contract; the one that does not apply is simply off.
    if (ringRef.current) ringRef.current.visible = ringRadii !== null;
    const gate = gateRef.current;
    if (gate) {
      gate.visible = gateShape !== null;
      if (gateShape) gate.rotation.y = Math.atan2(gateShape.dirY, gateShape.dirX);
    }
    if (labelRef.current) labelRef.current.visible = labelTexture !== null;
    // The sign steps off the carriageway onto the kerb side of the approach.
    // Marker space has no yaw of its own, and district (x, y) maps to three
    // (x, ·, −y), so a district offset is applied straight to the group.
    const sign = signRef.current;
    if (sign) {
      // Seed only: "is there a sign for this objective at all". Whether it is
      // near enough to be READ is a live eye distance, so useFrame owns this
      // flag from the first rendered frame (R3F runs the frame subscribers
      // before every draw, in "always" and in "demand" alike).
      sign.visible = labelTexture !== null;
      const dir = goal && goal.kind === "point" ? markerApproachDir(goal, route) : null;
      const off = dir ? markerSignOffset(dir.x, dir.y) : { x: 0, y: 0 };
      sign.position.set(off.x, 0, -off.y);
    }
    // A fresh objective starts innocent — the cap tint re-arms per frame.
    overCapRef.current = false;
    if (ringMatRef.current) ringMatRef.current.color.copy(accent);
    if (barMatRef.current) barMatRef.current.color.copy(accent);
    if (pillarMatRef.current) pillarMatRef.current.uniforms.uColor.value.copy(accent);
    if (poolMatRef.current) poolMatRef.current.uniforms.uColor.value.copy(accent);
  }, [
    graph,
    goal,
    lookahead,
    ringRadii,
    gateShape,
    labelTexture,
    accent,
    spawnStart,
    sampleRef,
    district,
  ]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const sample = sampleRef.current;
    const goalNow = goalRef.current;

    // Marker: soft breathing ring (frozen under reduced motion) + the live
    // speed-cap read. The student never has to guess the hidden contract.
    const marker = markerRef.current;
    if (marker?.visible && goalNow && goalNow.kind === "point") {
      const ring = ringRef.current;
      if (ring && !reducedMotion) {
        const pulse = 1 + 0.05 * Math.sin(t * (overCapRef.current ? 4.4 : 1.8));
        ring.scale.set(pulse, pulse, 1);
      }
      // The shaft's silhouette + proximity terms both need the eye position.
      // Written straight into the uniform — no allocation, no React state.
      if (pillarMatRef.current) {
        (pillarMatRef.current.uniforms.uCamPos.value as THREE.Vector3).copy(
          state.camera.position,
        );
      }
      // The label carries a real teaching contract («Карай дотук / не по-бързо
      // от 35 км/ч»), so it is never removed — but at the acceptance pose it
      // was 7.2 × 2.4 m of world-space text that "spanned half the sky"
      // (register B24/B27), and beyond ~80 m it is a dark rectangle parked on
      // the vanishing point with text nobody can resolve (the founder's frames,
      // 2026-08-14). `markerSignOpacity` is the band it exists in, at both
      // ends; `signPanelAlpha` is the legibility floor UNDER that band (sweep
      // 161 — see MIN_LEGIBLE_SIGN_ALPHA), and the POST fades with the panel,
      // because a post standing under nothing is the same defect wearing the
      // other hat. `label.visible` stays owned by the layout effect (texture
      // present or not) and is the guard below; the SIGN GROUP's visibility is
      // owned here, because it is the one that depends on the live eye
      // distance — the marker's own ring, bar and pool are untouched by it.
      const label = labelRef.current;
      const sign = signRef.current;
      if (label?.visible && sign) {
        label.quaternion.copy(state.camera.quaternion);
        const lm = label.material as THREE.MeshBasicMaterial;
        // Distance to the SIGN, not to the marker: it now stands a lane's half
        // width to the side, and the band it fades in is measured off the thing
        // the eye is actually reading.
        const dx = state.camera.position.x - (marker.position.x + sign.position.x);
        const dz = state.camera.position.z - (marker.position.z + sign.position.z);
        const alpha = signPanelAlpha(Math.hypot(dx, dz));
        // Shown or gone, never a veil: below the floor the whole sign leaves —
        // panel AND post — instead of hanging over the road at an alpha its own
        // text cannot be told from its own plate at.
        sign.visible = alpha > 0;
        lm.opacity = alpha;
        if (postMatRef.current) postMatRef.current.opacity = alpha * 0.85;
      }
      if (sample && goalNow.maxSpeedKmh !== undefined) {
        const dx = sample.position.x - goalNow.x;
        const dy = sample.position.y - goalNow.y;
        const near =
          dx * dx + dy * dy <
          (goalNow.acceptRadiusM + CAP_WARN_LEAD_M) * (goalNow.acceptRadiusM + CAP_WARN_LEAD_M);
        const over = near && Math.abs(sample.speedKmh) > goalNow.maxSpeedKmh;
        if (over !== overCapRef.current) {
          overCapRef.current = over;
          const c = over ? warn : accent;
          if (ringMatRef.current) ringMatRef.current.color.copy(c);
          if (barMatRef.current) barMatRef.current.color.copy(c);
          if (pillarMatRef.current) pillarMatRef.current.uniforms.uColor.value.copy(c);
          // The pool is the marker's NEAR-field reading, and "you are over the
          // cap" is a near-field fact — it has to carry the warning too, or
          // the one surface still on screen at the mark stays reassuring.
          if (poolMatRef.current) poolMatRef.current.uniforms.uColor.value.copy(c);
        }
      }
    }

    const route = routeRef.current;
    const ribbonMat = ribbonMatRef.current;
    if (!route || !sample || !ribbonMat) return;

    // Ribbon head: fade window follows the car along the route.
    const headS = nearestArcOnRoute(route, sample.position.x, sample.position.y);
    ribbonMat.uniforms.uHeadS.value = headS;
    ribbonMat.uniforms.uTime.value = t;

    // Turn chevron: the NEXT junction ahead where the route turns. With the
    // look-ahead leg appended, that includes the turn PAST the active
    // waypoint — which is the whole point (doc 86 L5).
    const arrow = arrowRef.current;
    if (!arrow) return;
    let turn = null;
    for (let i = 0; i < route.turns.length; i++) {
      if (route.turns[i].s > headS + 4) {
        turn = route.turns[i];
        break;
      }
    }
    if (turn && turn.s - headS < ARROW_VISIBLE_AHEAD_M) {
      const s = Math.max(2, turn.s - ARROW_BEFORE_JUNCTION_M);
      const scratchPt = scratchPtRef.current;
      routePointAt(route, s, scratchPt);
      const bob = reducedMotion ? 0 : 0.15 * Math.sin(t * 1.6);
      arrow.position.set(scratchPt.x, ARROW_Y + bob, -scratchPt.y);
      // District dir (dx, dy) → three: rotation.y = atan2(dy, dx) points local
      // +X along the exit direction (derived from the axis mapping x, −z).
      arrow.rotation.y = Math.atan2(turn.dirY, turn.dirX);
      const pulse = reducedMotion ? 1 : 1 + 0.07 * Math.sin(t * 2.2);
      arrow.scale.setScalar(pulse);
      arrow.visible = true;
    } else {
      arrow.visible = false;
    }
  });

  return (
    <group>
      {/* Before the first rebuild effect the buffers are all zeros — that
          rasterizes nothing (zero-area triangles), so no declarative
          drawRange is needed (and none may be declared: a parent re-render
          would stomp the imperative range set by fillRibbon). */}
      <mesh ref={ribbonRef} frustumCulled={false} renderOrder={20}>
        <bufferGeometry ref={ribbonGeoRef}>
          <bufferAttribute attach="attributes-position" args={[ribbonBuffers.positions, 3]} />
          <bufferAttribute attach="attributes-aS" args={[ribbonBuffers.aS, 1]} />
          <bufferAttribute attach="attributes-aSide" args={[ribbonBuffers.aSide, 1]} />
          <bufferAttribute attach="index" args={[ribbonBuffers.index, 1]} />
        </bufferGeometry>
        <shaderMaterial ref={ribbonMatRef} args={ribbonMatArgs} />
      </mesh>
      <mesh ref={arrowRef} renderOrder={21}>
        <extrudeGeometry args={arrowGeoArgs} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group ref={markerRef}>
        <mesh position={[0, PILLAR_HEIGHT / 2 + 0.02, 0]} renderOrder={19}>
          <cylinderGeometry
            args={[PILLAR_RADIUS, PILLAR_RADIUS, PILLAR_HEIGHT, 24, 1, true]}
          />
          <shaderMaterial ref={pillarMatRef} args={pillarMatArgs} />
        </mesh>
        {/* Ground pool — the marker's near-field reading, once the shaft has
            dissolved out of the windscreen. One extra transparent draw of 32
            triangles at every tier. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={18}>
          <circleGeometry args={[POOL_RADIUS_M, 32]} />
          <shaderMaterial ref={poolMatRef} args={poolMatArgs} />
        </mesh>
        {/* Zone target: the ring IS the acceptance radius the engine tests. */}
        <mesh
          ref={ringRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          renderOrder={19}
        >
          <ringGeometry args={[ringRadii?.innerM ?? 1.2, ringRadii?.outerM ?? 1.85, 64]} />
          {/* `color` is MUTATED by the speed-cap tint, so it is deliberately
              not declared here — the layout effect seeds it (before paint) and
              useFrame owns it after that. A declared prop would let a parent
              re-render silently clear the warning. */}
          {/* NormalBlending, not Additive (art pass 2026-08-03). Additive on
              a mid-grey sunlit road drives the annulus to a flat clipped teal
              — the "untextured emissive primitive" read. Alpha-blended at 0.55
              the same ring lands as a painted band ON the asphalt, keeps the
              road's own value underneath it, and still carries the amber
              over-cap tint at full legibility. */}
          <meshBasicMaterial
            ref={ringMatRef}
            transparent
            opacity={0.55}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Stop-line gate: a bar ACROSS the lane, on the approach side of the
            graded line. Local +X is the travel direction (yaw set imperatively). */}
        <group ref={gateRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} renderOrder={19}>
            <planeGeometry
              args={[
                pointGoal?.affordance === "halt" ? BAR_DEPTH_HALT_M : BAR_DEPTH_THROUGH_M,
                2 * (gateShape?.halfWidthM ?? 4.06),
              ]}
            />
            <meshBasicMaterial
              ref={barMatRef}
              transparent
              opacity={pointGoal?.affordance === "halt" ? 0.6 : 0.34}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
        {/* THE ROADSIDE SIGN: «Спри тук» / «Карай дотук» + the hidden cap,
            spelled out — on a post, at the kerb, at sign height.

            The group's position is set imperatively (kerb side of the
            approach); the post and the panel are fixed inside it, so whatever
            the marker does the panel is always standing on its own post.

            Cost: ONE extra transparent draw of a 6-sided open cylinder — 12
            triangles, no texture, identical at every quality tier. */}
        <group ref={signRef}>
          <mesh position={[0, MARKER_SIGN_POST_BASE_Y + POST_HEIGHT_M / 2, 0]} renderOrder={21}>
            <cylinderGeometry
              args={[
                MARKER_SIGN_POST_RADIUS_M,
                MARKER_SIGN_POST_RADIUS_M,
                POST_HEIGHT_M,
                6,
                1,
                true,
              ]}
            />
            {/* NormalBlending like the acceptance ring, not additive: a post is
                a solid object and an additive one glows into the road behind
                it — the „untextured emissive primitive" read this whole marker
                has been walking back since the 2026-08-03 art pass. */}
            <meshBasicMaterial
              ref={postMatRef}
              color={accent}
              transparent
              opacity={0.8}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={labelRef} position={[0, MARKER_SIGN_PANEL_Y, 0]} renderOrder={22}>
            <planeGeometry args={[LABEL_WIDTH_M, LABEL_HEIGHT_M]} />
            <meshBasicMaterial
              map={labelTexture}
              transparent
              opacity={0.95}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
