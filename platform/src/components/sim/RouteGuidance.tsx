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
 *  4. Label chip — a canvas-textured billboard so the marker says what it
 *     wants in Bulgarian instead of being a silent circle.
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
  markerRingRadii,
  nearestArcOnRoute,
  routePointAt,
  stopLinesForGuidance,
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
/** How much of the ribbon's opacity survives PAST the active waypoint. The
 *  look-ahead leg has to be readable (it is the turn announcement) without
 *  competing with the task the student is actually on. */
const BEYOND_GOAL_OPACITY = 0.42;

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

const LABEL_Y = 4.4;
const LABEL_WIDTH_M = 7.2;
const LABEL_HEIGHT_M = 2.4;
const LABEL_PX_W = 480;
const LABEL_PX_H = 160;

/** Distance at which the speed-cap warning arms — far enough that easing off
 *  still works, near enough that it is clearly about THIS marker. */
const CAP_WARN_LEAD_M = 35;

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

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHeadS;
  uniform float uGoalS;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uOpacity;
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
    float a = uOpacity * edge * fadeAhead * fadeBehind * legMix * (0.35 + 0.65 * dash);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const PILLAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PILLAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = uOpacity * pow(1.0 - vUv.y, 1.8);
    gl_FragColor = vec4(uColor, a);
  }
`;

// ---------------------------------------------------------------------------
// Label chip — the marker states its own contract, in Bulgarian
// ---------------------------------------------------------------------------

/** Second line of the chip: the objective's hidden speed contract, spelled
 *  out. A gate that silently demands ≤5 km/h is the whole of doc 86 T8. */
function capLineBg(goal: GuidancePointGoal): string {
  if (goal.maxSpeedKmh === undefined) return "";
  return goal.affordance === "halt"
    ? `спри — под ${Math.round(goal.maxSpeedKmh)} км/ч`
    : `не по-бързо от ${Math.round(goal.maxSpeedKmh)} км/ч`;
}

function makeLabelTexture(goal: GuidancePointGoal | null): THREE.CanvasTexture | null {
  if (!goal || !goal.marker || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_PX_W;
  canvas.height = LABEL_PX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cap = capLineBg(goal);
  ctx.clearRect(0, 0, LABEL_PX_W, LABEL_PX_H);
  ctx.fillStyle = "rgba(6, 18, 22, 0.72)";
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(r, 6);
  ctx.arcTo(LABEL_PX_W - 6, 6, LABEL_PX_W - 6, LABEL_PX_H - 6, r);
  ctx.arcTo(LABEL_PX_W - 6, LABEL_PX_H - 6, 6, LABEL_PX_H - 6, r);
  ctx.arcTo(6, LABEL_PX_H - 6, 6, 6, r);
  ctx.arcTo(6, 6, LABEL_PX_W - 6, 6, r);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eafffb";
  ctx.font = "600 54px system-ui, sans-serif";
  ctx.fillText(goal.labelBg, LABEL_PX_W / 2, cap ? 60 : LABEL_PX_H / 2, LABEL_PX_W - 40);
  if (cap) {
    ctx.fillStyle = "#9fe8dc";
    ctx.font = "400 36px system-ui, sans-serif";
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
  const labelTexture = useMemo(() => makeLabelTexture(pointGoal), [pointGoal]);
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
          uOpacity: { value: 0.34 },
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
  const labelRef = useRef<THREE.Mesh>(null);

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
    // A fresh objective starts innocent — the cap tint re-arms per frame.
    overCapRef.current = false;
    if (ringMatRef.current) ringMatRef.current.color.copy(accent);
    if (barMatRef.current) barMatRef.current.color.copy(accent);
    if (pillarMatRef.current) pillarMatRef.current.uniforms.uColor.value.copy(accent);
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
      if (labelRef.current?.visible) labelRef.current.quaternion.copy(state.camera.quaternion);
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
          <meshBasicMaterial
            ref={ringMatRef}
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
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
        {/* «Спри тук» / «Премини на зелено» + the hidden cap, spelled out. */}
        <mesh ref={labelRef} position={[0, LABEL_Y, 0]} renderOrder={22}>
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
  );
}
