"use client";

/**
 * The live hero — a minimal dusk scene, deliberately NOT the simulator.
 *
 * WHAT IT IS ALLOWED TO IMPORT is the whole design. The simulator costs
 * ~9.8 MB of assets and 5.4 MB of JS (docs/80_FULL_AUDIT_2026-07-24), and a
 * landing page that touches any of it has already lost. So this file pulls:
 *   - three + @react-three/fiber (unavoidable — it IS the feature),
 *   - `SkyDome` and `GroundBackdrop` from sim/environment's public API, so
 *     the marketing sky and the product sky are literally the same shader,
 *   - the hero car GLB (139 KB, Draco) and the glTF-flavoured Draco decoder,
 *   - nothing else.
 * It does NOT pull the rule engine, Rapier, the traffic fleet, the world
 * builders, KTX2/Basis, the HDRI environment (1.5 MB) or the postprocessing
 * composer. If a future edit adds one of those, the reason this file exists
 * is gone.
 *
 * The frame budget is the phone tier from doc 82 §2.2 even though phones
 * never see this (heroCapability.ts sends them to the plate): ~14 draw calls,
 * ~66 k triangles, no shadow map, no composer, two lights. The gate is about
 * the WIRE cost, not the frame cost — so the frame cost is kept trivially
 * inside budget on purpose, and a desktop renders it at 60 fps with the fan
 * off. Canvas MSAA does the antialiasing (the `low` preset's approach); there
 * is no EffectComposer anywhere in this chunk.
 *
 * Everything animated is a pure function of elapsed seconds from
 * ./heroScene — see that file for why the loop is seamless and why nothing
 * accumulates.
 */

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  AdditiveBlending,
  Box3,
  Color,
  DataTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  LinearFilter,
  MathUtils,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import {
  ENVIRONMENT_PRESETS,
  GroundBackdrop,
  SkyDome,
  sunDirection,
  TONE_MAPPING_THREE,
} from "@/modules/sim/environment";
import {
  HERO_ASPHALT_ALBEDO,
  HERO_ASPHALT_ROUGHNESS,
  HERO_ASPHALT_VARIATION,
  HERO_ASPHALT_VARIATION_SCALE_M,
  HERO_PAINT_ALBEDO,
  HERO_PAINT_FADE_END_M,
  HERO_PAINT_FADE_START_M,
  HERO_PAINT_ROUGHNESS,
  HERO_ROAD_FRAGMENT_ALBEDO,
  HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR,
  HERO_ROAD_FRAGMENT_DECL,
  HERO_ROAD_FRAGMENT_ROUGHNESS,
  HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR,
  HERO_ROAD_PROGRAM_CACHE_KEY,
  HERO_ROAD_VERTEX_DECL,
  HERO_ROAD_VERTEX_DEPTH,
  HERO_ROAD_VERTEX_DEPTH_ANCHOR,
  HERO_ROAD_VERTEX_UV,
  HERO_ROAD_VERTEX_UV_ANCHOR,
} from "./heroRoadShader";
import {
  HERO_CAM_FAR_M,
  HERO_CAM_FOV_DEG,
  HERO_CAM_NEAR_M,
  HERO_DASH_MARK_M,
  HERO_DASH_PERIOD_M,
  HERO_LANE_WIDTH_M,
  HERO_LANE_X_M,
  HERO_MARK_WIDTH_M,
  HERO_ROAD_LENGTH_M,
  HERO_ROAD_WIDTH_M,
  heroCameraPose,
  roadScrollM,
  wheelSpinRad,
} from "./heroScene";

/** Same public asset the simulator uses — one car, one file, one cache entry. */
const HERO_CAR_URL = "/sim/vehicles/hero_car.glb";
/**
 * The glTF-flavoured Draco decoder (192 KB wasm) rather than the general one
 * the simulator loads from `/draco/` (286 KB). Both decode this GLB; the
 * glTF build is the one that only has to. 94 KB is a real fraction of a
 * marketing page's budget, and nothing here needs the general decoder's
 * point-cloud paths.
 */
const HERO_DRACO_PATH = "/draco/gltf/";

