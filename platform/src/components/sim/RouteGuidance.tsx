"use client";

/**
 * RouteGuidance — A7 in-world route guidance (doc 68 Pillar 2; audit B9).
 * Mounted by LessonScene ONLY when the lesson has objectives (l0 free drive
 * has nothing to follow, so it never mounts).
 *
 * Three visuals, three draw units, zero per-frame allocation:
 *  1. Ghost ribbon — an emissive, semi-transparent strip hovering ~2 cm above
 *     the asphalt along the derived route; chevron bands scroll forward so
 *     direction reads instantly; fades in ~90→120 m ahead of the car and
 *     dissolves a few meters behind it.
 *  2. Turn chevron — ONE floating arrow before the next junction where the
 *     route turns ≥30°, yawed along the exit direction, gentle pulse/bob.
 *  3. Objective marker — a soft light pillar + ground ring at point
 *     objectives (parking bay, stop target…); gone the moment the objective
 *     completes (the rebuild hides it).
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

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { LessonSpec } from "@/modules/sim/lessons";
import {
  ROUTE_MAX_SAMPLES,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  nearestArcOnRoute,
  routePointAt,
  type DerivedRoute,
  type GuidanceGoal,
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

const ARROW_Y = 2.6;
/** Arrow sits this far before the junction node (2.5×-scaled mouths — a safe
 * fixed setback per doc 68 A7). */
const ARROW_BEFORE_JUNCTION_M = 20;
/** Only show the arrow once its junction is inside the guidance horizon. */
const ARROW_VISIBLE_AHEAD_M = 140;

const PILLAR_HEIGHT = 11;
const PILLAR_RADIUS = 1.0;

/** HUD token palette — holo cyan (--accent-2), the telemetry colour. Read
 * from the live CSS custom property so a theme change re-skins the world
 * guidance on next mount; fallback = the authored dark-theme value. */
const ACCENT_2_FALLBACK = "#17e1c4";

function readAccentCyan(): THREE.Color {
  let value = "";
  if (typeof document !== "undefined") {
    value = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim();
  }
  return new THREE.Color(value || ACCENT_2_FALLBACK);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ---------------------------------------------------------------------------
// Ribbon shader — vS carries arclength; the fragment fades around uHeadS and
// scrolls forward-pointing chevron bands at uFlowSpeed (0 = reduced motion).
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
    // Chevron bands: wings (|side|→1) trail the center, so the V points along
    // +s (travel direction); bands drift forward at uFlowSpeed m/s.
    float band = fract(vS / 7.0 + abs(vSide) * 0.22 - uTime * uFlowSpeed / 7.0);
    float dash = smoothstep(0.05, 0.22, band) * (1.0 - smoothstep(0.5, 0.68, band));
    float a = uOpacity * edge * fadeAhead * fadeBehind * (0.35 + 0.65 * dash);
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
  const accent = useMemo(() => readAccentCyan(), []);

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
          uColor: { value: accent },
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

  const routeRef = useRef<DerivedRoute | null>(null);
  const goalRef = useRef<GuidanceGoal | null>(null);
  const firstBuildRef = useRef(true);
  // Per-frame scratch — never allocated inside useFrame.
  const scratchPtRef = useRef({ x: 0, y: 0 });

  // Rebuild route + visuals on objective change ONLY (never per frame).
  // Layout effect: visibility/positions land before the first paint, so the
  // marker/arrow never flash at the world origin.
  useLayoutEffect(() => {
    const goal = guidanceGoalFor(lesson, activeObjectiveIndex);
    goalRef.current = goal;

    // First build: the physics sample is not live yet → derive from spawn.
    // Later rebuilds (objective advance, retry) start from the car itself.
    const sample = sampleRef.current;
    const start =
      firstBuildRef.current || !sample
        ? spawnStart
        : { x: sample.position.x, y: sample.position.y, headingDeg: sample.headingDeg };
    firstBuildRef.current = false;

    const route = deriveGuidanceRoute(graph, start, goal);
    routeRef.current = route;

    const geo = ribbonGeoRef.current;
    if (geo && route) fillRibbon(geo, route);
    if (ribbonRef.current) ribbonRef.current.visible = route !== null && geo !== null;
    if (arrowRef.current) arrowRef.current.visible = false; // per-frame logic re-shows it
    const marker = markerRef.current;
    if (marker) {
      const showMarker = goal !== null && goal.kind === "point" && goal.marker;
      marker.visible = showMarker;
      if (showMarker) marker.position.set(goal.x, 0, -goal.y);
    }
  }, [graph, lesson, activeObjectiveIndex, spawnStart, sampleRef]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Marker: soft breathing ring (frozen under reduced motion).
    const ring = ringRef.current;
    if (ring && markerRef.current?.visible && !reducedMotion) {
      const pulse = 1 + 0.05 * Math.sin(t * 1.8);
      ring.scale.set(pulse, pulse, 1);
    }

    const route = routeRef.current;
    const sample = sampleRef.current;
    const ribbonMat = ribbonMatRef.current;
    if (!route || !sample || !ribbonMat) return;

    // Ribbon head: fade window follows the car along the route.
    const headS = nearestArcOnRoute(route, sample.position.x, sample.position.y);
    ribbonMat.uniforms.uHeadS.value = headS;
    ribbonMat.uniforms.uTime.value = t;

    // Turn chevron: the NEXT junction ahead where the route turns.
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
          <shaderMaterial args={pillarMatArgs} />
        </mesh>
        <mesh
          ref={ringRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          renderOrder={19}
        >
          <ringGeometry args={[PILLAR_RADIUS + 0.2, PILLAR_RADIUS + 0.85, 40]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}
