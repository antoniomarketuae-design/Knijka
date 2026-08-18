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
 *   - glance events flash a mirror icon sprite ON the roof;
 *   - the full path draws as a ground ribbon through the SHARED A7 ribbon
 *     mesh builder (ribbonStrip.ts) — the reference image's colored lines.
 *
 * Two channels answer catalogue sweep 161 rather than the trace, and each is
 * derived beside its own constants below: a PROXIMITY FADE, because a ghost
 * drawn at the camera is drawn through the student's dashboard, and a
 * FOOTPRINT HALO, because on a phone there is no legend to say which of the
 * cars on the carriageway is the hologram.
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
/** Indicator/brake quad opacity. Lifted out of the JSX so the proximity fade
 *  below scales the lamps from the SAME number the meshes render at. */
const LAMP_OPACITY = 0.95;
/** Ground clearance of the pose group (ROAD_Y — tyres kiss the asphalt). */
const GHOST_Y = 0.02;
const DEG2RAD = Math.PI / 180;
/** Indicator blink period, s (real cars flash at ~90/min). */
const BLINK_PERIOD_S = 0.75;
/** Mirror-icon flash window after a glance event, s. */
const GLANCE_FLASH_S = 0.9;

// ---------------------------------------------------------------------------
// THE GHOST DRAWN THROUGH THE STUDENT'S OWN COCKPIT (catalogue sweep 161)
// ---------------------------------------------------------------------------
/**
 * Four of the sweep's eight defects against this file are ONE defect: the
 * ghost is posed straight from the trace and nothing ever asked where the
 * CAMERA is, so a translucent hero car is free to be drawn exactly where the
 * student's own body is.
 *
 *   sc-park-van/mobile-right/05-stopped.png       (critical) — bonnet, screen
 *     and A-pillars laid over the dashboard; „0 км/ч" and „D" are read
 *     THROUGH a second car's body.
 *   sc-follow-distance/mobile-right/04-t077s.png  — the same, from the
 *     arrival frame onward, on both platforms.
 *   sc-mw-emergency-lane/mobile-right/04-t209s.png — the same at t209 s.
 *   sc-jx-blocked-exit/mobile-right/06-waited.png — one car-length ahead,
 *     burying the stop line and the light the lesson is asking about.
 *
 * It is NOT a pose bug and there is no pose to fix: playback loops
 * (`clock.tSec = 0` in useFrame), so on every lap the demonstration sweeps
 * through wherever the student has stopped. Nor is „the ghost is opaque on
 * mobile" (sc-zebra-approach, sc-jx-blocked-exit) a second defect: the shell
 * has `depthWrite = false` and renders both faces, so at contact range the eye
 * composites ~6 surfaces — 1 − (1 − 0.45)^6 = 0.97, i.e. solid. One cause,
 * and the cause is that the ghost is allowed to occupy the viewer.
 *
 * The law is geometric, not aesthetic:
 *   HIDE 2.4 m — CHASSIS_HALF_EXTENTS.z (2.02) plus the 0.255 m COCKPIT_EYE
 *     sits behind the ego's centre, plus a hand's margin. Inside it the camera
 *     is inside the shell and nothing is drawn at all.
 *   FULL 8.0 m — two car lengths (4.04 m each). Past it the ghost is a lead
 *     vehicle rather than an obstruction and pays nothing.
 * Smoothstep between them. Checked against the frames above: at the sc-jx stop
 * line (~4.5 m) each surface drops to 0.45 × 0.32 = 0.14 and the stop line
 * reads through; at the sc-zebra crossing (~15 m) the ghost is untouched —
 * which matters, because a ghost nobody can see is the same failure as a ghost
 * nobody can see past.
 */
export const GHOST_FADE_HIDE_M = 2.4;
export const GHOST_FADE_FULL_M = 8.0;

/** Ghost-surface opacity multiplier at `distanceM` from the camera. */
export function ghostProximityFade(distanceM: number): number {
  // Written as `!(d > HIDE)` rather than `d <= HIDE` so a NaN distance hides
  // the ghost instead of leaving it at full strength over the dashboard.
  if (!(distanceM > GHOST_FADE_HIDE_M)) return 0;
  if (distanceM >= GHOST_FADE_FULL_M) return 1;
  const t = (distanceM - GHOST_FADE_HIDE_M) / (GHOST_FADE_FULL_M - GHOST_FADE_HIDE_M);
  return t * t * (3 - 2 * t);
}

