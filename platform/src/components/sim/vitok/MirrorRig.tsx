"use client";

// A4 functional mirrors — render-to-texture onto the GLB mirror glass.
//
// Three WebGLRenderTargets (rear 256x96, doors 192x128) fed by mirror-eye
// PerspectiveCameras parented to the chassis at the GLB mirror-glass
// positions, all looking BACKWARD (chassis -Z; the cars' forward is +Z, so an
// unrotated camera already faces the rear). The horizontal mirror-image flip
// and the vertical orientation are applied HERE, as a uv transform on the
// render target's own texture (`center`/`repeat` below) — they used to rely on
// VitokCockpit.ensureQuadUVs(mirrorU), which only fires when the geometry
// ships no UVs, and the interior GLB now ships them. See the REF 7 block above
// MIRROR_DEFS.
//
// RECURSION / SELF-VIEW GUARD: the mirror cameras keep the default layer-0
// mask while the whole cabin (interior GLB, mirror quads, hotspot proxies,
// windshield plane) lives on INTERIOR_LAYER — a mirror pass can never see a
// mirror, so no feedback loop is possible. Shadow-map auto-update is
// suspended around the pass so the main render's shadow maps are reused.
//
// PERF BUDGET (documented per doc 68 A4, tightened after the 0d1c922 FPS
// regression — once the mirrors started actually rendering, each pass was a
// FULL district re-render at far 560):
//   targets: rear 256x96 (24.6k px) + 2x 160x96 (15.4k px each) ≈ 0.45 MB
//   RGBA16F + depth total (HalfFloat so the composer tone-maps mirror
//   content identically to the direct view — see the aim-table comment).
//   cadence (MIRROR_CADENCE / LOW_REAR_CADENCE): at most ONE mirror pass per
//   frame —
//     low    = rear only, every 8th frame (doc 62 #44 — the rear mirror is
//              safety-critical; doors keep the authored dark-gloss glass.
//              4 → 8 is doc 91 §I21; the rationale is on LOW_REAR_CADENCE);
//     medium = rear only, rendered every 2nd frame;
//     high   = rear every 2nd frame, doors every 4th (staggered on the
//              rear's off-frames, phases 1 and 3).
//   REDUCED SCENE per pass: a PER-INSTANCE cull (mirrorInstanceCull.ts) drops
//   every InstancedMesh with no instance inside the mirror's own cone — the
//   thing three cannot do, and the only cut that was ever big here: 97.3 % of
//   the triangles this pass submitted could not appear in it. The 200 m far
//   plane (vs the main camera's 900) bounds the merged non-instanced world,
//   the fog density is floored so geometry fades out BEFORE that boundary
//   instead of popping at it, and the (scale-invariant) sky dome is shrunk
//   into the frustum. Shadows are frozen (main pass's maps reused); the cabin
//   is layer-excluded; the pass is a raw gl.render — no composer/
//   postprocessing ever runs for a mirror.
//   Passes only run at all while the cockpit camera is live (`active`).
//
// THIS LINE IS NOT „THE MIRROR DOES NOT EXIST IN THE CHASE VIEW" — 2026-08-03.
// It has now been cited twice as the cause of founder item 44 („I drive from
// the back of the car POV and I dont see Rear Mirror at all … we must put Rear
// Mirror some small window in the POV after pressing C"), and it is not. This
// file feeds the three PHYSICAL GLASS QUADS inside the cabin GLB. In the chase
// camera the cabin is not in frame, so a pass here would render a mirror image
// onto geometry nobody can see — gating it on `active` is a pure saving and
// removing the gate would put the FPS back without putting a mirror on screen.
//
// The chase-view mirror is a DIFFERENT rig and it is built: a camera-locked
// quad fed by its own backward pass, permanent at REAR_VIEW_IDLE_SCALE and
// grown to full size on a held Q/E/F glance. It lives in
// `components/sim/CameraRig.tsx` („CHASE REAR-VIEW WINDOW"), with its geometry
// and its ≤10 %-of-screen contract in `modules/sim/scene/chaseRearView.ts`, and
// PlayAreaStyles steps the DOM rail below it (`--sim-mirror-h`).
//
// Photographed on 2026-08-03 at 852×393, the founder's own device profile: the
// window sits at the top centre of the chase frame at rest and slides to the
// right of the frame while E is held, with `--sim-mirror-h: 65px` and
// `--sim-glance-h: 88px` published on <html>. If the row is ever re-opened,
// re-open it against THAT rig.
//
// GRADING IS UNTOUCHED: mirror glances stay camera/key/click events through
// CabinControls.glance() — RTT is visual truth, not the graded signal.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  FogExp2,
  HalfFloatType,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
  WebGLRenderTarget,
  type Mesh,
  type Object3D,
} from "three";
import { SKY_DOME_NAME } from "@/modules/sim/environment";
import { COCKPIT_EYE } from "@/modules/sim/vehicle";
import { renderMirrorPass } from "@/modules/sim/scene/vitok/mirrorPass";
import { cullInstancedForMirror } from "@/modules/sim/scene/vitok/mirrorInstanceCull";
import { loadQualityPreset } from "../lesson-ui/QualityPresetSelector";