/** Fictional-vehicle proportions (ADR-001), matching HeroPlate's silhouette. */
const CAR_WIDTH_M = 1.85;
/** Metres ahead of the origin the car sits — the camera rig orbits this. */
const CAR_Z_M = 0;

/** Dusk is the whole identity: warm low sun, cold sky, lit lamps. */
const TIME_OF_DAY = "dusk" as const;

/**
 * Exposure for this shot, multiplying the renderer's tone map.
 *
 * The dusk preset ships at 1.1 (`presets.dusk.exposure`) because a DRIVER
 * needs to read signs, kerbs and a pedestrian's legs in that light. A hero
 * image has the opposite job: it is a dark instrument-cluster identity with
 * white type over it, and at 1.1 the golden sky washes to near-white and
 * takes the headline's contrast with it. 0.95 is the same scene later in the
 * blue hour — richer, and it is what makes the tail lamps read as lamps
 * instead of as clipped orange bars.
 */
const HERO_EXPOSURE = 0.95;

/**
 * How hard the generated dusk environment lights the car's own materials.
 *
 * Above 1 on purpose. The sun is west-south-west and the camera is astern, so
 * the surface the visitor actually sees is the one facing AWAY from the only
 * key light in the scene — physically correct, and it renders a £0 silhouette
 * where the product's best-looking asset is supposed to be. The simulator
 * solves the same problem with a 1.5 MB HDRI; here the ambient term is simply
 * turned up until the paint, the glass and the alloys read.
 */
const HERO_CAR_ENV_INTENSITY = 1.7;

/**
 * A second, dim, cool light from behind the camera.
 *
 * doc 82 §2.2 budgets one directional + one hemisphere for the SIMULATOR,
 * where every material in a city is paying for each light. This scene has one
 * car, one road plane and no shadow maps, so a second light costs one more
 * term in one more material and buys the rear-three-quarter separation that
 * stops the hero car from merging into its own road.
 */
const HERO_FILL_INTENSITY = 0.4;
const HERO_FILL_COLOR = "#8fb6e6";

/** Roadside ground. Darker and less saturated than the sim's #5e6931 verge:
 *  at this exposure the backdrop disc's green would be the brightest thing in
 *  the lower half of a frame that is meant to be about the road. */
const HERO_VERGE_ALBEDO = "#141a14";

/** One program, compiled once — hoisted so the identity is stable per frame. */
const roadProgramCacheKey = () => HERO_ROAD_PROGRAM_CACHE_KEY;

// ---------------------------------------------------------------------------
// Image-based lighting, generated rather than fetched
// ---------------------------------------------------------------------------

/**
 * A 32×64 equirectangular dusk gradient, built in code.
 *
 * The car's paint is a clearcoat MeshPhysicalMaterial and its canopy is
 * tinted glass; with no environment they render as black holes, which is the
 * one way this shot can look cheap. The simulator solves that with a 1.5 MB
 * HDRI (`public/sim/env/*.hdr`) — three times the entire rest of this
 * component's payload, for reflections nobody will inspect. 8 KB of generated
 * pixels carrying the same zenith→horizon→sun ramp as the sky dome gets the
 * glass and the chrome reading correctly, at zero bytes on the wire.
 *
 * three's renderer PMREM-filters an equirect `scene.environment` for us, so
 * the roughness response is real, not a mirror.
 */
