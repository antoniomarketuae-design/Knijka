/**
 * vehicleFleet — GLB extraction + instanced-mesh assembly for TrafficLayer.
 *
 * Fleet v2 (docs/simulation/70 REF 3 directive #3): 12 distinct self-authored
 * models (public/sim/vehicles-v2/*.glb) + the v1 police cruiser + the hero
 * de-badged boxy luxury SUV (public/sim/vehicles/suv_boxy_lux.glb, REF 4).
 * The traffic system stays model-agnostic (pose + colorIndex only); this
 * helper turns the kit into a small, FIXED set of InstancedMeshes:
 *
 *  - Each traffic vehicle is assigned ONE model deterministically from its id:
 *    police ~1 in 15 (unchanged), then a research-weighted pick over the v2
 *    pool (mostly sedans/hatches/wagons/crossovers; taxi ~1 in 10; minibus/van
 *    occasional; luxury sedan rare; the boxy hero SUV ~1 in 20, instance count
 *    CAPPED — it is ~4× heavier than a fleet car; overflow falls back to the
 *    kolos, the ambient boxy-SUV archetype).
 *  - Per model, body primitives are merged into a SINGLE multi-material
 *    geometry. headlight/taillight primitives are dropped (TrafficLayer draws
 *    night-gated / per-vehicle emissive lamp overlays instead), and same-look
 *    accessory materials are FOLDED into their host group (plate/cladding/
 *    checker -> trim, etc.) so a standard model costs 3-4 body draws, not 6-8.
 *  - PAINT is split out of the body merge for every model palettes.json lists:
 *    one paint InstancedMesh per model (material cloned to white) tinted
 *    per-instance from the model's researched color palette — 12 physical
 *    models render as ~50 paint variants with zero extra draw calls. Police
 *    (two-tone livery) and the hero SUV (REF-4 gloss black IS its identity)
 *    keep their authored paint inside the body merge.
 *  - ALL standard wheels are one shared InstancedMesh (tire+hubcap geometry
 *    from the first GLB, spin axis local X, hub-centred), drawn 4× per car and
 *    uniformly scaled to each model's wheel radius (= the authored wheel-node
 *    hub height, which matches the tire bbox half-extent on every model).
 *    kolos/corva_l author `hubcap_dark` — they render the shared silver cap
 *    (palettes.json blesses hub-tint variation). The hero SUV's cross-spoke
 *    red-pinstripe wheels are side-mirrored custom meshes (rim detail faces
 *    outward), so it gets TWO dedicated wheel InstancedMeshes (left/right,
 *    2 instances per car each) built from its own wheel_FL/FR nodes; its
 *    tailgate spare (a `tire`-material primitive inside the BODY mesh) stays
 *    in the body merge — wheel exclusion is by wheel-NODE subtree, not by
 *    material name.
 *  - The PARKED pass reuses the exact same rigs as static InstancedMeshes.
 *    Parked pool (assignCivilianModel): the v2 civilian models weighted per
 *    palettes.json's parked note (shifted toward vela_h3/corva_s/dret_90),
 *    including curb-parked taxis at a low weight (realistic) but excluding
 *    police (reads wrong on every street), the kargo_m minibus (a route
 *    vehicle — parked ranks read wrong), and the hero SUV (premium moving-only
 *    spawn; also keeps the static pass off its 14 material groups).
 *
 * Draw calls stay bounded by MODELS-with-instances × body-groups (+ paint
 * splits + 2 shared-wheel groups + 6 hero-wheel groups when present), plus the
 * same bound for the parked pass — independent of how many cars are on screen.
 * Geometry is authored ground-relative (Y = 0 = tarmac, nose +Z); instances
 * place the body at Y = 0 and each wheel at Y = its (scaled) radius.
 *
 * ADR-001: the kit is entirely FICTIONAL (no real brands / insignia).
 */