/**
 * The interior GLB's mount offset along +Y, i.e. `-VitokCockpit.INTERIOR_Y_OFFSET`
 * (chassis y = authored y − 0.55). Duplicated as a literal rather than imported
 * because VitokCockpit imports THIS module — the pair would be a cycle. The
 * mount also carries yaw π, which is why x and z flip sign below.
 */
const INTERIOR_MOUNT_Y_OFFSET = 0.55;

/**
 * Extra drop of the rear-mirror assembly, metres (REF 8, second half). The
 * authored stalk approaches the mirror from above and its underside projects
 * BELOW the glass's top edge over the last ~120 mm — which is why, in every
 * frame from round 1 onward, the arm appeared to end INSIDE the reflection.
 * Nothing can hide the arm there (it is nearer the eye than the housing), so
 * the glass moves instead: 14 mm down is ~19 px at 1440×900, enough that the
 * arm meets the housing's top rim with clearance and the reflection is a clean
 * rectangle. The cockpit-camera contract asserts only that the mirror's fy
 * stays ≤ 0.97 (0.745 then, 0.889 after the B58 raise — still inside the band).
 *
 * B58 KEPT THIS UNCHANGED ON PURPOSE. The raise moved the authored stalk and
 * the glass node by the same 105 mm, so the geometry this constant answers —
 * the stalk's underside crossing the glass's top edge — is the same geometry it
 * always was. (It is in fact 7.5 mm slacker now, because the eye-ray lift below
 * eats part of a raised node's move; the drop is therefore, if anything,
 * generous. Left alone: re-tuning a verified 14 mm to save 7 is how a fixed
 * frame becomes an unfixed one.)
 */
const MIRROR_DROP_M = 0.014;

export interface MirrorMeshes {
  left: Mesh | null;
  right: Mesh | null;
  rear: Mesh | null;
}

type MirrorKind = keyof MirrorMeshes;

interface MirrorDef {
  /** Render-target size — small on purpose; mirrors are ~0.1-0.2 m of glass. */
  width: number;
  height: number;
  /** Vertical FOV (deg) approximating the real glass's angular coverage. */
  fovDeg: number;
  /** Camera position, chassis-local (m) — the GLB mirror-glass positions
   *  (authored node transforms through the yaw-π / y-0.55 interior mount). */
  pos: readonly [number, number, number];
  /** Small outward yaw (doors) so the adjacent lane fills the glass, and a
   *  touch of down-pitch to keep road in frame. YXZ, radians. */
  yaw: number;
  pitch: number;
  /**
   * How far to lift the GLB glass quad TOWARD THE DRIVER'S EYE so it sits
   * proud of the authored mirror casing instead of being buried inside it.
   * See the REF 8 block under MIRROR_DEFS for why the direction is the eye
   * ray and not the glass normal. 0 = leave the authored position alone.
   */
  glassLiftM: number;
}