/** One fadeable ghost surface: its material and the opacity that material
 *  renders at when the ghost is at full strength. */
export interface GhostFadeTarget {
  material: { opacity: number };
  baseOpacity: number;
}

/** Scale every ghost surface by `fade`. Allocation-free — runs per frame. */
export function applyGhostFade(targets: readonly GhostFadeTarget[], fade: number): void {
  for (let i = 0; i < targets.length; i++) {
    targets[i].material.opacity = targets[i].baseOpacity * fade;
  }
}

// ---------------------------------------------------------------------------
// THE GLANCE MARKER'S ANCHOR (sc-pe-zone-living/pc-wrong/04-t017s.png)
// ---------------------------------------------------------------------------
/**
 * That frame photographs the 👀 quad reading as a pair of cartoon eyes pasted
 * on an apartment block three storeys up. Measured on an 8× crop of it, using
 * the ghost's own 1.70 m width (CHASSIS_HALF_EXTENTS.x × 2 — the fit target
 * below) as the scale bar, 680 crop px wide, i.e. 400 crop px/m:
 *
 *   ghost roofline            475 px above the tyre contact = 1.19 m
 *   old quad (y 2.15, s 0.85) lower edge                    = 1.725 m
 *   → 0.53 m of EMPTY AIR between the roof and the marker
 *   old glyph                 255 × 230 px                  = 0.64 × 0.58 m
 *   → 38 % of the car's own width, floating free of it
 *
 * Nothing was at the wrong depth — the sprite is depth-tested and really was
 * in front of the facade. What was wrong is that at that size, with that much
 * air beneath it, the marker has no visible owner, so the eye gives it to the
 * nearest thing that has a surface. Anchoring it on the roof and cutting it to
 * icon size gives it one.
 */
export const GHOST_WIDTH_M = CHASSIS_HALF_EXTENTS.x * 2;
export const GHOST_ROOF_Y = 1.19;
export const GLANCE_ICON_SCALE = 0.46;
export const GLANCE_ICON_Y = 1.46;
/** Above this much air the marker has stopped belonging to the car. */
export const GLANCE_ANCHOR_MAX_GAP_M = 0.25;
/** Empty air between the ghost's roofline and the marker's lower edge, m. */
export function glanceIconGapM(
  iconY: number,
  iconScale: number,
  roofY: number = GHOST_ROOF_Y,
): number {
  return iconY - iconScale / 2 - roofY;
}

// ---------------------------------------------------------------------------
// THE FOOTPRINT HALO — „which of these cars is the hologram?" (sweep 161)
// ---------------------------------------------------------------------------
/**
 * sc-signal-flashing/mobile-right/04-t017s.png and
 * sc-rb-exit-signal/mobile-right/06-waited.png both photograph the ghost
 * sharing a carriageway with solid NPC traffic with no distinction but
 * transparency; sc-zebra-approach/mobile-right/06-waited.png adds the reason
 * transparency is not enough on its own — the legend that explains the blue
 * („синя — пътят на колата-сянка") is desktop chrome, and a phone gets none.
 * The composite arithmetic above says the same thing from the other end: at
 * close range „translucent" stops being translucent.
 *
 * The halo is an ELLIPSE, not a ring. A circle large enough to clear a 4.04 m
 * car is 4.9 m across and reads as a lit patch of road rather than as THIS
 * car's footprint; the radii instead hug the chassis box
 * (CHASSIS_HALF_EXTENTS + ≤0.43 m) and carry the ribbon's tint, which is what
 * binds the car to the blue path the legend names.
 */
export const HALO_RX = 1.25;
export const HALO_RZ = 2.45;
/** How far outside the chassis box a halo radius may sit before it has
 *  stopped tracing the car and started lighting the road. */
