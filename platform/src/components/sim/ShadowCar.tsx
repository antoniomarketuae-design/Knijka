"use client";

/**
 * ShadowCar — the Scenario Studio ghost (doc 76 §5): a translucent hero car
 * playing back a recorded ScenarioTrace KINEMATICALLY (sampleAt lerp — no
 * physics, no re-simulation; trap 3). Founder ruling 2026-07-15: ghost style
 * = translucent car; blue for correct shadows, RED + ❌ chrome for mistake
 * demos (wrong ways are demonstrated, never neutral), yellow for the
 * student's own attempt replays.
 *
 * Visual channels driven straight from the trace:
 *   - pose (position lerp + shortest-arc heading) via the shared TraceClock;
 *   - front wheels steer per steerRad, all wheels roll per speed;
 *   - indicator blinkers blink, brake lights light on brakeOn (corner quads —
 *     model-independent, no per-lamp GLB knowledge required);
 *   - glance events flash a mirror icon sprite above the roof;
 *   - the full path draws as a ground ribbon through the SHARED A7 ribbon
 *     mesh builder (ribbonStrip.ts) — the reference image's colored lines.
 *
 * The ghost ADVANCES the shared clock while `playing` (single time driver,
 * inside useFrame); TraceTimeline only reads/writes the same ref from the
 * DOM side. Per-frame work is allocation-free (module scratch + refs).
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { CHASSIS_HALF_EXTENTS } from "@/modules/sim/vehicle";
import {
  createTracePoint,
  sampleAt,
  tracePathForRibbon,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import { createRibbonBuffers, writeRibbonStrip } from "@/modules/sim/scene/ribbonStrip";

/** Same assets as HeroCarBody (kept in sync — public asset paths). */
const HERO_URL = "/sim/vehicles/hero_car.glb";
const DRACO_PATH = "/draco/";
/** The GLB renders nose backward (HeroCarBody's founder-confirmed flip). */
const HERO_YAW = Math.PI;
const WHEEL_RADIUS_M = 0.34;
/** Ghost shell opacity (doc 76 §5 — translucent, clearly not a real car). */
const GHOST_OPACITY = 0.45;
/** Ground clearance of the pose group (ROAD_Y — tyres kiss the asphalt). */
const GHOST_Y = 0.02;
const DEG2RAD = Math.PI / 180;
/** Indicator blink period, s (real cars flash at ~90/min). */
const BLINK_PERIOD_S = 0.75;
/** Mirror-icon flash window after a glance event, s. */
const GLANCE_FLASH_S = 0.9;

/** Ribbon styling (the reference image's colored path lines). */
const RIBBON_MAX_SAMPLES = 1024;
const RIBBON_Y = 0.05;
const RIBBON_HALF_W = 0.55;

/** Ghost tint per trace kind (doc 76 §4: blue shadow / yellow attempt /
 *  red mistake). */
const KIND_TINT: Record<ScenarioTrace["meta"]["kind"], string> = {
  shadow: "#3f8cff",
  attempt: "#ffc61a",
  mistake: "#ff4545",
};