// AIM TABLE (doc 71 §4.9 / lane 12 §7 — explicit, NOT derived from the GLB
// mirror-node orientations: those encode the GLASS plane tilted toward the
// driver's eyes, and a fixed backward camera is our approximation of the
// reflected view, so the aim is authored here on purpose).
//
//   mirror | pos (chassis-local, GLB glass) | yaw    | pitch        | vFOV
//   rear   | (0, 0.687, 0.575) — 1.18 m up  | 0      | 0 (horizon)  | 14°
//   left   | (+0.905, 0.455, 0.592)         | 0      | −0.08 ≈ −4.6°| 18°
//   right  | (−0.905, 0.455, 0.592)         | 0      | −0.08 ≈ −4.6°| 18°
//
// Rear looks straight back along −Z with the horizon centred (the glass sits
// at real eye/horizon height). Door cameras look rearward PARALLEL to the
// body axis, 4–5° down (lane-12's real-mirror numbers): the ±0.905 m lateral
// camera position already gives the outboard eye a real glass provides, so
// road fills the lower two-thirds and horizon rides the upper third.
//
// REF 6 post-mortem (why the mirrors were broken, so nobody re-breaks them):
//  1. far plane 500 < SkyDome radius 520 → EVERY mirror pass clipped the sky
//     dome and rendered clear-colour black sky (MIRROR_FAR fixes this);
//  2. 8-bit UNSIGNED_BYTE targets stored the LINEAR pre-composer scene —
//     HDR >1 clipped and linear quantisation crushed the dark asphalt into
//     the "dark smear" (HalfFloatType fixes this — see below);
//  3. the old ∓0.14 outward yaw aimed the left glass ~8° into the roadside
//     lawn — with the black sky that read as "solid green";
//  4. (doc 82) the composer sets renderer.autoClear = false for its own
//     ClearPass, so the raw gl.render below never cleared the mirror target's
//     colour OR DEPTH — a fresh depth buffer reads 0 (the near plane), every
//     fragment failed the LESS test, and the glass was a solid black
//     rectangle on med/high forever. mirrorPass.ts owns autoClear now.
//
// NOTE ON `rear.pos` (it is NOT the glass centre, on purpose): the GLB glass
// sits at chassis (0, 0.908, 0.50) — the header-mounted housing of the
// 2026-07-11 black-mass fix, plus the 105 mm B58 mirror-station raise that
// `tools/glb/raise_interior_mirror.mjs` applied to the asset — but the rear RTT
// vantage stays at eye height
// (0, 0.687, 0.575), which is the ruling pinned by
// vehicle/cockpit-camera-contract.test.ts („sample point ≠ glass"): a rear
// mirror reflects the DRIVER'S eye line, not the glass's own position, so the
// horizon lands centred in the strip. `left`/`right` do coincide with their
// GLB glass nodes.
//
// REF 7 — „the rear-view mirror is a flat dead rectangle" (2026-07-27), the
// `glassLiftM` column. The PASS was already healthy after the doc-82 autoClear
// fix: reading the rear target back on a live /dev/ghost-demo frame gives a
// real linear-HDR image (dark road at v≈0, bright dusk sky at v≈1). What the
// driver saw instead was the AUTHORED MIRROR CASING — in hero_interior.glb the
// `hotspot_mirror_rear` quad is modelled INSIDE its housing, and interior_shell
// carries geometry from 4 mm to ~50 mm in FRONT of the glass plane, covering
// it. Ray-casting the shell from COCKPIT_EYE over a 17×11 grid on each glass
// measured how much of the glass the driver can actually see, against a lift
// along the glass's own normal:
//
//   lift (m)  0.00  0.01  0.02  0.03  0.04  0.05  0.06  0.08  0.12
//   rear       16%   49%   61%   71%   85%   94%   94%   95%   96%
//   left       34%   41%   48%   47%   47%   47%   45%   45%   44%
//   right      14%   18%   21%   23%   22%   22%   21%   21%   19%
//
// 0.05 m clears the rear casing (16% → 94%) and then plateaus — pushing the
// glass further only shoves it into the cabin for nothing. The DOOR mirrors do
// not respond at all: what hides them is the door/window frame from a centred
// eye point, an aim/authoring problem no depth nudge can fix, so they keep
// their authored position (`glassLiftM: 0`) and are left honestly as they are.
// The lift is applied and reverted by this rig, never baked into the cached
// GLTF — `scene.clone(true)` gives every mount its own node transforms, so
// writing `mesh.position` only affects this cockpit instance.
//
// REF 8 — „the bezel does not enclose the glass" (2026-07-27 R0 round 2). The
// REF 7 lift was applied along the glass's OWN NORMAL. Measured on the shipped
// GLB, that normal — quaternion (−0.0346, −0.1391, −0.0049, 0.98966) applied
// to +Z — is (−0.275, +0.070, +0.959) in GLB space, while the direction from
// the glass centre (GLB (0, 1.353, −0.5) then; (0, 1.458, −0.5) since the B58
// raise) to the cockpit eye (COCKPIT_EYE
// through the yaw-π / y−0.55 mount → GLB (−0.24, 1.26, 0.255)) is
// (−0.301, −0.117, +0.947). Those differ by 10.8°, so a 50 mm normal-lift
// slid the glass 9.4 mm SIDEWAYS across the driver's sightline, and being
// 50 mm nearer also magnified it 6.7 %. Result in a rendered 1100×900 frame:
// the glass sat ~13 px up-and-right of the authored bezel it is supposed to
// live in, overhanging the frame with the bezel's top strip left showing as a
// loose flap — and its lower-left corner covered the root of the authored
// mirror stalk, so the stalk read as a black arm ending inside the reflection.
//
// FIX: lift along the EYE RAY and shrink by the same ratio ((d − lift) / d).
// Moving a plane along the ray to the eye and scaling it by the distance ratio
// leaves its projection from that eye EXACTLY unchanged — so the glass now
// covers precisely the pixels the authored quad covered (the cockpit-camera
// contract's `interiorMirror` landmark is untouched), it is simply 60 mm
// nearer than the casing that used to bury it. Head-sway parallax against the
// fixed COCKPIT_EYE is ~1 mm of apparent shift and invisible.
//
// ONE CONSEQUENCE B58 HAD TO PAY FOR, recorded because it will surprise the
// next person who moves this node: because the lift runs along the EYE RAY and
// a raised node makes that ray point further DOWN, a node raise does not arrive
// at the glass intact. 105 mm of node raise delivers 97.5 mm at the glass —
// the missing 7.5 mm is the lift's own y-component growing. That is why the
// mirror-station raise is 105 mm and not the 94 mm first estimated from the
// node position alone.
const MIRROR_DEFS: Record<MirrorKind, MirrorDef> = {
  rear: {
    width: 256,
    height: 96,
    fovDeg: 14,
    pos: [0, 0.687, 0.575],
    yaw: 0,
    pitch: 0,
    // 60 mm clears the authored casing, whose driver-facing face was measured
    // (raycast on the shipped GLB) at chassis z 0.467 — 33 mm in front of the
    // glass plane — with the dress reaching chassis x ±0.096 / y 0.759–0.850.
    glassLiftM: 0.06,
  },
  left: {
    width: 160,
    height: 96,
    fovDeg: 18,
    pos: [0.905, 0.455, 0.592],
    yaw: 0,
    pitch: -0.08,
    glassLiftM: 0,
  },
  right: {
    width: 160,
    height: 96,
    fovDeg: 18,
    pos: [-0.905, 0.455, 0.592],
    yaw: 0,
    pitch: -0.08,
    glassLiftM: 0,
  },
};