export const HALO_MARGIN_MAX_M = 0.6;
const HALO_OPACITY = 0.5;
/** Local to the pose group (world 0.04 m — above the road, under RIBBON_Y). */
const HALO_Y = 0.02;
/** Unit ring, scaled anisotropically to HALO_RX × HALO_RZ. */
const HALO_RING_OUTER = 1.16;
const HALO_SEGMENTS = 48;

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
  const badgeSpriteRef = useRef<THREE.Sprite>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
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

  /** The ❌ sprite exists only on mistake demos — and only when the caller
   *  wants it, which is what the fade list has to be rebuilt for. */
  const hasBadge = kind === "mistake" && showBadge;

  // Every surface the proximity fade owns, gathered ONCE after commit — the
  // shell, the six lamp quads, the roof markers and the halo. A per-frame
  // `traverse` would rediscover the same ~30 nodes on every frame.
  const fadeTargets = useRef<GhostFadeTarget[]>([]);
  useLayoutEffect(() => {
    const list: GhostFadeTarget[] = [];
    for (const m of ghostMaterials) list.push({ material: m, baseOpacity: GHOST_OPACITY });
    for (const r of [indLeftFRef, indLeftRRef, indRightFRef, indRightRRef, brakeLRef, brakeRRef]) {
      const mat = r.current?.material;
      if (mat && !Array.isArray(mat)) list.push({ material: mat, baseOpacity: LAMP_OPACITY });
    }
    const glanceMat = glanceSpriteRef.current?.material;
    if (glanceMat) list.push({ material: glanceMat, baseOpacity: 1 });
    const badgeMat = hasBadge ? badgeSpriteRef.current?.material : undefined;
    if (badgeMat) list.push({ material: badgeMat, baseOpacity: 1 });
    if (haloMatRef.current) list.push({ material: haloMatRef.current, baseOpacity: HALO_OPACITY });
    fadeTargets.current = list;
  }, [ghostMaterials, hasBadge]);

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

    // Proximity fade — the ghost may never be drawn on top of the viewer.
    // `group.position` is world (the parent <group> carries no transform), so
    // this is the camera-to-ghost-origin distance with no allocation.
    const fade = showGhost ? ghostProximityFade(group.position.distanceTo(state.camera.position)) : 0;
    applyGhostFade(fadeTargets.current, fade);
    // Inside the shell there is nothing worth submitting; the clock above has
    // already advanced, so the ghost stays the single time driver either way.
    group.visible = showGhost && fade > 0;

    const mat = ribbonMatRef.current;
    if (mat) mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const lampGeoArgs = useMemo<[number, number]>(() => [0.16, 0.12], []);
  const haloGeoArgs = useMemo<[number, number, number]>(
    () => [1, HALO_RING_OUTER, HALO_SEGMENTS],
    [],
  );

  return (
    <group>
      {/* Ghost car (pose group; inner group carries the GLB fit transform).
          visible=false (L2 ribbon-only) keeps the playback clock advancing —
          this group stays the single time driver either way. */}
      <group ref={groupRef} visible={showGhost}>
        <group scale={scale} position={[0, offsetY, 0]} rotation={[0, HERO_YAW, 0]}>
          <primitive object={model} />
        </group>

        {/* Footprint halo: the ghost's one distinction from solid traffic that
            survives both range and contact (see „THE FOOTPRINT HALO"). Unit
            ring scaled to the chassis ellipse; it rides the pose group, so it
            turns with the car and fades with it. */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, HALO_Y, 0]}
          scale={[HALO_RX, HALO_RZ, 1]}
          renderOrder={18}
        >
          <ringGeometry args={haloGeoArgs} />
          <meshBasicMaterial ref={haloMatRef} color={tint} transparent opacity={HALO_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>

        {/* Indicator + brake lamp quads (car-local: +Z forward, +X left). */}
        <mesh ref={indLeftFRef} position={[0.78, 0.62, 1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indLeftRRef} position={[0.78, 0.62, -1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indRightFRef} position={[-0.78, 0.62, 1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={indRightRRef} position={[-0.78, 0.62, -1.95]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ffb300" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={brakeLRef} position={[0.55, 0.68, -2.0]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ff2020" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={brakeRRef} position={[-0.55, 0.68, -2.0]} visible={false}>
          <planeGeometry args={lampGeoArgs} />
          <meshBasicMaterial color="#ff2020" transparent opacity={LAMP_OPACITY} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>

        {/* Glance flash: mirror-check icon ON the roof, not floating over it
            — the numbers and the frame that produced them are above. */}
        <sprite
          ref={glanceSpriteRef}
          position={[0, GLANCE_ICON_Y, 0]}
          scale={[GLANCE_ICON_SCALE, GLANCE_ICON_SCALE, 1]}
          visible={false}
        >
          <spriteMaterial map={glanceTexArgs[0]} transparent depthWrite={false} />
        </sprite>

        {/* Mistake demos carry the ❌ chrome — never a neutral pattern. */}
        {hasBadge ? (
          <sprite ref={badgeSpriteRef} position={[0, 2.9, 0]} scale={[0.8, 0.8, 1]}>
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