function buildDuskEnvironment(): DataTexture {
  const width = 32;
  const height = 64;
  const sky = ENVIRONMENT_PRESETS[TIME_OF_DAY].sky;
  const zenith = new Color(sky.zenith);
  const horizon = new Color(sky.horizon);
  const sunTint = new Color(sky.sunTint);
  const ground = new Color(ENVIRONMENT_PRESETS[TIME_OF_DAY].light.hemisphere.groundColor);

  // The sun's azimuth decides WHERE the hot spot sits, so the highlight that
  // slides along the car's flank agrees with the directional light.
  const sunAz = ENVIRONMENT_PRESETS[TIME_OF_DAY].light.sun.azimuthDeg;
  const sunU = ((sunAz / 360) % 1 + 1) % 1;

  const data = new Uint8Array(width * height * 4);
  const scratch = new Color();
  for (let y = 0; y < height; y += 1) {
    // v = 0 at the top of the sphere.
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      if (v < 0.5) {
        // Sky half: zenith → horizon, curved so the warmth hugs the horizon.
        const t = Math.pow(v / 0.5, sky.horizonCurve);
        scratch.copy(zenith).lerp(horizon, t);
        // Sun hot spot — wrapped angular distance, widened near the horizon.
        const du = Math.min(Math.abs(u - sunU), 1 - Math.abs(u - sunU));
        const glow = Math.max(0, 1 - du / 0.16) * Math.max(0, 1 - Math.abs(v - 0.47) / 0.14);
        scratch.lerp(sunTint, glow * 0.85);
      } else {
        // Ground half: the horizon colour falling into the hemisphere's
        // ground bounce, so reflections in the flanks are not sky-only.
        scratch.copy(horizon).lerp(ground, (v - 0.5) / 0.5);
      }
      const i = (y * width + x) * 4;
      data[i] = Math.round(MathUtils.clamp(scratch.r, 0, 1) * 255);
      data[i + 1] = Math.round(MathUtils.clamp(scratch.g, 0, 1) * 255);
      data[i + 2] = Math.round(MathUtils.clamp(scratch.b, 0, 1) * 255);
      data[i + 3] = 255;
    }
  }

  const texture = new DataTexture(data, width, height);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function DuskEnvironment() {
  // `attach="environment"` is R3F's declarative form of `scene.environment =`:
  // it wires and unwires with the component, so there is no effect to keep in
  // sync and no path where a texture outlives the canvas.
  const texture = useMemo<Texture>(() => buildDuskEnvironment(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive object={texture} attach="environment" />;
}

// ---------------------------------------------------------------------------
// Lighting rig — the dusk preset's two lights, and nothing else
// ---------------------------------------------------------------------------

function DuskRig() {
  const preset = ENVIRONMENT_PRESETS[TIME_OF_DAY];

  // Static values, unlike SimEnvironment's damped rig: this scene never
  // changes time of day or weather, so there is nothing to animate and no
  // reason to pay for a per-frame damp.
  const sun = useMemo(() => {
    const dir = sunDirection(preset.light.sun);
    return new Vector3(dir.x, dir.y, dir.z).multiplyScalar(140);
  }, [preset]);

  return (
    <>
      {/* Fog is what buries the far end of the road and blends it into the
          dome's horizon band — the same FogExp2 the simulator uses, at the
          same dusk density, so the two horizons match. */}
      <fogExp2 attach="fog" args={[preset.fog.color, preset.fog.density]} />
      <hemisphereLight
        intensity={preset.light.hemisphere.intensity}
        color={preset.light.hemisphere.skyColor}
        groundColor={preset.light.hemisphere.groundColor}
      />
      {/* No shadow map: doc 82 §2.2's phone tier has zero, the car's own
          contact shadow is faked below for a fraction of the cost, and a
          shadow camera would be the single most expensive object here. */}
      <directionalLight
        position={sun}
        intensity={preset.light.sun.intensity}
        color={preset.light.sun.color}
        castShadow={false}
      />
      {/* The fill, from behind the camera's shoulder (see HERO_FILL_*). */}
      <directionalLight
        position={[6, 5, -22]}
        intensity={HERO_FILL_INTENSITY}
        color={HERO_FILL_COLOR}
        castShadow={false}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Road
// ---------------------------------------------------------------------------

function HeroRoad() {
  const uniforms = useMemo(
    () => ({
      uScrollM: { value: 0 },
      uRoadWidthM: { value: HERO_ROAD_WIDTH_M },
      uRoadLengthM: { value: HERO_ROAD_LENGTH_M },
      uDashPeriodM: { value: HERO_DASH_PERIOD_M },
      uDashDuty: { value: HERO_DASH_MARK_M / HERO_DASH_PERIOD_M },
      uMarkWidthM: { value: HERO_MARK_WIDTH_M },
      uLaneWidthM: { value: HERO_LANE_WIDTH_M },
      uPaintColor: { value: new Color(HERO_PAINT_ALBEDO) },
      uPaintRoughness: { value: HERO_PAINT_ROUGHNESS },
      uPaintFadeStartM: { value: HERO_PAINT_FADE_START_M },
      uPaintFadeEndM: { value: HERO_PAINT_FADE_END_M },
      uVariation: { value: HERO_ASPHALT_VARIATION },
      uVariationScaleM: { value: HERO_ASPHALT_VARIATION_SCALE_M },
    }),
    [],
  );

  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${HERO_ROAD_VERTEX_DECL}`)
        .replace(
          HERO_ROAD_VERTEX_UV_ANCHOR,
          `${HERO_ROAD_VERTEX_UV_ANCHOR}\n${HERO_ROAD_VERTEX_UV}`,
        )
        .replace(
          HERO_ROAD_VERTEX_DEPTH_ANCHOR,
          `${HERO_ROAD_VERTEX_DEPTH_ANCHOR}\n${HERO_ROAD_VERTEX_DEPTH}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${HERO_ROAD_FRAGMENT_DECL}`)
        .replace(
          HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR,
          `${HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR}\n${HERO_ROAD_FRAGMENT_ALBEDO}`,
        )
        .replace(
          HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR,
          `${HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR}\n${HERO_ROAD_FRAGMENT_ROUGHNESS}`,
        );
    },
    [uniforms],
  );

  // The pattern scrolls; the mesh never moves. One uniform write per frame,
  // zero allocations, and `roadScrollM` wraps so the float cannot drift.
  useFrame((state) => {
    uniforms.uScrollM.value = roadScrollM(state.clock.elapsedTime);
  });

  return (
    <>
      {/* The verge. GroundBackdrop sits 35 cm BELOW the road (its own
          GROUND_BACKDROP_Y, so it tucks under a district's terrain), and with
          no terrain here that step lands right beside the tarmac and reads as
          a ledge at grazing angles. One wide, flat plane carries the ground
          out to where the fog has closed, and the step happens 70 m away
          where nobody can see it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, HERO_ROAD_LENGTH_M / 2 - 24]}>
        <planeGeometry args={[140, HERO_ROAD_LENGTH_M, 1, 1]} />
        <meshStandardMaterial color={HERO_VERGE_ALBEDO} roughness={1} metalness={0} />
      </mesh>

      {/* SOUTHBOUND. The plane's UVs run local +Y → world −Z once it is laid
          flat, but the shot drives toward +Z (due south, where the sky dome
          puts Vitosha). Turning the mesh inside a flipped group keeps
          `zM = uv.y · length + scroll` reading "metres into the distance",
          which is the whole reason the shader is legible. */}
      <group rotation={[0, Math.PI, 0]}>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          // Pushed forward so the plane starts behind the camera and ends in
          // the fog: nothing in frame ever shows an edge of the road.
          position={[0, 0, -HERO_ROAD_LENGTH_M / 2 + 24]}
          receiveShadow={false}
          castShadow={false}
        >
          <planeGeometry args={[HERO_ROAD_WIDTH_M, HERO_ROAD_LENGTH_M, 1, 1]} />
          <meshStandardMaterial
            color={HERO_ASPHALT_ALBEDO}
            roughness={HERO_ASPHALT_ROUGHNESS}
            metalness={0}
            onBeforeCompile={onBeforeCompile}
            customProgramCacheKey={roadProgramCacheKey}
          />
        </mesh>
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

/** The four rigged wheel nodes, in GLB naming order. */
const WHEEL_NAMES = ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"] as const;

function HeroCar() {
  const { scene: source } = useGLTF(HERO_CAR_URL, HERO_DRACO_PATH);

  // Clone before touching anything: drei caches the loaded scene and the
  // simulator loads the SAME url, so mutating it here would follow a student
  // into a lesson. `clone` shares geometries and MATERIALS, so the materials
  // are cloned individually below before their envMapIntensity is raised.
  const car = useMemo(() => {
    const copy = source.clone(true);
    const owned: Material[] = [];
    const own = (shared: Material): Material => {
      const mine = shared.clone() as MeshStandardMaterial;
      mine.envMapIntensity = HERO_CAR_ENV_INTENSITY;
      owned.push(mine);
      return mine;
    };
    copy.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return { root: copy, owned };
  }, [source]);

  // The clones are ours, so freeing them is ours too — React 19 Strict Mode
  // mounts this twice in dev, which is one leaked material set per reload.
  useEffect(() => () => car.owned.forEach((material) => material.dispose()), [car]);

  const fit = useMemo(() => {
    const box = new Box3().setFromObject(car.root);
    const size = new Vector3();
    box.getSize(size);
    // Scale by WIDTH, not length: width is what the eye calibrates a car
    // against, and the model authors it at 2.075 m (a touch wide).
    const scale = size.x > 0 ? CAR_WIDTH_M / size.x : 1;
    // …then drop it so the tyres kiss the asphalt instead of hovering.
    return { scale, y: -box.min.y * scale };
  }, [car]);

  const wheels = useMemo(
    () =>
      WHEEL_NAMES.map((name) => car.root.getObjectByName(name)).filter(
        (node): node is Object3D => node !== undefined,
      ),
    [car],
  );

  useFrame((state) => {
    const spin = wheelSpinRad(state.clock.elapsedTime);
    for (const wheel of wheels) wheel.rotation.x = spin;
  });

  return (
    // The GLB authors its nose at −Z (front wheels sit at z = −1.52), and the
    // shot drives south (+Z), so it is turned to face the way it is going —
    // the same π HeroCarBody applies, arrived at from the opposite direction.
    // The tail lamps therefore face the camera, which is the point.
    <group
      position={[HERO_LANE_X_M, fit.y, CAR_Z_M]}
      rotation={[0, Math.PI, 0]}
      scale={fit.scale}
    >
      <primitive object={car.root} />
    </group>
  );
}

/**
 * A fake contact shadow: one additive-free dark quad with a radial falloff,
 * drawn on the road under the car.
 *
 * A real shadow map would cost a second render of the whole scene from the
 * sun and a 1024² depth texture, to darken about 2 % of the frame. drei's
 * <ContactShadows> costs the same second pass. This is one draw call, one
 * 12-line shader and no texture, and at this camera height nobody can tell.
 */
function ContactPatch() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HERO_LANE_X_M, 0.012, CAR_Z_M]}>
      <planeGeometry args={[4.4, 7.2, 1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={{}}
        vertexShader={/* glsl */ `
          varying vec2 vUvPatch;
          void main() {
            vUvPatch = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec2 vUvPatch;
          void main() {
            float d = length((vUvPatch - 0.5) * vec2(2.0, 1.35));
            float a = smoothstep(0.62, 0.0, d);
            gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.62);
          }
        `}
      />
    </mesh>
  );
}

/**
 * The car's own headlight throw, as a single additive quad on the road ahead.
 *
 * Two real SpotLights (what VehicleRig does in the sim) would add two shadow-
 * capable lights and recompile every material in the scene. At dusk the throw
 * is a soft pool, not a hard cone, so a painted pool is not a compromise —
 * it is the correct primitive.
 */
function HeadlightPool() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HERO_LANE_X_M, 0.014, CAR_Z_M + 15]}>
      <planeGeometry args={[9, 26, 1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={{}}
        vertexShader={/* glsl */ `
          varying vec2 vUvPool;
          void main() {
            vUvPool = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec2 vUvPool;
          void main() {
            // Narrow near the car, spreading and dimming with distance —
            // the shape a low beam actually paints on wet tarmac. The plane
            // is laid flat with rotation.x = −π/2, which maps its local +Y
            // (v = 1) to world −Z, i.e. BACK toward the camera — so v is
            // inverted here and the near end of the pool is v = 1.
            float along = 1.0 - vUvPool.y;
            float spread = mix(0.16, 0.5, along);
            float across = abs(vUvPool.x - 0.5) / spread;
            float body = smoothstep(1.0, 0.0, across);
            float fade = smoothstep(0.0, 0.18, along) * smoothstep(1.0, 0.55, along);
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.76) * body * fade * 0.34, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Camera + readiness
// ---------------------------------------------------------------------------

function CameraRig() {
  const camera = useThree((state) => state.camera);
  const target = useRef(new Vector3());

  useFrame((state) => {
    const pose = heroCameraPose(state.clock.elapsedTime);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    target.current.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(target.current);
  });

  return null;
}

/**
 * Fires once the scene has actually drawn a frame WITH the car in it.
 *
 * It sits inside the same <Suspense> as the car on purpose: React only mounts
 * it after the GLB has resolved, so "ready" cannot mean "an empty road is on
 * screen". The stage uses it to start the crossfade — announcing readiness
 * early would flash a carless road over the finished plate, which is strictly
 * worse than the plate.
 */
function FirstFrame({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    onReady?.();
  });
  return null;
}

export interface HeroScene3DProps {
  /** Called after the first frame that includes the car. */
  onReady?: () => void;
  /**
   * Stop the render loop entirely. The stage sets this when the hero scrolls
   * out of view or the tab is hidden — an idle WebGL canvas still burns a
   * GPU frame every 16 ms, and this one sits at the top of a page people
   * scroll past.
   */
  paused?: boolean;
}

export default function HeroScene3D({ onReady, paused = false }: HeroScene3DProps) {
  return (
    <Canvas
      // The desktop tier of doc 82 §2.2. The gate (heroCapability.ts) has
      // already established this is a desktop; capping at 1.5 keeps a 4K
      // panel from quadrupling the fill for a background element.
      dpr={[1, 1.5]}
      frameloop={paused ? "never" : "always"}
      camera={{
        fov: HERO_CAM_FOV_DEG,
        near: HERO_CAM_NEAR_M,
        far: HERO_CAM_FAR_M,
        // Astern of a southbound car. CameraRig overwrites this on the first
        // frame; it matters only so frame zero is not shot from inside the car.
        position: [0, 1.6, -8],
      }}
      gl={{
        // No composer in this chunk, so canvas MSAA is the antialiasing —
        // the same trade the simulator's `low` tier makes, and the only thing
        // that keeps a 0.15 m lane line from crawling.
        antialias: true,
        powerPreference: "high-performance",
        stencil: false,
        // The plate sits behind the canvas and must show through until the
        // scene draws its first frame.
        alpha: true,
        // The grade, set on the renderer at construction rather than patched
        // in an effect. AgX is the operator the whole product is authored
        // against (doc 71 §4.3 — it preserves hue under the warm low sun
        // instead of skewing orange to yellow); R3F would otherwise default
        // to ACES, which the sky presets were never tuned for.
        toneMapping: TONE_MAPPING_THREE,
        toneMappingExposure: HERO_EXPOSURE,
      }}
      // Purely decorative: the section around it owns the accessible name,
      // and a canvas in the tab order is a keyboard trap with nothing in it.
      aria-hidden
      tabIndex={-1}
      style={{ pointerEvents: "none" }}
    >
      {/* `skyline` is passed explicitly, never left to the default — the
          environment module's own guard (skyline.test.ts) requires it at
          every render site, because the regression it exists to stop was a
          working gate that no call site ever forwarded. Here it is always ON:
          the massif at the end of the road IS the shot (see heroScene.ts on
          why the camera faces south). Written `={true}` rather than as the
          JSX shorthand because the guard greps for a literal `skyline=`. */}
      <SkyDome timeOfDay={TIME_OF_DAY} skyline={true} />
      <GroundBackdrop />
      <DuskRig />
      <DuskEnvironment />
      <CameraRig />
      <HeroRoad />
      <HeadlightPool />
      <Suspense fallback={null}>
        <HeroCar />
        <ContactPatch />
        <FirstFrame onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}

// Warm the GLB + Draco decoder as soon as this chunk is parsed. By the time
// React mounts the Canvas the fetch is already in flight, which removes the
// one visible stall between "3D decided" and "3D on screen".
useGLTF.preload(HERO_CAR_URL, HERO_DRACO_PATH);