/** Mirror-camera near plane (m) — glass positions sit just outside the
 *  chassis box, nothing legitimate is closer. */
const MIRROR_NEAR = 0.3;
/**
 * Mirror-camera far plane (m) — deliberately SHORT (the post-0d1c922 perf
 * fix): CityBuildings' 200 m chunk grid has instance-aware bounding spheres
 * with frustumCulled=true, so a 200 m far plane culls every distant chunk
 * from the pass and the mirror renders a small neighbourhood, not the whole
 * district.
 *
 * THE PARENTHESIS THAT USED TO END THIS PARAGRAPH WAS WRONG AND IT WAS
 * EXPENSIVE. It said the still-uncullable props — „trees/furniture/traffic
 * shells" — „are the cheap minority". Counted on the running product with a
 * raw GL counter (d2-v1, tier low, level 1, 1264×619): ONE entry into this
 * 256×96 pass submitted 106 draw calls and 1,284,796 triangles — more
 * triangles than the entire main pass at 1264×619, for 24,576 pixels, because
 * every tree in the district was `frustumCulled = false` and went to every
 * camera. The far plane could not save it: culling was switched off, so there
 * was nothing to cull against.
 *
 * `three-helpers` now gives every static prop an instance-aware sphere and
 * chunks district-spanning sets onto a 600 m grid, and the same pass on the
 * same district measures 83.0 draws / 492,716 triangles per entry — the
 * triangle bill for one mirror entry fell by 62 %.
 *
 * AND THIS FAR PLANE STILL IS NOT WHAT SAVED IT. Measured after that fix, on
 * /dev/drive-rig, d2-v1 tier low, per mirror entry, 8-second windows:
 *
 *     far 200 (this constant)  83.0 draws  492,716 tris
 *     far 120                  81.0        485,380   −2.4 % / −1.5 %
 *     far  60                  80.9        483,393   −2.6 % / −1.9 %
 *
 * Shortening it to less than a third of its value removes two draw calls. It
 * cannot do more, because what the pass submits is not distant world: it is
 * whole InstancedMeshes whose ONE union-of-all-instances bounding sphere is
 * 800-1100 m across, which every frustum containing the camera intersects at
 * any far plane. That is what `mirrorInstanceCull.ts` now handles, by testing
 * the instances instead of the sphere. The far plane stays at 200 because it
 * still bounds the non-instanced merged world meshes and because
 * MIRROR_FOG_MIN_DENSITY is derived from it — shortening it makes the mirror
 * visibly hazier than the direct view for a 2 % saving.
 *
 * REF 6 GUARD STILL HOLDS: the sky is a mesh dome (radius 520) and a far
 * plane below it clips the entire sky to black clear-colour (the original
 * REF 6 failure #1). Instead of raising the far plane back to 560, the pass
 * temporarily shrinks the dome to MIRROR_SKY_RADIUS (< far) — the dome's
 * shading is direction-based and scale-invariant, so the mirrored sky
 * (gradient + sun disc/glow) is pixel-identical to the full-size dome.
 */