// Ribbon shader: the A7 chevron-band language WITHOUT the head fade — a
// demonstration path is visible end to end (top-down reference image).
const TRACE_RIBBON_VERT = /* glsl */ `
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

const TRACE_RIBBON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uOpacity;
  varying float vS;
  varying float vSide;
  void main() {
    float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
    float band = fract(vS / 6.0 + abs(vSide) * 0.22 - uTime * uFlowSpeed / 6.0);
    float dash = smoothstep(0.05, 0.22, band) * (1.0 - smoothstep(0.5, 0.68, band));
    float a = uOpacity * edge * (0.4 + 0.6 * dash);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Emoji sprite texture (dev-grade chrome: badge/mirror icons). Exported for
 *  the clip-capture rig's ground fault marker (same visual vocabulary). */
export function emojiTexture(emoji: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${Math.floor(size * 0.78)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2 + 6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface GhostWheel {
  node: THREE.Object3D;
  front: boolean;
}

export interface ShadowCarProps {
  trace: ScenarioTrace;
  /** Shared playback clock (createTraceClock) — the timeline's control seam. */
  clockRef: React.RefObject<TraceClock>;
  /** Draw the full-path ground ribbon (default true). */
  showRibbon?: boolean;
  /**
   * Render the ghost car itself (default true). False = the L2 „Частична
   * помощ" aid: the correct-path ribbon ALONE, no ghost, no lamp chrome —
   * the trace still drives the (invisible) pose group so a later toggle
   * would resume in sync.
   */
  showGhost?: boolean;
  /**
   * Render the roof ❌ badge on mistake demos (default true). The clip rig
   * passes false on lot maps, where the badge's 2.9 m float parallax-projects
   * onto near backgrounds ("X on the grass", pilot v2) — a ground-anchored
   * marker at the ENGINE fault position replaces it there.
   */
  showBadge?: boolean;
}

export function ShadowCar({
  trace,
  clockRef,
  showRibbon = true,
  showGhost = true,
  showBadge = true,
}: ShadowCarProps) {
  const { scene } = useGLTF(HERO_URL, DRACO_PATH);
  const kind = trace.meta.kind;
  const tint = useMemo(() => new THREE.Color(KIND_TINT[kind]), [kind]);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  // --- ghost model: clone + translucent tinted materials + wheel rig -------
  const wheels = useRef<GhostWheel[]>([]);
  const { model, scale, offsetY, ghostMaterials } = useMemo(() => {
    const root = scene.clone(true);
    const ghostMaterials: THREE.Material[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const g = (m as THREE.Material).clone();
        g.transparent = true;
        g.opacity = GHOST_OPACITY;
        g.depthWrite = false;
        // EVERY GHOST MESH WAS DRAWN TWICE. hero_car.glb authors its materials
        // doubleSided, and three's `renderObject` splits a material that is
        // `transparent && side === DoubleSide && !forceSinglePass` into a
        // BackSide pass and a FrontSide pass with a `needsUpdate` between them
        // (`WebGLRenderer.js:2133-2143`) — two draw calls and two triangle
        // submissions per mesh, plus a shader re-resolve. Measured with my own
        // raw GL counter on /dev/drive-rig at tier low, level 1: turning this
        // on removed 26–31 draw calls per frame in every district tested, and
        // at med/high it removes four submissions per mesh rather than two,
        // because N8AO's transparency-aware mode re-renders the transparent
        // queue at full resolution.
        //
        // The ghost is one uniformly tinted translucent shell at opacity
        // GHOST_OPACITY with depthWrite already off, so the sorted two-pass
        // render buys nothing a viewer can see; both faces are still
        // rasterised, in one submission instead of two.
        g.forceSinglePass = true;
        const std = g as THREE.MeshStandardMaterial;
        if (std.color) std.color.lerp(tint, 0.6);
        if (std.emissive) {
          std.emissive.copy(tint).multiplyScalar(0.22);
        }
        ghostMaterials.push(g);
        return g;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });

    const found: GhostWheel[] = [];
    for (const name of ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"]) {
      const node = root.getObjectByName(name);
      if (node) {
        node.rotation.order = "YXZ";
        found.push({ node, front: name.startsWith("wheel_F") });
      }
    }
    wheels.current = found;

    // Auto-fit exactly like HeroCarBody: width → collider width, tyres → 0.
    const bbox = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const targetWidth = CHASSIS_HALF_EXTENTS.x * 2; // the hero collider width
    const fitScale = size.x > 1e-3 ? targetWidth / size.x : 1;
    const fitOffsetY = -bbox.min.y * fitScale;
    return { model: root, scale: fitScale, offsetY: fitOffsetY, ghostMaterials };
  }, [scene, tint]);

  useEffect(
    () => () => {
      for (const m of ghostMaterials) m.dispose();
    },
    [ghostMaterials],
  );

  // --- sprites (glance mirror icon; ❌ badge on mistake demos) --------------
  const glanceTexArgs = useMemo(() => [emojiTexture("👀")] as const, []);
  const badgeTexArgs = useMemo(() => [emojiTexture("❌")] as const, []);
  useEffect(
    () => () => {
      glanceTexArgs[0].dispose();
      badgeTexArgs[0].dispose();
    },
    [glanceTexArgs, badgeTexArgs],
  );
  /** Precomputed glance-event times (sparse — scanned per frame, no alloc). */
  const glances = useMemo(
    () => trace.events.filter((e) => e.kind.startsWith("glance-")),
    [trace],
  );

  // --- ribbon ---------------------------------------------------------------
  const ribbonBuffers = useMemo(() => createRibbonBuffers(RIBBON_MAX_SAMPLES), []);
  const ribbonPath = useMemo(
    () => tracePathForRibbon(trace, 1.25, RIBBON_MAX_SAMPLES),
    [trace],
  );
  const ribbonMatArgs = useMemo<[THREE.ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: TRACE_RIBBON_VERT,
        fragmentShader: TRACE_RIBBON_FRAG,
        uniforms: {
          uColor: { value: tint },
          uTime: { value: 0 },
          uFlowSpeed: { value: reducedMotion ? 0 : 4.0 },
          uOpacity: { value: 0.4 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      },
    ],
    [tint, reducedMotion],
  );

  const groupRef = useRef<THREE.Group>(null);
  const ribbonGeoRef = useRef<THREE.BufferGeometry>(null);
  const ribbonMatRef = useRef<THREE.ShaderMaterial>(null);
  const glanceSpriteRef = useRef<THREE.Sprite>(null);
  const indLeftFRef = useRef<THREE.Mesh>(null);
  const indLeftRRef = useRef<THREE.Mesh>(null);
  const indRightFRef = useRef<THREE.Mesh>(null);
  const indRightRRef = useRef<THREE.Mesh>(null);
  const brakeLRef = useRef<THREE.Mesh>(null);
  const brakeRRef = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    const geo = ribbonGeoRef.current;
    if (geo) writeRibbonStrip(geo, ribbonPath, RIBBON_Y, RIBBON_HALF_W);
  }, [ribbonPath]);

  // Per-frame playback scratch — zero allocation.
  const ptRef = useRef(createTracePoint());
  const rollRef = useRef(0);

  useFrame((state, delta) => {
    const clock = clockRef.current;
    const group = groupRef.current;
    if (!clock || !group) return;
    const duration = trace.meta.durationSec;

    // Advance the shared clock (the ghost is the single time driver).
    let dtPlayback = 0;
    if (clock.playing) {
      dtPlayback = delta * clock.speed;
      clock.tSec += dtPlayback;
      const loop = clock.loop;
      const end = loop ? Math.min(loop.endSec, duration) : duration;
      if (clock.tSec > end) clock.tSec = loop ? loop.startSec : 0;
    }
    if (clock.tSec < 0) clock.tSec = 0;
    if (clock.tSec > duration) clock.tSec = duration;
    const t = clock.tSec;

    const pt = ptRef.current;
    sampleAt(trace, t, pt);

    // Pose: district (x, y) → three (x, GHOST_Y, −y); yaw = π − heading.
    group.position.set(pt.x, GHOST_Y, -pt.y);
    group.rotation.y = Math.PI - pt.headingDeg * DEG2RAD;

    // Wheels: roll with the trace speed at the playback rate, steer per trace.
    rollRef.current += ((pt.speedKmh / 3.6) / WHEEL_RADIUS_M) * dtPlayback;
    for (const w of wheels.current) {
      w.node.rotation.x = rollRef.current;
      w.node.rotation.y = w.front ? pt.steerRad : 0;
    }

    // Indicators blink on the trace clock (scrub-stable), brake lights latch.
    const blinkOn = t % BLINK_PERIOD_S < BLINK_PERIOD_S * 0.55;
    const left = pt.indicator === "left" && blinkOn;
    const right = pt.indicator === "right" && blinkOn;
    if (indLeftFRef.current) indLeftFRef.current.visible = left;
    if (indLeftRRef.current) indLeftRRef.current.visible = left;
    if (indRightFRef.current) indRightFRef.current.visible = right;
    if (indRightRRef.current) indRightRRef.current.visible = right;
    if (brakeLRef.current) brakeLRef.current.visible = pt.brakeOn;
    if (brakeRRef.current) brakeRRef.current.visible = pt.brakeOn;

    // Glance flash: any glance event within the window behind the playhead.
    const sprite = glanceSpriteRef.current;
    if (sprite) {
      let active = false;
      for (let i = 0; i < glances.length; i++) {
        const dt = t - glances[i].tSec;
        if (dt >= 0 && dt <= GLANCE_FLASH_S) {
          active = true;
          break;
        }
        if (glances[i].tSec > t) break;
      }
      sprite.visible = active;
    }

    const mat = ribbonMatRef.current;
    if (mat) mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const lampGeoArgs = useMemo<[number, number]>(() => [0.16, 0.12], []);

  return (
    <group>
      {/* Ghost car (pose group; inner group carries the GLB fit transform).
          visible=false (L2 ribbon-only) keeps the playback clock advancing —
          this group stays the single time driver either way. */}
      <group ref={groupRef} visible={showGhost}>
        <group scale={scale} position={[0, offsetY, 0]} rotation={[0, HERO_YAW, 0]}>
          <primitive object={model} />
        </group>

        {/* Indicator + brake lamp quads (car-local: +Z forward, +X left). */}
        <mesh ref={indLeftFRef} position={[0.78, 0.62, 1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indLeftRRef} position={[0.78, 0.62, -1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indRightFRef} position={[-0.78, 0.62, 1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indRightRRef} position={[-0.78, 0.62, -1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={brakeLRef} position={[0.55, 0.68, -2.0]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ff2020" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={brakeRRef} position={[-0.55, 0.68, -2.0]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ff2020" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>

        {/* Glance flash: mirror-check icon above the roof. */}
        <sprite ref={glanceSpriteRef} position={[0, 2.15, 0]} scale={[0.85, 0.85, 1]} visible={false}>
          <spriteMaterial map={glanceTexArgs[0]} transparent depthWrite={false} />
        </sprite>

        {/* Mistake demos carry the ❌ chrome — never a neutral pattern. */}
        {kind === "mistake" && showBadge ? (
          <sprite position={[0, 2.9, 0]} scale={[0.8, 0.8, 1]}>
            <spriteMaterial map={badgeTexArgs[0]} transparent depthWrite={false} />
          </sprite>
        ) : null}
      </group>

      {/* Full-path ground ribbon (shared A7 mesh builder). */}
      {showRibbon ? (
        <mesh frustumCulled={false} renderOrder={19}>
          <bufferGeometry ref={ribbonGeoRef}>
            <bufferAttribute attach="attributes-position" args={[ribbonBuffers.positions, 3]} />
            <bufferAttribute attach="attributes-aS" args={[ribbonBuffers.aS, 1]} />
            <bufferAttribute attach="attributes-aSide" args={[ribbonBuffers.aSide, 1]} />
            <bufferAttribute attach="index" args={[ribbonBuffers.index, 1]} />
          </bufferGeometry>
          <shaderMaterial ref={ribbonMatRef} args={ribbonMatArgs} />
        </mesh>
      ) : null}
    </group>
  );
}

useGLTF.preload(HERO_URL, DRACO_PATH);
