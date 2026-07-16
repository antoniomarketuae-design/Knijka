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
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
  if (v.profile === "emergency") return EMERGENCY_MODEL_INDEX;
  if (v.profile === "tram") return TRAM_MODEL_INDEX;
  if (v.profile === "van") return VAN_MODEL_INDEX;
  return assignModel(v.id);
}

/** Mesh-name base for a model slot (procedural slots are past FLEET). */
function modelName(m: number): string {
  if (m === EMERGENCY_MODEL_INDEX) return "emergency";
  if (m === TRAM_MODEL_INDEX) return "tram";
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

/**
 * The procedural emergency ModelRig (doc 72 §15 N9 / VU-09 „Линейка отзад"):
 * a white cab + white box body (merged, one draw) topped by an emissive BLUE
 * light-bar box + a blue beltline stripe on each flank (merged into one blue
 * draw). Static-emissive light bar is the honest v1 — a strobing beacon is a
 * TrafficLayer polish pass, not a rig concern. Ground-relative like the GLB
 * kit (Y = 0 = tarmac, nose +Z); shared fleet wheels scaled to 0.38 m hubs.
 * All geometry + materials are OWNED (disposed via ownedMaterials/geometry).
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
  const bar = new BoxGeometry(lightBar.widthM, lightBar.heightM, lightBar.lengthM);
  bar.translate(0, cabHeightM + lightBar.heightM / 2, halfLength - cabLen / 2 - 0.1);
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
  const bodyGeometry = mergeGeometries([whiteMerged, blueMerged], true) ?? whiteMerged;
  if (bodyGeometry !== whiteMerged) {
    whiteMerged.dispose();
    blueMerged.dispose();
  }
  const track = widthM / 2 - 0.2;
  const frontAxleZ = halfLength - 1.0;
  const rearAxleZ = -halfLength + 1.25;
  return {
    bodyGeometry,
    bodyMaterials: bodyGeometry.groups.length === 2 ? [bodyMat, blueMat] : [bodyMat],
    ownedMaterials: [bodyMat, blueMat],
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
    color: 0x7c1f2d, // deep fictional crimson (ADR-001 — no real livery)
    metalness: 0.3,
    roughness: 0.42,
    envMapIntensity: 1.35,
  });
  paintMat.name = "tram_paint";
  const darkMat = new MeshStandardMaterial({
    color: 0x2b2f33, // graphite: bellows + roof kit + pantograph
    metalness: 0.35,
    roughness: 0.55,
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
  // Dark kit: articulation bellows bridging the gap…
  const bellows = new BoxGeometry(widthM - 0.3, segH - 0.4, gapM + 0.24);
  bellows.translate(0, 0.55 + (segH - 0.4) / 2, 0);
  // …a low roof strip along each segment (equipment boxes)…
  const roofF = new BoxGeometry(widthM - 0.7, 0.16, segLen - 1.2);
  roofF.translate(0, bodyHeightM + 0.08, gapM / 2 + segLen / 2);
  const roofR = new BoxGeometry(widthM - 0.7, 0.16, segLen - 1.2);
  roofR.translate(0, bodyHeightM + 0.08, -(gapM / 2 + segLen / 2));
  // …and the pantograph hint on the FRONT segment: two Λ-leaning arms + a
  // contact bar at the apex (three slim boxes — a silhouette, not a mechanism).
  const pantoZ = gapM / 2 + segLen / 2;
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
  const darkParts = [bellows, roofF, roofR, armA, armB, bar];
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
    // Hero-SUV cap: it costs ~4× a fleet car; overflow becomes a kolos.
    if (m === BOXY_INDEX && counts[m] >= BOXY_MAX_INSTANCES) m = BOXY_FALLBACK_INDEX;
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
    mesh.name = `traffic-wheels-${FLEET[m]}-L`;
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
    mesh.name = `traffic-wheels-${FLEET[m]}-R`;
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