const MIRROR_FAR = 200;
/** Sky-dome scale during a mirror pass — just inside MIRROR_FAR. */
const MIRROR_SKY_RADIUS = 190;
/**
 * Fog-density floor for mirror passes so geometry fades toward the fog
 * colour BEFORE the 200 m cull boundary instead of popping there:
 * FogExp2 transmittance exp(-(d·far)²) with d·far = 1.5 ≈ 0.105 at the far
 * plane. The main scene's density (day 0.0028) would still be ~68 % visible
 * at 200 m. Applied as max(scene density, floor) so denser night/rain fog
 * wins; restored right after the pass.
 */
const MIRROR_FOG_MIN_DENSITY = 1.5 / MIRROR_FAR;

/**
 * Per-mirror refresh cadence: render mirror `kind` on frames where
 * frame % interval === phase. Phases are disjoint (rear owns 0 and 2 mod 4,
 * doors own 1 and 3), so AT MOST ONE mirror pass ever runs per frame:
 *   low    (rear only) — rear every 8th frame (~7.5 Hz; see LOW_REAR_CADENCE);
 *   medium (rear only) — passes on half the frames;
 *   high (all three)   — rear at 30 Hz, each door at 15 Hz.
 * Glass is small and mostly glanced at — 15 Hz doors read fine.
 */
const MIRROR_CADENCE: Record<MirrorKind, { interval: number; phase: number }> = {
  rear: { interval: 2, phase: 0 },
  left: { interval: 4, phase: 1 },
  right: { interval: 4, phase: 3 },
};

/** LOW-preset rear cadence (founder review doc 62 #44 — "the cockpit rear
 *  mirror shows NOTHING": on low the rig used to mount no RTT at all and the
 *  glass stayed authored dark gloss). The rear mirror is the safety-critical
 *  one — a tailgater lesson is unplayable without it — so low now runs the
 *  REAR pass only: one 256×96 reduced-scene render (far plane 200 m, frozen
 *  shadows, no composer). The door mirrors stay dark gloss on low — that
 *  remains the honest budget cut.
 *
 *  INTERVAL 4 → 8 (doc 91 §I21 / §D12f, 2026-08-12). The pass is a FIXED
 *  256×96 target, so unlike the main pass its cost does not shrink with the
 *  viewport: measured at phone dimensions, tier low, it was 0.61–1.13 ms of a
 *  2.4–3.2 ms GPU frame — 25–34 % of the whole tier-low GPU budget for 7 % of
 *  the canvas pixels. With §I19 (frameloop="demand" behind a card) landed it
 *  became the largest single remaining per-frame GPU line at `low`, exactly as
 *  §J-10 predicted, so this is the next cut and it is a pure reduction.
 *
 *  WHAT IT COSTS, STATED: the rear glass refreshes ~7.5×/s instead of ~15×/s
 *  on the tier where it is smallest and dimmest. It is still a live mirror —
 *  a tailgater lesson stays playable (doc 62 #44) — and it is only `low`;
 *  medium keeps every 2nd frame and high keeps 30 Hz. */
const LOW_REAR_CADENCE = { interval: 8, phase: 0 } as const;