import {
  Box3,
  BoxGeometry,
  type BufferGeometry,
  Color,
  type ColorRepresentation,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LinearFilter,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  RGBAFormat,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import type { TrafficVehicleState } from "./types";
import palettesJson from "../../../../public/sim/vehicles-v2/palettes.json";

/** Fleet model basenames. Order is load-order and the model-index space.
 *  Police stays LAST (rarity carve-out); the hero SUV is second-to-last. */
export const FLEET = [
  "vela_h3", // compact hatchback
  "pino", // city hatchback
  "corva_s", // midsize sedan
  "dret_90", // old-gen sedan (chrome bumpers)
  "corva_sw", // wagon
  "arden_x", // crossover
  "kolos", // boxy SUV (ambient)
  "corva_l", // luxury sedan
  "tarpan", // pickup
  "kargo_v", // panel van
  "kargo_m", // YELLOW route minibus
  "taxi", // roof-sign taxi
  "suv_boxy_lux", // hero de-badged boxy luxury SUV (REF 4)
  "police",
] as const;
type FleetName = (typeof FLEET)[number];

/** v1 kit dir holds the hero SUV + police; everything else is fleet v2. */
export const FLEET_URLS = FLEET.map((n) =>
  n === "suv_boxy_lux" || n === "police"
    ? `/sim/vehicles/${n}.glb`
    : `/sim/vehicles-v2/${n}.glb`,
);
/** Police is the last entry (rare, moving-only). */
const POLICE_INDEX = FLEET.length - 1;
/** Hero boxy SUV — rare premium spawn with a hard instance cap. */
export const BOXY_INDEX = FLEET.length - 2;
/** Max simultaneous hero-SUV instances (heavier: 14 body groups + 6 wheel
 *  draws). Overflow reassigns to the kolos (same boxy-SUV archetype). */
export const BOXY_MAX_INSTANCES = 2;
/**
 * The tier-`low` cap: ZERO (doc 82 §2.3, "best effort-to-win ratio in the
 * entire codebase"). The model is 22,672 triangles across 16 materials against
 * 180–280 triangles for every other fleet car, and it spawns ~1 in 21 — at the
 * phone tier's ≤70 draws / ≤250k triangles per frame (§2.2) two of them are
 * ~54k triangles and 16 draw calls spent on one constant-coloured background
 * car. Overflow already falls back to the kolos, the ambient boxy-SUV
 * archetype, so the street still reads the same; the silhouette a student
 * needs for a right-of-way judgement is unchanged.
 */
export const BOXY_MAX_INSTANCES_LOW = 0;
const BOXY_FALLBACK_INDEX = FLEET.indexOf("kolos");

// ---------------------------------------------------------------------------
// Size/type profiles (doc 72 §9 FO-06 — the large-vehicle actor unlock).
// A staged actor's TrafficVehicleState.profile OVERRIDES the deterministic
// fleet pick: "van" reuses the kargo_v panel-van GLB; "truck" renders the
// PROCEDURAL box-truck rig appended AFTER the GLB models (a code-built cab +
// cargo box — honest polish gap: swap for an authored GLB when the kit grows
// one; entirely fictional per ADR-001). Ambient vehicles never carry a
// profile, so the moving/parked mixes are byte-identical to pre-profile.
// ---------------------------------------------------------------------------

/** Model slot of the procedural box truck — one PAST the GLB fleet. */
export const TRUCK_MODEL_INDEX = FLEET.length;
/** Model slot of the procedural emergency rig (doc 72 VU-09) — after the truck. */
export const EMERGENCY_MODEL_INDEX = FLEET.length + 1;
/** Model slot of the procedural articulated tram rig (doc 72 RX-04/RX-05,
 *  ADR-006 stage 3b) — after the emergency rig. */
export const TRAM_MODEL_INDEX = FLEET.length + 2;
/** Model slot of the procedural ADULT bicycle + rider rig (audit C3's render
 *  half — the VU-01/02 cyclist proxy finally looks like a bicycle). */
export const CYCLIST_MODEL_INDEX = FLEET.length + 3;
/** Model slot of the CHILD bicycle + rider rig (VU-03 „дете с колело"). */
export const CHILD_CYCLIST_MODEL_INDEX = FLEET.length + 4;
/** Model slot of the procedural multi-unit TRAIN rig (RX-02/RX-01 „жп прелез"
 *  — the railway-level-crossing actor: a locomotive + 2 cars that CROSSES the
 *  carriageway on the rendered rail deck). No InstancedMesh unless a train
 *  actor exists — same cost discipline as the tram. */
export const TRAIN_MODEL_INDEX = FLEET.length + 5;
/** Model slot of the procedural low-poly ANIMAL rig (doc 72 §HZ „животно на
 *  пътя" — the animal-hazard actor: a quadruped that darts across the
 *  carriageway). Mirrors CYCLIST_MODEL_INDEX: no InstancedMesh unless an
 *  "animal"-profile actor exists — same cost discipline as the tram/cyclist. */
export const ANIMAL_MODEL_INDEX = FLEET.length + 6;
/** Model slot of the procedural CITY BUS rig (doc 72 §15 VU-11 „Автобусът
 *  потегля от спирката", ЗДвП чл. 67) — after the animal. Same cost
 *  discipline: no InstancedMesh unless a "bus"-profile actor exists. */
export const BUS_MODEL_INDEX = FLEET.length + 7;
const VAN_MODEL_INDEX = FLEET.indexOf("kargo_v");

/** Box-truck body plan, meters (fictional): ~7.5 × 2.4 × 3.1 — longer, wider
 *  and taller than every fleet car (~4.4 × 1.8) and the van (~5.4 × 2.0), so
 *  it genuinely blocks the forward view (FO-06's whole point). */
export const TRUCK_DIMENSIONS = {
  lengthM: 7.5,
  widthM: 2.4,
  cabHeightM: 2.6,
  boxHeightM: 3.1,
  wheelRadiusM: 0.45,
} as const;

/**
 * Model index for one vehicle state: an explicit size/type profile (staged
 * actors only today) overrides the deterministic pick; ambient vehicles have
 * no profile and keep assignModel unchanged. NOTE: same population-wide
 * hero-SUV cap caveat as assignModel (applied in buildTrafficFleet).
 */
export function modelForVehicle(v: Pick<TrafficVehicleState, "id" | "profile">): number {
  if (v.profile === "truck") return TRUCK_MODEL_INDEX;
  if (v.profile === "bus") return BUS_MODEL_INDEX;
  if (v.profile === "emergency") return EMERGENCY_MODEL_INDEX;
  if (v.profile === "tram") return TRAM_MODEL_INDEX;
  if (v.profile === "train") return TRAIN_MODEL_INDEX;
  if (v.profile === "cyclist") return CYCLIST_MODEL_INDEX;
  if (v.profile === "childCyclist") return CHILD_CYCLIST_MODEL_INDEX;
  if (v.profile === "animal") return ANIMAL_MODEL_INDEX;
  if (v.profile === "van") return VAN_MODEL_INDEX;
  return assignModel(v.id);
}

/** Mesh-name base for a model slot (procedural slots are past FLEET). */
function modelName(m: number): string {
  if (m === BUS_MODEL_INDEX) return "bus";
  if (m === EMERGENCY_MODEL_INDEX) return "emergency";
  if (m === TRAM_MODEL_INDEX) return "tram";
  if (m === TRAIN_MODEL_INDEX) return "train";
  if (m === CYCLIST_MODEL_INDEX) return "cyclist";
  if (m === CHILD_CYCLIST_MODEL_INDEX) return "cyclist_child";
  if (m === ANIMAL_MODEL_INDEX) return "animal";
  return FLEET[m] ?? "box_truck";
}

/**
 * The procedural box-truck ModelRig: a paint-colored cab + a tall pale cargo
 * box (two merged BoxGeometries, one draw call per material), shared fleet
 * wheels scaled to the truck's 0.45 m hubs. Ground-relative like the GLB kit
 * (Y = 0 = tarmac, nose +Z), so TrafficLayer places/lights/shadows it through
 * the exact same instancing path as every GLB model. All geometry + materials
 * are OWNED (disposed by disposeTrafficFleet via ownedMaterials/bodyGeometry).
 */
function buildBoxTruckRig(): ModelRig {
  const { lengthM, widthM, cabHeightM, boxHeightM, wheelRadiusM } = TRUCK_DIMENSIONS;
  const halfLength = lengthM / 2;
  const cabPaint = new MeshStandardMaterial({
    color: 0x27506b, // muted fleet blue (fictional livery, ADR-001)
    metalness: 0.25,
    roughness: 0.45,
    envMapIntensity: 1.35,
  });
  cabPaint.name = "truck_cab_paint";
  const boxMat = new MeshStandardMaterial({
    color: 0xd7d5cf, // weathered off-white cargo box
    metalness: 0.05,
    roughness: 0.8,
  });
  boxMat.name = "truck_box";
  // Cab: slightly narrower than the box, over the front axle.
  const cabLen = 1.95;
  const cab = new BoxGeometry(widthM - 0.14, cabHeightM - 0.5, cabLen);
  cab.translate(0, 0.5 + (cabHeightM - 0.5) / 2, halfLength - cabLen / 2);
  // Cargo box: full width/height, a visible gap behind the cab.
  const boxLen = lengthM - cabLen - 0.25;
  const box = new BoxGeometry(widthM, boxHeightM - 0.62, boxLen);
  box.translate(0, 0.62 + (boxHeightM - 0.62) / 2, -halfLength + boxLen / 2);
  // Two BoxGeometries share attribute layouts — this merge cannot fail; the
  // ?? branch only guards the type.
  const bodyGeometry = mergeGeometries([cab, box], true) ?? cab;
  if (bodyGeometry !== cab) {
    cab.dispose();
    box.dispose();
  }
  const track = widthM / 2 - 0.22;
  const frontAxleZ = halfLength - 1.15;
  const rearAxleZ = -halfLength + 1.55;
  return {
    bodyGeometry,
    bodyMaterials: bodyGeometry.groups.length === 2 ? [cabPaint, boxMat] : [cabPaint],
    ownedMaterials: [cabPaint, boxMat],
    paint: null, // no palette tint — the livery IS the profile's identity
    customWheel: null, // shared fleet wheel, scaled to the 0.45 m hubs
    wheelOffsets: [
      new Vector3(track, wheelRadiusM, frontAxleZ), // FL (+X = left)
      new Vector3(-track, wheelRadiusM, frontAxleZ), // FR
      new Vector3(track, wheelRadiusM, rearAxleZ), // RL
      new Vector3(-track, wheelRadiusM, rearAxleZ), // RR
    ],
    wheelRadius: wheelRadiusM,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth: widthM / 2,
    halfLength,
    lampY: 0.95,
    headY: 0.85,
  };
}

/**
 * City-bus body plan, meters (fictional livery, ADR-001 — no real operator's
 * insignia, no route number that names a real line).
 *
 * EVERY NUMBER IS THE LESSON'S, not a taste. `sc-merge-bus-pullout` teaches
 * ЗДвП чл. 67 out loud in two places and both are dimensions:
 *   · instruction 5 / the forcing-past mistake card — «Автобусът е дълъг 12
 *     метра и завива с целия си корпус: докато носът му е още в спирката,
 *     задницата му вече е в твоята лента» → lengthM 12;
 *   · the same card — «Шофьорът му седи на два метра над земята и има мъртва
 *     зона точно там, откъдето ти реши да се промъкнеш» → the cab glazing is
 *     built around a 2.0 m eye line (`driverEyeM`), so the rig the student
 *     looks at is the rig the sentence describes.
 * Until this rig existed the drill borrowed TRUCK_DIMENSIONS — a 7.5 m
 * WINDOWLESS cargo box. That is not a smaller bus, it is a different vehicle
 * class: чл. 67 is owed to a ППС от редовна линия and to nothing else, so a
 * student who reads „камион" off the body has been shown a road on which the
 * duty he is being graded against does not exist.
 */
export const BUS_DIMENSIONS = {
  lengthM: 12,
  widthM: 2.55,
  bodyHeightM: 3.05,
  /** Underfloor clearance — the skirt band below the passenger saloon. */
  skirtM: 0.42,
  wheelRadiusM: 0.5,
  /** Driver's eye line above the tarmac, m — the mistake card's «два метра». */
  driverEyeM: 2.0,
  /** Front-axle / rear-axle centres from the body centre, m (long wheelbase,
   *  which is why the tail swings: the rear overhang is 12/2 − 4.4 = 1.6 m). */
  frontAxleZM: 4.0,
  rearAxleZM: -4.4,
} as const;

/**
 * The procedural CITY BUS ModelRig (doc 72 §15 VU-11, ЗДвП чл. 67 — the
 * bus-pull-out actor). Three merged material groups, one draw each:
 *
 *   1. PAINT — a single 12 m saloon box in a fictional municipal amber.
 *   2. GLASS/DARK — the cue the audit sheet says was missing: a continuous
 *      window band down BOTH flanks at seated-passenger height, a full-height
 *      windscreen and rear screen, two CURB-SIDE door leaves (a bus at a
 *      спирка is a vehicle with its doors on the pavement side), a roof strip
 *      and an underfloor skirt. A bus is glazed; a lorry is not, and that one
 *      difference is the whole of what a student has to read at 130 m.
 *   3. ACCENT — the ROUTE BOARD, front and rear. Legally this is the load-
 *      bearing detail rather than decoration: чл. 67 protects a vehicle „от
 *      редовните линии", and the destination board is the visible mark of a
 *      scheduled route. It is a blank lit panel — no digits, so no real Sofia
 *      line is depicted (ADR-001).
 *
 * Ground-relative like the GLB kit (Y = 0 = tarmac, nose +Z); shared fleet
 * wheels scaled to the 0.5 m hubs. All geometry + materials are OWNED
 * (disposed by disposeTrafficFleet via ownedMaterials/bodyGeometry).
 */
function buildCityBusRig(): ModelRig {
  const { lengthM, widthM, bodyHeightM, skirtM, wheelRadiusM, driverEyeM, frontAxleZM, rearAxleZM } =
    BUS_DIMENSIONS;
  const halfLength = lengthM / 2;
  const paintMat = new MeshStandardMaterial({
    color: 0xd8a12a, // fictional municipal amber (ADR-001 — no real livery)
    metalness: 0.2,
    roughness: 0.45,
    envMapIntensity: 1.35,
  });
  paintMat.name = "bus_paint";
  const accentMat = new MeshStandardMaterial({
    color: 0xf6efd8, // the lit route board — blank, no digits (ADR-001)
    metalness: 0.05,
    roughness: 0.6,
  });
  accentMat.name = "bus_accent";
  const glassMat = new MeshStandardMaterial({
    color: 0x1b2026, // near-black glazing: windows, screens, doors, skirt, roof
    metalness: 0.45,
    roughness: 0.35,
  });
  glassMat.name = "bus_glass";

  // -- paint: one saloon box above the skirt --------------------------------
  const bodyH = bodyHeightM - skirtM;
  const paintMerged = new BoxGeometry(widthM, bodyH, lengthM);
  paintMerged.translate(0, skirtM + bodyH / 2, 0);

  // -- accent: route boards, front and rear, above the screens --------------
  const boardW = widthM - 0.9;
  const boardFront = new BoxGeometry(boardW, 0.3, 0.06);
  boardFront.translate(0, bodyHeightM - 0.3, halfLength + 0.01);
  const boardRear = new BoxGeometry(boardW, 0.26, 0.06);
  boardRear.translate(0, bodyHeightM - 0.32, -halfLength - 0.01);
  const accentParts = [boardFront, boardRear];
  const accentMerged = mergeGeometries(accentParts, false) ?? boardFront;
  if (accentMerged !== boardFront) for (const g of accentParts) g.dispose();

  // -- glass/dark kit -------------------------------------------------------
  const flankX = widthM / 2 - 0.01; // flush to the flank, protrudes ~0.02 m
  // Saloon window band: seated-passenger height, both flanks, stopping short
  // of the nose so the windscreen reads as a separate pane.
  const winY = 1.95;
  const winH = 0.9;
  const winLen = lengthM - 3.2;
  const winZ = -0.6; // biased back — the cab occupies the front 1.6 m
  const darkParts: BufferGeometry[] = [];
  for (const sx of [flankX, -flankX]) {
    const w = new BoxGeometry(0.06, winH, winLen);
    w.translate(sx, winY, winZ);
    darkParts.push(w);
  }
  // The CAB: a deep windscreen whose lower edge sits below the driver's eye
  // line and whose upper edge sits above it, so «шофьорът седи на два метра
  // над земята» is a thing you can see rather than only read.
  const screenH = 1.3;
  const screenF = new BoxGeometry(widthM - 0.22, screenH, 0.06);
  screenF.translate(0, driverEyeM + 0.15, halfLength - 0.02);
  darkParts.push(screenF);
  // Rear screen — smaller, and the face the student actually follows.
  const screenR = new BoxGeometry(widthM - 0.5, 0.85, 0.06);
  screenR.translate(0, winY + 0.05, -halfLength + 0.02);
  darkParts.push(screenR);
  // Two CURB-SIDE door leaves (−X = the vehicle's right = the pavement at a
  // спирка): full height from the skirt to the window head.
  const doorTop = winY + winH / 2;
  const doorH = doorTop - skirtM;
  for (const doorZ of [halfLength - 2.1, -0.9]) {
    const d = new BoxGeometry(0.07, doorH, 1.15);
    d.translate(-flankX, skirtM + doorH / 2, doorZ);
    darkParts.push(d);
  }
  // Roof equipment strip + the underfloor skirt band (dark bottom contrast).
  const roof = new BoxGeometry(widthM - 0.7, 0.14, lengthM - 2.2);
  roof.translate(0, bodyHeightM + 0.07, 0);
  darkParts.push(roof);
  const skirtBox = new BoxGeometry(widthM - 0.12, skirtM, lengthM - 0.5);
  skirtBox.translate(0, skirtM / 2, 0);
  darkParts.push(skirtBox);
  const darkMerged = mergeGeometries(darkParts, false) ?? darkParts[0];
  if (darkMerged !== darkParts[0]) for (const g of darkParts) g.dispose();

  const bodyGeometry =
    mergeGeometries([paintMerged, accentMerged, darkMerged], true) ?? paintMerged;
  if (bodyGeometry !== paintMerged) {
    paintMerged.dispose();
    accentMerged.dispose();
    darkMerged.dispose();
  }

  const track = widthM / 2 - 0.22;
  return {
    bodyGeometry,
    bodyMaterials:
      bodyGeometry.groups.length === 3 ? [paintMat, accentMat, glassMat] : [paintMat],
    ownedMaterials: [paintMat, accentMat, glassMat],
    paint: null, // no palette tint — the amber livery IS the profile's identity
    customWheel: null, // shared fleet wheel, scaled to the 0.5 m hubs
    wheelOffsets: [
      new Vector3(track, wheelRadiusM, frontAxleZM), // FL (+X = left)
      new Vector3(-track, wheelRadiusM, frontAxleZM), // FR
      new Vector3(track, wheelRadiusM, rearAxleZM), // RL
      new Vector3(-track, wheelRadiusM, rearAxleZM), // RR
    ],
    wheelRadius: wheelRadiusM,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth: widthM / 2,
    halfLength,
    lampY: 0.95,
    headY: 0.85,
  };
}

// ---------------------------------------------------------------------------
// ВОДНАТА ПЕЛЕНА — the spray a heavy vehicle throws off its tyres in rain.
//
// WHY IT LIVES HERE AND NOT IN environment/weather.ts (the address, settled
// twice): spray is emitted BY ONE VEHICLE and it hangs BEHIND THAT VEHICLE.
// A scene-wide 0..1 in the weather store cannot express that — every driver in
// the lesson would spray, including the student's own car, and nothing would
// sit between his eye and the truck's tail lamps. The emitter owns the plume,
// so the plume is built by the rig file, sized off the rig's own body plan
// (TRUCK_DIMENSIONS: 7.5 × 2.4 × 3.1) and placed off the rig's own `rearZ`.
//
// WHAT IT HAS TO TEACH (sc-ac-truck-spray, briefing 3/4/9 verbatim):
//   3. „гумите му вдигат пелена от пръски, в която не се вижда нищо"
//   4. „Не разчитай да видиш в нея нито стоповете му, нито пътя пред него"
//   9. „Не се доближавай «за да виждаш» — колкото по-близо си, толкова
//      по-малко виждаш"
// So a decorative puff is NOT the fix. Three properties are load-bearing:
//   · it must be BETWEEN the eye and the truck, so it actually washes out the
//     tail lamps and the road beyond — sight distance the student LOSES;
//   · it must get WORSE as he closes, or briefing 9 is a slogan he never meets;
//   · it must vanish when the emitter is slow or the rain stops, or it is a
//     decoration that lies about the weather.
//
// THE MECHANISM is deliberately dumb, because it has to be cheap and it has to
// be legible from source: SPRAY_SLABS camera-facing quads trailing the rig,
// each at a fixed low alpha, and the DENSITY is how many of them are switched
// on. Overlapping translucent slabs compound (1 − (1 − a)^k), so k = 1..5 at
// a = SPRAY_SLAB_ALPHA walks 0.30 → 0.83 of the view behind the truck. No
// per-instance alpha (three has none for InstancedMesh), no shader patch, no
// particle system, ~10 triangles and ONE draw call, and only when a lesson
// actually stages a spraying profile.
//
// W20 — THAT COMPOUNDING WAS ADVERTISED HERE AND CANCELLED IN THE TEXTURE, and
// it is worth saying so at the top, because the three properties above were all
// wired and the row still stood. The slab alpha reaching the framebuffer is
// SPRAY_SLAB_ALPHA × the alphaMap, and the alphaMap's vertical ramp used to
// decay with height on top of the slab stagger that already decays with height.
// The 0.83 was therefore never reached at ANY height: the five-slab curtain
// peaked at 0.65 and it peaked at 0.31 m — knee height — measuring 0.44 at the
// tail lamps and 0.12 at 2.00 m, so the plume was a skirt round the wheels and
// the student read the stop lamps and the road beyond straight through it. It
// now peaks at 0.79 and peaks at 0.85 m, which is where the sight distance the
// drill is about is actually bought. The falloff now lives
// in ONE place — the staggered slab tops — and the ramp holds its crest across
// each slab's own body (`CREST_UP` in buildSprayAlphaTexture carries the
// before/after numbers). Nothing else in this section moved: same five quads,
// same widths, same spacing, same one draw call.
//
// W21 — AND THE THIRD PROPERTY WAS THE GEOMETRY. W20 fixed how MUCH alpha the
// curtain carries and left WHERE it stands alone, so the fixed density was
// spent inside a box 2.7 m wide and 2.2 m tall standing behind a body 2.4 m
// wide and 3.1 m tall: the plume never crossed the emitter's own outline, and
// at the 59 m this drill pins the student at it read as a white panel bolted
// to the trailer rather than as water. The `spraySlabShape` fan now stands
// proud of the body sideways and reaches the roofline instead of the waist at
// the k the drill actually reaches; the four W20 numbers quoted above are
// superseded by the tables in that function's docblock, because they were
// measured on the old fan. Still five quads, still one draw call.
// ---------------------------------------------------------------------------

/** Profiles that throw a pelena: the tall, heavy, many-wheeled ones the лекция
 *  names — „камион, автобус или бус". A car throws spray too, but the drill's
 *  whole discriminator is the HIGH vehicle you cannot see past, and putting a
 *  curtain behind every hatchback in every rain lesson would bury that. */
const SPRAY_PROFILES: ReadonlySet<string> = new Set(["truck", "van", "emergency"]);

/** True when this vehicle's profile throws a spray plume in rain. Ambient
 *  vehicles carry no profile, so the answer for them is always false and every
 *  non-staged lesson allocates nothing. */
export function emitsSpray(v: Pick<TrafficVehicleState, "profile">): boolean {
  return v.profile !== undefined && SPRAY_PROFILES.has(v.profile);
}

/** Trailing quads per emitter. Five is what the compounding curve needs to
 *  reach a believable near-whiteout (0.83) without ever hitting 1.0 — the
 *  truck's silhouette must stay readable, because „не се вижда нищо" is about
 *  what is BEYOND the truck, not about losing the truck itself. */
export const SPRAY_SLABS = 5;

/** Alpha of ONE slab. Tuned so k=1 is a visible haze and k=5 is a wall. */
export const SPRAY_SLAB_ALPHA = 0.3;

/** Below this the tyres are not lifting standing water at all (≈14 км/ч): a
 *  truck crawling in a jam throws nothing, and the render must say so. */
export const SPRAY_MIN_SPEED_MPS = 4;
/** Full plume at ≈65 км/ч — the speed the lesson itself asks the student to
 *  settle at behind the truck (briefing 7). */
export const SPRAY_FULL_SPEED_MPS = 18;

/** Inside this range of the emitter's tail the observer is IN the plume. */
export const SPRAY_NEAR_M = 22;
/** Beyond this the plume is something you look at, not something you are in. */
export const SPRAY_FAR_M = 70;

/**
 * How much of the curtain is switched on, 0..1.
 *
 * `rainIntensity` is the live weather store's 0..1 (environment/weather.ts) —
 * NOT a boolean, so the plume fades in with the storm instead of popping.
 * `eyeGapM` is the distance from the observer's eye to the emitter.
 *
 * The proximity term is the part that carries briefing 9. It never REPLACES
 * the base — at the drill's pinned ~60 m gap the plume must already be costing
 * sight distance (briefing 4), which is why the near factor only spans
 * 0.55 → 1.0 rather than 0 → 1.
 */
export function sprayDensity(
  rainIntensity: number,
  speedMps: number,
  eyeGapM: number,
): number {
  if (rainIntensity <= 0) return 0;
  const speed =
    (speedMps - SPRAY_MIN_SPEED_MPS) / (SPRAY_FULL_SPEED_MPS - SPRAY_MIN_SPEED_MPS);
  if (speed <= 0) return 0;
  const near = (SPRAY_FAR_M - eyeGapM) / (SPRAY_FAR_M - SPRAY_NEAR_M);
  const nearClamped = near < 0 ? 0 : near > 1 ? 1 : near;
  const base = (rainIntensity > 1 ? 1 : rainIntensity) * (speed > 1 ? 1 : speed);
  return base * (0.55 + 0.45 * nearClamped);
}

/** Slabs to draw for a density — 0 means the emitter is drawn with no plume at
 *  all (dry road, or standing still), which is the honest state and the one
 *  every non-rain lesson stays in forever. */
export function sprayActiveSlabs(density: number): number {
  if (density <= 0) return 0;
  const k = Math.round(density * SPRAY_SLABS);
  return k < 1 ? 1 : k > SPRAY_SLABS ? SPRAY_SLABS : k;
}

/**
 * Placement of slab `i` behind an emitter, in the emitter's own body space.
 * Pure so the shape can be asserted without a renderer.
 *
 * The plume LIFTS and FANS as it drifts back — that is what makes it read as
 * thrown water rather than a poster: slab 0 is a low sheet just off the rear
 * tyres, slab 4 stands taller than the cargo box and better than three times
 * the body's width. `backM` is measured behind `rig.rearZ`, so a longer rig
 * pushes its own curtain further back automatically.
 *
 * WIDTH SCALES WITH THE RIG, HEIGHT DOES NOT, and that split is a claim about
 * water rather than a convenience: the sheet is thrown by the TYRES, so how
 * wide it starts is the emitter's own track (`halfWidthM`, the only rig
 * measurement this function is handed); how HIGH it climbs is set by the road
 * film and the speed, which are properties of the storm and not of the van.
 * The measured kit also refuses width as a stand-in for height: the three
 * spraying profiles run 2.40 × 3.10 (truck), 2.10 × 2.50 (emergency) and
 * 2.30 × 2.29 (kargo_v, read off the shipped GLB's own POSITION accessors),
 * i.e. width:height ratios of 1.29, 1.19 and 1.00. A width-scaled fan would
 * track none of that — it would hand the van, the SHORTEST of the three, very
 * nearly the tallest curtain, for no reason in the world or in the weather.
 *
 * W21 — WHY THE CURTAIN WAS RENDERING AND `:ebaacf94` STILL STOOD. Measured on
 * `.audit-frames/w21/frames/sc-ac-truck-spray__pc-right/04-t050s.png`, the
 * frame the verifier re-cited, read out pixel by pixel down x = 806 (the
 * truck's centre-line at its pinned 59 m): the plume IS on the glass — the
 * trailer's flat 84-luminance rear face ramps smoothly to the 177 of the rain
 * haze between y = 382 and y = 360 — but that ramp is 2.7 m wide and 2.2 m
 * tall (down to the frame's own noise floor, which sits under the 0.10 the
 * envelope table below uses) behind a body 2.4 m wide and 3.1 m tall. It did
 * not meaningfully cross the emitter's own outline at any point, at any k the
 * drill can reach. So from the cockpit it did not read as water at all: the
 * verifier wrote it down as „a crisp grey silhouette with a WHITE LOWER PANEL"
 * and concluded there was no plume. He was describing the render correctly. A
 * curtain that never leaves the silhouette of the thing throwing it is a paint
 * job, not пелена.
 *
 * AND „IT WILL LOOK RIGHT WHEN HE CLOSES IN" IS NOT AVAILABLE HERE, because
 * the drill pins the gap and then GRADES him for holding it: ACTS_SPRAY_TRUCK
 * paces at `paceAheadM: 64` (≈59.9 m bumper) on `cruiseSpeedMps: 18`, and the
 * second success gate is „стигни края на отсечката, БЕЗ да си влизал в
 * пелената". At rain 1.0 that is `sprayDensity` 0.645 → `sprayActiveSlabs` 3,
 * for the whole drive. Slab 2 IS the crown of the curtain this lesson is
 * about, so slab 2 is the slab that has to do the work.
 *
 * MEASURED, by compounding this function through the alphaMap's green channel
 * — the same rasterise-and-compound rig that produced `CREST_UP`'s numbers —
 * on the centre-line of a TRUCK_DIMENSIONS emitter at k = 3, i.e. at exactly
 * the gap the student is graded for keeping:
 *
 *          0.95 m (lamps)  1.50 m  2.00 m (road beyond)  2.60 m  3.10 m (roof)
 *   was        0.603        0.325        0.037            0.000     0.000
 *   now        0.609        0.583        0.440            0.194     0.031
 *
 * and the VISIBLE envelope (where the compounded curtain still carries 0.10,
 * against a 2.40 × 3.10 body):
 *
 *                 crown          half-width at 1.20 m
 *   k = 1 (haze)  1.04 → 1.57 m   0.00 → 1.04 m
 *   k = 3 (drill) 1.86 → 2.86 m   1.41 → 1.92 m
 *   k = 5 (in it) 2.69 → 4.16 m   2.00 → 2.68 m
 *
 * The tail lamps were already being taken; nothing there needed touching. Two
 * things moved. 2.00 m — the height a 1.2 m cockpit eye reads the road BEYOND
 * the truck out at, which is the whole of briefing 4 („нито пътя пред него") —
 * went from 4 % to 44 %. And at 1.20 m the curtain now stands 0.72 m PROUD of
 * a body whose half-width is 1.20 m, where it used to stand 0.21 m proud: on
 * the cited frame the trailer is 25 px across, so that is an overhang of ~7 px
 * per side instead of ~2 — the difference between a cloud and a painted panel,
 * and the whole of what the verifier was reacting to.
 *
 * WHY THE CROWN DELIBERATELY STOPS UNDER THE ROOF (2.86 m against 3.10 m) —
 * i.e. why this did not simply keep growing until it towered. Above the
 * roofline the background is the rain haze, and the curtain IS rain haze: on
 * the cited frame the sky reads 173 and the plume reads 177, so height spent
 * above the trailer buys nothing a student can see while costing the one
 * invariant this section's header sets. Everything below the roofline is read
 * against the dark trailer (84) and the wet tarmac (110), which is where a
 * white curtain actually has contrast — so the fan is spent there and
 * sideways, over the markings. The truck is still never lost: the roof reads
 * 0.031 at k = 3, and 0.468 at k = 5 — inside SPRAY_NEAR_M, where he has
 * already failed the „без да си влизал в пелената" gate and briefing 9 is
 * being demonstrated on him — against 0.609 and 0.776 at the lamps.
 *
 * KNOWN AND NOT FIXED HERE, so the next lane does not re-derive it: the
 * curtain is an UNLIT `MeshBasicMaterial` at 0xdfe6ea in a scene the sun never
 * reaches, so it renders brighter than the overcast sky it is supposed to be
 * made of (measured on the same frame: plume core 193, sky 173, the truck's
 * own off-white 0xd7d5cf cargo box only 84). That is why what does show reads
 * as a lit panel rather than as mist. Re-toning it is a `buildSprayCurtain`
 * change and it cannot be settled from the numbers — it has to be looked at on
 * a fresh sweep frame (doc 66 R0), which is a round this lane does not have.
 */
export function spraySlabShape(
  i: number,
  halfWidthM: number,
): { backM: number; widthM: number; heightM: number; centerY: number } {
  const backM = 0.9 + i * 1.35;
  // 1.45 → 3.25 track widths: on the truck slab 0 now stands 0.54 m proud of
  // the body on each side (it used to start 0.18 m proud — inside the rig's
  // own anti-aliasing at 59 m) and slab 4 reaches 2.70 m proud, most of the
  // neighbouring lane.
  const widthM = halfWidthM * 2 * (1.45 + 0.45 * i);
  // 1.90 → 5.02 m of quad, which the alphaMap's crest fade turns into a
  // VISIBLE crown of 1.57 / 2.86 / 4.16 m at k = 1 / 3 / 5. The shipped fan
  // (1.25 → 3.25) put the k = 3 crown at 1.86 m — knee-to-chest on a 3.1 m
  // trailer, which is why it could only ever read as part of the truck.
  const topM = 1.90 + 0.78 * i;
  const bottomM = 0.05;
  return {
    backM,
    widthM,
    heightM: topM - bottomM,
    centerY: (topM + bottomM) / 2,
  };
}

/** Alpha ramp of one slab, procedurally filled — no canvas, so the fleet stays
 *  importable in a headless test. A BODY of mist across the slab's own span,
 *  feathered at the tarmac, at the crown and at both sides so the quad never
 *  shows a hard rectangle. It is deliberately NOT a second height falloff —
 *  see `CREST_UP` below for the measurement that says why. */
function buildSprayAlphaTexture(): DataTexture {
  const W = 96;
  const H = 96;
  const data = new Uint8Array(W * H * 4);
  /**
   * Fraction of a slab's own height the mist holds at full strength before it
   * begins to thin toward the crown.
   *
   * THE CURTAIN'S VERTICAL FALLOFF IS ALREADY CARRIED BY THE SLAB STAGGER.
   * `spraySlabShape` gives every slab the same bottom (0.05 m) and a top that
   * grows 1.90 → 5.02 m, so how much curtain stands at a given height IS how
   * many slabs still reach it: five at the tail lamps, four at 2.6 m, three at
   * the cargo box's top. That is the whole mechanism the block comment above
   * this section describes.
   *
   * W21 RE-STATED THAT FAN (it was 1.25 → 3.25 when the numbers below were
   * taken), so every k = 5 figure in this docblock is a w20 reading on the w20
   * geometry: correct as the record of WHY the ramp holds its crest, superseded
   * as a description of what the curtain now measures. The live tables are in
   * `spraySlabShape`. Nothing about CREST_UP itself changed, and none of the
   * reasoning below depends on the fan's absolute heights — only on there
   * being a stagger to carry the falloff.
   *
   * The shipped ramp was `rise = (1 − up)^1.6` — a SECOND falloff, applied to
   * each slab on top of the stagger. Measured on the shipped constants at k = 5
   * (the most the emitter can ever switch on, i.e. exactly what the student
   * meets once he has closed inside SPRAY_NEAR_M at speed), compounded over the
   * five slabs on the centre-line of a TRUCK_DIMENSIONS rig:
   *
   *      0.30 m 0.64 · 0.95 m (lampY) 0.44 · 1.50 m 0.26 · 2.00 m 0.12 ·
   *      2.60 m 0.03 · 3.10 m (box top) 0.001
   *
   * — against the 0.83 this section's own header advertises. Every slab spent
   * its density in the first half-metre off the road, so the „пелена" was a
   * skirt around the wheels: the stop lamps stayed legible through it (0.44 is
   * not „не разчитай да видиш … стоповете му"), and the road BEYOND the truck —
   * the sight distance briefing 3 and 4 are about, which from a 1.2 m cockpit
   * eye reads out at roughly 0.8–2.0 m of curtain height — was 88 % clear. That
   * is the w20 row: a plume that renders and costs no visibility. Closing the
   * gap could not settle it either, because closing only walks k from 4 to 5.
   *
   * Holding the crest instead, same rig, same k = 5, same heights:
   *
   *      0.74 · 0.78 · 0.67 · 0.47 · 0.14 · 0.006
   *
   * — opaque where he is trying to look, and still transparent at the box top,
   * so he never LOSES the truck. That distinction is the header's, and it is
   * the one the render was failing in the wrong direction.
   *
   * AND BRIEFING 9 („колкото по-близо си, толкова по-малко виждаш") now has a
   * gradient to meet. At 2.00 m, where the road beyond the truck reads out, the
   * curtain walks with k — which is what `sprayDensity`'s near term buys as the
   * gap closes — 0.04 → 0.25 → 0.47 for k = 3 → 4 → 5. Before, the same walk
   * was 0.01 → 0.05 → 0.12: closing the gap bought him nothing he could see, so
   * the instruction was a slogan. k = 1 is still only a haze (0.30 at its
   * strongest), so a light shower behind a slow rig has not become a wall.
   *
   * Both rows measured by rasterising THIS function and compounding it through
   * `spraySlabShape` on the green channel three's alphaMap samples — not
   * modelled. Nothing in the geometry moved: same five quads, same widths, same
   * backM spacing, same single draw call.
   */
  const CREST_UP = 0.55;
  // Deterministic value noise — road spray is dust, not an airbrush gradient,
  // and a perfectly smooth ramp is what made the first render read as three
  // nested rectangles instead of one cloud (looked at, 65 км/ч, 58.7 m gap).
  const cell = (cx: number, cy: number): number => {
    let h = (cx * 374761393 + cy * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const noise = (fx: number, fy: number): number => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = cell(x0, y0) + (cell(x0 + 1, y0) - cell(x0, y0)) * tx;
    const b = cell(x0, y0 + 1) + (cell(x0 + 1, y0 + 1) - cell(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let y = 0; y < H; y++) {
    // DataTexture keeps flipY = false, so row 0 is v = 0 — the BOTTOM of the
    // quad, i.e. the tarmac. `up` therefore runs 0 (road) → 1 (top of slab).
    const up = y / (H - 1);
    // Full strength through the body of the slab, then thinning to nothing at
    // the crown — a cloud that ENDS, not a cloud that was never there. The
    // crown fade is what keeps the stagger from drawing five stacked lids.
    const crest = up > CREST_UP ? smooth((1 - up) / (1 - CREST_UP)) : 1;
    // …and not a hard cut AT the road either: the first 12 % fades in, so the
    // slab never draws a straight line across the tarmac.
    const foot = up < 0.12 ? smooth(up / 0.12) : 1;
    const vertical = crest * foot;
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1; // −1..1 across the slab
      // cos falloff, not 1 − u²: it reaches zero with zero SLOPE, which is what
      // kills the visible rectangle edge the parabola left behind.
      const across = Math.pow(Math.cos((u * Math.PI) / 2), 1.7);
      // Two octaves of drift, biased so the mean stays near 1 (the noise
      // breaks the silhouette up; it must not thin the curtain out).
      const n = 0.62 + 0.5 * noise(u * 3.1 + 7, up * 4.3) + 0.26 * noise(u * 8.3, up * 9.7 + 3);
      const a = vertical * across * n;
      const idx = (y * W + x) * 4;
      // THE RAMP GOES IN RGB, NOT IN A. three's `alphaMap` samples the GREEN
      // channel (`diffuseColor.a *= texture2D(alphaMap, vUv).g`) — the first
      // build put this ramp in the alpha channel and left g = 1 everywhere,
      // and the render came back as three flat hard-edged rectangles stacked
      // behind the truck. Looked at, not reasoned about: doc 66 R0.
      const g = Math.round(255 * (a < 0 ? 0 : a > 1 ? 1 : a));
      data[idx] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
      data[idx + 3] = 255;
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat);
  // DataTexture defaults to NearestFilter; at the scale a 5.4 m slab occupies
  // 20 m from the eye that reads as a 64-px checkerboard, not as water.
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Geometry + material + texture for the spray curtain. The caller OWNS all
 *  three and must dispose them (TrafficLayer does it in an unmount effect,
 *  the same contract as its blob texture). */
export interface SprayCurtain {
  geometry: PlaneGeometry;
  material: MeshBasicMaterial;
  texture: DataTexture;
}

/**
 * Build the shared spray quad. One unit plane; every slab is that plane scaled
 * by `spraySlabShape`, so the whole curtain is 2 triangles of geometry and one
 * draw call however many emitters a lesson stages.
 *
 * `depthWrite` off (it must not carve a hole in the truck behind it) but depth
 * TEST on, so once the student passes the truck its plume is correctly hidden
 * by whatever is now in front of him. `fog` stays on — a curtain that ignored
 * the scene fog would be the one bright rectangle in a grey motorway.
 */
export function buildSprayCurtain(): SprayCurtain {
  const texture = buildSprayAlphaTexture();
  const material = new MeshBasicMaterial({
    // Road spray is lit water dust: near-white, very slightly cool.
    color: 0xdfe6ea,
    alphaMap: texture,
    transparent: true,
    opacity: SPRAY_SLAB_ALPHA,
    depthWrite: false,
    side: DoubleSide,
  });
  material.name = "traffic_spray";
  const geometry = new PlaneGeometry(1, 1);
  return { geometry, material, texture };
}

/** Free a curtain's owned GPU resources. */
export function disposeSprayCurtain(c: SprayCurtain): void {
  c.geometry.dispose();
  c.material.dispose();
  c.texture.dispose();
}


/** Emergency-rig body plan, meters (fictional, ADR-001): a compact white
 *  box-van silhouette (~5.6 × 2.1 × 2.5) with a roof-mounted BLUE light bar —
 *  unmistakably "special regime" in the mirror without any real-world livery
 *  or insignia (no crosses, no stars, no lettering). */
export const EMERGENCY_DIMENSIONS = {
  lengthM: 5.6,
  widthM: 2.1,
  cabHeightM: 2.0,
  boxHeightM: 2.5,
  wheelRadiusM: 0.38,
  lightBar: { widthM: 1.2, heightM: 0.2, lengthM: 0.36 },
} as const;

/** Beacon strobe lens colors: lit blue flash vs dark navy lens (the same
 *  lit/unlit-lens discipline as TrafficLayer's BLINK_ON/BLINK_OFF quads). */
export const STROBE_ON = 0x2f7dff;
export const STROBE_OFF = 0x0c1f4e;
/** Strobe alternation half-period, s — half TrafficLayer's indicator blink
 *  period (0.9), so the beacon flips sides ~2.2×/s off the SAME deterministic
 *  clock the NPC blinkers already accumulate. */
export const STROBE_HALF_PERIOD_S = 0.45;

/**
 * Flip the emergency beacon (left/right lamp domes in anti-phase) from the
 * shared blink clock. The lamp materials are SHARED across every emergency
 * instance, so this is one cached-phase check per frame and two color writes
 * per flip edge — no per-instance work, no allocations. No-op (early return)
 * when no emergency actor is staged.
 */
export function updateEmergencyStrobe(fleet: TrafficFleet, blinkClockSec: number): void {
  const em = fleet.models[EMERGENCY_MODEL_INDEX];
  const strobe = em?.rig.strobe;
  if (!strobe || !em.mesh) return;
  const phase = Math.floor(blinkClockSec / STROBE_HALF_PERIOD_S) & 1;
  if (phase === strobe.phase) return;
  strobe.phase = phase;
  strobe.left.color.setHex(phase === 0 ? STROBE_ON : STROBE_OFF);
  strobe.right.color.setHex(phase === 0 ? STROBE_OFF : STROBE_ON);
}

/**
 * The procedural emergency ModelRig (doc 72 §15 N9 / VU-09 „Линейка отзад"):
 * a white cab + white box body (merged, one draw) topped by an emissive BLUE
 * light-bar box + a blue beltline stripe on each flank (merged into one blue
 * draw), PLUS two beacon lamp domes at the bar ends on their own unlit-basic
 * materials (toneMapped false — the TrafficLayer lamp-quad look). The domes
 * are the STROBE: updateEmergencyStrobe flips their colors in anti-phase on
 * the shared indicator blink clock — two color writes per edge, shared across
 * every emergency instance, zero per-frame cost otherwise. Ground-relative
 * like the GLB kit (Y = 0 = tarmac, nose +Z); shared fleet wheels scaled to
 * 0.38 m hubs. All geometry + materials are OWNED (disposed via
 * ownedMaterials/geometry).
 */
function buildEmergencyRig(): ModelRig {
  const { lengthM, widthM, cabHeightM, boxHeightM, wheelRadiusM, lightBar } = EMERGENCY_DIMENSIONS;
  const halfLength = lengthM / 2;
  const bodyMat = new MeshStandardMaterial({
    color: 0xe9eae6, // clean fleet white (fictional livery, ADR-001)
    metalness: 0.15,
    roughness: 0.5,
    envMapIntensity: 1.35,
  });
  bodyMat.name = "emergency_body";
  const blueMat = new MeshStandardMaterial({
    color: 0x1c4fd8, // signal blue: light bar + beltline stripe
    metalness: 0.2,
    roughness: 0.35,
    emissive: 0x2a5cff,
    emissiveIntensity: 1.2,
  });
  blueMat.name = "emergency_blue";
  // Cab over the front axle, slightly narrower + lower than the patient box.
  const cabLen = 1.7;
  const cab = new BoxGeometry(widthM - 0.12, cabHeightM - 0.5, cabLen);
  cab.translate(0, 0.5 + (cabHeightM - 0.5) / 2, halfLength - cabLen / 2);
  const boxLen = lengthM - cabLen - 0.15;
  const box = new BoxGeometry(widthM, boxHeightM - 0.55, boxLen);
  box.translate(0, 0.55 + (boxHeightM - 0.55) / 2, -halfLength + boxLen / 2);
  const whiteMerged = mergeGeometries([cab, box], false) ?? cab;
  if (whiteMerged !== cab) {
    cab.dispose();
    box.dispose();
  }
  // Blue kit: roof light bar (over the cab, the identity) + beltline stripes.
  const barZ = halfLength - cabLen / 2 - 0.1;
  const bar = new BoxGeometry(lightBar.widthM, lightBar.heightM, lightBar.lengthM);
  bar.translate(0, cabHeightM + lightBar.heightM / 2, barZ);
  const stripeY = 1.05;
  const stripeLen = boxLen - 0.3;
  const stripeL = new BoxGeometry(0.05, 0.28, stripeLen);
  stripeL.translate(widthM / 2 + 0.01, stripeY, -halfLength + boxLen / 2);
  const stripeR = new BoxGeometry(0.05, 0.28, stripeLen);
  stripeR.translate(-widthM / 2 - 0.01, stripeY, -halfLength + boxLen / 2);
  const blueMerged = mergeGeometries([bar, stripeL, stripeR], false) ?? bar;
  if (blueMerged !== bar) {
    bar.dispose();
    stripeL.dispose();
    stripeR.dispose();
  }
  // Beacon lamp domes at the bar ends — unlit basic materials (the lamp-quad
  // look: no lighting, no tone mapping) so a color flip reads as LIGHT. Both
  // start dark; updateEmergencyStrobe drives the anti-phase flash.
  const strobeLMat = new MeshBasicMaterial({ color: STROBE_OFF, toneMapped: false });
  strobeLMat.name = "emergency_strobe_l";
  const strobeRMat = new MeshBasicMaterial({ color: STROBE_OFF, toneMapped: false });
  strobeRMat.name = "emergency_strobe_r";
  const lampH = lightBar.heightM + 0.06; // domes poke above the bar
  const lampX = lightBar.widthM / 2 - 0.16;
  const lampL = new BoxGeometry(0.32, lampH, lightBar.lengthM + 0.06);
  lampL.translate(lampX, cabHeightM + lampH / 2, barZ); // +X = left
  const lampR = new BoxGeometry(0.32, lampH, lightBar.lengthM + 0.06);
  lampR.translate(-lampX, cabHeightM + lampH / 2, barZ);
  const bodyGeometry =
    mergeGeometries([whiteMerged, blueMerged, lampL, lampR], true) ?? whiteMerged;
  if (bodyGeometry !== whiteMerged) {
    whiteMerged.dispose();
    blueMerged.dispose();
    lampL.dispose();
    lampR.dispose();
  }
  const track = widthM / 2 - 0.2;
  const frontAxleZ = halfLength - 1.0;
  const rearAxleZ = -halfLength + 1.25;
  return {
    bodyGeometry,
    bodyMaterials:
      bodyGeometry.groups.length === 4
        ? [bodyMat, blueMat, strobeLMat, strobeRMat]
        : [bodyMat],
    ownedMaterials: [bodyMat, blueMat, strobeLMat, strobeRMat],
    strobe: { left: strobeLMat, right: strobeRMat, phase: -1 },
    paint: null, // no palette tint — white + blue IS the profile's identity
    customWheel: null, // shared fleet wheel, scaled to the 0.38 m hubs
    wheelOffsets: [
      new Vector3(track, wheelRadiusM, frontAxleZ), // FL (+X = left)
      new Vector3(-track, wheelRadiusM, frontAxleZ), // FR
      new Vector3(track, wheelRadiusM, rearAxleZ), // RL
      new Vector3(-track, wheelRadiusM, rearAxleZ), // RR
    ],
    wheelRadius: wheelRadiusM,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth: widthM / 2,
    halfLength,
    lampY: 0.85,
    headY: 0.75,
  };
}

/** Tram-rig body plan, meters (fictional, ADR-001 — no real livery): a LONG
 *  articulated two-segment silhouette (~14 × 2.3 × 3.1) with a roof
 *  pantograph hint — unmistakably "rail vehicle" in the junction mouth. The
 *  point of the length is perceptual: a driver reads 14 m of tram and knows
 *  it can neither stop like a car nor swerve at all (doc 72 RX-05). */
export const TRAM_DIMENSIONS = {
  lengthM: 14,
  widthM: 2.3,
  bodyHeightM: 3.05,
  /** Articulation gap between the two body segments. */
  gapM: 0.5,
  wheelRadiusM: 0.33,
  pantograph: { apexM: 3.85, armLenM: 1.05, barWidthM: 1.3 },
} as const;

/**
 * The procedural articulated tram ModelRig (doc 72 §12 RX-04/RX-05, ADR-006
 * stage 3b — the rail pack's actor): TWO joined box segments in a deep
 * fictional crimson (one paint draw) + a graphite kit merged into one dark
 * draw (articulation bellows, roof strip, skirt band, pantograph Λ-arms +
 * contact bar). Ground-relative like the GLB kit (Y = 0 = tarmac, nose +Z);
 * shared fleet wheels scaled to the 0.33 m bogie hubs sit tucked under the
 * skirt. HONEST LIMITS (documented at VehicleProfile): the tram is a
 * path-locked staged vehicle — its authored polyline is the "track"; no rail
 * mesh, no separate rail physics, and every proximity query stays point-based
 * at the body center. All geometry + materials are OWNED (disposed via
 * ownedMaterials/geometry).
 */
function buildTramRig(): ModelRig {
  const { lengthM, widthM, bodyHeightM, gapM, wheelRadiusM, pantograph } = TRAM_DIMENSIONS;
  const halfLength = lengthM / 2;
  const paintMat = new MeshStandardMaterial({
    color: 0x9a2b33, // fictional Sofia-tram red (ADR-001 — no real livery); a
    // touch brighter + glossier than the old crimson so it catches light and
    // reads as a painted vehicle, not a dark box (founder R0: „plain red box").
    metalness: 0.3,
    roughness: 0.38,
    envMapIntensity: 1.4,
  });
  paintMat.name = "tram_paint";
  const darkMat = new MeshStandardMaterial({
    color: 0x1c2024, // near-black graphite: glazing band + cab screens + skirt +
    // bellows + roof kit + pantograph (dark enough to read as glass/underframe)
    metalness: 0.4,
    roughness: 0.45,
  });
  darkMat.name = "tram_dark";
  // Two body segments over a 0.35 m skirt clearance, separated by the gap.
  const segLen = (lengthM - gapM) / 2;
  const segH = bodyHeightM - 0.35;
  const segFront = new BoxGeometry(widthM, segH, segLen);
  segFront.translate(0, 0.35 + segH / 2, gapM / 2 + segLen / 2);
  const segRear = new BoxGeometry(widthM, segH, segLen);
  segRear.translate(0, 0.35 + segH / 2, -(gapM / 2 + segLen / 2));
  const paintMerged = mergeGeometries([segFront, segRear], false) ?? segFront;
  if (paintMerged !== segFront) {
    segFront.dispose();
    segRear.dispose();
  }
  // Segment centres (front at +Z / the nose end) — shared by the roof, the
  // pantograph and the glazing band below.
  const segCF = gapM / 2 + segLen / 2;
  const segCR = -(gapM / 2 + segLen / 2);
  // Dark kit: articulation bellows bridging the gap…
  const bellows = new BoxGeometry(widthM - 0.3, segH - 0.4, gapM + 0.24);
  bellows.translate(0, 0.55 + (segH - 0.4) / 2, 0);
  // …a low roof strip along each segment (equipment boxes)…
  const roofF = new BoxGeometry(widthM - 0.7, 0.16, segLen - 1.2);
  roofF.translate(0, bodyHeightM + 0.08, segCF);
  const roofR = new BoxGeometry(widthM - 0.7, 0.16, segLen - 1.2);
  roofR.translate(0, bodyHeightM + 0.08, segCR);
  // …the pantograph hint on the FRONT segment: two Λ-leaning arms + a contact
  // bar at the apex (three slim boxes — a silhouette, not a mechanism)…
  const pantoZ = segCF;
  const armRise = pantograph.apexM - (bodyHeightM + 0.16);
  const armLean = Math.acos(Math.min(1, armRise / pantograph.armLenM));
  const armA = new BoxGeometry(0.06, pantograph.armLenM, 0.06);
  armA.rotateX(armLean);
  armA.translate(0, bodyHeightM + 0.16 + armRise / 2, pantoZ + 0.3);
  const armB = new BoxGeometry(0.06, pantograph.armLenM, 0.06);
  armB.rotateX(-armLean);
  armB.translate(0, bodyHeightM + 0.16 + armRise / 2, pantoZ - 0.3);
  const bar = new BoxGeometry(pantograph.barWidthM, 0.05, 0.14);
  bar.translate(0, pantograph.apexM, pantoZ);
  // …the GLAZING BAND — the single strongest „this is a tram" cue (founder R0):
  // a continuous dark window strip flush to each flank at seated-eye height, so
  // the body reads as a glazed vehicle and not a solid red prism.
  const winY = 2.15;
  const winH = 0.85;
  const winLen = segLen - 0.7;
  const flankX = widthM / 2 - 0.01; // flush to the flank, protrudes ~0.02 m
  const glassParts: BufferGeometry[] = [];
  for (const segZ of [segCF, segCR]) {
    for (const sx of [flankX, -flankX]) {
      const w = new BoxGeometry(0.06, winH, winLen);
      w.translate(sx, winY, segZ);
      glassParts.push(w);
    }
  }
  // …cab windscreens on the two end faces — the black driver-cab glass that
  // turns the flat red ends into a front/rear you can read the direction from…
  const screenF = new BoxGeometry(widthM - 0.34, 1.0, 0.06);
  screenF.translate(0, 2.2, halfLength - 0.02);
  const screenR = new BoxGeometry(widthM - 0.34, 1.0, 0.06);
  screenR.translate(0, 2.2, -halfLength + 0.02);
  // …and a low underframe skirt along each flank (dark bottom band for contrast
  // with the red body above the wheels).
  const skirtL = new BoxGeometry(0.06, 0.32, lengthM - 0.6);
  skirtL.translate(flankX, 0.55, 0);
  const skirtR = new BoxGeometry(0.06, 0.32, lengthM - 0.6);
  skirtR.translate(-flankX, 0.55, 0);
  const darkParts = [
    bellows,
    roofF,
    roofR,
    armA,
    armB,
    bar,
    ...glassParts,
    screenF,
    screenR,
    skirtL,
    skirtR,
  ];
  const darkMerged = mergeGeometries(darkParts, false) ?? bellows;
  if (darkMerged !== bellows) for (const g of darkParts) g.dispose();
  const bodyGeometry = mergeGeometries([paintMerged, darkMerged], true) ?? paintMerged;
  if (bodyGeometry !== paintMerged) {
    paintMerged.dispose();
    darkMerged.dispose();
  }
  // Two bogies; wheels tucked inside the skirt line (track < half width).
  const track = widthM / 2 - 0.3;
  const frontBogieZ = gapM / 2 + segLen / 2;
  const rearBogieZ = -(gapM / 2 + segLen / 2);
  return {
    bodyGeometry,
    bodyMaterials: bodyGeometry.groups.length === 2 ? [paintMat, darkMat] : [paintMat],
    ownedMaterials: [paintMat, darkMat],
    paint: null, // no palette tint — the crimson IS the profile's identity
    customWheel: null, // shared fleet wheel, scaled to the 0.33 m bogie hubs
    wheelOffsets: [
      new Vector3(track, wheelRadiusM, frontBogieZ), // FL (+X = left)
      new Vector3(-track, wheelRadiusM, frontBogieZ), // FR
      new Vector3(track, wheelRadiusM, rearBogieZ), // RL
      new Vector3(-track, wheelRadiusM, rearBogieZ), // RR
    ],
    wheelRadius: wheelRadiusM,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth: widthM / 2,
    halfLength,
    lampY: 0.9,
    headY: 0.8,
  };
}

/** Train body plan, meters (fictional, ADR-001 — no real livery): a MULTI-UNIT
 *  heavy-rail consist (a locomotive + 2 cars) that actually CROSSES the road at
 *  a railway level crossing (RX-02/RX-01). Unlike the street-running tram (a
 *  ~14 m single articulated body sharing the traffic lane), the train is much
 *  LONGER and rides a PERPENDICULAR rail path over the rendered rail deck
 *  (world/builders/railTrack.ts): its wheel track equals the deck's rail gauge
 *  so the wheels sit ON the drawn rails, and it is wide enough to overhang
 *  them. Still a path-locked staged actor — no free physics, no rail sim; the
 *  authored polyline IS the track, and every proximity query stays point-based
 *  at the body centre (the VehicleProfile point-geometry law). */
export const TRAIN_DIMENSIONS = {
  /** Units in the consist (1 locomotive + 2 passenger cars). */
  units: 3,
  /** Per-unit body length + the coupler gap between units, m. */
  unitLengthM: 11,
  couplerGapM: 0.7,
  /** Body width — overhangs the deck's rail gauge (railTrack RAIL_GAUGE_M ≈
   *  3.59 m at the perceptual road scale), the real rail silhouette. */
  widthM: 3.9,
  bodyHeightM: 3.95,
  wheelRadiusM: 0.46,
  /** Wheel track = HALF the rendered rail gauge, so the shared bogie wheels
   *  land on the two drawn rails. */
  railGaugeM: 1.435 * PERCEPTUAL_ROAD_SCALE,
} as const;

/** Total consist length, m (units × unitLen + gaps). */
export const TRAIN_LENGTH_M =
  TRAIN_DIMENSIONS.units * TRAIN_DIMENSIONS.unitLengthM +
  (TRAIN_DIMENSIONS.units - 1) * TRAIN_DIMENSIONS.couplerGapM;

/**
 * The procedural multi-unit TRAIN ModelRig (the railway-crossing actor). ONE
 * rigid merged geometry (the whole consist translates/rotates as a unit — a
 * train is inflexible, so unlike the tram's articulation there is no bend
 * modelled): a deep fictional-teal body over each unit (one paint draw), a
 * safety-YELLOW nose band + cab stripe on the leading locomotive (one accent
 * draw), and a graphite kit — roof equipment strip, low skirt, and coupler
 * bellows bridging the unit gaps (one dark draw). Ground-relative like the GLB
 * kit (Y = 0 = tarmac, nose +Z); shared fleet wheels scaled to the 0.46 m
 * bogie hubs, tracked to the rail gauge. All geometry + materials are OWNED
 * (disposed via ownedMaterials/geometry).
 */
function buildTrainRig(): ModelRig {
  const { units, unitLengthM, couplerGapM, widthM, bodyHeightM, wheelRadiusM, railGaugeM } =
    TRAIN_DIMENSIONS;
  const lengthM = TRAIN_LENGTH_M;
  const halfLength = lengthM / 2;
  const paintMat = new MeshStandardMaterial({
    color: 0x1f5a63, // deep fictional teal (ADR-001 — no real livery)
    metalness: 0.35,
    roughness: 0.45,
    envMapIntensity: 1.35,
  });
  paintMat.name = "train_paint";
  const accentMat = new MeshStandardMaterial({
    color: 0xf2c14e, // safety yellow: locomotive nose band + cab stripe
    metalness: 0.1,
    roughness: 0.5,
  });
  accentMat.name = "train_accent";
  const darkMat = new MeshStandardMaterial({
    color: 0x24282b, // graphite: roof kit + skirt + coupler bellows
    metalness: 0.35,
    roughness: 0.55,
  });
  darkMat.name = "train_dark";

  const skirt = 0.4; // ground clearance below the body boxes
  const bodyH = bodyHeightM - skirt;
  const pitch = unitLengthM + couplerGapM;
  // Unit i center Z (i = 0 is the leading locomotive at +Z / the nose end).
  const unitCenterZ = (i: number) => halfLength - unitLengthM / 2 - i * pitch;

  // -- body units (paint) --------------------------------------------------
  const bodyParts: BufferGeometry[] = [];
  for (let i = 0; i < units; i++) {
    const seg = new BoxGeometry(widthM, bodyH, unitLengthM);
    seg.translate(0, skirt + bodyH / 2, unitCenterZ(i));
    bodyParts.push(seg);
  }
  const paintMerged = mergeGeometries(bodyParts, false) ?? bodyParts[0];
  if (paintMerged !== bodyParts[0]) for (const g of bodyParts) g.dispose();

  // -- accent: locomotive nose band (front face) + a cab stripe (accent) ----
  const locoZ = unitCenterZ(0);
  const noseBand = new BoxGeometry(widthM + 0.04, 0.9, 0.5);
  noseBand.translate(0, skirt + 0.45, locoZ + unitLengthM / 2 - 0.25);
  const cabStripeL = new BoxGeometry(0.06, 0.34, unitLengthM - 1.4);
  cabStripeL.translate(widthM / 2 + 0.02, skirt + bodyH - 0.6, locoZ);
  const cabStripeR = new BoxGeometry(0.06, 0.34, unitLengthM - 1.4);
  cabStripeR.translate(-widthM / 2 - 0.02, skirt + bodyH - 0.6, locoZ);
  const accentParts = [noseBand, cabStripeL, cabStripeR];
  const accentMerged = mergeGeometries(accentParts, false) ?? noseBand;
  if (accentMerged !== noseBand) for (const g of accentParts) g.dispose();

  // -- dark kit: roof strip per unit, a full-length skirt, coupler bellows ---
  const darkParts: BufferGeometry[] = [];
  for (let i = 0; i < units; i++) {
    const roof = new BoxGeometry(widthM - 0.8, 0.22, unitLengthM - 1.4);
    roof.translate(0, bodyHeightM - 0.11, unitCenterZ(i));
    darkParts.push(roof);
  }
  const skirtBox = new BoxGeometry(widthM - 0.2, skirt, lengthM);
  skirtBox.translate(0, skirt / 2, 0);
  darkParts.push(skirtBox);
  for (let i = 0; i < units - 1; i++) {
    const gapZ = unitCenterZ(i) - unitLengthM / 2 - couplerGapM / 2;
    const bellows = new BoxGeometry(widthM - 1.0, bodyH - 0.6, couplerGapM + 0.2);
    bellows.translate(0, skirt + (bodyH - 0.6) / 2, gapZ);
    darkParts.push(bellows);
  }
  const darkMerged = mergeGeometries(darkParts, false) ?? darkParts[0];
  if (darkMerged !== darkParts[0]) for (const g of darkParts) g.dispose();

  const bodyGeometry =
    mergeGeometries([paintMerged, accentMerged, darkMerged], true) ?? paintMerged;
  if (bodyGeometry !== paintMerged) {
    paintMerged.dispose();
    accentMerged.dispose();
    darkMerged.dispose();
  }

  // Two bogies under the leading + trailing units, tracked to the rail gauge
  // (wheels land on the drawn rails). Only 4 shared wheels per vehicle exist —
  // the honest tram limit; on a 34 m consist they read as bogie hints tucked
  // under the skirt.
  const track = railGaugeM / 2;
  const frontBogieZ = unitCenterZ(0);
  const rearBogieZ = unitCenterZ(units - 1);
  return {
    bodyGeometry,
    bodyMaterials:
      bodyGeometry.groups.length === 3 ? [paintMat, accentMat, darkMat] : [paintMat],
    ownedMaterials: [paintMat, accentMat, darkMat],
    paint: null, // no palette tint — the teal + yellow IS the profile's identity
    customWheel: null, // shared fleet wheel, scaled to the 0.46 m bogie hubs
    wheelOffsets: [
      new Vector3(track, wheelRadiusM, frontBogieZ), // FL (+X = left)
      new Vector3(-track, wheelRadiusM, frontBogieZ), // FR
      new Vector3(track, wheelRadiusM, rearBogieZ), // RL
      new Vector3(-track, wheelRadiusM, rearBogieZ), // RR
    ],
    wheelRadius: wheelRadiusM,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth: widthM / 2,
    halfLength,
    lampY: 1.0,
    headY: 0.9,
  };
}

/** Bicycle body plan, meters (fictional, ADR-001): a ~1.7 m city bike + a
 *  seated rider whose helmet tops out ~1.7 m — visibly NARROW and TALL next
 *  to every car, which is the entire perceptual point of VU-01/02/03. The
 *  child variant scales the whole plan by CHILD_CYCLIST_SCALE with a
 *  proportionally LARGER head/helmet and an upright posture — the two
 *  strongest silhouette cues for „child". */
export const BICYCLE_DIMENSIONS = {
  wheelRadiusM: 0.34,
  /** Front/rear hub distance from the bottom-bracket origin, m. */
  hubZM: 0.53,
  /** halfLength = hubZM + wheelRadiusM (the wheels ARE the footprint). */
  halfLengthM: 0.87,
  /** halfWidth = the handlebar half-span. */
  halfWidthM: 0.23,
} as const;
/** Uniform body-plan scale of the child rig (≈ a 7-year-old's 16" bike). */
export const CHILD_CYCLIST_SCALE = 0.72;

/**
 * The procedural BICYCLE + RIDER ModelRig (audit C3's missing render half —
 * doc 72 §7 VU-01/02/03: the „cyclist" proxy used to render with the CAR
 * fleet, which is exactly the founder-reported bug „казва дете с колело, а
 * отпред кара кола"). Three merged material groups: frame kit (tubes, bars,
 * saddle, pedals, helmet), rider clothes (torso, arms, legs) and skin (head).
 * The two REAL wheels ride the custom-wheel channel so they spin from
 * speed·dt/r and the front one steers: cwL carries the visible wheel at the
 * front/rear hubs; cwR (the mechanism is side-paired for the hero SUV) gets a
 * 1 cm placeholder box hidden INSIDE the hub — same slots, nothing drawn.
 * Ground-relative like the GLB kit (Y = 0 = tarmac, nose +Z); rider is STATIC
 * (honest v1 — pedalling legs are a TrafficLayer polish pass, the pedestrian
 * swing machinery does not reach instanced vehicle bodies today). Entirely
 * fictional (ADR-001 — no brands, no insignia); all geometry + materials are
 * OWNED (disposed via ownedMaterials/geometry).
 */
function buildBicycleRig(child: boolean): ModelRig {
  const s = child ? CHILD_CYCLIST_SCALE : 1;
  /** Child heads read big for the body — scaled ON TOP of the body scale. */
  const headScale = (child ? 1.18 : 1) * s;
  /** Torso lean: adult commuter tips forward, a child sits upright. */
  const lean = child ? 0.2 : 0.42;
  const r = BICYCLE_DIMENSIONS.wheelRadiusM * s;
  const hubZ = BICYCLE_DIMENSIONS.hubZM * s;
  const halfLength = BICYCLE_DIMENSIONS.halfLengthM * s;
  const halfWidth = BICYCLE_DIMENSIONS.halfWidthM * s;

  const frameMat = new MeshStandardMaterial({
    // Fictional liveries: brick-red adult frame, bright-green child frame.
    color: child ? 0x2e8a5f : 0x8a3a2e,
    metalness: 0.45,
    roughness: 0.4,
    envMapIntensity: 1.35,
  });
  frameMat.name = child ? "bike_frame_child" : "bike_frame";
  const clothesMat = new MeshStandardMaterial({
    // The child wears hi-vis orange — the silhouette the drill is ABOUT.
    color: child ? 0xd97a1f : 0x4f6d8a,
    metalness: 0.05,
    roughness: 0.85,
  });
  clothesMat.name = "bike_rider";
  const skinMat = new MeshStandardMaterial({
    color: 0xc9a184, // the pedestrian head tone (one skin, one palette)
    metalness: 0.0,
    roughness: 0.85,
  });
  skinMat.name = "bike_skin";

  /** Slanted strut: Box(w, len, w) rotated about X, centered at (x, y, z). */
  const strut = (w: number, len: number, rotX: number, x: number, y: number, z: number) => {
    const g = new BoxGeometry(w * s, len * s, w * s);
    if (rotX !== 0) g.rotateX(rotX);
    g.translate(x * s, y * s, z * s);
    return g;
  };
  const box = (
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    rotX = 0,
  ) => {
    const g = new BoxGeometry(sx * s, sy * s, sz * s);
    if (rotX !== 0) g.rotateX(rotX);
    g.translate(x * s, y * s, z * s);
    return g;
  };

  // Frame kit (frame material): fork, down tube, seat tube, chainstay, top
  // tube, handlebar, saddle, crank + two pedals (fixed crank pose), helmet.
  const helmet = new SphereGeometry(0.125 * headScale, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  helmet.translate(0, 1.57 * s, 0.06 * s);
  const frameParts = [
    strut(0.05, 0.68, 0.165, 0, 0.67, 0.475), // head tube + fork
    strut(0.06, 0.74, 0.65, 0, 0.655, 0.175), // down tube
    strut(0.06, 0.57, -0.305, 0, 0.63, -0.135), // seat tube + post
    box(0.05, 0.05, 0.5, 0, 0.35, -0.29), // chainstay
    box(0.05, 0.05, 0.62, 0, 0.93, 0.09), // top tube
    box(0.46, 0.04, 0.04, 0, 1.02, 0.42), // handlebar
    box(0.09, 0.05, 0.26, 0, 0.92, -0.22), // saddle
    box(0.24, 0.05, 0.05, 0, 0.36, -0.05), // crank axle
    box(0.1, 0.03, 0.09, 0.15, 0.28, 0.07), // left pedal (forward-low)
    box(0.1, 0.03, 0.09, -0.15, 0.44, -0.17), // right pedal (back-high)
    helmet,
  ];
  const frameMerged = mergeGeometries(frameParts, false) ?? frameParts[0];
  if (frameMerged !== frameParts[0]) for (const g of frameParts) g.dispose();

  // Rider clothes: two legs astride the frame (feet on the fixed pedals),
  // forward-leaning torso, two arms reaching the handlebar.
  const clothesParts = [
    box(0.1, 0.6, 0.13, 0.1, 0.56, -0.06, 0.3), // left leg (extended)
    box(0.1, 0.46, 0.13, -0.1, 0.64, -0.17, -0.15), // right leg (bent)
    box(0.32, 0.56, 0.2, 0, 1.16, -0.04, lean), // torso
    box(0.07, 0.5, 0.07, 0.155, 1.2, 0.2, 2.33), // left arm to the bar
    box(0.07, 0.5, 0.07, -0.155, 1.2, 0.2, 2.33), // right arm to the bar
  ];
  const clothesMerged = mergeGeometries(clothesParts, false) ?? clothesParts[0];
  if (clothesMerged !== clothesParts[0]) for (const g of clothesParts) g.dispose();

  const head = new SphereGeometry(0.11 * headScale, 8, 6);
  head.translate(0, 1.52 * s, 0.06 * s);

  const bodyGeometry = mergeGeometries([frameMerged, clothesMerged, head], true) ?? frameMerged;
  if (bodyGeometry !== frameMerged) {
    frameMerged.dispose();
    clothesMerged.dispose();
    head.dispose();
  }

  // Custom-wheel channel: the LEFT set is the visible wheel (X-axial tire ring
  // + a pale spoke disc), instanced at BOTH hubs; the RIGHT set is a 1 cm
  // placeholder parked inside the hub (the channel is side-paired — see the
  // rig doc above). Wheel offsets sit ON the centerline (x = 0): FL/FR are the
  // front hub twice, RL/RR the rear — so the front wheel steers and both roll.
  const tireMat = new MeshStandardMaterial({ color: 0x23262a, metalness: 0.1, roughness: 0.85 });
  tireMat.name = "bike_tire";
  const spokeMat = new MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
  spokeMat.name = "bike_spokes";
  const tire = new CylinderGeometry(r, r, 0.05 * s, 14);
  tire.rotateZ(Math.PI / 2); // cylinder axis Y -> X (the fleet spin axis)
  const disc = new CylinderGeometry(r - 0.05 * s, r - 0.05 * s, 0.02 * s, 12);
  disc.rotateZ(Math.PI / 2);
  const wheelGeo = mergeGeometries([tire, disc], true) ?? tire;
  if (wheelGeo !== tire) {
    tire.dispose();
    disc.dispose();
  }
  const hiddenGeo = new BoxGeometry(0.01, 0.01, 0.01);

  return {
    bodyGeometry,
    bodyMaterials:
      bodyGeometry.groups.length === 3 ? [frameMat, clothesMat, skinMat] : [frameMat],
    ownedMaterials: [frameMat, clothesMat, skinMat, tireMat, spokeMat],
    paint: null, // no palette tint — the frame color IS the variant's identity
    customWheel: {
      left: {
        geometry: wheelGeo,
        materials: wheelGeo.groups.length === 2 ? [tireMat, spokeMat] : [tireMat],
      },
      right: { geometry: hiddenGeo, materials: [tireMat] },
    },
    wheelOffsets: [
      new Vector3(0, r, hubZ), // FL -> the front wheel (steers)
      new Vector3(0, r, hubZ), // FR -> the hidden placeholder, same hub
      new Vector3(0, r, -hubZ), // RL -> the rear wheel
      new Vector3(0, r, -hubZ), // RR -> the hidden placeholder
    ],
    wheelRadius: r,
    rearZ: -halfLength,
    frontZ: halfLength,
    halfWidth,
    halfLength,
    lampY: 0.62 * s, // the tail bar reads as a rear reflector/light
    headY: 0.8 * s,
  };
}

/** Animal body plan, meters (fictional, ADR-001): a mid-size deer-ish
 *  quadruped — torso ~1.2 m long over ~0.6 m legs, a raised head/neck and a
 *  short tail, so it reads unmistakably as „животно" (four legs, a head that
 *  is NOT a car) darting across the lane. Ground-relative like the GLB kit
 *  (Y = 0 = hooves, nose +Z = travel/facing). No wheels — the four legs ARE
 *  the footprint; the ModelRig wheel channel carries four hidden placeholder
 *  cubes tucked in the belly (the bicycle rig's hidden-right-wheel trick). */
export const ANIMAL_DIMENSIONS = {
  bodyLenM: 1.2,
  bodyWidthM: 0.5,
  bodyHeightM: 0.5,
  legHeightM: 0.62,
  halfLengthM: 1.1,
  halfWidthM: 0.28,
} as const;

/**
 * The procedural low-poly ANIMAL + legs ModelRig (the animal-hazard actor —
 * doc 72 §HZ „животно на пътя"; mirrors buildBicycleRig). Two merged material
 * groups: the hide (torso, neck, four legs, tail) and a darker head group
 * (head, snout, ears) so the silhouette reads as a facing animal, not a box.
 * Ground-relative (Y = 0 = hooves, nose +Z); STATIC pose (a galloping cycle is
 * a TrafficLayer polish pass, like the bicycle rider). Entirely fictional
 * (ADR-001 — no real species branding); all geometry + materials are OWNED
 * (disposed via ownedMaterials/geometry). Exported so the hazard-dart visual
 * (TrafficLayer) can mount the same geometry it renders in the fleet.
 */
export function buildAnimalRig(): ModelRig {
  const { legHeightM, halfLengthM, halfWidthM } = ANIMAL_DIMENSIONS;
  const hideMat = new MeshStandardMaterial({
    color: 0x8a6a44, // muted deer-brown hide (fictional, ADR-001)
    metalness: 0.0,
    roughness: 0.85,
    envMapIntensity: 1.1,
  });
  hideMat.name = "animal_hide";
  const headMat = new MeshStandardMaterial({
    color: 0x6f5236, // darker head/snout tone for silhouette contrast
    metalness: 0.0,
    roughness: 0.85,
  });
  headMat.name = "animal_head";

  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rotX = 0) => {
    const g = new BoxGeometry(sx, sy, sz);
    if (rotX !== 0) g.rotateX(rotX);
    g.translate(x, y, z);
    return g;
  };

  // Hide group: torso over the legs, a forward neck, four legs, a short tail.
  const torsoY = legHeightM + 0.25;
  const hideParts = [
    box(0.5, 0.5, 1.2, 0, torsoY, -0.05), // torso
    box(0.28, 0.42, 0.34, 0, torsoY + 0.22, 0.55, -0.5), // neck (leaning up-forward)
    box(0.15, legHeightM, 0.17, 0.17, legHeightM / 2, 0.42), // front-left leg
    box(0.15, legHeightM, 0.17, -0.17, legHeightM / 2, 0.42), // front-right leg
    box(0.15, legHeightM, 0.17, 0.17, legHeightM / 2, -0.5), // rear-left leg
    box(0.15, legHeightM, 0.17, -0.17, legHeightM / 2, -0.5), // rear-right leg
    box(0.09, 0.09, 0.4, 0, torsoY + 0.12, -0.78, 0.6), // tail (angled down-back)
  ];
  const hideMerged = mergeGeometries(hideParts, false) ?? hideParts[0];
  if (hideMerged !== hideParts[0]) for (const g of hideParts) g.dispose();

  // Head group: head + snout at the neck top, two upright ears.
  const headY = torsoY + 0.5;
  const headParts = [
    box(0.3, 0.32, 0.36, 0, headY, 0.78), // head
    box(0.17, 0.17, 0.26, 0, headY - 0.06, 0.98), // snout
    box(0.06, 0.16, 0.05, 0.1, headY + 0.2, 0.72), // left ear
    box(0.06, 0.16, 0.05, -0.1, headY + 0.2, 0.72), // right ear
  ];
  const headMerged = mergeGeometries(headParts, false) ?? headParts[0];
  if (headMerged !== headParts[0]) for (const g of headParts) g.dispose();

  const bodyGeometry = mergeGeometries([hideMerged, headMerged], true) ?? hideMerged;
  if (bodyGeometry !== hideMerged) {
    hideMerged.dispose();
    headMerged.dispose();
  }

  // No wheels: the ModelRig wheel channel carries four 1 cm placeholder cubes
  // hidden inside the torso (the bicycle rig's hidden-wheel precedent), so the
  // shared/instanced wheel passes draw nothing visible for this model.
  const hidden = () => new BoxGeometry(0.01, 0.01, 0.01);
  const hideWheelMat = new MeshStandardMaterial({ color: 0x000000 });
  hideWheelMat.name = "animal_hidden_wheel";
  const hy = 0.1;
  return {
    bodyGeometry,
    bodyMaterials: bodyGeometry.groups.length === 2 ? [hideMat, headMat] : [hideMat],
    ownedMaterials: [hideMat, headMat, hideWheelMat],
    paint: null, // no palette tint — the hide colour IS the animal's identity
    customWheel: {
      left: { geometry: hidden(), materials: [hideWheelMat] },
      right: { geometry: hidden(), materials: [hideWheelMat] },
    },
    wheelOffsets: [
      new Vector3(0.17, hy, 0.42), // FL — hidden cube at the front-left hoof
      new Vector3(-0.17, hy, 0.42), // FR
      new Vector3(0.17, hy, -0.5), // RL
      new Vector3(-0.17, hy, -0.5), // RR
    ],
    wheelRadius: hy,
    rearZ: -halfLengthM,
    frontZ: halfLengthM,
    halfWidth: halfWidthM,
    halfLength: halfLengthM,
    lampY: torsoY,
    headY,
  };
}

/**
 * Models whose gloss paint is upgraded to REAL automotive clearcoat
 * (MeshPhysicalMaterial). HERO-ONLY by ruling (docs/simulation/71 §4.8 +
 * quality-gap/06 §3): clearcoat is the most expensive built-in material, so
 * only the rare premium boxy SUV gets it — REF-4 gloss black IS its identity,
 * and it spawns ~1-in-21 capped at BOXY_MAX_INSTANCES (2). Every other fleet
 * model keeps MeshStandard. Combined with the player car (HeroCarBody, +1),
 * this bounds physical-material vehicles to ≤3 instances on screen.
 */
const CLEARCOAT_PAINT_MODELS = new Set<number>([BOXY_INDEX]);

/** Local Draco decoder (CSP-safe, served from public/draco/ — no CDN). */
export const DRACO_DECODER_PATH = "/draco/";

// ---------------------------------------------------------------------------
// Distribution — research mix (palettes.json movingShare, taxi raised to the
// ~1-in-10 city rate) as integer weights. Effective share of ALL spawns is
// weight% × 14/15 (police carve-out first): taxi ~9.3%, hero SUV ~4.7%
// (~1 in 21), minibus+van ~8.4%, luxury ~1.9%.
// ---------------------------------------------------------------------------
const MOVING_WEIGHTS: Partial<Record<FleetName, number>> = {
  vela_h3: 15,
  pino: 9,
  corva_s: 12,
  dret_90: 7,
  corva_sw: 11,
  arden_x: 12,
  kolos: 6,
  corva_l: 2,
  tarpan: 2,
  kargo_v: 6,
  kargo_m: 3,
  taxi: 10,
  suv_boxy_lux: 5,
};

/** Parked pool: palettes.json note ("shift +10% toward vela_h3/corva_s/
 *  dret_90"). Curb-parked taxis are realistic (low weight); police, the
 *  kargo_m route minibus and the hero SUV never park (see header). */
const PARKED_WEIGHTS: Partial<Record<FleetName, number>> = {
  vela_h3: 18,
  corva_s: 16,
  dret_90: 12,
  pino: 10,
  corva_sw: 12,
  arden_x: 12,
  kolos: 5,
  corva_l: 2,
  tarpan: 4,
  kargo_v: 5,
  taxi: 4,
};

interface WeightTable {
  models: number[];
  cum: number[];
  total: number;
}

function buildWeightTable(weights: Partial<Record<FleetName, number>>): WeightTable {
  const models: number[] = [];
  const cum: number[] = [];
  let total = 0;
  for (const name of FLEET) {
    const w = weights[name];
    if (!w) continue;
    total += w;
    models.push(FLEET.indexOf(name));
    cum.push(total);
  }
  return { models, cum, total };
}

const MOVING_TABLE = buildWeightTable(MOVING_WEIGHTS);
const PARKED_TABLE = buildWeightTable(PARKED_WEIGHTS);

function pickFromTable(t: WeightTable, r: number): number {
  const x = r % t.total;
  for (let i = 0; i < t.cum.length; i++) {
    if (x < t.cum[i]) return t.models[i];
  }
  return t.models[t.models.length - 1];
}

// ---------------------------------------------------------------------------
// Paint palettes — public/sim/vehicles-v2/palettes.json is the single source
// of truth (per-model researched color weights, linear-space RGB). Models
// absent from it (police livery, the gloss-black hero SUV) are not tinted.
// ---------------------------------------------------------------------------
interface PalettesJson {
  colors: Record<string, [number, number, number]>;
  models: Record<string, { palette: Record<string, number> }>;
}
const PALETTES = palettesJson as unknown as PalettesJson;

interface PaintPalette {
  rgb: [number, number, number][];
  cum: number[];
  total: number;
}

const MODEL_PAINTS: (PaintPalette | null)[] = FLEET.map((name) => {
  const model = PALETTES.models[name];
  if (!model) return null;
  const rgb: [number, number, number][] = [];
  const cum: number[] = [];
  let total = 0;
  for (const [colorName, weight] of Object.entries(model.palette)) {
    const c = PALETTES.colors[colorName];
    if (!c) continue; // unknown color name — skip rather than crash
    total += weight;
    rgb.push(c);
    cum.push(total);
  }
  return total > 0 ? { rgb, cum, total } : null;
});

/** True when the model gets a per-instance palette tint (paint split). */
function hasPaintPalette(modelIndex: number): boolean {
  return MODEL_PAINTS[modelIndex] !== null;
}

/**
 * Deterministic weighted palette color for (model, seed) written into `out`
 * (linear space, matching the GLB's authored paint values). Returns false for
 * un-tinted models (police / hero SUV).
 */
export function paintColorFor(modelIndex: number, seed: number, out: Color): boolean {
  const p = MODEL_PAINTS[modelIndex];
  if (!p) return false;
  const x = mix32(seed ^ 0x51ed270b) % p.total;
  for (let i = 0; i < p.cum.length; i++) {
    if (x < p.cum[i]) {
      out.setRGB(p.rgb[i][0], p.rgb[i][1], p.rgb[i][2]);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Car paint — shared HERO clearcoat recipe (player car + premium boxy SUV)
// ---------------------------------------------------------------------------

export interface CarPaintOptions {
  /** Pigment colour (linear space). Default: REF-4 gloss black (#0a0a0a). */
  color?: ColorRepresentation;
  /** Env reflection strength vs the scene HDRI. Plan §4.8 range 1.0–1.5;
   *  default 1.4, tuned to the dimmed day golden-hour env (shanghai_riverside_1k
   *  @ environmentIntensity 0.5) so black paint catches a deep gloss highlight. */
  envMapIntensity?: number;
}

/**
 * Real automotive CLEARCOAT paint — the canonical three.js `webgl_materials_car`
 * recipe (quality-gap/06 §3a): a rough metallic pigment/flake base UNDER a
 * near-mirror clearcoat. The rough metal base carries the pigment; the clearcoat
 * (roughness ~0.03) supplies the crisp sky/environment reflection that sweeps
 * across the body while driving — the "deep gloss" REF-4 look.
 *
 * MeshPhysicalMaterial is the most expensive built-in material, so this is
 * HERO-ONLY (docs/simulation/71 §4.8 ruling: clearcoat = player car + the rare
 * premium boxy SUV; the 12-model traffic fleet stays MeshStandard for perf).
 * No `transmission`/`sheen` (banned on gameplay vehicles). The caller OWNS the
 * returned material and must dispose it.
 */
export function carPaintMaterial(opts: CarPaintOptions = {}): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: opts.color ?? 0x0a0a0a,
    metalness: 0.9,
    roughness: 0.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: opts.envMapIntensity ?? 1.4,
  });
}

/**
 * The med/low fallback for the hero paint (docs/simulation/71 §4.8 tier
 * ruling): a glossy MeshStandard — NO clearcoat lobe, so ~half the fragment
 * cost of `carPaintMaterial`, but a high metalness + low roughness + strong env
 * reflection keep the "wet gloss" read. Same signature as carPaintMaterial so
 * the call sites (HeroCarBody + the fleet's boxy SUV) swap one for the other by
 * tier. The caller OWNS the returned material and must dispose it.
 */
export function carPaintStandardMaterial(opts: CarPaintOptions = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: opts.color ?? 0x0a0a0a,
    metalness: 0.7,
    roughness: 0.35,
    envMapIntensity: opts.envMapIntensity ?? 1.4,
  });
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

// Materials the body merge drops (TrafficLayer renders these as dynamic lamp
// overlays; their bboxes are still read for lamp placement).
const SKIP_BODY_MATERIALS = new Set(["headlight", "taillight"]);
// Same-look accessory groups folded into a host material at extraction time —
// one draw call each saved per model per pass (the fold target's color is a
// close visual match; falls back to the authored material when absent).
const FOLD_BODY_MATERIALS: Record<string, string> = {
  plate: "trim",
  cladding: "trim",
  checker_black: "trim",
  // Hero SUV: near-black mesh intake -> matte cladding; steel brake discs ->
  // satin running boards. Its plate/lenses/rings stay distinct (hero detail).
  mesh_dark: "matte_black",
  brake_steel: "silver_satin",
};
// Generic wheels are tire + hubcap / hubcap_dark; anything else (the hero
// SUV's rim_gloss_black / red_accent) makes the model's wheels CUSTOM.
const GENERIC_WHEEL_MATERIAL_RE = /^(tire|hubcap)/;
const WHEEL_NODE_RE = /^wheel_(FL|FR|RL|RR)$/;
const WHEEL_ORDER = ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"];

/** Let paint/glass/chrome catch the scene HDRI (glass reflects more). */
function bumpEnv(mat: Material | Material[] | null | undefined): void {
  const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
  for (const m of list) {
    const sm = m as Material & { envMapIntensity?: number; name?: string };
    if (sm && "envMapIntensity" in sm) {
      sm.envMapIntensity = /glass/i.test(sm.name ?? "") ? 1.7 : 1.35;
    }
  }
}

/** Multi-material geometry + material list (one draw call per material). */
interface GeoSet {
  geometry: BufferGeometry;
  materials: Material[];
}

/** Per-model geometry + placement metadata, extracted once from the GLB. */
export interface ModelRig {
  /** Merged multi-material body geometry (minus lamps, minus split paint). */
  bodyGeometry: BufferGeometry;
  /** Materials aligned to the merged geometry's groups. */
  bodyMaterials: Material[];
  /** Materials WE created (not from the drei cache) — disposed by
   *  disposeTrafficFleet. Today: the hero SUV's clearcoat paint clone. */
  ownedMaterials: Material[];
  /** Emergency beacon strobe channel (emergency rig only): the two lamp-dome
   *  materials updateEmergencyStrobe flips on the shared blink clock; `phase`
   *  caches the last written state so a flip costs two color writes per edge.
   *  Absent for every other model. */
  strobe?: { left: MeshBasicMaterial; right: MeshBasicMaterial; phase: number };
  /** Split paint shell for per-instance palette tint (null: paint stays in
   *  the body merge — police livery / hero SUV). Material is OUR white clone. */
  paint: GeoSet | null;
  /** Side-mirrored custom wheels (hero SUV) — null: use the shared wheel. */
  customWheel: { left: GeoSet; right: GeoSet } | null;
  /** Wheel hub offsets [FL, FR, RL, RR] in body-local (three) space. */
  wheelOffsets: Vector3[];
  /** Wheel radius = hub height above ground (== authored tire bbox radius). */
  wheelRadius: number;
  /** Body extents (for lamp placement + blob-shadow footprint). */
  rearZ: number;
  frontZ: number;
  halfWidth: number;
  halfLength: number;
  /** Lamp heights: from the dropped taillight/headlight prim bboxes when the
   *  model authors them, else a body-height heuristic (hero SUV). */
  lampY: number;
  headY: number;
}

/** Shared wheel geometry reused across every standard car's wheels. */
interface SharedWheel extends GeoSet {
  refRadius: number;
}

/** Name of the wheel node this object sits under (or is), if any. */
function wheelAncestor(o: Object3D): string | null {
  for (let p: Object3D | null = o; p; p = p.parent) {
    if (WHEEL_NODE_RE.test(p.name)) return p.name;
  }
  return null;
}

interface RawPrim {
  matName: string;
  mat: Material;
  geo: BufferGeometry;
}

/**
 * Merge prims into one multi-material geometry: same-material prims collapse
 * into ONE group (this is what actually saves draw calls — adjacent groups
 * sharing a material still issue separate draws in three).
 */
function mergePrims(prims: RawPrim[]): GeoSet | null {
  const buckets = new Map<Material, BufferGeometry[]>();
  for (const p of prims) {
    const list = buckets.get(p.mat);
    if (list) list.push(p.geo);
    else buckets.set(p.mat, [p.geo]);
  }
  const geos: BufferGeometry[] = [];
  const materials: Material[] = [];
  for (const [mat, list] of buckets) {
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (merged) {
      geos.push(merged);
      materials.push(mat);
    } else {
      // Attribute mismatch inside the bucket — degrade to per-prim groups.
      for (const g of list) {
        geos.push(g);
        materials.push(mat);
      }
    }
  }
  if (geos.length === 0) return null;
  // Outer merge with groups so one InstancedMesh + material array draws the
  // whole set. ALWAYS merge (even a single geo): the materials are handed to
  // the mesh as an array, and three draws array-material meshes per GROUP —
  // a group-less geometry would render nothing. The merge result is a
  // geometry WE own (mergeGeometries copies the source attributes).
  const merged = mergeGeometries(geos, true);
  if (!merged) {
    // Extremely unlikely (all prims are POSITION+NORMAL+index) — degrade to
    // the first bucket rather than crash, and surface it.
    console.warn("[vehicleFleet] geometry merge failed; using first group only");
    const fallback = mergeGeometries([geos[0]], true) ?? geos[0].clone();
    return { geometry: fallback, materials: materials.slice(0, 1) };
  }
  return { geometry: merged, materials };
}

function extractModelRig(scene: Object3D, modelIndex: number, clearcoat: boolean): ModelRig {
  scene.updateMatrixWorld(true);
  const offsets: Record<string, Vector3> = {};
  const bodyPrims: RawPrim[] = [];
  const matByName = new Map<string, Material>();
  const wheelPrims = new Map<string, RawPrim[]>();
  let headBox: Box3 | null = null;
  let tailBox: Box3 | null = null;

  scene.traverse((o) => {
    if (WHEEL_NODE_RE.test(o.name)) {
      // Body node is at the origin, so world position == the hub's local offset.
      offsets[o.name] = o.getWorldPosition(new Vector3());
    }
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as Material & { name?: string };
    const name = (mat?.name ?? "").toLowerCase();
    const wheelNode = wheelAncestor(o);
    if (wheelNode) {
      // Wheel exclusion is by NODE subtree, not material — the hero SUV's
      // tailgate spare is a `tire` primitive inside the BODY mesh and stays.
      const list = wheelPrims.get(wheelNode);
      const prim: RawPrim = { matName: name, mat, geo: mesh.geometry };
      if (list) list.push(prim);
      else wheelPrims.set(wheelNode, [prim]);
      return;
    }
    if (SKIP_BODY_MATERIALS.has(name)) {
      // Dropped (drawn as dynamic overlays) — but keep the bbox so the
      // overlay lamps sit at the authored lamp height.
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        if (name === "headlight") headBox = (headBox ?? new Box3()).union(bb);
        else tailBox = (tailBox ?? new Box3()).union(bb);
      }
      return;
    }
    matByName.set(name, mat);
    bumpEnv(mat);
    bodyPrims.push({ matName: name, mat, geo: mesh.geometry });
  });

  // Fold same-look accessory materials into their host group (when present).
  for (const p of bodyPrims) {
    const target = FOLD_BODY_MATERIALS[p.matName];
    const host = target ? matByName.get(target) : undefined;
    if (host) p.mat = host;
  }

  // Hero-only paint upgrade: swap the SUV's gloss-black paint (stays inside the
  // body merge — it has no palette split) for a dedicated hero material. On the
  // high tier (clearcoat=true) that is a real MeshPhysicalMaterial (clearcoat);
  // on med/low it is the glossy MeshStandard fallback (~½ the fragment cost).
  // Either way fleet models keep their authored MeshStandard (see
  // CLEARCOAT_PAINT_MODELS). We own the new material (never mutate the
  // drei-cached one) — disposed on teardown.
  const ownedMaterials: Material[] = [];
  if (CLEARCOAT_PAINT_MODELS.has(modelIndex)) {
    const paintPrims = bodyPrims.filter((p) => p.matName.startsWith("paint"));
    if (paintPrims.length > 0) {
      const src = paintPrims[0].mat as Material & { color?: Color; name?: string };
      const heroPaint = clearcoat
        ? carPaintMaterial({ color: src.color?.clone() })
        : carPaintStandardMaterial({ color: src.color?.clone() });
      heroPaint.name = src.name ?? (clearcoat ? "paint_clearcoat" : "paint_gloss");
      ownedMaterials.push(heroPaint);
      for (const p of paintPrims) p.mat = heroPaint; // one shared group
    }
  }

  // Split paint out for per-instance palette tint (palette-listed models).
  let paint: GeoSet | null = null;
  let mergedBody: GeoSet | null;
  if (hasPaintPalette(modelIndex)) {
    const paintPrims = bodyPrims.filter((p) => p.matName.startsWith("paint_"));
    const rest = bodyPrims.filter((p) => !p.matName.startsWith("paint_"));
    const paintSet = mergePrims(paintPrims);
    if (paintSet) {
      // Clone to white so instanceColor multiplies to the palette color —
      // the authored material belongs to the drei GLTF cache, never mutate it.
      const white = paintSet.materials[0].clone() as Material & { color?: Color };
      white.color?.setRGB(1, 1, 1);
      bumpEnv(white);
      paint = { geometry: paintSet.geometry, materials: [white] };
    }
    mergedBody = mergePrims(rest);
  } else {
    mergedBody = mergePrims(bodyPrims);
  }
  if (!mergedBody) {
    console.warn(`[vehicleFleet] ${FLEET[modelIndex]}: empty body after merge`);
    mergedBody = { geometry: paint?.geometry.clone() ?? new Mesh().geometry, materials: paint ? [paint.materials[0]] : [] };
  }
  const bodyGeometry = mergedBody.geometry;
  bodyGeometry.computeBoundingBox();
  const bb = bodyGeometry.boundingBox ?? new Box3();
  // Footprint/extents over body + paint (the paint shell IS the outer skin).
  const full = bb.clone();
  if (paint) {
    paint.geometry.computeBoundingBox();
    if (paint.geometry.boundingBox) full.union(paint.geometry.boundingBox);
  }
  const height = full.max.y - full.min.y;

  const wheelOffsets = WHEEL_ORDER.map((k) => offsets[k]?.clone() ?? new Vector3());
  const wheelRadius = wheelOffsets[0].y || 0.32;

  // Custom wheels: any non-generic wheel material (hero SUV rims). Left/right
  // sides are mirrored meshes — keep both so rim detail faces outward.
  let customWheel: ModelRig["customWheel"] = null;
  let anyCustom = false;
  for (const prims of wheelPrims.values()) {
    if (prims.some((p) => !GENERIC_WHEEL_MATERIAL_RE.test(p.matName))) {
      anyCustom = true;
      break;
    }
  }
  if (anyCustom) {
    const left = mergePrims(wheelPrims.get("wheel_FL") ?? []);
    const right = mergePrims(wheelPrims.get("wheel_FR") ?? []);
    if (left && right) {
      for (const s of [left, right]) for (const m of s.materials) bumpEnv(m);
      customWheel = { left, right };
    } else {
      console.warn(`[vehicleFleet] ${FLEET[modelIndex]}: custom wheel extraction failed; using shared wheel`);
    }
  }

  const headB = headBox as Box3 | null;
  const tailB = tailBox as Box3 | null;
  return {
    bodyGeometry,
    bodyMaterials: mergedBody.materials,
    ownedMaterials,
    paint,
    customWheel,
    wheelOffsets,
    wheelRadius,
    rearZ: full.min.z,
    frontZ: full.max.z,
    halfWidth: full.max.x,
    halfLength: Math.max(full.max.z, -full.min.z),
    lampY: tailB ? (tailB.min.y + tailB.max.y) / 2 : full.min.y + height * 0.42,
    headY: headB ? (headB.min.y + headB.max.y) / 2 : full.min.y + height * 0.3,
  };
}

function extractSharedWheel(scene: Object3D): SharedWheel {
  const parts: Record<string, RawPrim> = {};
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !wheelAncestor(o)) return;
    const mat = mesh.material as Material & { name?: string };
    const name = (mat?.name ?? "").toLowerCase();
    if (GENERIC_WHEEL_MATERIAL_RE.test(name) && !parts[name]) {
      bumpEnv(mat);
      parts[name] = { matName: name, mat, geo: mesh.geometry };
    }
  });
  const ordered = ["tire", "hubcap"].filter((k) => parts[k]).map((k) => parts[k]);
  // mergePrims always hands back a geometry WE own (merged or a clone) —
  // disposeTrafficFleet frees it, and the drei cache's source geometry must
  // not be the thing we dispose.
  const set = mergePrims(ordered);
  if (!set) throw new Error("[vehicleFleet] no generic wheel in the reference GLB");
  set.geometry.computeBoundingBox();
  const bb = set.geometry.boundingBox ?? new Box3();
  // Wheel axis is local X; radius = half the Y (or Z) extent.
  const refRadius = (bb.max.y - bb.min.y) / 2 || 0.32;
  return { ...set, refRadius };
}