/** Which mirrors run RTT per quality tier (lesson-ui preset, fixed for the
 *  life of the scene — the selector lives on the pre-lesson screen). */
function activeKindsFor(preset: "low" | "medium" | "high"): MirrorKind[] {
  if (preset === "high") return ["rear", "left", "right"];
  return ["rear"]; // medium AND low — see LOW_REAR_CADENCE
}

interface MirrorRigEntry {
  kind: MirrorKind;
  mesh: Mesh;
  target: WebGLRenderTarget;
  camera: PerspectiveCamera;
  material: MeshBasicMaterial;
}

/**
 * Mounts the mirror cameras into the chassis-local tree and drives the
 * round-robin RTT passes from useFrame (manual gl.render before the main
 * pass, so the glass shows this frame's world). Inactive tiers/mirrors keep
 * the authored dark-gloss glass material — the "static dark glass" look.
 */
export function MirrorRig({ mirrors, active }: { mirrors: MirrorMeshes; active: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // Read once on mount: the quality selector lives on the lesson-select
  // screen, so the preset cannot change while this scene is alive.
  const [preset] = useState(() => loadQualityPreset());

  const entries = useMemo<MirrorRigEntry[]>(() => {
    return activeKindsFor(preset).flatMap((kind) => {
      const mesh = mirrors[kind];
      if (!mesh) return [];
      const def = MIRROR_DEFS[kind];
      // HalfFloat target = "exposure locked to main scene" (lane 12 §7): the
      // main pipeline renders LINEAR HDR and tone-maps in the composer, so
      // the mirror target must carry linear HDR too — the glass quad is then
      // graded/tone-mapped by the same composer pass as the directly-seen
      // world. An 8-bit target here clips HDR and bands the darks (REF 6).
      const target = new WebGLRenderTarget(def.width, def.height, {
        stencilBuffer: false,
        type: HalfFloatType,
      });
      // ORIENTATION (REF 7, second half). The rig's mirror-image flip used to
      // live in VitokCockpit.ensureQuadUVs(mirrorU), which SYNTHESIZES UVs —
      // and only "if the geometry has none". hero_interior.glb now ships
      // TEXCOORD_0 on all three glass quads, so that helper has been a silent
      // no-op and the authored UVs went straight through untouched. Those
      // authored UVs are (verified by decoding the Draco buffers):
      //     local +Y (quad top)   → v = 0
      //     local +X              → u = 1
      // while the target holds a plain rear-facing camera image: sky at v = 1,
      // and — the camera keeps chassis +X as image-right — CAR-LEFT at u = 1.
      // Rendered as-is that is upside down AND left-right unreversed, which is
      // exactly what a live frame showed (road above sky, the building we had
      // just passed on our left sitting on the mirror's right).
      // Both corrections are one transform on the texture WE own, so nothing
      // touches the shared GLTF geometry: centre (0.5, 0.5) with repeat
      // (-1, -1) maps uv → 1 - uv on both axes. u flip = real glass (car-left
      // reads on the mirror's left); v flip = right way up.
      target.texture.center.set(0.5, 0.5);
      target.texture.repeat.set(-1, -1);
      const camera = new PerspectiveCamera(
        def.fovDeg,
        def.width / def.height,
        MIRROR_NEAR,
        MIRROR_FAR,
      );
      camera.position.set(def.pos[0], def.pos[1], def.pos[2]);
      camera.rotation.order = "YXZ";
      camera.rotation.set(def.pitch, def.yaw, 0);
      // Default layer-0 mask = world only; the cabin is on INTERIOR_LAYER.
      const material = new MeshBasicMaterial({ map: target.texture, toneMapped: false });
      return [{ kind, mesh, target, camera, material }];
    });
    // `mirrors` is a new object per GLB (re)clone; preset is mount-constant.
  }, [mirrors, preset]);

  // Swap the RTT material onto the glass and lift the quad clear of its
  // authored casing (see MIRROR_DEFS / REF 8); restore the authored material,
  // position AND scale, and dispose everything we created, when the rig (or
  // the GLB) goes away.
  useEffect(() => {
    const restores = entries.map((e) => {
      const previous = e.mesh.material;
      const previousPosition = new Vector3().copy(e.mesh.position);
      const previousScale = new Vector3().copy(e.mesh.scale);
      e.mesh.material = e.material;
      // REF 8: slide the quad along the ray to the driver's eye and shrink it
      // by the distance ratio — same pixels, 60 mm nearer than the casing.
      // Both vectors are in the mesh's parent (GLB) frame, which the cabin
      // mount reaches from chassis space by (−x, y + 0.55, −z).
      const lift = MIRROR_DEFS[e.kind].glassLiftM;
      if (lift !== 0) {
        const toEye = new Vector3(
          -COCKPIT_EYE.x,
          COCKPIT_EYE.y + INTERIOR_MOUNT_Y_OFFSET,
          -COCKPIT_EYE.z,
        ).sub(e.mesh.position);
        const distance = toEye.length();
        if (distance > lift * 2) {
          e.mesh.position.addScaledVector(toEye.divideScalar(distance), lift);
          e.mesh.scale.multiplyScalar((distance - lift) / distance);
          // Chassis +Y is GLB +Y (the mount's yaw-π only flips x and z).
          if (e.kind === "rear") e.mesh.position.y -= MIRROR_DROP_M;
        }
      }
      return () => {
        e.mesh.material = previous;
        e.mesh.position.copy(previousPosition);
        e.mesh.scale.copy(previousScale);
      };
    });
    return () => {
      for (const restore of restores) restore();
      for (const e of entries) {
        e.target.dispose();
        e.material.dispose();
      }
    };
  }, [entries]);

  const frameRef = useRef(0);
  // The SkyDome mesh, resolved lazily by name (it mounts in a sibling tree,
  // possibly after us) and re-resolved if the environment remounts.
  const skyRef = useRef<Object3D | null>(null);

  useFrame(() => {
    if (!active || entries.length === 0) return;
    const frame = frameRef.current++;
    // MIRROR_CADENCE phases are disjoint → at most one entry matches. The low
    // preset carries only the rear entry, at its own gentler cadence.
    let entry: MirrorRigEntry | null = null;
    for (const e of entries) {
      const c =
        preset === "low" && e.kind === "rear" ? LOW_REAR_CADENCE : MIRROR_CADENCE[e.kind];
      if (frame % c.interval === c.phase) {
        entry = e;
        break;
      }
    }
    if (!entry) return;

    let sky = skyRef.current;
    if (!sky || !sky.parent) {
      sky = scene.getObjectByName(SKY_DOME_NAME) ?? null;
      skyRef.current = sky;
    }
    const fog = scene.fog instanceof FogExp2 ? scene.fog : null;

    // PER-INSTANCE CULL (mirrorInstanceCull.ts). three culls a whole
    // InstancedMesh against one sphere that unions every instance, and this
    // world is built from district-spanning sets whose spheres are 800-1100 m
    // across — so nothing was ever rejected and the pass submitted the entire
    // district to a 36°-wide cone. Measured on d2-v1 at tier low: 97.3 % of the
    // triangles it submitted were outside its own frustum. This rejects a mesh
    // only when NO instance touches the frustum, so it removes nothing that
    // could have been seen. `updateWorldMatrix` first because the camera's
    // `matrixWorldInverse` — which is what the frustum is extracted from — is
    // only refreshed by three inside `render()`, i.e. after we would have
    // needed it.
    entry.camera.updateWorldMatrix(true, false);
    const cull = cullInstancedForMirror(scene, entry.camera);
    try {
      // Reduced-scene render (see MIRROR_FAR/MIRROR_FOG_MIN_DENSITY): freeze
      // shadows (reuse the main pass's maps), floor the fog so the short far
      // plane never pops, shrink the sky dome into the frustum, and — the
      // black-mirror fix, doc 82 §3.2 — force `autoClear` back on for the pass,
      // because the composer switched it off globally and a raw gl.render into
      // an unclear'd depth buffer draws nothing at all. renderMirrorPass owns
      // saving and restoring all four.
      renderMirrorPass(gl, {
        target: entry.target,
        scene: scene as never,
        camera: entry.camera as never,
        fog,
        fogMinDensity: MIRROR_FOG_MIN_DENSITY,
        sky,
        skyRadius: MIRROR_SKY_RADIUS,
      });
    } finally {
      // NEVER conditional: a throw inside the pass must not leave half the
      // world invisible in the driver's own view.
      cull.restore();
    }
  });

  // The cameras join the chassis-local tree so they inherit the interpolated
  // body pose; nothing visible renders from this component itself.
  return (
    <group>
      {entries.map((e) => (
        <primitive key={e.kind} object={e.camera} />
      ))}
    </group>
  );
}