function mix32(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic model index from a vehicle id. Police ~1 in 15 (carved out
 * first, unchanged from v1); everything else is a research-weighted pick over
 * the v2 pool + hero SUV (MOVING_WEIGHTS). Stable across sessions (same id =>
 * same car). NOTE: the hero-SUV instance CAP is applied population-wide in
 * buildTrafficFleet (this per-id function cannot see the population).
 */
export function assignModel(id: number): number {
  const h = mix32(id);
  if (h % 15 === 0) return POLICE_INDEX;
  return pickFromTable(MOVING_TABLE, mix32(h));
}

/**
 * Deterministic PARKED-pool model index from an arbitrary seed — weighted per
 * the palettes.json parked note. Never police / kargo_m minibus / hero SUV
 * (see header). Stable: same seed => same model.
 */
export function assignCivilianModel(seed: number): number {
  return pickFromTable(PARKED_TABLE, mix32(seed));
}

/** Parked placement: model (from assignCivilianModel) + a stable seed that
 *  picks the paint color. */
export interface ParkedPlacement {
  model: number;
  seed: number;
}

/** Build-time quality gates for the fleet. */
export interface BuildTrafficFleetOptions {
  /**
   * Real automotive clearcoat (MeshPhysicalMaterial) on the hero boxy SUV
   * paint. Default true (the high look). Pass false on med/low to render the
   * SUV paint as glossy MeshStandard — ~½ the fragment cost (mirrors the
   * player car's HeroCarBody gate). Only the ≤2 capped SUV instances are
   * affected; the rest of the fleet is MeshStandard regardless.
   */
  clearcoat?: boolean;
  /**
   * Max simultaneous hero boxy-SUV instances. Defaults to BOXY_MAX_INSTANCES
   * (2) so every existing caller and every headless test keeps its exact
   * population; TrafficLayer passes BOXY_MAX_INSTANCES_LOW (0) at tier `low`
   * to drop it entirely (doc 82 §2.3). Overflow becomes a kolos either way, so
   * the vehicle COUNT, its id, lane, speed and every conflict the rule engine
   * grades are untouched — this changes which GLB is drawn, nothing else.
   */
  boxyMaxInstances?: number;
}

export interface TrafficFleet {
  /** One Object3D holding every fleet InstancedMesh; mount with <primitive>. */
  group: Group;
  /** Per model: its InstancedMesh (null when no vehicle uses it) + rig. */
  models: { mesh: InstancedMesh | null; rig: ModelRig; count: number }[];
  /** Per model: paint-shell InstancedMesh (per-instance palette tint), null
   *  when the model is un-tinted or unused. Same slots as `models[m].mesh`. */
  paintMeshes: (InstancedMesh | null)[];
  /** Shared wheel InstancedMesh (nVeh*4 instances; hero-SUV slots stay zero). */
  wheel: InstancedMesh;
  /** Per model: custom LEFT/RIGHT wheel meshes (hero SUV — 2 instances per
   *  car each: slot*2 = front, slot*2+1 = rear), null for shared-wheel models. */
  customWheelL: (InstancedMesh | null)[];
  customWheelR: (InstancedMesh | null)[];
  /** veh index -> model index. */
  assign: Int32Array;
  /** veh index -> instance slot inside its model's InstancedMesh. */
  slot: Int32Array;
  /** veh index -> uniform wheel scale (1 for custom-wheel models). */
  wheelScale: Float32Array;
  /** veh index -> wheel roll radius (for speed·dt/r). */
  wheelRadius: Float32Array;

  // --- Parked pass (static; matrices written once by TrafficLayer) ---------
  /** Per model index: static body InstancedMesh (null when no parked car uses
   *  that model). Shares each model's merged geometry with `models`. */
  parkedMeshes: (InstancedMesh | null)[];
  /** Per model index: static paint-shell InstancedMesh (palette-tinted). */
  parkedPaintMeshes: (InstancedMesh | null)[];
  /** Static shared wheel InstancedMesh (nPark*4), null when nPark = 0. */
  parkedWheel: InstancedMesh | null;
  /** parked index -> model index (parked pool only). */
  parkedAssign: Int32Array;
  /** parked index -> instance slot inside its model's parked InstancedMesh. */
  parkedSlot: Int32Array;
  /** parked index -> uniform wheel scale. */
  parkedWheelScale: Float32Array;
}

const ZERO_MATRIX = new Float32Array(16); // all-zero => scale 0 => nothing drawn

function hideAll(mesh: InstancedMesh): void {
  for (let i = 0; i < mesh.count; i++) mesh.instanceMatrix.set(ZERO_MATRIX, i * 16);
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Build the instanced fleet from the loaded GLB scenes (FLEET order) and the
 * traffic vehicles. Instances start hidden (zero matrix); TrafficLayer
 * positions them on the first frame. `parked` (from assignCivilianModel +
 * placement seeds) additionally builds the static parked pass over the same
 * rigs. Paint instance colors are written here, once.
 */
export function buildTrafficFleet(
  scenes: Object3D[],
  vehicles: readonly TrafficVehicleState[],
  parked: readonly ParkedPlacement[] = [],
  opts: BuildTrafficFleetOptions = {},
): TrafficFleet {
  // Tier gate for the hero boxy SUV paint (docs/simulation/71 §4.8): real
  // clearcoat at high, glossy MeshStandard on med/low. Defaults to true so the
  // full look (and the existing headless tests) are preserved when a caller
  // does not opt in.
  const clearcoat = opts.clearcoat ?? true;
  // Tier gate for the hero boxy SUV POPULATION (doc 82 §2.3). Defaults to the
  // shipped cap so nothing changes unless a caller opts in.
  const boxyMax = opts.boxyMaxInstances ?? BOXY_MAX_INSTANCES;
  const rigs = scenes.map((s, m) => extractModelRig(s, m, clearcoat));
  // FO-06 profile slot: the procedural box truck rides AFTER the GLB models
  // (TRUCK_MODEL_INDEX). Costs nothing unless a truck-profile vehicle exists
  // (count 0 => no InstancedMesh), beyond building the two-box rig itself.
  rigs.push(buildBoxTruckRig());
  // VU-09 profile slot: the procedural emergency rig (EMERGENCY_MODEL_INDEX)
  // — same cost discipline: no InstancedMesh unless an emergency actor exists.
  rigs.push(buildEmergencyRig());
  // RX-04/RX-05 profile slot: the procedural articulated tram rig
  // (TRAM_MODEL_INDEX) — no InstancedMesh unless a tram actor exists.
  rigs.push(buildTramRig());
  // VU-01/02/03 profile slots: the procedural bicycle + rider rigs
  // (CYCLIST_MODEL_INDEX adult, CHILD_CYCLIST_MODEL_INDEX child) — same cost
  // discipline: no InstancedMesh unless a cyclist actor exists.
  rigs.push(buildBicycleRig(false));
  rigs.push(buildBicycleRig(true));
  // RX-02/RX-01 profile slot: the procedural multi-unit train rig
  // (TRAIN_MODEL_INDEX) — no InstancedMesh unless a train actor exists.
  rigs.push(buildTrainRig());
  // HZ profile slot: the procedural quadruped animal rig (ANIMAL_MODEL_INDEX)
  // — no InstancedMesh unless an "animal"-profile actor exists.
  rigs.push(buildAnimalRig());
  // VU-11 profile slot: the procedural 12 m CITY BUS rig (BUS_MODEL_INDEX) —
  // same cost discipline: no InstancedMesh unless a "bus"-profile actor exists.
  rigs.push(buildCityBusRig());
  const sharedWheel = extractSharedWheel(scenes[0]);
  const nVeh = vehicles.length;
  const color = new Color();

  const assign = new Int32Array(nVeh);
  const slot = new Int32Array(nVeh);
  const wheelScale = new Float32Array(nVeh);
  const wheelRadius = new Float32Array(nVeh);
  const counts = new Array(rigs.length).fill(0);

  for (let i = 0; i < nVeh; i++) {
    // Profile override (staged large vehicles) → deterministic fleet pick.
    let m = modelForVehicle(vehicles[i]);
    // Hero-SUV cap: it costs ~4× a fleet car; overflow becomes a kolos. At
    // `boxyMax` 0 (tier low) every pick falls back — the model never spawns.
    if (m === BOXY_INDEX && counts[m] >= boxyMax) m = BOXY_FALLBACK_INDEX;
    assign[i] = m;
    slot[i] = counts[m]++;
  }

  const group = new Group();
  group.name = "traffic-fleet";

  const models = rigs.map((rig, m) => {
    const count = counts[m];
    if (count === 0) return { mesh: null, rig, count };
    const mesh = new InstancedMesh(rig.bodyGeometry, rig.bodyMaterials, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-body-${modelName(m)}`;
    hideAll(mesh);
    group.add(mesh);
    return { mesh, rig, count };
  });

  const paintMeshes = rigs.map((rig, m): InstancedMesh | null => {
    const count = counts[m];
    if (count === 0 || !rig.paint) return null;
    const mesh = new InstancedMesh(rig.paint.geometry, rig.paint.materials, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-paint-${FLEET[m]}`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });

  const wheel = new InstancedMesh(
    sharedWheel.geometry,
    sharedWheel.materials,
    Math.max(1, nVeh * 4),
  );
  wheel.instanceMatrix.setUsage(DynamicDrawUsage);
  wheel.frustumCulled = false;
  wheel.name = "traffic-wheels";
  hideAll(wheel);
  group.add(wheel);

  const customWheelL = rigs.map((rig, m): InstancedMesh | null => {
    if (!rig.customWheel || counts[m] === 0) return null;
    const mesh = new InstancedMesh(
      rig.customWheel.left.geometry,
      rig.customWheel.left.materials,
      counts[m] * 2,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = `traffic-wheels-${modelName(m)}-L`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });
  const customWheelR = rigs.map((rig, m): InstancedMesh | null => {
    if (!rig.customWheel || counts[m] === 0) return null;
    const mesh = new InstancedMesh(
      rig.customWheel.right.geometry,
      rig.customWheel.right.materials,
      counts[m] * 2,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.name = `traffic-wheels-${modelName(m)}-R`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });

  for (let i = 0; i < nVeh; i++) {
    const rig = rigs[assign[i]];
    wheelScale[i] = rig.customWheel ? 1 : rig.wheelRadius / sharedWheel.refRadius;
    wheelRadius[i] = rig.wheelRadius;
    // Paint tint: deterministic weighted palette pick from the vehicle id.
    const pm = paintMeshes[assign[i]];
    if (pm && paintColorFor(assign[i], vehicles[i].id, color)) {
      pm.setColorAt(slot[i], color);
    }
  }
  for (const pm of paintMeshes) {
    if (pm?.instanceColor) pm.instanceColor.needsUpdate = true;
  }

  // --- Parked pass: static instances over the SAME rigs/geometry ------------
  const nPark = parked.length;
  const parkedAssign = new Int32Array(nPark);
  const parkedSlot = new Int32Array(nPark);
  const parkedWheelScale = new Float32Array(nPark);
  const parkedCounts = new Array(rigs.length).fill(0);
  for (let i = 0; i < nPark; i++) {
    const m = parked[i].model;
    parkedAssign[i] = m;
    parkedSlot[i] = parkedCounts[m]++;
    // Parked pool excludes custom-wheel models; if one slips in, the shared
    // wheel (right radius, generic cap) is a graceful degrade.
    parkedWheelScale[i] = rigs[m].wheelRadius / sharedWheel.refRadius;
  }

  const parkedMeshes = rigs.map((rig, m): InstancedMesh | null => {
    const count = parkedCounts[m];
    if (count === 0) return null;
    // Static draw usage (default) — placed once, never animated.
    const mesh = new InstancedMesh(rig.bodyGeometry, rig.bodyMaterials, count);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-parked-body-${FLEET[m]}`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });

  const parkedPaintMeshes = rigs.map((rig, m): InstancedMesh | null => {
    const count = parkedCounts[m];
    if (count === 0 || !rig.paint) return null;
    const mesh = new InstancedMesh(rig.paint.geometry, rig.paint.materials, count);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-parked-paint-${FLEET[m]}`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });
  for (let i = 0; i < nPark; i++) {
    const pm = parkedPaintMeshes[parkedAssign[i]];
    if (pm && paintColorFor(parkedAssign[i], parked[i].seed, color)) {
      pm.setColorAt(parkedSlot[i], color);
    }
  }
  for (const pm of parkedPaintMeshes) {
    if (pm?.instanceColor) pm.instanceColor.needsUpdate = true;
  }

  let parkedWheel: InstancedMesh | null = null;
  if (nPark > 0) {
    parkedWheel = new InstancedMesh(
      sharedWheel.geometry,
      sharedWheel.materials,
      nPark * 4,
    );
    parkedWheel.frustumCulled = false;
    parkedWheel.name = "traffic-parked-wheels";
    hideAll(parkedWheel);
    group.add(parkedWheel);
  }

  return {
    group,
    models,
    paintMeshes,
    wheel,
    customWheelL,
    customWheelR,
    assign,
    slot,
    wheelScale,
    wheelRadius,
    parkedMeshes,
    parkedPaintMeshes,
    parkedWheel,
    parkedAssign,
    parkedSlot,
    parkedWheelScale,
  };
}

/**
 * Free the buffers this fleet OWNS — instance attributes (moving + parked),
 * the merged geometries (disposed once even though moving and parked meshes
 * share them), the split paint geometry + our white material clone, and the
 * custom wheel geometries. Source materials and primitive geometries belong
 * to the drei GLTF cache (shared, survive remounts) and are deliberately NOT
 * disposed here.
 */
export function disposeTrafficFleet(fleet: TrafficFleet): void {
  for (let m = 0; m < fleet.models.length; m++) {
    fleet.models[m].mesh?.dispose();
    fleet.paintMeshes[m]?.dispose();
    fleet.parkedMeshes[m]?.dispose();
    fleet.parkedPaintMeshes[m]?.dispose();
    fleet.customWheelL[m]?.dispose();
    fleet.customWheelR[m]?.dispose();
    const rig = fleet.models[m].rig;
    // Materials we created (hero SUV clearcoat clone) — cached materials are
    // the drei GLTF cache's and are deliberately NOT disposed here.
    for (const mat of rig.ownedMaterials) mat.dispose();
    // Merged geometries are ours regardless of whether any mesh used them.
    rig.bodyGeometry.dispose();
    if (rig.paint) {
      rig.paint.geometry.dispose();
      for (const mat of rig.paint.materials) mat.dispose(); // our white clone
    }
    if (rig.customWheel) {
      rig.customWheel.left.geometry.dispose();
      rig.customWheel.right.geometry.dispose();
    }
  }
  fleet.wheel.dispose();
  fleet.parkedWheel?.dispose();
  // Shared wheel geometry backs both wheel meshes — dispose once.
  fleet.wheel.geometry.dispose();
}
